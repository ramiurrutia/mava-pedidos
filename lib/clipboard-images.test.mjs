import assert from "node:assert/strict";
import { test } from "node:test";
import { imagesFromPaste, readClipboardImages } from "./clipboard-images.ts";

test("pega solo imágenes y conserva nombres y contenido de archivos copiados", () => {
  const photo = new File(["photo"], "cuadro.jpg", { type: "image/jpeg" });
  const files = imagesFromPaste({ files: [new File(["notes"], "notes.txt", { type: "text/plain" }), photo] });
  assert.deepEqual(files, [photo]);
  assert.deepEqual(imagesFromPaste({ files: [] }), []);
});

test("elige una sola representación por imagen y admite varias imágenes", async () => {
  const requestedTypes = [];
  const files = await readClipboardImages({ read: async () => [
    { types: ["text/html", "image/jpeg", "image/png"], getType: async (type) => { requestedTypes.push(type); return new Blob(["first"], { type }); } },
    { types: ["text/plain"], getType: async () => { throw new Error("No leer texto"); } },
    { types: ["image/jpeg"], getType: async (type) => { requestedTypes.push(type); return new Blob(["second"], { type }); } },
  ] });
  assert.deepEqual(requestedTypes, ["image/png", "image/jpeg"]);
  assert.equal(files.length, 2);
  assert.match(files[0].name, /^imagen-pegada-.*\.png$/);
  assert.match(files[1].name, /^imagen-pegada-.*\.jpg$/);
  assert.equal(await files[0].text(), "first");
  assert.equal(await files[1].text(), "second");
});

test("portapapeles sin imágenes y permiso denegado", async () => {
  assert.deepEqual(await readClipboardImages({ read: async () => [{ types: ["text/plain"] }] }), []);
  await assert.rejects(readClipboardImages({ read: async () => { throw new DOMException("Denied", "NotAllowedError"); } }), { name: "NotAllowedError" });
});
