import {
  hasValidSubmittedOccurrenceEvidence,
  isTransmissionRelationship,
} from "./context-comparison";
import type {
  DetectedMutation,
  EvidenceSnapshot,
  LineageEdgeEvidence,
  RuntimeLineageEdge,
  RuntimeLineageGraph,
  RuntimeLineageNode,
  SourceClaimVersion,
  SourceComparison,
  SubmittedOccurrence,
} from "./types";

export const SUBMITTED_CLAIM_SOURCE_ID = "submitted-claim";

export interface RuntimeLineageGraphInput {
  claim: string;
  snapshots: EvidenceSnapshot[];
  versions: SourceClaimVersion[];
  comparisons?: SourceComparison[];
  mutations: DetectedMutation[];
  submittedOccurrence?: SubmittedOccurrence | null;
  /** Claim-extraction evidence only. This never establishes an occurrence. */
  submittedEvidenceId?: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bestVersions(versions: SourceClaimVersion[]): SourceClaimVersion[] {
  const bySource = new Map<string, SourceClaimVersion>();
  for (const version of versions) {
    if (
      !version.evidencePassageId ||
      version.evidenceIds.length === 0 ||
      !version.evidenceIds.includes(version.evidencePassageId)
    ) {
      continue;
    }
    const current = bySource.get(version.sourceId);
    if (!current || version.confidence > current.confidence) {
      bySource.set(version.sourceId, version);
    }
  }
  return [...bySource.values()];
}

function sourceNode(
  version: SourceClaimVersion,
  snapshot: EvidenceSnapshot,
): RuntimeLineageNode {
  return {
    id: `node:${version.sourceId}`,
    sourceId: version.sourceId,
    kind: "source",
    claim: version.claim,
    url: snapshot.canonicalUrl ?? snapshot.finalUrl ?? snapshot.originalUrl,
    date: snapshot.publishedAt,
    dateConfidence: snapshot.dateConfidence,
    evidenceIds: unique([snapshot.id, ...version.evidenceIds]),
  };
}

function submittedNode(
  claim: string,
  occurrence: SubmittedOccurrence | null,
  submittedEvidenceId: string | undefined,
): RuntimeLineageNode {
  if (occurrence) {
    return {
      id: `node:${occurrence.id}`,
      sourceId: occurrence.id,
      kind: "submitted_occurrence",
      claim: occurrence.exactText,
      url: occurrence.sourceUrl,
      date: occurrence.timestamp,
      dateConfidence: occurrence.timestamp ? occurrence.confidence : 0,
      evidenceIds: unique(occurrence.evidenceIds),
    };
  }
  return {
    id: `node:${SUBMITTED_CLAIM_SOURCE_ID}`,
    sourceId: SUBMITTED_CLAIM_SOURCE_ID,
    kind: "submitted_claim",
    claim: claim.trim(),
    url: null,
    date: null,
    dateConfidence: 0,
    evidenceIds: unique([submittedEvidenceId]),
  };
}

function evidenceIsValid(
  evidence: LineageEdgeEvidence[],
  fromSourceId: string,
  toSourceId: string,
): boolean {
  const before = evidence.some(
    (item) =>
      item.sourceId === fromSourceId &&
      item.role === "before" &&
      item.passageId.trim() &&
      item.exactText.trim(),
  );
  const after = evidence.some(
    (item) =>
      item.sourceId === toSourceId &&
      (item.role === "after" || item.role === "occurrence") &&
      item.passageId.trim() &&
      item.exactText.trim(),
  );
  const relationship = evidence.some(
    (item) =>
      (item.role === "relationship" ||
        item.role === "source_reference" ||
        item.role === "media_identity") &&
      item.passageId.trim() &&
      item.exactText.trim(),
  );
  return before && after && relationship;
}

function edgeFromComparison(
  comparison: SourceComparison,
  mutation: DetectedMutation | null,
): RuntimeLineageEdge | null {
  const relationship = comparison.relationship;
  if (
    !isTransmissionRelationship(relationship.type) ||
    relationship.status === "insufficient_evidence"
  ) {
    return null;
  }
  const evidence = uniqueEvidence([
    ...relationship.evidence,
    ...(mutation?.evidence ?? []),
  ]);
  if (!evidenceIsValid(evidence, comparison.fromSourceId, comparison.toSourceId)) {
    return null;
  }
  const beforeEvidence =
    mutation?.beforeEvidence ??
    evidence.find(
      (item) =>
        item.sourceId === comparison.fromSourceId && item.role === "before",
    ) ??
    null;
  const afterEvidence =
    mutation?.afterEvidence ??
    evidence.find(
      (item) =>
        item.sourceId === comparison.toSourceId &&
        (item.role === "after" || item.role === "occurrence"),
    ) ??
    null;
  const confidence = round(
    Math.min(
      relationship.confidence,
      comparison.confidence,
      mutation?.confidence ?? 1,
    ),
  );
  const status =
    relationship.status === "established" &&
    comparison.status === "established" &&
    (!mutation || mutation.status === "established")
      ? "established"
      : "candidate";
  const explanation = mutation
    ? mutation.explanation
    : `Explicit ${relationship.type.replace(/_/g, " ")} relationship; no proposition mutation was inferred.`;

  return {
    id: `edge:${comparison.id}:${mutation?.mutationType ?? relationship.type}`,
    fromSourceId: comparison.fromSourceId,
    toSourceId: comparison.toSourceId,
    relationship: relationship.type,
    status,
    mutationType: mutation?.mutationType ?? null,
    mutationConfidence: mutation?.confidence ?? null,
    evidenceIds: unique(evidence.map((item) => item.passageId)),
    evidence,
    beforeEvidence,
    afterEvidence,
    confidence,
    reason: mutation?.reason ?? relationship.reason,
    explanation,
  };
}

function transitionKey(edge: RuntimeLineageEdge): string {
  return `${edge.fromSourceId}\u0000${edge.toSourceId}`;
}

function establishedReachability(
  edges: RuntimeLineageEdge[],
  targetSourceId: string,
): { connected: boolean; transitionCount: number; ancestorIds: Set<string> } {
  const established = edges.filter(
    (edge) => edge.status === "established" && evidenceIsValid(
      edge.evidence,
      edge.fromSourceId,
      edge.toSourceId,
    ),
  );
  const incoming = new Map<string, RuntimeLineageEdge[]>();
  for (const edge of established) {
    const values = incoming.get(edge.toSourceId) ?? [];
    values.push(edge);
    incoming.set(edge.toSourceId, values);
  }

  const pending = [targetSourceId];
  const ancestors = new Set<string>([targetSourceId]);
  const transitions = new Set<string>();
  while (pending.length > 0) {
    const target = pending.shift()!;
    for (const edge of incoming.get(target) ?? []) {
      transitions.add(transitionKey(edge));
      if (!ancestors.has(edge.fromSourceId)) {
        ancestors.add(edge.fromSourceId);
        pending.push(edge.fromSourceId);
      }
    }
  }
  return {
    connected: ancestors.size > 1,
    transitionCount: transitions.size,
    ancestorIds: ancestors,
  };
}

/**
 * Builds runtime edges only from comparisons with explicit transmission
 * evidence. Mutations enrich those transitions but cannot create a transition
 * by themselves. This makes arbitrary mutation injection and date-only chains
 * fail closed.
 */
export function buildRuntimeLineageGraph(
  input: RuntimeLineageGraphInput,
): RuntimeLineageGraph {
  const snapshotsById = new Map(
    input.snapshots.map((snapshot) => [snapshot.id, snapshot]),
  );
  const nodes = bestVersions(input.versions)
    .map((version) => {
      const snapshot = snapshotsById.get(version.sourceId);
      const passageBound = snapshot?.relevantPassages.some(
        (passage) => passage.id === version.evidencePassageId,
      );
      return snapshot && passageBound
        ? { node: sourceNode(version, snapshot), snapshot }
        : null;
    })
    .filter(
      (
        item,
      ): item is { node: RuntimeLineageNode; snapshot: EvidenceSnapshot } =>
        item !== null,
    )
    .sort((left, right) => {
      const leftTime = timestamp(left.snapshot.publishedAt);
      const rightTime = timestamp(right.snapshot.publishedAt);
      if (leftTime !== null && rightTime !== null) {
        return leftTime - rightTime || left.node.sourceId.localeCompare(right.node.sourceId);
      }
      if (leftTime !== null) return -1;
      if (rightTime !== null) return 1;
      return left.node.sourceId.localeCompare(right.node.sourceId);
    })
    .map(({ node }) => node);

  const validOccurrence =
    input.submittedOccurrence &&
    hasValidSubmittedOccurrenceEvidence(input.submittedOccurrence)
      ? input.submittedOccurrence
      : null;
  const currentNode = submittedNode(
    input.claim,
    validOccurrence,
    input.submittedEvidenceId,
  );
  nodes.push(currentNode);

  const sourceIds = new Set(nodes.map((node) => node.sourceId));
  const mutationsByPair = new Map<string, DetectedMutation[]>();
  for (const mutation of input.mutations) {
    const pair = `${mutation.fromSourceId}\u0000${mutation.toSourceId}`;
    const values = mutationsByPair.get(pair) ?? [];
    values.push(mutation);
    mutationsByPair.set(pair, values);
  }

  const edges: RuntimeLineageEdge[] = [];
  for (const comparison of input.comparisons ?? []) {
    if (
      !sourceIds.has(comparison.fromSourceId) ||
      !sourceIds.has(comparison.toSourceId)
    ) {
      continue;
    }
    if (
      comparison.toSourceId === currentNode.sourceId &&
      (!validOccurrence || currentNode.kind !== "submitted_occurrence")
    ) {
      continue;
    }
    const mutations =
      mutationsByPair.get(
        `${comparison.fromSourceId}\u0000${comparison.toSourceId}`,
      ) ?? [];
    if (mutations.length === 0) {
      const edge = edgeFromComparison(comparison, null);
      if (edge) edges.push(edge);
      continue;
    }
    for (const mutation of mutations) {
      const edge = edgeFromComparison(comparison, mutation);
      if (edge) edges.push(edge);
    }
  }

  const requiredTransitionCount = Math.max(1, nodes.length - 1);
  const reachability = validOccurrence
    ? establishedReachability(edges, validOccurrence.id)
    : { connected: false, transitionCount: 0, ancestorIds: new Set<string>() };
  const allNodesReachOccurrence =
    validOccurrence !== null &&
    nodes.every((node) => reachability.ancestorIds.has(node.sourceId));
  const submittedOccurrenceConnected =
    validOccurrence !== null && reachability.connected;
  const complete =
    submittedOccurrenceConnected &&
    allNodesReachOccurrence &&
    reachability.transitionCount >= requiredTransitionCount &&
    edges
      .filter((edge) => reachability.ancestorIds.has(edge.fromSourceId))
      .every((edge) => edge.status === "established");
  const status: RuntimeLineageGraph["status"] = complete
    ? "established"
    : edges.length > 0
      ? "candidate"
      : "insufficient_evidence";
  const relevantEdges = edges.filter((edge) =>
    validOccurrence
      ? reachability.ancestorIds.has(edge.fromSourceId) &&
        reachability.ancestorIds.has(edge.toSourceId)
      : true,
  );
  const confidence =
    relevantEdges.length > 0
      ? round(
          relevantEdges.reduce((sum, edge) => sum + edge.confidence, 0) /
            relevantEdges.length,
        )
      : null;

  return {
    status,
    nodes,
    edges,
    evidenceIds: unique([
      ...nodes.flatMap((node) => node.evidenceIds),
      ...edges.flatMap((edge) => edge.evidenceIds),
    ]),
    confidence,
    submittedOccurrenceConnected,
    establishedTransitionCount: submittedOccurrenceConnected
      ? reachability.transitionCount
      : 0,
    requiredTransitionCount,
    reason: complete
      ? "Every required transition to the submitted occurrence is established with exact relationship evidence."
      : edges.length === 0
        ? validOccurrence
          ? "No explicit evidence-backed transmission relationship connects the acquired versions to the submitted occurrence."
          : "No submitted occurrence evidence was supplied, so the normalized claim remains disconnected and no live lineage can be established."
        : submittedOccurrenceConnected
          ? "Some established transitions reach the submitted occurrence, but the required directed graph is incomplete or contains provisional edges."
          : "Explicit source-to-source relationship evidence was found, but no established path reaches a submitted occurrence.",
  };
}
