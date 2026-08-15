import type { Lineage } from "@workspace/api-zod";
import { describe, expect, it } from "vitest";
import { lineagesById } from "../../data/lineages";
import {
  buildKnownRecordMatch,
  buildVerifiedKnownRecordScores,
  buildVerifiedKnownRecordStages,
  mergeVerifiedKnownRecordStages,
} from "./known-record";
import type { InvestigationStage, InvestigationStageId } from "./types";

const LIVE_STAGE_IDS: InvestigationStageId[] = [
  "claim_extracted",
  "live_search",
  "source_discovery",
  "earliest_source",
  "context_comparison",
  "mutation_detection",
  "origin_assessment",
  "lineage",
];

function baselineLiveStages(): InvestigationStage[] {
  return LIVE_STAGE_IDS.map((id, index) => ({
    id,
    status: index < 3 ? "established" : "insufficient_evidence",
    evidenceIds: [`live:${id}`],
    confidence: index < 3 ? 0.8 : null,
    reason: `Live investigation result for ${id}.`,
  }));
}

function requiredLineage(id: string): Lineage {
  const lineage = lineagesById.get(id);
  if (!lineage) throw new Error(`Missing test lineage ${id}`);
  return lineage;
}

function stage(
  stages: InvestigationStage[],
  id: InvestigationStageId,
): InvestigationStage {
  const result = stages.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing stage ${id}`);
  return result;
}

describe("verified known-record evidence path", () => {
  it("separates wording matches from verified-record eligibility", () => {
    const verified = requiredLineage("spain-portugal-blackout");
    const illustrative = requiredLineage("great-pacific-garbage-patch-island");

    expect(buildKnownRecordMatch(verified, 0.91)).toEqual({
      matched: true,
      lineageId: verified.id,
      datasetProvenance: "externally_verified",
      similarity: 0.91,
      eligibleAsVerifiedFastPath: true,
    });
    expect(buildKnownRecordMatch(illustrative, 1)).toEqual({
      matched: true,
      lineageId: illustrative.id,
      datasetProvenance: "illustrative",
      similarity: 1,
      eligibleAsVerifiedFastPath: false,
    });
  });

  it("never promotes live stages with curated evidence", () => {
    const live = baselineLiveStages();
    expect(
      mergeVerifiedKnownRecordStages(
        requiredLineage("spain-portugal-blackout"),
        1,
        live,
      ),
    ).toEqual(live);
  });

  it("keeps Spain's EFE and Maldita findings as independent related branches", () => {
    const spain = requiredLineage("spain-portugal-blackout");
    expect(spain.curated_relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from_node_id: "hop-1",
          to_node_id: "hop-2",
          relationship: "related_claim",
        }),
        expect.objectContaining({
          from_node_id: "hop-1",
          to_node_id: "hop-3",
          relationship: "related_claim",
        }),
      ]),
    );
    expect(
      spain.curated_relationships.some(
        (item) =>
          item.from_node_id === "hop-2" && item.to_node_id === "hop-3",
      ),
    ).toBe(false);

    const stages = buildVerifiedKnownRecordStages(spain, 1);
    expect(stage(stages, "earliest_source").status).toBe("established");
    expect(stage(stages, "context_comparison").status).toBe("established");
    expect(stage(stages, "mutation_detection").status).toBe("established");
    expect(stage(stages, "origin_assessment").status).toBe("established");
    expect(stage(stages, "lineage").status).toBe("insufficient_evidence");

    expect(buildVerifiedKnownRecordScores(spain, 1)).toEqual({
      provenanceConfidence: null,
      mutationConfidence: 0.96,
      originConfidence: 1,
      lineageCompleteness: 0,
    });
  });

  it("does not treat array order, same-event, or related-claim links as transmission", () => {
    const spain = structuredClone(requiredLineage("spain-portugal-blackout"));
    spain.curated_relationships.reverse();

    expect(
      stage(buildVerifiedKnownRecordStages(spain, 1), "lineage").status,
    ).toBe("insufficient_evidence");
    expect(buildVerifiedKnownRecordScores(spain, 1).lineageCompleteness).toBe(0);
  });

  it("requires explicit established transmission relationships for curated completeness", () => {
    const spain = structuredClone(requiredLineage("spain-portugal-blackout"));
    spain.curated_relationships[1]!.relationship = "derived_from";
    spain.curated_relationships[2]!.relationship = "reposted_from";

    expect(
      stage(buildVerifiedKnownRecordStages(spain, 1), "lineage").status,
    ).toBe("established");
    expect(buildVerifiedKnownRecordScores(spain, 1).lineageCompleteness).toBe(1);

    spain.curated_relationships[2]!.status = "candidate";
    expect(
      stage(buildVerifiedKnownRecordStages(spain, 1), "lineage").status,
    ).toBe("insufficient_evidence");
    expect(buildVerifiedKnownRecordScores(spain, 1).lineageCompleteness).toBe(
      0.5,
    );
  });

  it("returns no curated stages or confidence for illustrative records", () => {
    const illustrative = requiredLineage("great-pacific-garbage-patch-island");
    expect(buildVerifiedKnownRecordStages(illustrative, 1)).toEqual([]);
    expect(buildVerifiedKnownRecordScores(illustrative, 1)).toEqual({
      provenanceConfidence: null,
      mutationConfidence: null,
      originConfidence: null,
      lineageCompleteness: 0,
    });
  });

  it("retains five explicit insufficient stages for an eligible but uncited record", () => {
    const whale = requiredLineage("whale-barnacles");
    const stages = buildVerifiedKnownRecordStages(whale, 1);
    expect(stages).toHaveLength(5);
    expect(stages.every((item) => item.status === "insufficient_evidence")).toBe(
      true,
    );
  });
});
