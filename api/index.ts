import app from "../artifacts/api-server/src/app";

// An Express application instance is itself a `(req, res)` request handler,
// which is exactly the shape Vercel's Node runtime expects for a serverless
// function's default export. Re-exporting it directly avoids importing
// `express` here at the repo root — where `@types/express` isn't resolvable
// (it lives in the api-server package), which broke the Vercel build.
export default app;
