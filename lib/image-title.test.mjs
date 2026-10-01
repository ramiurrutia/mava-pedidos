import assert from "node:assert/strict";
import { test } from "node:test";
import { getImageTitle } from "./image-title.ts";

test("detecta las medidas completas sin confundir prefijos, con mayúsculas o minúsculas", () => {
  for (const size of ["DNG", "XG", "XGM", "SG", "SGF", "TC"]) {
    assert.equal(getImageTitle("", `${size.toLowerCase()} 1234 · Marco natural`), size);
    assert.equal(getImageTitle(undefined, `Marco blanco\nMedida: (${size})`), size);
  }
});

test("respeta títulos escritos y no inventa medidas ausentes o ambiguas", () => {
  assert.equal(getImageTitle("Título personalizado", "DNG natural"), "Título personalizado");
  assert.equal(getImageTitle("", "SGF / SG"), "");
  assert.equal(getImageTitle("", "XGM · medida XGM"), "XGM");
  for (const description of ["", "Paisaje natural", "TCCA", "XGTELA", "AXGM", "SGF123", "MEDIDA_TC"]) {
    assert.equal(getImageTitle("", description), "");
  }
});
