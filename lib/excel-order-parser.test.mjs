import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseExcelOrder } from "./excel-order-parser.ts";

const image = new Uint8Array([255, 216, 255, 217]);
const relationships = (body) => `<Relationships>${body}</Relationships>`;
const relationship = (id, target, extra = "") => `<Relationship Id="${id}" Target="${target}" ${extra}/>`;
const anchor = (row, id = "image1", type = "twoCellAnchor") => `<xdr:${type}><xdr:from><xdr:row>${row}</xdr:row><xdr:col>0</xdr:col></xdr:from><xdr:pic><xdr:nvPicPr><xdr:cNvPr name="Foto ${row}"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic></xdr:${type}>`;
const drawing = (body) => `<xdr:wsDr xmlns:xdr="drawing" xmlns:a="drawingml" xmlns:r="rel">${body}</xdr:wsDr>`;
const stringCell = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
function fixture(overrides = {}) {
  const entries = {
    "xl/workbook.xml": '<workbook xmlns:r="rel"><sheets><sheet name="Pedido" r:id="sheet1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": relationships(relationship("sheet1", "worksheets/sheet1.xml")),
    "xl/sharedStrings.xml": '<sst><si><r><t>Cliente </t></r><r><t>Ejemplo</t></r></si></sst>',
    "xl/worksheets/sheet1.xml": '<worksheet xmlns:r="rel"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData><drawing r:id="drawing1"/></worksheet>',
    "xl/worksheets/_rels/sheet1.xml.rels": relationships(relationship("drawing1", "../drawings/drawing1.xml")),
    "xl/drawings/drawing1.xml": drawing(anchor(5) + anchor(2, "image1", "oneCellAnchor")),
    "xl/drawings/_rels/drawing1.xml.rels": relationships(relationship("image1", "../media/image1.jpeg")),
    "xl/media/image1.jpeg": image,
    ...overrides,
  };
  return zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, typeof value === "string" ? strToU8(value) : value])));
}

test("extrae imágenes insertadas, ordena por fila y conserva apariciones repetidas", () => {
  const result = parseExcelOrder(fixture(), "pedido.xlsx");
  assert.equal(result.clientName, "Cliente Ejemplo");
  assert.deepEqual(result.pictures.map((picture) => picture.row), [2, 5]);
  assert.equal(result.pictures.length, 2);
  assert.notEqual(result.pictures[0].key, result.pictures[1].key);
  assert.deepEqual(result.pictures[0].bytes, image);
  assert.equal(result.pictures[0].mimeType, "image/jpeg");
  assert.equal(result.pictures[0].quantity, 1);
  assert.equal(result.pictures[0].unitPrice, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("1 unidad")));
  assert.ok(result.warnings.some((warning) => warning.includes("precio 0")));
});

test("lee cantidades, códigos, texto escapado y precios sin ejecutar fórmulas", () => {
  const result = parseExcelOrder(fixture({
    "xl/drawings/drawing1.xml": drawing(anchor(2)),
    "xl/worksheets/sheet1.xml": `<worksheet xmlns:r="rel"><sheetData>
      <row r="1">${stringCell("A1", "Cliente")}${stringCell("B1", "Ana &amp; Hijos")}</row>
      <row r="2">${stringCell("B2", "Cantidad")}${stringCell("C2", "Precio")}${stringCell("D2", "Código")}${stringCell("E2", "Descripción")}</row>
      <row r="3"><c r="B3"><f>1+1</f><v>2</v></c>${stringCell("C3", "$ 1.234,50")}${stringCell("D3", "0012")}${stringCell("E3", "Marco &lt;roble&gt;")}</row>
      </sheetData><drawing r:id="drawing1"/></worksheet>`,
  }), "pedido.xlsx");
  assert.equal(result.clientName, "Ana & Hijos");
  assert.equal(result.pictures[0].quantity, 2);
  assert.equal(result.pictures[0].unitPrice, 1234.5);
  assert.equal(result.pictures[0].code, "0012");
  assert.match(result.pictures[0].description, /Marco <roble>/);
});

test("incluye varias hojas sin perder imágenes y avisa si una hoja estaba oculta", () => {
  const result = parseExcelOrder(fixture({
    "xl/workbook.xml": '<workbook xmlns:r="rel"><sheets><sheet name="Uno" r:id="sheet1"/><sheet name="Dos" state="hidden" r:id="sheet2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": relationships(relationship("sheet1", "worksheets/sheet1.xml") + relationship("sheet2", "worksheets/sheet2.xml")),
    "xl/worksheets/sheet2.xml": '<worksheet xmlns:r="rel"><drawing r:id="drawing1"/></worksheet>',
    "xl/worksheets/_rels/sheet2.xml.rels": relationships(relationship("drawing1", "../drawings/drawing1.xml")),
  }), "pedido.xlsx");
  assert.deepEqual(result.sheets, ["Uno", "Dos"]);
  assert.equal(result.pictures.length, 4);
  assert.equal(new Set(result.pictures.map((picture) => picture.key)).size, 4);
  assert.ok(result.warnings.some((warning) => warning.includes("hoja oculta Dos")));
});

test("rechaza imágenes externas o faltantes sin omitirlas silenciosamente", () => {
  assert.throws(() => parseExcelOrder(fixture({ "xl/drawings/_rels/drawing1.xml.rels": relationships(relationship("image1", "https://example.com/photo.jpg", 'TargetMode="External"')) }), "pedido.xlsx"), /vinculada/);
  assert.throws(() => parseExcelOrder(fixture({ "xl/drawings/_rels/drawing1.xml.rels": relationships(relationship("image1", "../media/missing.jpeg")) }), "pedido.xlsx"), /no compatible/);
});

test("rechaza XML inválido, entidades y referencias fuera del libro", () => {
  assert.throws(() => parseExcelOrder(fixture({ "xl/workbook.xml": '<!DOCTYPE x [<!ENTITY file SYSTEM "file:///secret">]><workbook/>' }), "pedido.xlsx"), /XML/);
  assert.throws(() => parseExcelOrder(fixture({ "xl/workbook.xml": '<workbook><sheets></workbook>' }), "pedido.xlsx"), /XML/);
  assert.throws(() => parseExcelOrder(fixture({ "xl/_rels/workbook.xml.rels": relationships(relationship("sheet1", "../../outside.xml")) }), "pedido.xlsx"), /inválida/);
});

test("informa formatos no compatibles y hojas sin imágenes", () => {
  assert.throws(() => parseExcelOrder(fixture(), "pedido.xls"), /\.xlsx/);
  assert.throws(() => parseExcelOrder(strToU8("not an Excel"), "pedido.xlsx"), /válido/);
  assert.throws(() => parseExcelOrder(fixture({ "xl/drawings/drawing1.xml": drawing("") }), "pedido.xlsx"), /No se encontraron imágenes/);
});

test("limita cantidad de imágenes y tamaño expandido", () => {
  assert.throws(() => parseExcelOrder(fixture({ "xl/drawings/drawing1.xml": drawing(Array.from({ length: 101 }, (_, index) => anchor(index + 2)).join("")) }), "pedido.xlsx"), /100 modelos/);
  const large = fixture({ "xl/media/large.png": new Uint8Array(21 * 1024 * 1024) });
  assert.throws(() => parseExcelOrder(large, "pedido.xlsx"), /demasiado grande/);
});
