import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMavaPdf } from "./pdf-order-parser.ts";

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
  assert.equal(parsed.declaredTotal, 2000);
});

test("no inventa una localidad cuando el PDF no la contiene", () => {
  const parsed = parseMavaPdf([{ number: 1, images: [], texts: table }]);
  assert.equal(parsed.locality, "");
});
