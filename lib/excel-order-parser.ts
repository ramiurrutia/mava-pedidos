import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

// Spreadsheet contents are data. Formulas, macros and external links are never run.
type XmlNode = Record<string, unknown>;
type Cell = { row: number; column: number; value: string };
export type ExcelPicture = {
  key: string; code: string; description: string; quantity: number; unitPrice: number;
  sheet: string; row: number; column: number; bytes: Uint8Array; mimeType: string;
  crop: { left: number; top: number; right: number; bottom: number };
};
export type ParsedExcelOrder = {
  clientName: string; phone: string; locality: string; email: string; address: string;
  pictures: ExcelPicture[]; sheets: string[]; warnings: string[];
};
const MAX_BYTES = 20 * 1024 * 1024;
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const node = (value: unknown): XmlNode => value !== null && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
const list = (value: unknown): XmlNode[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(node);
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : String(node(value)["#text"] ?? "");
const richText = (value: unknown) => {
  const element = node(value);
  return text(element.t) || list(element.r).map((run) => text(run.t)).join("");
};

function resolvePart(base: string, target: string) {
  if (!target || /[\\?#]/.test(target) || /^[a-z]+:/i.test(target)) throw new Error("El Excel contiene una referencia de archivo no compatible.");
  const parts = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") { if (!parts.length) throw new Error("Referencia inválida en el Excel."); parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  const path = parts.join("/");
  if (!path.startsWith("xl/")) throw new Error("Referencia inválida en el Excel.");
  return path;
}

export function parseExcelOrder(bytes: Uint8Array, filename: string): ParsedExcelOrder {
  if (!/\.xlsx$/i.test(filename) || bytes.length < 4 || bytes.length > MAX_BYTES) throw new Error("Elegí un Excel .xlsx de hasta 20 MB. Para archivos .xls, guardá primero una copia como .xlsx.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("El archivo no es un Excel .xlsx válido o está protegido con contraseña.");
  let expanded = 0, entries = 0;
  const files = unzipSync(bytes, { filter: (entry) => {
    if (++entries > 5000) throw new Error("El Excel contiene demasiados archivos internos.");
    if (!/^xl\/.*(?:\.xml|\.rels|\.(?:jpe?g|png|gif|webp|bmp))$/i.test(entry.name)) return false;
    expanded += entry.originalSize;
    if (entry.originalSize > MAX_BYTES || expanded > 80 * 1024 * 1024) throw new Error("El contenido descomprimido del Excel es demasiado grande.");
    return true;
  } });
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false });
  function xml(path: string, optional = false): XmlNode {
    if (!files[path]) { if (optional) return {}; throw new Error(`No se pudo leer una parte del Excel: ${path}.`); }
    if (files[path].length > 4 * 1024 * 1024) throw new Error("Una hoja del Excel es demasiado grande.");
    const source = strFromU8(files[path]);
    if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) throw new Error("El Excel contiene datos XML inválidos.");
    return node(parser.parse(source));
  }
  function relationships(path: string) {
    const parts = path.split("/"); const name = parts.pop();
    const rels = list(node(xml(`${parts.join("/")}/_rels/${name}.rels`, true).Relationships).Relationship);
    return new Map(rels.map((rel) => [text(rel["@Id"]), { target: text(rel["@Target"]), external: text(rel["@TargetMode"]) === "External" }]));
  }
  const workbook = node(xml("xl/workbook.xml").workbook);
  const sheets = list(node(workbook.sheets).sheet);
  if (!sheets.length || sheets.length > 20) throw new Error("El Excel debe tener entre 1 y 20 hojas.");
  const strings = list(node(xml("xl/sharedStrings.xml", true).sst).si).map(richText);
  const workbookRels = relationships("xl/workbook.xml");
  const result: ParsedExcelOrder = { clientName: "", phone: "", locality: "", email: "", address: "", pictures: [], sheets: [], warnings: [] };
  let missingQuantity = false, missingPrice = false;

  for (const [sheetIndex, sheet] of sheets.entries()) {
    const sheetName = text(sheet["@name"]) || `Hoja ${sheetIndex + 1}`;
    const relation = workbookRels.get(text(sheet["@id"]));
    if (!relation || relation.external) throw new Error(`No se pudo leer la hoja ${sheetName}.`);
    const sheetPath = resolvePart("xl/workbook.xml", relation.target);
    const worksheet = node(xml(sheetPath).worksheet);
    const cells: Cell[] = [];
    for (const row of list(node(worksheet.sheetData).row)) for (const cell of list(row.c)) {
      const match = /^([A-Z]+)(\d+)$/.exec(text(cell["@r"]));
      if (!match) continue;
      const column = [...match[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const value = cell["@t"] === "s" ? strings[Number(text(cell.v))] ?? "" : cell["@t"] === "inlineStr" ? richText(cell.is) : text(cell.v);
      if (value.trim()) cells.push({ row: Number(match[2]) - 1, column, value: value.trim() });
    }
    cells.sort((a, b) => a.row - b.row || a.column - b.column);
    function field(labels: string[]) {
      const heading = cells.find((cell) => labels.includes(normalize(cell.value).replace(/:$/, "")));
      if (!heading) return "";
      return cells.find((cell) => cell.row === heading.row && cell.column === heading.column + 1)?.value
        ?? cells.find((cell) => cell.row === heading.row + 1 && cell.column === heading.column)?.value ?? "";
    }
    result.clientName ||= field(["cliente", "nombre del cliente"]);
    result.phone ||= field(["telefono", "whatsapp"]);
    result.locality ||= field(["localidad"]);
    result.email ||= field(["correo", "email", "correo electronico"]);
    result.address ||= field(["direccion"]);
    const sheetRels = relationships(sheetPath);
    const pictures: ExcelPicture[] = [];
    for (const drawing of list(worksheet.drawing)) {
      const drawingRel = sheetRels.get(text(drawing["@id"]));
      if (!drawingRel || drawingRel.external) throw new Error(`No se pudieron leer las imágenes de ${sheetName}.`);
      const drawingPath = resolvePart(sheetPath, drawingRel.target);
      const drawingRels = relationships(drawingPath);
      const root = node(xml(drawingPath).wsDr);
      const anchors = [...list(root.twoCellAnchor), ...list(root.oneCellAnchor), ...list(root.absoluteAnchor)];
      for (const [anchorIndex, anchor] of anchors.entries()) {
        if (anchor.grpSp) result.warnings.push(`${sheetName}: hay objetos agrupados que no se pudieron extraer; desagrupalos en Excel y volvé a importar.`);
        const from = node(anchor.from);
        const row = Number(text(from.row) || 0), column = Number(text(from.col) || 0);
        for (const [pictureIndex, picture] of list(anchor.pic).entries()) {
          const blipFill = node(picture.blipFill), blip = node(blipFill.blip);
          const imageRel = drawingRels.get(text(blip["@embed"]));
          if (!imageRel || imageRel.external) throw new Error(`${sheetName}: hay una imagen vinculada o no disponible. Insertala dentro del Excel antes de importarlo.`);
          const imagePath = resolvePart(drawingPath, imageRel.target);
          const extension = imagePath.split(".").pop()?.toLowerCase();
          const mimeType = ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" } as Record<string, string>)[extension ?? ""];
          if (!files[imagePath] || !mimeType) throw new Error(`${sheetName}: una imagen tiene un formato no compatible. Convertí esa imagen a JPEG o PNG.`);
          const name = text(node(node(picture.nvPicPr).cNvPr)["@name"]);
          const headers = cells.filter((cell) => cell.row < row);
          function columnValue(labels: string[]) {
            const header = headers.findLast((cell) => labels.includes(normalize(cell.value)));
            return header ? cells.find((cell) => cell.row === row && cell.column === header.column)?.value : undefined;
          }
          const quantityText = columnValue(["cantidad", "cant", "cant.", "unidades"]);
          const priceText = columnValue(["precio", "precio unitario", "precio por unidad"]);
          const quantity = quantityText === undefined ? 1 : Number(quantityText.replace(",", "."));
          const unitPrice = priceText === undefined ? 0 : excelNumber(priceText);
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`${sheetName}, fila ${row + 1}: revisá la cantidad o el precio en el Excel.`);
          missingQuantity ||= quantityText === undefined;
          missingPrice ||= priceText === undefined;
          const detail = columnValue(["descripcion", "detalle", "producto"]) ?? "";
          const dimensions = columnValue(["medidas", "medida", "tamaño"]);
          const crop = node(blipFill.srcRect);
          const transform = node(node(picture.spPr).xfrm);
          if (transform["@rot"] || transform["@flipH"] === "1" || transform["@flipV"] === "1") result.warnings.push(`${name || "Imagen"} (${sheetName}): se extrae sin la rotación o el reflejo aplicado en Excel.`);
          pictures.push({ key: `excel-${sheetIndex + 1}-${anchorIndex + 1}-${pictureIndex + 1}`, code: columnValue(["codigo", "cod", "cod."]) || name || `Imagen ${pictures.length + 1}`,
            description: [detail, dimensions, `${sheetName} · fila ${row + 1}`].filter(Boolean).join(" · "), quantity, unitPrice,
            sheet: sheetName, row, column, bytes: files[imagePath], mimeType,
            crop: { left: Number(text(crop["@l"]) || 0) / 100000, top: Number(text(crop["@t"]) || 0) / 100000, right: Number(text(crop["@r"]) || 0) / 100000, bottom: Number(text(crop["@b"]) || 0) / 100000 },
          });
        }
      }
    }
    pictures.sort((a, b) => a.row - b.row || a.column - b.column);
    if (!result.clientName && pictures.length) {
      const first = cells.find((cell) => cell.row < pictures[0].row && cell.value.length <= 80 && !/^\d/.test(cell.value));
      if (first) { result.clientName = first.value; result.warnings.push("Revisá el nombre del cliente, tomado del encabezado de la hoja."); }
    }
    result.pictures.push(...pictures);
    result.sheets.push(sheetName);
    if (text(sheet["@state"]) === "hidden" || text(sheet["@state"]) === "veryHidden") result.warnings.push(`También se revisó la hoja oculta ${sheetName}.`);
    if (worksheet.legacyDrawing || worksheet.cellImage || Object.keys(files).some((path) => /^xl\/(?:richData\/|cellimages\.xml)/i.test(path))) result.warnings.push(`${sheetName}: las imágenes dentro de celdas o de formatos antiguos pueden no extraerse. Usá imágenes insertadas sobre la hoja.`);
  }
  if (!result.pictures.length) throw new Error("No se encontraron imágenes incrustadas compatibles. Insertá las imágenes sobre la hoja (Insertar > Imágenes) y guardá el archivo como .xlsx.");
  if (result.pictures.length > 100 || result.pictures.reduce((sum, picture) => sum + picture.quantity, 0) > 200) throw new Error("El límite por importación es de 100 modelos o 200 cuadros.");
  if (!result.clientName) { result.clientName = filename.replace(/\.xlsx$/i, "").slice(0, 80); result.warnings.push("Revisá el nombre del cliente, tomado del nombre del archivo."); }
  if (missingQuantity) result.warnings.push("Las imágenes sin cantidad reconocida se cargan como 1 unidad. Revisá las cantidades antes de confirmar.");
  if (missingPrice) result.warnings.push("Las imágenes sin precio reconocido se cargan con precio 0. Completalo si corresponde.");
  if (result.pictures.some((picture) => picture.mimeType === "image/gif")) result.warnings.push("Las imágenes GIF se guardan como fotos fijas.");
  result.warnings = [...new Set(result.warnings)];
  return result;
}

function excelNumber(value: string) {
  const clean = value.replace(/[$\s]/g, "");
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
}
