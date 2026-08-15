---
name: tesseract.js must be excluded from esbuild bundles
description: tesseract.js resolves its worker script and WASM core via package-relative paths at runtime, which breaks when esbuild bundles it into a single output file.
---

tesseract.js dynamically loads `worker-script/node/index.js` and its WASM core relative to its own installed package directory. When esbuild bundles it into a monolithic output (e.g. `dist/index.mjs`), that relative path resolution breaks — the runtime error looks like `Cannot find module '.../worker-script/node/index.js'` pointing at a nonsensical path near the build output, not node_modules.

**Why:** This surfaced as a runtime crash only when the OCR code path was actually exercised (not at build time or on other routes), since the worker is created lazily.

**How to apply:** Add `"tesseract.js"` and `"tesseract.js-core"` to the esbuild `external` array in any Node backend's build config, alongside other packages that use native/dynamic path resolution (sharp, canvas, etc.).
