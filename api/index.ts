// @ts-nocheck — deliberately untyped shim.
//
// This is the Vercel serverless function entrypoint. It imports `dist/app.mjs`,
// a build artifact produced by the `buildCommand` (see the root `build` script)
// *before* @vercel/node processes this directory. Two consequences:
//
//   1. There is no `.d.ts` for the built `.mjs`, so type-checking this line
//      would fail with TS7016 — hence `@ts-nocheck`.
//   2. @vercel/node only ever sees this trivial JS-importing entry, never the
//      raw workspace TypeScript graph. That matters because @vercel/node reads
//      the *root* tsconfig, ignores its project references, and forces NodeNext
//      module resolution — which this bundler-resolution monorepo (extensionless
//      imports, `@workspace/*` packages exporting raw `.ts`) cannot satisfy.
//
// esbuild has already inlined that whole graph into `dist/app.mjs`, resolving
// the extensions and the express/pino CommonJS interop that broke the build.
import app from "../artifacts/api-server/dist/app.mjs";

// An Express application instance is itself a `(req, res)` request handler,
// which is exactly the shape Vercel's Node runtime expects for a serverless
// function's default export.
export default app;
