import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMavaPdf, parsePdfOrder } from "./pdf-order-parser.ts";

const qrHeaders = (y) => [text("Cantidad / Producto", 37.5, y, 114), text("Imágenes", 375, y, 54), text("Comentarios", 487, y, 71)];
const qrPhoto = (y) => ({ x: 375, y, width: 54, height: 75 });

const text = (text, x, y, width = 30) => ({ text, x, y, width, height: 10 });
const table = [text("Descripción", 34, 600, 60), text("Imagen", 156, 600), text("Precio", 260, 600), text("Cantidad", 318, 600), text("Total", 424, 600), text("XGM 1234", 34, 550), text("Marco roble", 34, 530), text("$ 1.000,00", 260, 545), text("2", 340, 545), text("$ 2.000,00", 424, 545), text("TOTAL", 300, 100), text("$ 2.000,00", 424, 100)];

test("localidad se reconoce por separado, sin duplicarla en la dirección", () => {
  const parsed = parseMavaPdf([{ number: 1, images: [], texts: [
    text("Cliente", 34, 780), text("Cliente de prueba", 34, 760),
    text("Localidad", 200, 780), text("Mar del Plata", 200, 760),
    text("Dirección", 34, 700), text("Calle de prueba 123", 34, 680),
    text("Provincia", 200, 700), text("Buenos Aires", 200, 680), ...table,
  ] }]);
  assert.equal(parsed.locality, "Mar del Plata");
  assert.equal(parsed.address, "Calle de prueba 123, Buenos Aires");
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].quantity, 2);
  assert.equal(parsed.declaredTotal, null);
  assert.equal(parsed.products[0].unitPrice, 0);
});

test("no inventa una localidad cuando el PDF no la contiene", () => {
  const parsed = parseMavaPdf([{ number: 1, images: [], texts: table }]);
  assert.equal(parsed.locality, "");
});

test("ignora importes incorrectos sin generar advertencias sobre precios", () => {
  const texts = table.map((item) => item.text.startsWith("$") ? { ...item, text: "$ importe ilegible" } : item);
  const parsed = parseMavaPdf([{ number: 1, images: [{ x: 160, y: 520, width: 50, height: 35 }], texts }]);
  assert.equal(parsed.products[0].quantity, 2);
  assert.equal(parsed.products[0].description, "Marco roble");
  assert.ok(parsed.products[0].image);
  assert.equal(parsed.products[0].unitPrice, 0);
  assert.equal(parsed.declaredTotal, null);
  assert.ok(parsed.warnings.every((warning) => !/precio|total|importe/i.test(warning)));
});

test("reconoce cantidad, descripción e imagen en tablas sin columnas de precios", () => {
  const texts = table.filter((item) => !["Precio", "Total", "TOTAL"].includes(item.text) && !item.text.startsWith("$"));
  const parsed = parseMavaPdf([{ number: 1, images: [{ x: 160, y: 520, width: 50, height: 35 }], texts }]);
  assert.equal(parsed.products[0].quantity, 2);
  assert.equal(parsed.products[0].description, "Marco roble");
  assert.ok(parsed.products[0].image);
});

test("la detección automática conserva los productos y cantidades de MAVA", () => {
  const pages = [{ number: 1, images: [{ x: 160, y: 520, width: 50, height: 35 }], texts: table }];
  assert.deepEqual(parsePdfOrder(pages), parseMavaPdf(pages));
});

// Rounded geometry from the illustrated list supplied as a format example.
// Keep the fixture synthetic: no customer document or image data in the repo.
const listImages = [
  [55, 715, 54, 42], [55, 669, 54, 42], [61, 615, 42, 55], [60, 560, 42, 54],
  [58, 511, 42, 46], [60, 462, 42, 46], [62, 410, 38, 51], [64, 357, 38, 51],
  [62, 303, 38, 49], [61, 254, 38, 49], [60, 208, 38, 47], [59, 158, 38, 47],
  [59, 110, 23, 47], [62, 60, 20, 48],
].map(([x, y, width, height]) => ({ x, y, width, height }));
const listBaselines = [723, 676, 629, 582, 534, 487, 417, 370, 323, 276, 229, 182, 135, 88];
const listPage = {
  number: 1, images: listImages,
  texts: [text("CLIENTE DE PRUEBA", 54, 770), ...listBaselines.flatMap((y, index) => [
    { ...text(index < 12 && index % 2 ? "dng" : "xg", 140, y), height: 18 },
    ...(index < 12 ? [{ ...text(index < 4 ? "natural" : "blanco", 184, y), height: 18 }] : []),
  ])],
};

test("lee las 14 fotos de una lista sin tabla, incluidos modelos repetidos y filas sin color", () => {
  const parsed = parsePdfOrder([listPage]);
  assert.equal(parsed.clientName, "CLIENTE DE PRUEBA");
  assert.equal(parsed.products.length, 14);
  assert.deepEqual(parsed.products.map((product) => product.description), [
    "xg natural", "dng natural", "xg natural", "dng natural",
    "xg blanco", "dng blanco", "xg blanco", "dng blanco", "xg blanco", "dng blanco", "xg blanco", "dng blanco", "xg", "xg",
  ]);
  assert.deepEqual(parsed.products.map((product) => product.image), listImages.map((image) => ({ ...image, page: 1 })));
  assert.ok(parsed.products.every((product) => product.quantity === 1 && product.unitPrice === 0));
  assert.equal(parsed.declaredTotal, null);
  assert.ok(parsed.warnings.some((warning) => warning.includes("1 unidad por imagen")));
});

test("mantiene la asociación y claves únicas entre páginas, independientemente del orden interno del PDF", () => {
  const parsed = parsePdfOrder([
    { ...listPage, images: [...listImages].reverse(), texts: [...listPage.texts].reverse() },
    { ...listPage, number: 2 },
  ]);
  assert.equal(parsed.products.length, 28);
  assert.equal(new Set(parsed.products.map((product) => product.key)).size, 28);
  assert.equal(new Set(parsed.products.map((product) => product.code)).size, 28);
  assert.equal(parsed.products[0].description, "xg natural");
  assert.equal(parsed.products[14].description, "xg natural");
  assert.equal(parsed.products[14].image.page, 2);
  assert.ok(parsed.products.every((product) => !product.description.includes("CLIENTE")));
});

test("reúne descripciones en varias líneas sin incluir el encabezado ni el pie", () => {
  const parsed = parsePdfOrder([{ number: 1, images: [{ x: 50, y: 400, width: 50, height: 70 }], texts: [
    text("CLIENTE", 50, 500), text("xg", 140, 440), text("marco", 180, 441),
    text("natural", 140, 420), text("Pie de página", 140, 380),
  ] }]);
  assert.equal(parsed.products[0].description, "xg marco natural");
});

test("advierte sobre páginas e imágenes no reconocidas sin perder las filas válidas", () => {
  const parsed = parsePdfOrder([
    { ...listPage, images: [...listImages, { x: 450, y: 740, width: 40, height: 40 }] },
    { number: 2, images: [], texts: [text("Notas", 50, 700)] },
  ]);
  assert.equal(parsed.products.length, 14);
  assert.ok(parsed.warnings.some((warning) => warning.includes("imágenes sin descripción")));
  assert.ok(parsed.warnings.some((warning) => warning.includes("página 2")));
});

test("no inventa productos para escaneos ni imágenes sin texto asociado", () => {
  assert.throws(() => parsePdfOrder([{ number: 1, images: [{ x: 0, y: 0, width: 600, height: 800 }], texts: [] }]), /No se reconocieron cuadros/);
  assert.throws(() => parsePdfOrder([{ number: 1, images: [], texts: [text("Solo texto", 50, 700)] }]), /No se reconocieron cuadros/);
});

test("MavaQR lee cantidades, códigos y descripciones envueltas, conservando productos sin foto", () => {
  const parsed = parsePdfOrder([{ number: 1, images: [qrPhoto(559), qrPhoto(471)], texts: [
    text("Cliente", 171, 793), text("Cliente de prueba", 171, 776),
    text("Localidad", 433, 793), text("Tres Arroyos, Buenos", 433, 776), text("Aires", 433, 758),
    text("Teléfono", 171, 733), text("N/A", 171, 716), text("Correo", 302, 733), text("N/A", 302, 716),
    ...qrHeaders(683), text("1", 37.5, 651), text("Espejo EXC ROBLE", 48, 651),
    text("2", 37.5, 601), text("XGTELA ARP (1001) BLANCO sin vidrio Arpillera", 48, 601), text("Gris", 37.5, 583),
    text("3", 37.5, 513), text("DNG ARP TELA (1001) ROBLE sin vidrio", 48, 513),
    text("Revisar marco", 487, 513), text("Detalles de envío", 37.5, 410), text(": Calle de prueba 123", 134, 410),
    text("https://ejemplo.test/reporte", 24, 16), text("1/2", 560, 16),
  ] }]);
  assert.equal(parsed.clientName, "Cliente de prueba");
  assert.equal(parsed.locality, "Tres Arroyos, Buenos Aires");
  assert.equal(parsed.address, "Calle de prueba 123");
  assert.equal(parsed.phone, "");
  assert.equal(parsed.email, "");
  assert.deepEqual(parsed.products.map((product) => product.quantity), [1, 2, 3]);
  assert.equal(parsed.products[0].description, "Espejo EXC ROBLE");
  assert.equal(parsed.products[0].image, undefined);
  assert.equal(parsed.products[1].code, "XGTELA ARP (1001)");
  assert.equal(parsed.products[1].description, "BLANCO sin vidrio Arpillera Gris");
  assert.deepEqual(parsed.products[1].image, { ...qrPhoto(559), page: 1 });
  assert.equal(parsed.products[2].code, "DNG ARP TELA (1001)");
  assert.equal(parsed.products[2].description, "ROBLE sin vidrio · Comentarios: Revisar marco");
  assert.deepEqual(parsed.products[2].image, { ...qrPhoto(471), page: 1 });
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /foto de Espejo/);
  assert.ok(parsed.products.every((product) => product.unitPrice === 0));
  assert.equal(parsed.declaredTotal, null);
});

test("MavaQR continúa entre páginas y no convierte notas finales ni pies de impresión en productos", () => {
  const page = { number: 1, images: [qrPhoto(701)], texts: [
    ...qrHeaders(794), text("12 TCCA (2002) BLANCA sin vidrio", 37.5, 734),
    text("- MavaQR", 320, 819), text("1/3", 560, 16),
  ] };
  const parsed = parsePdfOrder([page, { ...page, number: 2, texts: [...page.texts].reverse() },
    { number: 3, images: [], texts: [...qrHeaders(794), text("Comentarios generales", 37.5, 763), text(": retirar", 166, 763)] },
  ]);
  assert.equal(parsed.products.length, 2);
  assert.deepEqual(parsed.products.map((product) => product.key), ["product-1", "product-2"]);
  assert.ok(parsed.products.every((product) => product.quantity === 12 && product.description === "BLANCA sin vidrio"));
  assert.deepEqual(parsed.products.map((product) => product.image.page), [1, 2]);
  assert.deepEqual(parsed.warnings, ["Completá el nombre del cliente."]);
});

test("MavaQR sin fotos conserva las filas y advierte sobre cantidades inválidas", () => {
  const parsed = parsePdfOrder([{ number: 1, images: [], texts: [
    ...qrHeaders(794), text("0", 37.5, 734), text("Espejo sin imagen", 48, 734),
  ] }]);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].description, "Espejo sin imagen");
  assert.equal(parsed.products[0].quantity, 0);
  assert.ok(parsed.warnings.some((warning) => warning.includes("cantidad")));
  assert.ok(parsed.warnings.some((warning) => warning.includes("foto")));
});
