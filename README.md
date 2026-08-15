# Lineage

**Trace, don't judge.**

Lineage doesn't decide what's true for you. It shows you where a claim came
from, what happened to it as it spread, and gives you enough evidence and
context to judge it yourself.

Built for the UNESCO Youth Hackathon 2026 (Media & Information Literacy).

---

## Quick start

No third-party account or API key is required. With no optional services
configured, the app runs end to end using deterministic lexical matching and
anonymous access; analyses are not saved and live web search is off.

```bash
pnpm install

# Terminal 1 — API
PORT=3001 pnpm --filter @workspace/api-server run dev

# Terminal 2 — frontend on http://localhost:5174
PORT=5174 BASE_PATH=/ API_PROXY_TARGET=http://localhost:3001 \
  pnpm --filter @workspace/lineage run dev
```

On Windows PowerShell, set the variables first:

```powershell
$env:PORT='3001'; pnpm --filter @workspace/api-server run dev
$env:PORT='5174'; $env:BASE_PATH='/'; $env:API_PROXY_TARGET='http://localhost:3001'; pnpm --filter @workspace/lineage run dev
```

### Other commands

```bash
pnpm --filter @workspace/api-server run test
pnpm run typecheck                             # all packages
pnpm run build                                 # API + Lineage frontend
pnpm --filter @workspace/api-spec run codegen  # regenerate after editing openapi.yaml
```

---

## What it does

1. **Submit** — paste a message, or upload a screenshot (OCR reads its text).
2. **Discover** — run up to three bounded search queries while independently
   checking the 17-record known-case library.
3. **Acquire** — safely fetch a small, diverse set of the strongest pages and
   preserve redirects, canonical URLs, metadata, dates, and evidence passages.
4. **Compare** — extract evidence-grounded claim versions, order dated sources,
   and compare semantic fields. Search snippets cannot enter this step.
5. **Trace** — draw only source-to-source mutation edges supported on both
   sides. Origin and the submitted occurrence remain unconnected when evidence
   is insufficient.
6. **Judge** — inspect evidence, uncertainty, and self-verification steps. The
   system does not output a truth score.

### Three trace states

| State              | Meaning                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `TRACED`           | A complete live evidence path reaches the submitted occurrence, or a fully cited verified known case matched.             |
| `PARTIALLY_TRACED` | A related verified case was found, but the submitted claim's lineage is not established. Treat it as a lead.             |
| `UNTRACED`         | No complete connection to the submitted occurrence. Candidate source paths may still be shown. **This is not falsity.**  |

---

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

### OpenRouter (optional — better matching)

Enables LLM claim extraction, adjudication of ambiguous known-record matches,
and bounded semantic selection among already-acquired evidence passages. For
provenance, the model may select an existing passage id but cannot write source
text, evidence, dates, mutations, or graph edges.

1. Get a key at <https://openrouter.ai/>
2. Set `OPENROUTER_API_KEY`
3. Optionally set `OPENROUTER_MODEL` (defaults to
   `nvidia/nemotron-3-ultra-550b-a55b:free`)

Without it, extraction falls back to longest-sentence heuristics and matching
runs on the lexical layer. The app reports which layer was used via
`matching_strategy`, so results stay honest about their own basis.

### Semantic matching (optional — off by default)

```bash
SEMANTIC_MATCHING=on
```

Requires the optional `@xenova/transformers` dependency and downloads a ~25 MB
sentence-embedding model on first use. It is deliberately **not** enabled by
default: a demo machine without network access would otherwise stall on a model
fetch at exactly the wrong moment. Nothing is downloaded unless you turn it on.

Install the optional package before enabling it:

```bash
pnpm --filter @workspace/api-server add @xenova/transformers
```

### Live provenance discovery (optional)

To retrieve current web results alongside the curated-library trace, set **one**
provider key on the server:

```bash
# Brave Search: https://api-dashboard.search.brave.com/
BRAVE_SEARCH_API_KEY=...

# Or Tavily: https://app.tavily.com/
TAVILY_API_KEY=...
```

With either configured, each analysis sends up to three deterministic query
variants, deduplicates returned URLs, and acquires the strongest diverse pages
with bounded concurrency. Brave takes precedence if both keys are set. The app
shows every query that ran and keeps provider ids/scores as discovery metadata
only.

Acquired HTML is converted into bounded evidence snapshots. Publication dates
are taken from JSON-LD, OpenGraph, article metadata, or explicit visible dates;
search indexing time is never treated as publication time. Search snippets,
provider rank, and an early dated page do not establish truth or origin.

Useful limits include `LIVE_SEARCH_MAX_RESULTS`,
`LIVE_SEARCH_MAX_TOTAL_RESULTS`, `LIVE_SEARCH_QUERY_CONCURRENCY`,
`LIVE_SEARCH_TIMEOUT_MS`, `PROVENANCE_MAX_SOURCES`,
`PROVENANCE_ACQUISITION_CONCURRENCY`, `PROVENANCE_SOURCE_TIMEOUT_MS`, and
`PROVENANCE_SOURCE_MAX_BYTES`.

### Firebase (optional — sign-in and saved history)

Without this, the app runs as a fully functional public product; analyses simply
are not saved.

**1. Create the project**

- Go to <https://console.firebase.google.com/> and create a project.
- **Authentication → Sign-in method →** enable **Google**.
- **Authentication → Settings → Authorized domains →** add your deploy domain.
  `localhost` is authorized by default.

**2. Client config** — Project settings → General → Your apps → Web app.
Copy the values into:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

These are client identifiers, not secrets. They identify the project; they do
not authorise access. Access is controlled by security rules and by server-side
ID-token verification.

**3. Server credentials** — Project settings → Service accounts → Generate new
private key. Then either:

```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'   # inline JSON
# or
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
```

**This one is a real secret.** `.gitignore` already excludes `.env` and
`*-service-account*.json`.

**4. Firestore** — enable Firestore in the console. When valid server credentials
are present, history is stored in an `analyses` collection keyed by document id,
with `userId` on each record. Ownership is enforced server-side on every read
and delete. Without valid server credentials, signed-in history is unavailable
and anonymous analyses are intentionally not stored.

---

## Architecture

```
lib/api-spec/openapi.yaml       source of truth → Orval → zod + react-query
artifacts/api-server/
  src/domain/repository.ts      LineageRepository (seed impl today)
  src/domain/history.ts         authenticated Firestore history (optional)
  src/data/lineages.ts          the 17 documented records
  src/lib/matching.ts           lexical → semantic → LLM adjudication
  src/lib/live-search.ts        bounded multi-query discovery (Brave or Tavily)
  src/lib/provenance/           acquisition, evidence snapshots, chronology,
                                comparison, mutation, origin, graph and stages
  src/lib/analyze.ts            orchestrates known-case + live paths
  src/lib/llm.ts                LLMProvider + injection boundary
  src/lib/correction.ts         template-only messenger-safe wording
artifacts/lineage/
  src/lib/auth-context.tsx      single source of auth truth
  src/lib/strings.ts            user-facing copy (i18n-ready)
```

### Design commitments

- **The LLM never writes the correction.** Messenger-safe wording is
  template-generated so its tone cannot drift toward blaming the sender.
- **The LLM never supplies facts.** It selects among human-written records; it
  cannot author one. Returned lineage ids are validated against the shortlist.
- **Search is discovery, acquisition is evidence collection.** Only acquired
  page passages can become claim versions; snippets and provider scores cannot.
- **Edges require two sides.** Different wording, adjacency, or chronology alone
  never creates a mutation edge, and the submitted claim is not auto-connected.
- **Origin questions stay separate.** Original event, earliest relevant source
  found, misinformation origin, and likely origin candidate are distinct fields.
- **Backend owns stage state.** The frontend renders eight typed stage results;
  it does not infer provenance from source counts.
- **Untraced ≠ false.** Absence of a record is reported as absence of a record.
- **Verified vs illustrative.** 2 of 17 records are externally verified; the
  other 15 are clearly labelled illustrative, in the data and in the UI.

---

## Scope

Lineage now runs a bounded live provenance investigation for arbitrary claims,
but it can only reconstruct what the retrieved, reachable pages actually
support. Paywalls, client-rendered pages, missing dates, deleted social posts,
and incomplete search coverage commonly leave origin or lineage insufficient.
The fifteen illustrative records can match wording but never establish
provenance. The two externally verified records are a separately labelled known-
case fast path and do not masquerade as live reconstruction. Screenshot uploads
retain a cryptographic image-evidence record and feed OCR text into the text
pipeline; perceptual matching and reverse-image search are not implemented.
