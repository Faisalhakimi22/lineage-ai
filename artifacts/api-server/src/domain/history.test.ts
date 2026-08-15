import { describe, expect, it } from "vitest";
import {
  AnalyzeTextResponse,
  type AnalysisRecord,
  type AnalyzeResult,
} from "@workspace/api-zod";
import { InMemoryHistoryStore } from "./history";

function record(id: string, userId: string): AnalysisRecord {
  const result: AnalyzeResult = {
    extracted_claim: `claim ${id}`,
    input_type: "text",
    trace_status: "UNTRACED",
    confidence: 0.1,
    matching_strategy: "lexical",
    lineage: null,
    candidates: [],
    live_search: {
      provider: "Brave Search",
      status: "not_configured",
      query: null,
      queries: [],
      searched_at: null,
      sources: [],
      note: null,
    },
    knownRecordMatch: {
      matched: false,
      lineageId: null,
      datasetProvenance: null,
      similarity: 0.1,
      eligibleAsVerifiedFastPath: false,
    },
    knownRecordStages: [],
    knownRecordScores: {
      provenanceConfidence: null,
      mutationConfidence: null,
      originConfidence: null,
      lineageCompleteness: 0,
    },
    liveInvestigation: false,
    evidenceSnapshots: [],
    sourceVersions: [],
    comparisons: [],
    mutations: [],
    originAssessment: {
      originalEvent: {
        status: "not_attempted",
        sourceId: null,
        confidence: null,
        evidenceIds: [],
        reason: "No live investigation was run for this fixture.",
      },
      earliestRelevantSource: {
        status: "not_attempted",
        sourceId: null,
        date: null,
        dateType: "unknown",
        confidence: null,
        evidenceIds: [],
        reason: "No live investigation was run for this fixture.",
      },
      misinformationOrigin: {
        status: "not_attempted",
        sourceId: null,
        confidence: null,
        evidenceIds: [],
        reason: "No live investigation was run for this fixture.",
      },
      likelyOriginCandidate: {
        status: "not_attempted",
        sourceId: null,
        confidence: null,
        evidenceIds: [],
        reason: "No live investigation was run for this fixture.",
      },
    },
    dynamicLineage: {
      status: "not_attempted",
      nodes: [],
      edges: [],
      evidenceIds: [],
      confidence: null,
      submittedOccurrenceConnected: false,
      establishedTransitionCount: 0,
      requiredTransitionCount: 0,
      reason: "No live investigation was run for this fixture.",
    },
    investigationStages: [],
    librarySimilarity: 0.1,
    sourceRelevance: null,
    provenanceConfidence: null,
    mutationConfidence: null,
    originConfidence: null,
    lineageCompleteness: 0,
    imageEvidence: null,
    submittedOccurrence: null,
    what_we_found: [],
    what_we_did_not_find: [],
    uncertainty_notes: [],
    messenger_safe_explanation: null,
    self_check_steps: [],
    analysis_id: null,
  };

  return {
    id,
    userId,
    inputType: "text",
    originalInput: `input ${id}`,
    result,
    createdAt: new Date(Number(id.slice(-1)) * 1000).toISOString(),
  };
}

describe("history ownership", () => {
  it("keeps its stored analysis fixture aligned with the public API schema", () => {
    const parsed = AnalyzeTextResponse.safeParse(record("a1", "user-a").result);
    expect(parsed.success).toBe(true);
  });

  it("returns a user their own record", async () => {
    const store = new InMemoryHistoryStore();
    await store.save(record("a1", "user-a"));
    expect(await store.getOwned("user-a", "a1")).not.toBeNull();
  });

  it("does not let user B read user A's record, even with the exact id", async () => {
    const store = new InMemoryHistoryStore();
    await store.save(record("a1", "user-a"));
    expect(await store.getOwned("user-b", "a1")).toBeNull();
  });

  it("does not let user B delete user A's record", async () => {
    const store = new InMemoryHistoryStore();
    await store.save(record("a1", "user-a"));

    expect(await store.deleteOwned("user-b", "a1")).toBe(false);
    // and A's record must survive the attempt
    expect(await store.getOwned("user-a", "a1")).not.toBeNull();
  });

  it("lists only the requesting user's records", async () => {
    const store = new InMemoryHistoryStore();
    await store.save(record("a1", "user-a"));
    await store.save(record("a2", "user-a"));
    await store.save(record("b1", "user-b"));

    const listed = await store.listForUser("user-a");
    expect(listed).toHaveLength(2);
    expect(listed.every((r) => r.id.startsWith("a"))).toBe(true);
  });

  it("returns an empty list for a user with no history", async () => {
    const store = new InMemoryHistoryStore();
    expect(await store.listForUser("nobody")).toEqual([]);
  });

  it("lets a user delete their own record", async () => {
    const store = new InMemoryHistoryStore();
    await store.save(record("a1", "user-a"));

    expect(await store.deleteOwned("user-a", "a1")).toBe(true);
    expect(await store.getOwned("user-a", "a1")).toBeNull();
  });

  it("reports deletion of a missing record as false rather than throwing", async () => {
    const store = new InMemoryHistoryStore();
    expect(await store.deleteOwned("user-a", "does-not-exist")).toBe(false);
  });

  it("orders history newest first", async () => {
    const store = new InMemoryHistoryStore();
    await store.save(record("a1", "user-a"));
    await store.save(record("a3", "user-a"));
    await store.save(record("a2", "user-a"));

    const listed = await store.listForUser("user-a");
    expect(listed.map((r) => r.id)).toEqual(["a3", "a2", "a1"]);
  });
});
