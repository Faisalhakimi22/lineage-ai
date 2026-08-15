import { isTransmissionRelationship } from "./context-comparison";
import type {
  ComparisonChange,
  DetectedMutation,
  LineageEdgeEvidence,
  RuntimeMutationType,
  SourceComparison,
} from "./types";

interface MutationMapping {
  mutationType: RuntimeMutationType;
  /** These labels imply falsity and require stronger evidence than difference. */
  forceCandidate: boolean;
}

const CHANGE_TO_MUTATION: Partial<Record<ComparisonChange["type"], MutationMapping>> = {
  context_removed: { mutationType: "stripped_context", forceCandidate: false },
  cause_introduced: { mutationType: "fabricated_cause", forceCandidate: true },
  cause_removed: { mutationType: "stripped_context", forceCandidate: false },
  attribution_changed: { mutationType: "misattribution", forceCandidate: true },
  date_changed: { mutationType: "out_of_date_information", forceCandidate: true },
  location_changed: { mutationType: "context_shift", forceCandidate: false },
  certainty_strengthened: { mutationType: "exaggeration", forceCandidate: false },
  quotation_changed: { mutationType: "false_quotation", forceCandidate: true },
  caption_changed: { mutationType: "false_caption", forceCandidate: true },
  old_media_reused: { mutationType: "recycled_old_media", forceCandidate: false },
  selective_evidence: { mutationType: "selective_evidence", forceCandidate: false },
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueEvidence(values: LineageEdgeEvidence[]): LineageEdgeEvidence[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const identity = `${item.sourceId}\u0000${item.passageId}\u0000${item.role}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function mutationExplanation(
  mutationType: RuntimeMutationType,
  changes: ComparisonChange[],
  candidate: boolean,
): string {
  const prefix = candidate ? "Candidate proposition mutation" : "Established proposition mutation";
  const details = changes.map((change) => change.explanation).join(" ");
  return `${prefix} (${mutationType.replace(/_/g, " ")}): ${details}`;
}

function evidenceByRole(
  comparison: SourceComparison,
  role: "before" | "after",
): LineageEdgeEvidence | null {
  const exact = comparison.relationship.evidence.find((item) => item.role === role);
  if (exact) return exact;
  if (role === "after") {
    return (
      comparison.relationship.evidence.find((item) => item.role === "occurrence") ??
      null
    );
  }
  return null;
}

/**
 * Classifies proposition-level changes only when an explicit transmission
 * relationship links the two sources. Date order, same-claim classification,
 * and semantic similarity are comparison aids, never mutation evidence.
 */
export function detectMutations(comparisons: SourceComparison[]): DetectedMutation[] {
  const mutations: DetectedMutation[] = [];

  for (const comparison of comparisons) {
    if (
      comparison.status === "insufficient_evidence" ||
      comparison.status === "blocked" ||
      comparison.status === "error" ||
      !isTransmissionRelationship(comparison.relationship.type) ||
      comparison.relationship.status === "insufficient_evidence"
    ) {
      continue;
    }

    const beforeEvidence = evidenceByRole(comparison, "before");
    const afterEvidence = evidenceByRole(comparison, "after");
    if (!beforeEvidence || !afterEvidence) continue;
    if (
      beforeEvidence.sourceId !== comparison.fromSourceId ||
      afterEvidence.sourceId !== comparison.toSourceId ||
      beforeEvidence.passageId === afterEvidence.passageId ||
      !beforeEvidence.exactText.trim() ||
      !afterEvidence.exactText.trim()
    ) {
      continue;
    }

    const grouped = new Map<
      RuntimeMutationType,
      { mapping: MutationMapping; changes: ComparisonChange[] }
    >();
    for (const change of comparison.changes) {
      const mapping = CHANGE_TO_MUTATION[change.type];
      if (!mapping || change.confidence < 0.45) continue;
      const evidenceIds = unique(change.evidenceIds);
      if (
        evidenceIds.length < 2 ||
        !evidenceIds.includes(beforeEvidence.passageId) ||
        !evidenceIds.includes(afterEvidence.passageId)
      ) {
        continue;
      }

      const group = grouped.get(mapping.mutationType);
      if (group) {
        group.changes.push(change);
        group.mapping.forceCandidate ||= mapping.forceCandidate;
      } else {
        grouped.set(mapping.mutationType, {
          mapping: { ...mapping },
          changes: [change],
        });
      }
    }

    for (const [mutationType, group] of grouped) {
      const evidence = uniqueEvidence([
        beforeEvidence,
        ...comparison.relationship.evidence,
        afterEvidence,
      ]);
      const evidenceIds = unique([
        ...comparison.evidenceIds,
        ...group.changes.flatMap((change) => change.evidenceIds),
        ...evidence.map((item) => item.passageId),
      ]);
      const confidence = round(
        Math.min(
          comparison.confidence,
          comparison.relationship.confidence,
          ...group.changes.map((change) => change.confidence),
        ),
      );
      const established =
        !group.mapping.forceCandidate &&
        comparison.status === "established" &&
        comparison.relationship.status === "established" &&
        confidence >= 0.8;
      const status: DetectedMutation["status"] = established
        ? "established"
        : "candidate";
      const explanation = mutationExplanation(
        mutationType,
        group.changes,
        !established,
      );

      mutations.push({
        id: `mutation:${comparison.fromSourceId}:${comparison.toSourceId}:${mutationType}`,
        fromSourceId: comparison.fromSourceId,
        toSourceId: comparison.toSourceId,
        mutationType,
        evidenceIds,
        evidence,
        relationship: comparison.relationship,
        beforeEvidence,
        afterEvidence,
        confidence,
        status,
        reason:
          established
            ? "An established transmission relationship and exact before/after passages support this proposition-level mutation."
            : group.mapping.forceCandidate
              ? "The passages support a semantic change, but this label implies falsity and remains a candidate without independent falsity evidence."
              : "The passages support a semantic change, but the comparison or transmission relationship remains provisional.",
        explanation,
      });
    }
  }

  return mutations;
}

