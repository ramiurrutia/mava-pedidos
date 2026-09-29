import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import manifest from "../app/manifest.ts";
import { loadSharedImages, removeSharedImages, saveSharedImages } from "./shared-images.ts";

const origin = "https://mava.example";
const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const jpeg = (text) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(text)]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

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
    caches: storage, URL, Response, FormData, File, crypto,
  });
  globalThis.caches = storage;
  globalThis.window = { location: { origin } };
  return {
    storage,
    async share(files, { field = "images", text, malformed = false } = {}) {
      const body = new FormData();
      for (const file of files) body.append(field, file);
      if (text) body.append("text", text);
      let response;
      listeners.fetch({
        request: new Request(`${origin}${manifest().share_target.action}`, { method: "POST", body: malformed ? "broken multipart" : body }),
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
    new File([jpeg("first-photo")], "foto ñ.jpg", { type: "image/jpeg" }),
    new File([png], "foto.png", { type: "image/png" }),
  ]));
  assert.ok(id);
  const draft = await loadSharedImages(id);
  assert.equal(draft.uploads.length, 2);
  assert.equal(draft.uploads[0].file.name, "foto ñ.jpg");
  assert.equal(draft.uploads[0].file.type, "image/jpeg");
  assert.deepEqual(Buffer.from(await draft.uploads[1].file.arrayBuffer()), png);
  assert.equal((await loadSharedImages(id)).uploads.length, 2, "reading must not consume the photos");
});

test("share target declares MIME types, extensions and generic attachments for browser filtering", () => {
  const accepts = manifest().share_target.params.files[0].accept;
  for (const type of ["image/*", "image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream", ".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
    assert.ok(accepts.includes(type), `Missing share target accept: ${type}`);
  }
});

test("simultaneous shares are isolated and worker updates preserve pending images", async () => {
  const { share, storage, activate } = setup();
  const a = shareId(await share([new File([jpeg("a")], "same.jpg", { type: "image/jpeg" })]));
  const b = shareId(await share([new File([jpeg("b")], "same.jpg", { type: "image/jpeg" })]));
  assert.notEqual(a, b);
  await storage.open("mava-pwa-v2-static");
  await activate();
  assert.ok(!(await storage.keys()).includes("mava-pwa-v2-static"));
  assert.equal(await (await loadSharedImages(a)).uploads[0].file.slice(3).text(), "a");
  await removeSharedImages(a);
  await assert.rejects(loadSharedImages(a), /ya se guardaron/);
  assert.equal(await (await loadSharedImages(b)).uploads[0].file.slice(3).text(), "b");
});

test("retry checkpoint keeps only remaining photos, titles, descriptions and original destination", async () => {
  const { share } = setup();
  const id = shareId(await share([
    new File([jpeg("a")], "same.jpg", { type: "image/jpeg" }),
    new File([jpeg("b")], "same.jpg", { type: "image/jpeg" }),
  ]));
  const draft = await loadSharedImages(id);
  await saveSharedImages(id, {
    ...draft, orderId: "order-123", uploads: [{ ...draft.uploads[1], title: "Frente", description: "Tela grande" }],
  });
  const restored = await loadSharedImages(id);
  assert.equal(restored.orderId, "order-123");
  assert.equal(restored.uploads.length, 1);
  assert.equal(restored.uploads[0].description, "Tela grande");
  assert.equal(restored.uploads[0].title, "Frente");
  assert.equal(await restored.uploads[0].file.slice(3).text(), "b");
  await saveSharedImages(id, { ...restored, uploads: [] });
  assert.deepEqual((await loadSharedImages(id)).uploads, []);
});

test("empty, unsupported, zero byte and oversized shares show explicit errors", async () => {
  const { share } = setup();
  for (const files of [[], ["text"]]) {
    assert.match((await share(files)).headers.get("location"), /error=missing$/);
  }
  assert.match((await share([new File(["text"], "file.txt", { type: "text/plain" })])).headers.get("location"), /error=format$/);
  assert.match((await share([new File([], "empty.jpg", { type: "image/jpeg" })])).headers.get("location"), /error=empty$/);
  const large = new File([new Uint8Array(6 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
  assert.match((await share([large])).headers.get("location"), /error=size$/);
  const many = Array.from({ length: 31 }, () => new File(["x"], "photo.jpg", { type: "image/jpeg" }));
  assert.match((await share(many)).headers.get("location"), /error=size$/);
});

test("expired shares are removed and invalid identifiers cannot read other cache paths", async () => {
  const { share } = setup();
  const id = shareId(await share([new File([jpeg("x")], "photo.jpg", { type: "image/jpeg" })]));
  const draft = await loadSharedImages(id);
  await saveSharedImages(id, { ...draft, createdAt: Date.now() - 25 * 60 * 60 * 1000 });
  await assert.rejects(loadSharedImages(id), /vencieron/);
  await assert.rejects(loadSharedImages(id), /ya se guardaron/);
  await assert.rejects(loadSharedImages("../../pedidos"), /no es válido/);
});

test("storage failure redirects to a recoverable error", async () => {
  const { share } = setup({ failStorage: true });
  assert.match((await share([new File([jpeg("x")], "photo.jpg", { type: "image/jpeg" })])).headers.get("location"), /error=storage$/);
});

test("normalizes missing, generic and incorrect MIME without changing file bytes or names", async () => {
  const { share } = setup();
  const formats = [
    { bytes: jpeg("photo"), type: "image/jpeg" },
    { bytes: png, type: "image/png" },
    { bytes: Buffer.from("GIF87a"), type: "image/gif" },
    { bytes: Buffer.from("GIF89a"), type: "image/gif" },
    { bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), type: "image/webp" },
  ];
  for (const { bytes, type } of formats) {
    for (const declaredType of ["", "application/octet-stream", "image/jpg", "image/png"]) {
      const id = shareId(await share([new File([bytes], "archivo", { type: declaredType })]));
      assert.ok(id, `${type} sent as ${declaredType} should be accepted`);
      const { uploads } = await loadSharedImages(id);
      assert.equal(uploads[0].file.type, type);
      assert.equal(uploads[0].file.name, "archivo");
      assert.deepEqual(Buffer.from(await uploads[0].file.arrayBuffer()), bytes);
      await saveSharedImages(id, { ...(await loadSharedImages(id)), orderId: "retry-order" });
      assert.equal((await loadSharedImages(id)).uploads[0].file.type, type);
    }
  }
});

test("accepts files from alternative form fields and ignores accompanying text", async () => {
  const { share } = setup();
  const id = shareId(await share([new File([png], "photo.png")], { field: "files[]", text: "Foto compartida" }));
  assert.equal((await loadSharedImages(id)).uploads.length, 1);
});

test("rejects disguised or unsupported files without storing a partial batch", async () => {
  const { share, storage } = setup();
  for (const bytes of [Buffer.from("not a photo"), Buffer.from("<svg></svg>"), Buffer.from("RIFFxxxxWAVE"), Buffer.from([0xff, 0xd8]), Buffer.from("\0\0\0\x18ftypheic")]) {
    const response = await share([new File([png], "real.png"), new File([bytes], "fake.jpg", { type: "image/jpeg" })]);
    assert.match(response.headers.get("location"), /error=format$/);
  }
  assert.deepEqual(await storage.keys(), []);
});

test("malformed shared payload is distinguished from a storage error", async () => {
  const { share } = setup();
  assert.match((await share([], { malformed: true })).headers.get("location"), /error=payload$/);
});
