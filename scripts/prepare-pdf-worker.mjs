import { createRequire } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const destination = new URL("../public/pdfjs/", import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(join(root, "build/pdf.worker.min.mjs"), new URL(`pdf.worker-${version}.mjs`, destination));
