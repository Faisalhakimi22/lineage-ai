// Vercel serverless function entrypoint.
//
// This file is deliberately plain ESM JavaScript (`.mjs`), not TypeScript, for
// two reasons:
//
//   1. ESM semantics. `dist/app.mjs` is an ES module. The root package.json has
//      no `"type": "module"`, so under the NodeNext resolution @vercel/node
//      forces, an `api/index.ts` here compiled to CommonJS — and a CJS
//      `require()` of an ES module either throws ERR_REQUIRE_ESM (Node < 22.12)
//      or resolves to the module *namespace object* rather than the Express
//      app. Vercel then has an object where it expects a request handler, and
//      every route fails with FUNCTION_INVOCATION_FAILED. The `.mjs` extension
//      makes this file unambiguously ESM, so the import below is a real ESM
//      import and `app` is the Express application itself.
//   2. There is nothing to type. This module only re-exports a build artifact,
//      which has no `.d.ts` — the TypeScript version needed a blanket
//      `@ts-nocheck`, so TypeScript was buying us no safety here.
//
// `dist/app.mjs` is produced by the `buildCommand` (see the root `build`
// script) before @vercel/node processes this directory. esbuild has already
// inlined the whole workspace graph into it, so the raw monorepo TypeScript —
// extensionless relative imports, `@workspace/*` packages exporting raw `.ts`,
// express/pino CommonJS interop — never reaches Vercel's compiler.
import app from "../artifacts/api-server/dist/app.mjs";

// An Express application instance is itself a `(req, res)` request handler,
// which is exactly the shape Vercel's Node runtime expects for a serverless
// function's default export.
export default app;
