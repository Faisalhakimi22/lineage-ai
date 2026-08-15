import type {
  ClaimCertainty,
  ComparisonChange,
  ComparisonChangeType,
  EvidencePassage,
  EvidenceSnapshot,
  LineageEdgeEvidence,
  LineageEdgeEvidenceRole,
  ProvenanceRelationshipAssessment,
  ProvenanceRelationshipType,
  SourceClaimVersion,
  SourceComparison,
  SubmittedOccurrence,
} from "./types";
import { buildSubmittedOccurrenceVersion } from "./version-extraction";

const CERTAINTY_RANK: Record<ClaimCertainty, number | null> = {
  unknown: null,
  possibility: 1,
  uncertain: 2,
  probable: 3,
  asserted: 4,
  confirmed: 5,
};

const SEMANTIC_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "with",
]);

const TRANSMISSION_RELATIONSHIPS = new Set<ProvenanceRelationshipType>([
  "derived_from",
  "reposted_from",
  "quoted_from",
  "corrected_by",
  "same_media",
]);

interface OrderedVersion {
  version: SourceClaimVersion;
  snapshot: EvidenceSnapshot;
  timestamp: number | null;
}

interface SourceReferenceMatch {
  confidence: number;
  description: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function key(value: string): string {
  return clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
}

function tokens(value: string): Set<string> {
  return new Set(
    key(value)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !SEMANTIC_STOPWORDS.has(token)),
  );
}

function dice(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return key(left) === key(right) ? 1 : 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return (2 * overlap) / (a.size + b.size);
}

function semanticallyEqual(left: string, right: string): boolean {
  return key(left) === key(right) || dice(left, right) >= 0.86;
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
    const result = Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    return Number.isFinite(result) ? result : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bestVersionPerSource(versions: SourceClaimVersion[]): SourceClaimVersion[] {
  const bySource = new Map<string, SourceClaimVersion>();
  for (const version of versions) {
    if (
      version.evidenceIds.length === 0 ||
      !version.evidencePassageId ||
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

function orderedVersions(
  versions: SourceClaimVersion[],
  snapshots: EvidenceSnapshot[],
): OrderedVersion[] {
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  return bestVersionPerSource(versions)
    .map((version) => {
      const snapshot = snapshotsById.get(version.sourceId);
      if (!snapshot) return null;
      if (!passageFor(version, snapshot)) return null;
      if (
        snapshot.acquisitionStatus !== "acquired" &&
        snapshot.acquisitionStatus !== "partial"
      ) {
        return null;
      }
      if (
        snapshot.acquisitionStatus === "partial" &&
        snapshot.extractionConfidence < 0.55
      ) {
        return null;
      }
      return { version, snapshot, timestamp: timestamp(snapshot.publishedAt) };
    })
    .filter((entry): entry is OrderedVersion => entry !== null)
    .sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null) {
        return (
          left.timestamp - right.timestamp ||
          left.version.sourceId.localeCompare(right.version.sourceId)
        );
      }
      if (left.timestamp !== null) return -1;
      if (right.timestamp !== null) return 1;
      return left.version.sourceId.localeCompare(right.version.sourceId);
    });
}

function passageFor(
  version: SourceClaimVersion,
  snapshot: EvidenceSnapshot,
): EvidencePassage | null {
  return (
    snapshot.relevantPassages.find(
      (passage) => passage.id === version.evidencePassageId,
    ) ??
    snapshot.relevantPassages.find((passage) =>
      version.evidenceIds.includes(passage.id),
    ) ??
    null
  );
}

function evidenceFor(
  version: SourceClaimVersion,
  snapshot: EvidenceSnapshot,
  role: LineageEdgeEvidenceRole,
): LineageEdgeEvidence {
  const passage = passageFor(version, snapshot);
  return {
    sourceId: version.sourceId,
    passageId: passage?.id ?? version.evidencePassageId,
    exactText: passage?.text ?? version.claim,
    role,
  };
}

function containsIdentifier(text: string, identifier: string): boolean {
  const normalizedIdentifier = identifier.trim().toLocaleLowerCase();
  if (normalizedIdentifier.length < 3) return false;
  return text.toLocaleLowerCase().includes(normalizedIdentifier);
}

function sourceReferenceMatch(
  source: EvidenceSnapshot,
  text: string,
): SourceReferenceMatch | null {
  const urls = unique([source.canonicalUrl, source.finalUrl, source.originalUrl]);
  for (const url of urls) {
    if (containsIdentifier(text, url)) {
      return { confidence: 0.99, description: "the earlier source URL" };
    }
  }

  const domain = source.domain.replace(/^www\./i, "");
  if (domain.length >= 4 && containsIdentifier(text, domain)) {
    return { confidence: 0.94, description: "the earlier source domain" };
  }
  if (source.publisher && containsIdentifier(text, source.publisher)) {
    return { confidence: 0.84, description: "the earlier publisher" };
  }
  if (source.author && containsIdentifier(text, source.author)) {
    return { confidence: 0.84, description: "the earlier author" };
  }
  if (tokens(source.title).size >= 3 && containsIdentifier(text, source.title)) {
    return { confidence: 0.8, description: "the earlier article title" };
  }
  return null;
}

function relationshipTypeFromPassage(text: string): ProvenanceRelationshipType | null {
  if (
    /\b(?:same|this|the)\s+(?:image|photo|photograph|picture|video|footage|clip)\b/i.test(
      text,
    ) &&
    /\b(?:reused|recycled|recirculated|originally|first appeared|same (?:image|photo|video|footage))\b/i.test(
      text,
    )
  ) {
    return "same_media";
  }
  if (
    /\b(?:reposted|re-posted|republished|cross-posted|copied|shared)\s+(?:from|by)\b/i.test(
      text,
    )
  ) {
    return "reposted_from";
  }
  if (
    /\b(?:corrects?|corrected|debunks?|debunked|refutes?|refuted|fact[- ]checks?|responds? to|contrary to)\b/i.test(
      text,
    )
  ) {
    return "corrected_by";
  }
  if (
    /\b(?:according to|quoted from|quotes?|citing|cites|as reported by|reported by)\b/i.test(
      text,
    )
  ) {
    return "quoted_from";
  }
  if (
    /\b(?:derived from|based on|source[ds]? from|originally (?:posted|published|shared|uploaded|created) by|originated (?:with|from))\b/i.test(
      text,
    )
  ) {
    return "derived_from";
  }
  return null;
}

function explicitRelationship(
  left: OrderedVersion,
  right: OrderedVersion,
): ProvenanceRelationshipAssessment | null {
  for (const passage of right.snapshot.relevantPassages) {
    if (
      passage.kind !== "provenance" &&
      passage.kind !== "context" &&
      passage.kind !== "claim"
    ) {
      continue;
    }
    const type = relationshipTypeFromPassage(passage.text);
    if (!type) continue;
    const reference = sourceReferenceMatch(left.snapshot, passage.text);
    if (!reference) continue;

    const chronologyConsistent =
      left.timestamp === null ||
      right.timestamp === null ||
      left.timestamp <= right.timestamp;
    const confidence = round(
      Math.min(
        reference.confidence,
        Math.max(0.45, passage.relevance),
        left.version.confidence,
        right.version.confidence,
      ) * (chronologyConsistent ? 1 : 0.7),
    );
    const status =
      chronologyConsistent && confidence >= 0.75
        ? "established"
        : confidence >= 0.5
          ? "candidate"
          : "insufficient_evidence";
    const before = evidenceFor(left.version, left.snapshot, "before");
    const after = evidenceFor(right.version, right.snapshot, "after");
    const relationshipEvidence: LineageEdgeEvidence = {
      sourceId: right.snapshot.id,
      passageId: passage.id,
      exactText: passage.text,
      role: "source_reference",
    };

    return {
      type,
      status,
      confidence,
      evidence: uniqueEvidence([before, relationshipEvidence, after]),
      reason:
        status === "established"
          ? `A passage in the later source explicitly identifies ${reference.description} and states a ${type.replace(/_/g, " ")} relationship.`
          : `A passage suggests a ${type.replace(/_/g, " ")} relationship to ${reference.description}, but the evidence or chronology is not strong enough to establish transmission.`,
    };
  }
  return null;
}

function descriptiveRelationship(
  left: OrderedVersion,
  right: OrderedVersion,
): ProvenanceRelationshipAssessment {
  const before = evidenceFor(left.version, left.snapshot, "before");
  const after = evidenceFor(right.version, right.snapshot, "after");
  const evidence = [before, after];
  const propositionSimilarity = dice(
    left.version.normalizedProposition,
    right.version.normalizedProposition,
  );
  const eventSimilarity = dice(left.version.event ?? "", right.version.event ?? "");

  if (propositionSimilarity >= 0.86) {
    return {
      type: "same_claim",
      status: "established",
      confidence: round(Math.min(left.version.confidence, right.version.confidence)),
      evidence,
      reason:
        "The passages express the same normalized proposition. This establishes claim identity, not source-to-source transmission.",
    };
  }
  if (eventSimilarity >= 0.72) {
    return {
      type: "same_event",
      status: "candidate",
      confidence: round(
        Math.min(left.version.confidence, right.version.confidence, eventSimilarity),
      ),
      evidence,
      reason:
        "The passages appear to concern the same event, but no citation, repost, common artifact, or other transmission evidence links the sources.",
    };
  }
  if (propositionSimilarity >= 0.28) {
    return {
      type: "related_claim",
      status: "candidate",
      confidence: round(
        Math.min(left.version.confidence, right.version.confidence, propositionSimilarity),
      ),
      evidence,
      reason:
        "The passages concern related claims, but semantic relatedness is not evidence that either source derived from the other.",
    };
  }

  const ordered =
    left.timestamp !== null &&
    right.timestamp !== null &&
    left.timestamp <= right.timestamp;
  return {
    type: "temporal_order",
    status: ordered ? "established" : "insufficient_evidence",
    confidence: ordered
      ? round(Math.min(left.snapshot.dateConfidence, right.snapshot.dateConfidence))
      : 0,
    evidence,
    reason: ordered
      ? "The publication metadata orders the sources. Temporal order alone is not a provenance relationship."
      : "The available passages do not establish claim identity, event identity, or transmission.",
  };
}

function relationshipForPair(
  left: OrderedVersion,
  right: OrderedVersion,
): ProvenanceRelationshipAssessment {
  return explicitRelationship(left, right) ?? descriptiveRelationship(left, right);
}

function addChange(
  changes: ComparisonChange[],
  type: ComparisonChangeType,
  before: string | null,
  after: string | null,
  explanation: string,
  evidenceIds: string[],
  confidence: number,
): void {
  const groundedIds = unique(evidenceIds);
  if (groundedIds.length < 2) return;
  changes.push({
    type,
    before,
    after,
    explanation,
    evidenceIds: groundedIds,
    confidence: round(confidence),
  });
}

function meaningfulQualifiers(version: SourceClaimVersion): string[] {
  // Attribution is presentation metadata. Treating "according to X" as
  // removable claim context created grammar-based false mutations.
  return version.qualifiers.filter(
    (qualifier) => !/^according to\s+/i.test(qualifier),
  );
}

function comparisonChanges(
  before: SourceClaimVersion,
  after: SourceClaimVersion,
  pairEvidence: string[],
  confidence: number,
  relationship: ProvenanceRelationshipAssessment,
): ComparisonChange[] {
  const changes: ComparisonChange[] = [];
  const propositionSimilarity = dice(
    before.normalizedProposition,
    after.normalizedProposition,
  );
  if (propositionSimilarity < 0.28) return changes;

  const beforeQualifiers = meaningfulQualifiers(before);
  const afterQualifiers = meaningfulQualifiers(after);
  const removedQualifiers = beforeQualifiers.filter(
    (qualifier) =>
      !afterQualifiers.some((candidate) => semanticallyEqual(qualifier, candidate)),
  );
  const addedQualifiers = afterQualifiers.filter(
    (qualifier) =>
      !beforeQualifiers.some((candidate) => semanticallyEqual(qualifier, candidate)),
  );
  if (removedQualifiers.length > 0) {
    addChange(
      changes,
      "context_removed",
      removedQualifiers.join("; "),
      null,
      "The later proposition omits a substantive qualifier present in the earlier proposition.",
      pairEvidence,
      confidence,
    );
  }
  if (addedQualifiers.length > 0) {
    addChange(
      changes,
      "context_added",
      null,
      addedQualifiers.join("; "),
      "The later proposition adds a substantive qualifier absent from the earlier proposition.",
      pairEvidence,
      confidence,
    );
  }

  if (!before.causalLanguage && after.causalLanguage) {
    addChange(
      changes,
      "cause_introduced",
      null,
      after.causalLanguage,
      "The later proposition introduces a causal account absent from the earlier proposition.",
      pairEvidence,
      confidence * 0.95,
    );
  } else if (before.causalLanguage && !after.causalLanguage) {
    addChange(
      changes,
      "cause_removed",
      before.causalLanguage,
      null,
      "The later proposition removes the earlier causal account.",
      pairEvidence,
      confidence * 0.95,
    );
  } else if (
    before.causalLanguage &&
    after.causalLanguage &&
    !semanticallyEqual(before.causalLanguage, after.causalLanguage)
  ) {
    addChange(
      changes,
      "cause_removed",
      before.causalLanguage,
      null,
      "The earlier causal account is absent from the later proposition.",
      pairEvidence,
      confidence * 0.9,
    );
    addChange(
      changes,
      "cause_introduced",
      null,
      after.causalLanguage,
      "The later proposition substitutes a materially different causal account.",
      pairEvidence,
      confidence * 0.9,
    );
  }

  // A narrator, grammatical subject, headline label, or fact-check wrapper is
  // not an attribution mutation. Only two explicit quotations of materially
  // the same proposition with different named speakers qualify as a change.
  if (
    before.claimType === "quotation" &&
    after.claimType === "quotation" &&
    before.quotedSpeaker &&
    after.quotedSpeaker &&
    !semanticallyEqual(before.quotedSpeaker, after.quotedSpeaker) &&
    propositionSimilarity >= 0.72
  ) {
    addChange(
      changes,
      "attribution_changed",
      before.quotedSpeaker,
      after.quotedSpeaker,
      "The same quoted proposition is explicitly attributed to different speakers.",
      pairEvidence,
      confidence * 0.94,
    );
  }

  if (before.eventDate && after.eventDate && before.eventDate !== after.eventDate) {
    addChange(
      changes,
      "date_changed",
      before.eventDate,
      after.eventDate,
      "The propositions place the described event on different dates.",
      pairEvidence,
      confidence * 0.96,
    );
  }
  if (
    before.location &&
    after.location &&
    !semanticallyEqual(before.location, after.location)
  ) {
    addChange(
      changes,
      "location_changed",
      before.location,
      after.location,
      "The propositions place the described event in different locations.",
      pairEvidence,
      confidence * 0.92,
    );
  }

  const beforeRank = CERTAINTY_RANK[before.certainty];
  const afterRank = CERTAINTY_RANK[after.certainty];
  if (beforeRank !== null && afterRank !== null && beforeRank !== afterRank) {
    const strengthened = afterRank > beforeRank;
    addChange(
      changes,
      strengthened ? "certainty_strengthened" : "certainty_weakened",
      before.certainty,
      after.certainty,
      strengthened
        ? "The later proposition states the same claim with greater certainty."
        : "The later proposition states the same claim with less certainty.",
      pairEvidence,
      confidence,
    );
  }

  if (
    before.claimType === "quotation" &&
    after.claimType === "quotation" &&
    before.quotedSpeaker &&
    after.quotedSpeaker &&
    semanticallyEqual(before.quotedSpeaker, after.quotedSpeaker) &&
    propositionSimilarity >= 0.35 &&
    propositionSimilarity < 0.78
  ) {
    addChange(
      changes,
      "quotation_changed",
      before.normalizedProposition,
      after.normalizedProposition,
      "The same identified speaker is quoted with materially different proposition wording.",
      pairEvidence,
      confidence * 0.9,
    );
  }

  if (
    relationship.type === "same_media" &&
    before.captionContext &&
    after.captionContext &&
    !semanticallyEqual(before.captionContext, after.captionContext)
  ) {
    addChange(
      changes,
      "caption_changed",
      before.captionContext,
      after.captionContext,
      "Explicit same-media evidence accompanies materially different caption context.",
      pairEvidence,
      Math.min(confidence, relationship.confidence),
    );
  }
  if (
    relationship.type === "same_media" &&
    relationship.status !== "insufficient_evidence" &&
    before.eventDate &&
    after.eventDate &&
    before.eventDate < after.eventDate
  ) {
    addChange(
      changes,
      "old_media_reused",
      `${before.eventDate}: ${before.captionContext ?? before.normalizedProposition}`,
      `${after.eventDate}: ${after.captionContext ?? after.normalizedProposition}`,
      "An explicit same-media relationship accompanies different event dates.",
      pairEvidence,
      Math.min(confidence, relationship.confidence),
    );
  }

  return changes;
}

function comparePair(left: OrderedVersion, right: OrderedVersion): SourceComparison {
  const beforeEvidence = evidenceFor(left.version, left.snapshot, "before");
  const afterEvidence = evidenceFor(right.version, right.snapshot, "after");
  const pairEvidence = unique([beforeEvidence.passageId, afterEvidence.passageId]);
  const chronologyEstablished =
    left.timestamp !== null &&
    right.timestamp !== null &&
    left.timestamp <= right.timestamp &&
    left.snapshot.dateConfidence >= 0.5 &&
    right.snapshot.dateConfidence >= 0.5;
  const confidence = round(
    Math.min(left.version.confidence, right.version.confidence) *
      (chronologyEstablished ? 1 : 0.78),
  );
  const relationship = relationshipForPair(left, right);
  const propositionSimilarity = dice(
    left.version.normalizedProposition,
    right.version.normalizedProposition,
  );

  if (pairEvidence.length < 2 || propositionSimilarity < 0.28) {
    return {
      id: `comparison:${left.version.sourceId}:${right.version.sourceId}`,
      fromSourceId: left.version.sourceId,
      toSourceId: right.version.sourceId,
      changes: [],
      evidenceIds: pairEvidence,
      confidence: round(confidence * 0.5),
      status: "insufficient_evidence",
      relationship,
      reason:
        "The passages do not share enough proposition-level identity for a before-and-after semantic comparison.",
    };
  }

  const changes = comparisonChanges(
    left.version,
    right.version,
    pairEvidence,
    confidence,
    relationship,
  );
  const status: SourceComparison["status"] =
    chronologyEstablished && confidence >= 0.65 ? "established" : "candidate";

  return {
    id: `comparison:${left.version.sourceId}:${right.version.sourceId}`,
    fromSourceId: left.version.sourceId,
    toSourceId: right.version.sourceId,
    changes,
    evidenceIds: pairEvidence,
    confidence,
    status,
    relationship,
    reason:
      status === "established"
        ? changes.length > 0
          ? `Compared proposition-level evidence and found ${changes.length} supported semantic change${changes.length === 1 ? "" : "s"}. ${relationship.reason}`
          : `Compared proposition-level evidence; no supported semantic mutation was found. ${relationship.reason}`
        : `The propositions can be compared provisionally, but chronology or extraction confidence is incomplete. ${relationship.reason}`,
  };
}

export function hasValidSubmittedOccurrenceEvidence(
  occurrence: SubmittedOccurrence,
): boolean {
  if (!occurrence.id.trim() || !occurrence.exactText.trim()) return false;
  const occurrenceEvidence = occurrence.evidence.filter(
    (item) =>
      item.sourceId === occurrence.id &&
      item.role === "occurrence" &&
      item.passageId.trim() &&
      item.exactText.trim(),
  );
  if (occurrenceEvidence.length === 0 || occurrence.evidenceIds.length === 0) {
    return false;
  }
  if (
    !occurrenceEvidence.every((item) => occurrence.evidenceIds.includes(item.passageId))
  ) {
    return false;
  }

  switch (occurrence.evidenceType) {
    case "supplied_url":
      return /^https?:\/\//i.test(occurrence.sourceUrl ?? "");
    case "screenshot":
    case "image":
      return occurrence.evidenceIds.length > 0;
    case "source_post":
      return Boolean(occurrence.sourceUrl || occurrence.sourceIdentifier);
    case "quoted_context":
      return Boolean(
        occurrence.sourceContext &&
          (occurrence.sourceUrl || occurrence.sourceIdentifier || occurrence.timestamp),
      );
    case "source_metadata":
      return Boolean(
        occurrence.timestamp &&
          (occurrence.sourceUrl || occurrence.sourceIdentifier || occurrence.sourceContext),
      );
    default:
      return false;
  }
}

function validatedOccurrenceRelationship(
  occurrence: SubmittedOccurrence,
  latest: OrderedVersion,
): ProvenanceRelationshipAssessment {
  const supplied = occurrence.sourceRelationship;
  if (!hasValidSubmittedOccurrenceEvidence(occurrence) || !supplied) {
    return {
      type: "related_claim",
      status: "insufficient_evidence",
      confidence: 0,
      evidence: occurrence.evidence,
      reason:
        "The request does not include occurrence-level evidence plus an explicit relationship to an acquired source.",
    };
  }
  if (
    supplied.fromSourceId !== latest.version.sourceId ||
    !TRANSMISSION_RELATIONSHIPS.has(supplied.relationship)
  ) {
    return {
      type: supplied.relationship,
      status: "insufficient_evidence",
      confidence: 0,
      evidence: supplied.evidence,
      reason:
        "The supplied relationship does not identify the latest supported live version with a transmission-capable relationship.",
    };
  }

  const livePassageIds = new Set(
    latest.snapshot.relevantPassages.map((passage) => passage.id),
  );
  const beforeEvidence = supplied.evidence.some(
    (item) =>
      item.sourceId === latest.version.sourceId &&
      (item.role === "before" ||
        item.role === "relationship" ||
        item.role === "source_reference" ||
        item.role === "media_identity") &&
      livePassageIds.has(item.passageId) &&
      item.exactText.trim(),
  );
  const occurrenceEvidence = supplied.evidence.some(
    (item) =>
      item.sourceId === occurrence.id &&
      item.role === "occurrence" &&
      occurrence.evidenceIds.includes(item.passageId) &&
      item.exactText.trim(),
  );
  const relationshipEvidence = supplied.evidence.some(
    (item) =>
      (item.role === "relationship" ||
        item.role === "source_reference" ||
        item.role === "media_identity") &&
      item.passageId.trim() &&
      item.exactText.trim(),
  );
  if (!beforeEvidence || !occurrenceEvidence || !relationshipEvidence) {
    return {
      type: supplied.relationship,
      status: "insufficient_evidence",
      confidence: 0,
      evidence: supplied.evidence,
      reason:
        "The submitted relationship lacks exact before, occurrence, or relationship evidence.",
    };
  }

  const confidence = round(Math.min(supplied.confidence, occurrence.confidence));
  return {
    type: supplied.relationship,
    status:
      supplied.status === "established" && confidence >= 0.75
        ? "established"
        : confidence >= 0.5
          ? "candidate"
          : "insufficient_evidence",
    confidence,
    evidence: uniqueEvidence(supplied.evidence),
    reason: supplied.reason,
  };
}

/**
 * Compares all acquired source pairs in temporal order. Pair generation is an
 * inspection step only: neither adjacency, dates, nor semantic similarity can
 * create a lineage relationship.
 */
export function compareSourceVersions(
  versions: SourceClaimVersion[],
  snapshots: EvidenceSnapshot[],
): SourceComparison[] {
  const ordered = orderedVersions(versions, snapshots);
  const comparisons: SourceComparison[] = [];
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      comparisons.push(comparePair(ordered[left]!, ordered[right]!));
    }
  }
  return comparisons;
}

/**
 * Performs the only comparison eligible to connect the current request. It
 * fails closed unless a first-class occurrence and explicit relationship
 * evidence identify the latest supported acquired source.
 */
export function compareLatestVersionToSubmittedOccurrence(
  versions: SourceClaimVersion[],
  snapshots: EvidenceSnapshot[],
  occurrence: SubmittedOccurrence | null | undefined,
): SourceComparison | null {
  if (!occurrence) return null;
  const ordered = orderedVersions(versions, snapshots);
  const dated = ordered.filter((entry) => entry.timestamp !== null);
  const latest = (dated.length > 0 ? dated : ordered).at(-1);
  if (!latest) return null;

  const relationship = validatedOccurrenceRelationship(occurrence, latest);
  const occurrenceVersion = buildSubmittedOccurrenceVersion(occurrence);
  const before = evidenceFor(latest.version, latest.snapshot, "before");
  const after =
    occurrence.evidence.find((item) => item.role === "occurrence") ??
    ({
      sourceId: occurrence.id,
      passageId: occurrence.evidenceIds[0] ?? `occurrence:${occurrence.id}`,
      exactText: occurrence.exactText,
      role: "occurrence",
    } satisfies LineageEdgeEvidence);
  const pairEvidence = unique([before.passageId, after.passageId]);
  const propositionSimilarity = dice(
    latest.version.normalizedProposition,
    occurrenceVersion.normalizedProposition,
  );
  const confidence = round(
    Math.min(latest.version.confidence, occurrenceVersion.confidence),
  );
  const changes =
    propositionSimilarity >= 0.28
      ? comparisonChanges(
          latest.version,
          occurrenceVersion,
          pairEvidence,
          confidence,
          relationship,
        )
      : [];
  const status: SourceComparison["status"] =
    propositionSimilarity < 0.28 || relationship.status === "insufficient_evidence"
      ? "insufficient_evidence"
      : relationship.status;

  return {
    id: `comparison:${latest.version.sourceId}:${occurrence.id}`,
    fromSourceId: latest.version.sourceId,
    toSourceId: occurrence.id,
    changes,
    evidenceIds: pairEvidence,
    confidence:
      status === "insufficient_evidence"
        ? round(confidence * 0.5)
        : round(Math.min(confidence, relationship.confidence)),
    status,
    relationship,
    reason:
      status === "insufficient_evidence"
        ? `The latest acquired version cannot be connected to the submitted occurrence: ${relationship.reason}`
        : `The latest acquired version was compared with request-specific occurrence evidence. ${relationship.reason}`,
  };
}

export function isTransmissionRelationship(
  type: ProvenanceRelationshipType,
): boolean {
  return TRANSMISSION_RELATIONSHIPS.has(type);
}
