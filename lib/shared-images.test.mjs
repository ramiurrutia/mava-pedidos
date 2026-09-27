import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import manifest from "../app/manifest.ts";
import { loadSharedImages, removeSharedImages, saveSharedImages } from "./shared-images.ts";

const origin = "https://mava.example";
const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function setup({ failStorage = false } = {}) {
  const stores = new Map();
  const storage = {
    async open(name) {
      if (failStorage) throw new Error("Quota exceeded");
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      const key = (request) => typeof request === "string" ? request : request.url;
      return {
        async put(request, response) { entries.set(key(request), response.clone()); },
        async match(request) { return entries.get(key(request))?.clone(); },
        async delete(request) { return entries.delete(key(request)); },
        async keys() { return [...entries.keys()].map((url) => new Request(url)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const listeners = {};
  vm.runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (type, handler) => { listeners[type] = handler; },
      clients: { claim: async () => {} },
    },
    caches: storage, URL, Response, FormData, crypto,
  });
  globalThis.caches = storage;
  globalThis.window = { location: { origin } };
  return {
    storage,
    async share(files) {
      const body = new FormData();
      for (const file of files) body.append("images", file);
      let response;
      listeners.fetch({
        request: new Request(`${origin}${manifest().share_target.action}`, { method: "POST", body }),
        respondWith(value) { response = value; },
      });
      return await response;
    },
    async activate() {
      let promise;
      listeners.activate({ waitUntil(value) { promise = value; } });
      await promise;
    },
  };
}

function shareId(response) {
  assert.equal(response.status, 303);
  return new URL(response.headers.get("location")).searchParams.get("share");
}

test("manifest and service worker receive multiple images preserving names, MIME and bytes", async () => {
  const { share } = setup();
  const target = manifest().share_target;
  assert.equal(target.method, "POST");
  assert.equal(target.enctype, "multipart/form-data");
  assert.equal(target.params.files[0].name, "images");
  const id = shareId(await share([
    new File(["first-photo"], "foto ñ.jpg", { type: "image/jpeg" }),
    new File(["second-photo"], "foto.png", { type: "image/png" }),
  ]));
  assert.ok(id);
  const draft = await loadSharedImages(id);
  assert.equal(draft.uploads.length, 2);
  assert.equal(draft.uploads[0].file.name, "foto ñ.jpg");
  assert.equal(draft.uploads[0].file.type, "image/jpeg");
  assert.equal(await draft.uploads[1].file.text(), "second-photo");
  assert.equal((await loadSharedImages(id)).uploads.length, 2, "reading must not consume the photos");
});

test("simultaneous shares are isolated and worker updates preserve pending images", async () => {
  const { share, storage, activate } = setup();
  const a = shareId(await share([new File(["a"], "same.jpg", { type: "image/jpeg" })]));
  const b = shareId(await share([new File(["b"], "same.jpg", { type: "image/jpeg" })]));
  assert.notEqual(a, b);
  await storage.open("mava-pwa-v2-static");
  await activate();
  assert.ok(!(await storage.keys()).includes("mava-pwa-v2-static"));
  assert.equal(await (await loadSharedImages(a)).uploads[0].file.text(), "a");
  await removeSharedImages(a);
  await assert.rejects(loadSharedImages(a), /ya se guardaron/);
  assert.equal(await (await loadSharedImages(b)).uploads[0].file.text(), "b");
});

test("retry checkpoint keeps only remaining photos, descriptions and original destination", async () => {
  const { share } = setup();
  const id = shareId(await share([
    new File(["a"], "same.jpg", { type: "image/jpeg" }),
    new File(["b"], "same.jpg", { type: "image/jpeg" }),
  ]));
  const draft = await loadSharedImages(id);
  await saveSharedImages(id, {
    ...draft, orderId: "order-123", uploads: [{ ...draft.uploads[1], description: "Tela grande" }],
  });
  const restored = await loadSharedImages(id);
  assert.equal(restored.orderId, "order-123");
  assert.equal(restored.uploads.length, 1);
  assert.equal(restored.uploads[0].description, "Tela grande");
  assert.equal(await restored.uploads[0].file.text(), "b");
  await saveSharedImages(id, { ...restored, uploads: [] });
  assert.deepEqual((await loadSharedImages(id)).uploads, []);
});

test("empty, unsupported, zero byte and oversized shares show explicit errors", async () => {
  const { share } = setup();
  for (const files of [[], ["text"], [new File(["text"], "file.txt", { type: "text/plain" })], [new File([], "empty.jpg", { type: "image/jpeg" })]]) {
    assert.match((await share(files)).headers.get("location"), /error=images$/);
  }
  const large = new File([new Uint8Array(6 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
  assert.match((await share([large])).headers.get("location"), /error=size$/);
  const many = Array.from({ length: 31 }, () => new File(["x"], "photo.jpg", { type: "image/jpeg" }));
  assert.match((await share(many)).headers.get("location"), /error=size$/);
});

test("expired shares are removed and invalid identifiers cannot read other cache paths", async () => {
  const { share } = setup();
  const id = shareId(await share([new File(["x"], "photo.jpg", { type: "image/jpeg" })]));
  const draft = await loadSharedImages(id);
  await saveSharedImages(id, { ...draft, createdAt: Date.now() - 25 * 60 * 60 * 1000 });
  await assert.rejects(loadSharedImages(id), /vencieron/);
  await assert.rejects(loadSharedImages(id), /ya se guardaron/);
  await assert.rejects(loadSharedImages("../../pedidos"), /no es válido/);
});

test("storage failure redirects to a recoverable error", async () => {
  const { share } = setup({ failStorage: true });
  assert.match((await share([new File(["x"], "photo.jpg", { type: "image/jpeg" })])).headers.get("location"), /error=storage$/);
});
