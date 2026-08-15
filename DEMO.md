# Lineage — Live Demo Script

A 5-step script for presenting Lineage to judges, plus the exact inputs used.

## 1. Open with the mission (Home, `/`)

Show the landing page. Read the tagline out loud: *"AI that doesn't decide what's true for you — it shows you where a claim came from so you can judge it yourself."* This sets up the core idea before touching the tool: Lineage doesn't fact-check you, it traces you back to the source.

## 2. Trace a real, recognizable example (`/trace`)

Paste this into the textarea and click "Trace origin":

```
OMG did you hear the Spain blackout was caused by Russia sanctions?? Europe is destroying itself
```

Point out:
- The **verified known-case lineage**, whose origin and every hop have specific
  linked citations. Its panel explicitly says it is a curated fast path.
- The separate **live investigation**. If it finds candidate edges, they appear
  in their own graph and never replace or silently merge with the known record.
- The **nutrition label** bars (evidence quality is low, emotional framing and missing context are high).
- The **messenger-safe correction** banner — read it aloud to show it blames the origin, never the person who shared it.

## 3. Show a paraphrase still resolves to the same claim

Paste a differently-worded version of the same claim:

```
Spain destroyed its own power plants and blamed Russia for the blackout
```

Point to **Known-record wording similarity**. If semantic matching is disabled,
say plainly that this value is lexical; it is separate from source relevance,
origin confidence, mutation confidence, and lineage completeness.

## 4. Show the image path (OCR)

Upload a screenshot containing the same claim as text. Lineage hashes the image,
records its dimensions and upload metadata, OCRs it, and runs the extracted text
through the same provenance pipeline. Be explicit that this is not reverse-image
search; the UI does not claim image origin from OCR alone.

## 5. Show the graceful "unknown claim" fallback and the database (`/trace`, then `/claims`)

Paste something Lineage has no record of, e.g.:

```
The new city library is opening two weeks early this year
```

Show the friendly self-check-steps response instead of an error — Lineage never pretends to know something it doesn't. Then switch to `/claims` to show the full curated library (17 claims across climate/energy, Lahore civic issues, environment, and general science), proving this scales beyond one example.

## Live-path proof (when a search key is configured)

Run both:

```
5G caused COVID-19.
Pope Francis was photographed wearing a white puffer jacket.
```

For 5G, show that pages were acquired and compared while mutation, origin, and
lineage remain insufficient if no transformation chain is documented. For the
Pope claim, show acquired publisher/date metadata and claim versions. Depending
on today's reachable pages, LINEAGE may produce evidence-backed candidate edges
or decline to do so. That variability is the point: never promise a graph the
retrieved evidence cannot support.

## Second anchor example (optional, if time allows)

```
This diver is heroically saving a whale from barnacles, please share to raise awareness
```

Resolves to the "misleading" whale-barnacles claim — a good second example because the verdict is "misleading" rather than "false", showing Lineage handles nuance, not just true/false.
