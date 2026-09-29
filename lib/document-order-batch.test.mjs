import assert from "node:assert/strict";
import { test } from "node:test";
import { combineDocumentPreviews, validateDocumentSelection } from "./document-order-batch.ts";

function document(letter, overrides = {}) {
  return {
    format: "PDF", hash: letter.repeat(64), file: new File(["%PDF-test"], `${letter}.pdf`),
    clientName: "Cliente", phone: "", locality: "", email: "", address: "",
    declaredTotal: 200, warnings: [], pages: [{ number: 1, previewUrl: `blob:${letter}` }],
    products: [{ key: "same-key", code: "001", description: letter, quantity: 2, unitPrice: 100,
      file: new File([letter], `${letter}.jpg`), previewUrl: `blob:${letter}` }], dispose() {}, ...overrides,
  };
}

test("combina tres PDFs sin mezclar imágenes y conserva una identidad estable al reordenarlos", async () => {
  const documents = [document("a"), document("b"), document("c")];
  const preview = await combineDocumentPreviews(documents);
  const reordered = await combineDocumentPreviews([...documents].reverse());
  assert.equal(preview.hash, reordered.hash);
  assert.equal(preview.declaredTotal, 600);
  assert.equal(preview.pages.length, 3);
  assert.equal(new Set(preview.products.map((product) => product.key)).size, 3);
  assert.deepEqual(preview.products.map((product) => product.sourceFilename), ["a.pdf", "b.pdf", "c.pdf"]);
  assert.deepEqual(preview.products, reordered.products);
});

test("rechaza PDFs duplicados, más de tres archivos y mezclas de PDF con Excel", async () => {
  await assert.rejects(combineDocumentPreviews([document("a"), document("a")]), /ya está seleccionado/);
  assert.throws(() => validateDocumentSelection(Array.from({ length: 4 }, () => new File([], "a.pdf"))), /hasta 3/);
  assert.throws(() => validateDocumentSelection([new File([], "a.pdf"), new File([], "a.xlsx")]), /todos deben ser PDFs/);
});

test("mantiene la identidad de un único documento y libera todas las vistas previas", async () => {
  const disposed = [];
  const one = document("a", { dispose: () => disposed.push("a") });
  assert.equal((await combineDocumentPreviews([one])).hash, one.hash);
  const result = await combineDocumentPreviews([one, document("b", { dispose: () => disposed.push("b") })]);
  result.dispose();
  assert.deepEqual(disposed, ["a", "b"]);
});

test("advierte si cambian los clientes y no inventa un total impreso faltante", async () => {
  const result = await combineDocumentPreviews([document("a"), document("b", { clientName: "Otra persona", declaredTotal: null })]);
  assert.equal(result.declaredTotal, null);
  assert.ok(result.warnings.some((warning) => warning.includes("diferentes")));
});
