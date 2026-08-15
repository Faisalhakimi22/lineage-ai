import { describe, expect, it } from "vitest";
import { lineages } from "../data/lineages";
import { matchClaim, PARTIAL_THRESHOLD, TRACE_THRESHOLD } from "./matching";
import { runAnalysis } from "./analyze";

/**
 * Whole-corpus matching evaluation.
 *
 * Guards two properties that matter more than any single score: every recorded
 * phrasing of a claim resolves to its own lineage (no cross-contamination
 * between the seventeen), and nothing unrelated is ever confidently traced.
 */
describe("matching evaluation across all 17 lineages", () => {
  it("routes every canonical claim to its own lineage", async () => {
    const wrong: string[] = [];
    for (const lineage of lineages) {
      const result = await matchClaim(lineage.canonical_claim, lineages);
      if (result.lineage?.id !== lineage.id) {
        wrong.push(`${lineage.id} -> ${result.lineage?.id ?? "none"}`);
      }
    }
    expect(wrong, `misrouted: ${wrong.join(", ")}`).toEqual([]);
  });

  it("reaches TRACED confidence on every canonical claim", async () => {
    const weak: string[] = [];
    for (const lineage of lineages) {
      const result = await matchClaim(lineage.canonical_claim, lineages);
      if (result.confidence < TRACE_THRESHOLD) {
        weak.push(`${lineage.id}=${result.confidence.toFixed(3)}`);
      }
    }
    expect(weak, `below trace threshold: ${weak.join(", ")}`).toEqual([]);
  });

  it("routes every recorded alias to its own lineage", async () => {
    const wrong: string[] = [];
    for (const lineage of lineages) {
      for (const alias of lineage.aliases) {
        const result = await matchClaim(alias, lineages);
        if (result.lineage?.id !== lineage.id) {
          wrong.push(`"${alias}" -> ${result.lineage?.id ?? "none"}`);
        }
      }
    }
    expect(wrong, `misrouted aliases: ${wrong.join(" | ")}`).toEqual([]);
  });

  it("never confidently traces unrelated claims", async () => {
    const UNRELATED = [
      "The new city library is opening two weeks early this year",
      "My neighbour repainted their front door yesterday",
      "The bus timetable changed on Tuesday",
      "A local bakery started selling sourdough",
      "Traffic on the ring road was heavy this morning",
    ];

    for (const text of UNRELATED) {
      const result = await runAnalysis(text, "text");
      expect(
        result.trace_status,
        `"${text}" was traced at ${result.confidence}`,
      ).toBe("UNTRACED");
    }
  });

  it("keeps a weak lexical hit from becoming a confident trace", async () => {
    // Shares vocabulary with the blackout lineage without being that claim.
    const result = await runAnalysis(
      "Spain and Portugal are lovely countries to visit in April",
      "text",
    );
    expect(result.confidence).toBeLessThan(TRACE_THRESHOLD);
    expect(result.trace_status).not.toBe("TRACED");
  });

  it("does not confuse an explicit negation with the recorded claim", async () => {
    const result = await runAnalysis(
      "The April 2025 Spain Portugal blackout was not caused by European sanctions on Russia.",
      "text",
    );

    expect(result.trace_status).toBe("UNTRACED");
    expect(result.lineage).toBeNull();
    expect(result.confidence).toBeLessThan(PARTIAL_THRESHOLD);
  });

  it("documents the known lexical-only paraphrase ceiling", async () => {
    // This is the limitation, asserted rather than hidden: with no semantic
    // layer the paraphrase finds the right lineage but cannot confirm it.
    const result = await matchClaim(
      "The blackout in Spain was caused by European sanctions on Russian energy",
      lineages,
    );
    expect(result.lineage?.id).toBe("spain-portugal-blackout");
    expect(result.confidence).toBeGreaterThanOrEqual(PARTIAL_THRESHOLD);
    expect(result.strategy).toBe("lexical");
  });
});
