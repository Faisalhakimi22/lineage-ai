# Lineage

Lineage traces a misinformation claim back to where it actually came from — even after it's been screenshotted and reworded — shows how it mutated as it spread, and corrects it by attributing blame to the origin, never the person who shared it. Built as a demo for a UNESCO / Smart City hackathon on misinformation and media literacy.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (needs `PORT`)
- `pnpm --filter @workspace/lineage run dev` — run the Lineage web frontend (needs `PORT` and `BASE_PATH`)

Running both locally, outside Replit (two terminals). Replit's router normally
joins the frontend and the API on one origin; locally `API_PROXY_TARGET` makes
Vite forward `/api` to the API server instead:

```bash
# terminal 1 — API
PORT=3001 pnpm --filter @workspace/api-server run dev

# terminal 2 — frontend on http://localhost:5174
PORT=5174 BASE_PATH=/ API_PROXY_TARGET=http://localhost:3001 \
  pnpm --filter @workspace/lineage run dev
```
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec after editing `lib/api-spec/openapi.yaml`
- Optional env: `OPENROUTER_API_KEY` — enables LLM-based claim extraction/matching (nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter). The app is fully functional without it via deterministic heuristic fallbacks.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`), with a 17-record curated lineage library held in memory and optional Firebase history
- OCR: `tesseract.js` (pure JS/WASM, no system tesseract binary needed)
- LLM: OpenRouter (nemotron model), optional, with heuristic fallback for both claim extraction and claim matching
- Frontend: React + Vite (`artifacts/lineage`), `reactflow` for the mutation-chain trail visualization
- API codegen: Orval (OpenAPI spec → Zod schemas + React Query hooks)
- Build: esbuild (ESM bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for the API contract (Lineage, MutationChainNode, Signal, AnalyzeResult schemas + all routes)
- `artifacts/api-server/src/data/lineages.ts` — the 17-claim curated lineage library (2 externally verified anchors; 15 clearly labelled illustrative teaching records)
- `artifacts/api-server/src/lib/` — `llm.ts` (LLM client), `extraction.ts` (claim extraction), `matching.ts` (claim matching), `correction.ts` (messenger-safe correction templates), `ocr.ts` (image → text), `analyze.ts` (shared pipeline used by both text and image routes)
- `artifacts/lineage/src/pages/` — Home (landing), Trace (the tool), Claims (database browser)

## Architecture decisions

- No Python/sentence-transformers/pytesseract stack (the original spec's stack) — adapted to this repo's TypeScript monorepo conventions: Express + OpenAPI-first codegen, `tesseract.js` for OCR, and OpenRouter for optional LLM assistance.
- Claim extraction and claim matching each have a deterministic heuristic fallback (longest-sentence extraction; IDF-weighted cosine similarity against canonical claims and aliases) so the app works with zero AI configuration. The LLM path is used only for ambiguous matches.
- `messenger_safe_correction` text is always template-generated (never LLM-generated) for tone reliability — it must never sound accusatory toward the sender.
- The lineage library is static for this demo, so it is held in memory; Firebase is optional and used only for signed-in history.

## Product

- **Home (`/`)** — premium marketing page pitching the mission to hackathon judges.
- **Trace (`/trace`)** — paste text or upload a screenshot; get back the mutation chain, investigation signals, and a calm, origin-attributed correction. Unmatched claims get a friendly self-check-steps fallback instead of an error.
- **Claims database (`/claims`)** — browse all known seed claims.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- OpenRouter's nemotron model is a reasoning model — without `reasoning: { exclude: true }` in the chat completion request, it leaks its full chain-of-thought into `message.content` instead of just the final answer. Always pass that flag.
- `tesseract.js` must be listed in `build.mjs`'s esbuild `external` array — it resolves its worker script and WASM core via paths relative to its own package directory, which breaks if esbuild bundles it.
- Any Zod schema needing `File`/`Blob` types (e.g. multipart file upload schemas) requires `"lib": ["dom", "es2022"]` in that package's `tsconfig.json`.
- `pnpm-workspace.yaml` prunes native binaries for non-deployment platforms via `'-'` overrides. The `win32-x64` entries for rollup, esbuild, lightningcss, and `@tailwindcss/oxide` are deliberately kept so the frontend also runs on Windows — removing them again breaks `vite` there with `Cannot find module @rollup/rollup-win32-x64-msvc`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
