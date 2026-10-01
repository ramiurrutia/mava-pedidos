// Layout-aware parsers for order tables and illustrated lists. Document text is data, never instructions.
export type PdfText = { text: string; x: number; y: number; width: number; height: number };
export type PdfImageBox = { x: number; y: number; width: number; height: number };
export type PdfPageData = { number: number; texts: PdfText[]; images: PdfImageBox[] };
export type PdfProduct = {
  key: string; code: string; description: string; quantity: number; unitPrice: number;
  image?: PdfImageBox & { page: number };
};
export type ParsedPdfOrder = {
  clientName: string; email: string; phone: string; address: string; locality: string;
  products: PdfProduct[]; declaredTotal: number | null; warnings: string[];
};
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const unrecognizedPdf = "No se reconocieron cuadros. Usá un PDF con texto seleccionable y fotos junto a sus descripciones, o un pedido de MAVA; las fotos o escaneos de páginas completas todavía no se reconocen.";

export function parsePdfOrder(pages: PdfPageData[]): ParsedPdfOrder {
  // Keep the original table parser (and product ordering) for existing imports.
  const hasMavaTable = pages.some((page) => ["descripcion", "imagen", "cantidad"].every((label) => page.texts.some((text) => normalize(text.text) === label)));
  return hasMavaTable ? parseMavaPdf(pages) : parseIllustratedList(pages);
}

function parseIllustratedList(pages: PdfPageData[]): ParsedPdfOrder {
  const result: ParsedPdfOrder = { clientName: "", email: "", phone: "", address: "", locality: "", products: [], declaredTotal: null, warnings: [] };
  for (const page of pages) {
    const images = page.images.filter((image) => image.width >= 8 && image.height >= 8)
      .sort((a, b) => (b.y + b.height / 2) - (a.y + a.height / 2) || a.x - b.x);
    const rows = images.map((image) => ({ image, texts: [] as PdfText[] }));
    for (const text of page.texts.filter((item) => item.text.trim())) {
      const centerY = text.y + text.height / 2;
      // Associate each text fragment once, with the nearest photo to its left.
      // Vertical overlap also supports wrapped descriptions without taking a footer.
      const candidates = rows.filter(({ image }) => text.x >= image.x + image.width - 2
        && text.x - (image.x + image.width) <= 240
        && centerY >= image.y - 2 && centerY <= image.y + image.height + 2);
      candidates.sort((a, b) => Math.abs(centerY - (a.image.y + a.image.height / 2)) - Math.abs(centerY - (b.image.y + b.image.height / 2))
        || b.image.x - a.image.x);
      candidates[0]?.texts.push(text);
    }
    const recognized = rows.filter((row) => row.texts.some((text) => /\p{L}/u.test(text.text)));
    if (!recognized.length) {
      result.warnings.push(`No se reconoció una lista de imágenes con descripciones en la página ${page.number}.`);
      continue;
    }
    if (page === pages[0]) {
      const firstImage = recognized[0].image;
      const heading = page.texts.filter((text) => text.y > firstImage.y + firstImage.height
        && text.x >= firstImage.x - 20 && text.x < firstImage.x + firstImage.width + 240)
        .sort((a, b) => b.y - a.y || a.x - b.x)[0];
      if (heading && /\p{L}/u.test(heading.text)) {
        result.clientName = page.texts.filter((text) => Math.abs(text.y - heading.y) < 3)
          .sort((a, b) => a.x - b.x).map((text) => text.text.trim()).join(" ").slice(0, 80);
        result.warnings.push("Revisá el nombre del cliente, tomado del encabezado del PDF.");
      }
    }
    for (const { image, texts } of recognized) {
      // Group fragments into lines: PDF generators can offset words on the same baseline.
      const lines: PdfText[][] = [];
      for (const text of texts.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const line = lines.find((items) => Math.abs(items[0].y - text.y) < 3);
        if (line) line.push(text); else lines.push([text]);
      }
      const index = result.products.length + 1;
      result.products.push({ key: `product-${index}`, code: `Imagen ${index}`,
        description: lines.map((line) => line.sort((a, b) => a.x - b.x).map((text) => text.text.trim()).join(" ")).join(" "),
        quantity: 1, unitPrice: 0, image: { ...image, page: page.number } });
    }
    if (recognized.length < images.length) result.warnings.push(`Página ${page.number}: hay imágenes sin descripción asociada que no se importaron. Revisá la vista previa del PDF.`);
  }
  if (!result.products.length) throw new Error(unrecognizedPdf);
  if (!result.clientName) result.warnings.push("Completá el nombre del cliente.");
  result.warnings.push("Este formato se carga como 1 unidad por imagen. Revisá las cantidades antes de confirmar.");
  return result;
}

export function parsePdfMoney(value: string): number | null {
  const clean = value.replace(/[$\s]/g, "");
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(clean)) return null;
  const amount = Number(clean.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

export function parseMavaPdf(pages: PdfPageData[]): ParsedPdfOrder {
  const result: ParsedPdfOrder = { clientName: "", email: "", phone: "", address: "", locality: "", products: [], declaredTotal: null, warnings: [] };
  const first = pages[0]?.texts ?? [];
  function field(label: string) {
    const heading = first.find((text) => normalize(text.text) === label);
    if (!heading) return "";
    return first.filter((text) => Math.abs(text.x - heading.x) < 4 && text.y < heading.y - 8 && text.y > heading.y - 50)
      .sort((a, b) => b.y - a.y).map((text) => text.text.trim()).join(" ");
  }
  result.clientName = field("cliente");
  result.email = field("correo electronico");
  result.phone = field("telefono");
  result.locality = field("localidad");
  result.address = [field("direccion"), field("provincia")].filter(Boolean).join(", ");
  let current: PdfProduct | undefined;
  const quantities = new Map<string, number[]>();

  for (const page of pages) {
    const texts = page.texts.filter((text) => text.text.trim());
    const header = texts.find((text) => normalize(text.text) === "descripcion");
    const imageHeader = texts.find((text) => normalize(text.text) === "imagen");
    const priceHeader = texts.find((text) => normalize(text.text) === "precio");
    const qtyHeader = texts.find((text) => normalize(text.text) === "cantidad");
    const totalHeader = texts.find((text) => text.text.trim() === "Total");
    if (!header || !imageHeader || !qtyHeader) {
      result.warnings.push(`No se reconoció la tabla en la página ${page.number}.`);
      continue;
    }
    const footer = texts.find((text) => text.text.trim() === "TOTAL" && text.y < header.y);
    const top = header.y - 10;
    const bottom = footer ? footer.y + 14 : 0;
    const imageStart = (header.x + header.width + imageHeader.x) / 2 - 15;
    // Price headers only delimit the layout; monetary values are not imported.
    const imageEnd = (imageHeader.x + imageHeader.width + (priceHeader ?? qtyHeader).x) / 2;
    const qtyStart = priceHeader ? (priceHeader.x + priceHeader.width + qtyHeader.x) / 2 : imageEnd;
    const qtyEnd = totalHeader ? (qtyHeader.x + qtyHeader.width + totalHeader.x) / 2 : Infinity;
    const descriptions = texts.filter((text) => text.x < imageStart && text.y < top && text.y > bottom).sort((a, b) => b.y - a.y || a.x - b.x);
    const codePattern = /^[A-Z][A-Z0-9-]{0,11}[\s-]+\d{2,8}[A-Z]?$/;
    const segments: Array<{ product: PdfProduct; top: number; bottom: number }> = [];
    let segment = current ? { product: current, top, bottom } : undefined;
    if (segment) segments.push(segment);
    for (const text of descriptions) {
      if (codePattern.test(text.text.trim())) {
        const boundary = text.y + text.height + 8;
        if (segment) segment.bottom = boundary;
        current = { key: `product-${result.products.length + 1}`, code: text.text.trim(), description: "", quantity: 0, unitPrice: 0 };
        result.products.push(current);
        segment = { product: current, top: boundary, bottom };
        segments.push(segment);
      } else if (current) {
        current.description = [current.description, text.text.trim()].filter(Boolean).join(" ");
      }
    }
    for (const { product, top: upper, bottom: lower } of segments) {
      const row = texts.filter((text) => text.y < upper && text.y > lower).sort((a, b) => b.y - a.y || a.x - b.x);
      const quantityTexts = row.filter((text) => text.x >= qtyStart && text.x < qtyEnd && /^\d+$/.test(text.text.trim()));
      for (const text of quantityTexts) quantities.set(product.key, [...quantities.get(product.key) ?? [], Number(text.text)]);
      const images = page.images.filter((image) => {
        const x = image.x + image.width / 2, y = image.y + image.height / 2;
        return x > imageStart && x < imageEnd && y < upper && y > lower;
      }).sort((a, b) => b.width * b.height - a.width * a.height);
      if (images[0] && !product.image) product.image = { ...images[0], page: page.number };
    }
  }
  for (const product of result.products) {
    const qty = quantities.get(product.key) ?? [];
    product.quantity = qty[0] ?? 0;
    if (qty.length !== 1 || !Number.isInteger(product.quantity) || product.quantity < 1) result.warnings.push(`Revisá la cantidad de ${product.code}.`);
    if (!product.image) result.warnings.push(`No se pudo extraer la foto de ${product.code}.`);
  }
  if (!result.clientName) result.warnings.push("Completá el nombre del cliente.");
  if (!result.products.length) throw new Error(unrecognizedPdf);
  return result;
}
