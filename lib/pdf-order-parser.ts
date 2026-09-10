// Layout-aware parser for the MAVA order table. Document text is data, never instructions.
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
  const prices = new Map<string, number[]>();
  const lineTotals = new Map<string, number[]>();
  const totals: number[] = [];

  for (const page of pages) {
    const texts = page.texts.filter((text) => text.text.trim());
    const header = texts.find((text) => normalize(text.text) === "descripcion");
    const imageHeader = texts.find((text) => normalize(text.text) === "imagen");
    const priceHeader = texts.find((text) => normalize(text.text) === "precio");
    const qtyHeader = texts.find((text) => normalize(text.text) === "cantidad");
    const totalHeader = texts.find((text) => text.text.trim() === "Total");
    if (!header || !imageHeader || !priceHeader || !qtyHeader || !totalHeader) {
      result.warnings.push(`No se reconoció la tabla en la página ${page.number}.`);
      continue;
    }
    const footer = texts.find((text) => text.text.trim() === "TOTAL" && text.y < header.y);
    const top = header.y - 10;
    const bottom = footer ? footer.y + 14 : 0;
    const imageStart = (header.x + header.width + imageHeader.x) / 2 - 15;
    const priceStart = (imageHeader.x + imageHeader.width + priceHeader.x) / 2;
    const qtyStart = (priceHeader.x + priceHeader.width + qtyHeader.x) / 2;
    const totalStart = (qtyHeader.x + qtyHeader.width + totalHeader.x) / 2;
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
      const quantityTexts = row.filter((text) => text.x >= qtyStart && text.x < totalStart && /^\d+$/.test(text.text.trim()));
      for (const text of quantityTexts) quantities.set(product.key, [...quantities.get(product.key) ?? [], Number(text.text)]);
      const unit = parsePdfMoney(row.filter((text) => text.x >= priceStart && text.x < qtyStart).map((text) => text.text).join(""));
      if (unit !== null) prices.set(product.key, [...prices.get(product.key) ?? [], unit]);
      const total = parsePdfMoney(row.filter((text) => text.x >= totalStart).map((text) => text.text).join(""));
      if (total !== null) lineTotals.set(product.key, [...lineTotals.get(product.key) ?? [], total]);
      const images = page.images.filter((image) => {
        const x = image.x + image.width / 2, y = image.y + image.height / 2;
        return x > imageStart && x < priceStart && y < upper && y > lower;
      }).sort((a, b) => b.width * b.height - a.width * a.height);
      if (images[0] && !product.image) product.image = { ...images[0], page: page.number };
    }
    if (footer) {
      const total = parsePdfMoney(texts.filter((text) => text.x > footer.x + footer.width && Math.abs(text.y - footer.y) < 3).map((text) => text.text).join(""));
      if (total !== null) totals.push(total);
    }
  }
  for (const product of result.products) {
    const qty = quantities.get(product.key) ?? [];
    const price = prices.get(product.key) ?? [];
    product.quantity = qty[0] ?? 0;
    product.unitPrice = price[0] ?? 0;
    if (qty.length !== 1 || !Number.isInteger(product.quantity) || product.quantity < 1) result.warnings.push(`Revisá la cantidad de ${product.code}.`);
    if (price.length !== 1) result.warnings.push(`Revisá el precio de ${product.code}.`);
    const total = lineTotals.get(product.key)?.[0];
    if (total !== undefined && Math.abs(total - product.quantity * product.unitPrice) > 0.01) result.warnings.push(`El subtotal de ${product.code} no coincide con cantidad × precio.`);
    if (!product.image) result.warnings.push(`No se pudo extraer la foto de ${product.code}.`);
  }
  result.declaredTotal = totals[0] ?? null;
  if (new Set(totals).size > 1) result.warnings.push("El PDF muestra totales distintos entre sus páginas.");
  const calculated = result.products.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (result.declaredTotal !== null && Math.abs(calculated - result.declaredTotal) > 0.01) result.warnings.push("La suma de los cuadros no coincide con el total del PDF. Revisá cantidades y precios.");
  if (!result.clientName) result.warnings.push("Completá el nombre del cliente.");
  if (!result.products.length) throw new Error("No se reconocieron cuadros. Usá un PDF de pedido de MAVA con texto seleccionable; las fotos o escaneos todavía no se reconocen.");
  return result;
}
