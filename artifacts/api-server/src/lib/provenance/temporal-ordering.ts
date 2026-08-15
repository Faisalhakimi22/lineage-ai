import type {
  EvidenceDateType,
  EvidenceSnapshot,
  SourceClaimVersion,
  TemporalFinding,
} from "./types";

interface DatedCandidate {
  snapshot: EvidenceSnapshot;
  version: SourceClaimVersion;
  timestamp: number;
  confidence: number;
  evidenceIds: string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

function timestampFor(value: string | null): number | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? timestamp
      : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function emptyFinding(reason: string): TemporalFinding {
  return {
    status: "insufficient_evidence",
    sourceId: null,
    date: null,
    dateType: "unknown",
    confidence: null,
    evidenceIds: [],
    reason,
  };
}

function dateEvidenceIds(snapshot: EvidenceSnapshot): string[] {
  if (snapshot.dateEvidencePassageId) {
    return [snapshot.dateEvidencePassageId];
  }
  return snapshot.relevantPassages
    .filter((passage) => passage.kind === "date" || passage.kind === "metadata")
    .map((passage) => passage.id);
}

function sourceTypeFactor(snapshot: EvidenceSnapshot): number {
  switch (snapshot.sourceType) {
    case "primary":
      return 1;
    case "official":
      return 0.98;
    case "social":
      return 0.96;
    case "academic":
      return 0.95;
    case "fact_check":
      return 0.92;
    case "news":
      return 0.9;
    case "reference":
      return 0.88;
    default:
      return 0.8;
  }
}

function statusFor(candidate: DatedCandidate): TemporalFinding["status"] {
  return candidate.confidence >= 0.7 ? "established" : "candidate";
}

/**
 * Returns the earliest *relevant dated source among the acquired evidence*.
 * This is intentionally not an origin assertion: search coverage is finite,
 * provider dates may be wrong, and an earlier unindexed source may exist.
 */
export function findEarliestRelevantSource(
  snapshots: EvidenceSnapshot[],
  versions: SourceClaimVersion[],
): TemporalFinding {
  const versionBySource = new Map<string, SourceClaimVersion>();
  for (const version of versions) {
    const current = versionBySource.get(version.sourceId);
    if (!current || version.confidence > current.confidence) {
      versionBySource.set(version.sourceId, version);
    }
  }

  const candidates: DatedCandidate[] = [];
  for (const snapshot of snapshots) {
    const version = versionBySource.get(snapshot.id);
    if (!version || version.confidence < 0.35) continue;
    if (
      snapshot.acquisitionStatus !== "acquired" &&
      snapshot.acquisitionStatus !== "partial"
    ) {
      continue;
    }

    // Chronology here means publication/upload chronology. An event date,
    // modification timestamp, historical date mentioned in the article, or a
    // provider crawl/index date cannot stand in for when the page appeared.
    if (
      snapshot.dateType !== "publication" &&
      snapshot.dateType !== "upload"
    ) {
      continue;
    }

    const timestamp = timestampFor(snapshot.publishedAt);
    if (timestamp === null || snapshot.dateConfidence < 0.3) continue;

    candidates.push({
      snapshot,
      version,
      timestamp,
      confidence: round(
        Math.min(snapshot.dateConfidence, version.confidence) * sourceTypeFactor(snapshot),
      ),
      evidenceIds: unique([
        snapshot.id,
        ...version.evidenceIds,
        ...dateEvidenceIds(snapshot),
      ]),
    });
  }

  if (candidates.length === 0) {
    return emptyFinding(
      versions.length === 0
        ? "No evidence-grounded source claim versions were available for temporal ordering."
        : "Relevant sources were found, but none had a sufficiently supported publication date.",
    );
  }

  candidates.sort(
    (left, right) =>
      left.timestamp - right.timestamp ||
      right.confidence - left.confidence ||
      left.snapshot.id.localeCompare(right.snapshot.id),
  );
  const earliest = candidates[0]!;
  const status = statusFor(earliest);

  return {
    status,
    sourceId: earliest.snapshot.id,
    date: earliest.snapshot.publishedAt,
    dateType: earliest.snapshot.dateType as EvidenceDateType,
    confidence: earliest.confidence,
    evidenceIds: earliest.evidenceIds,
    reason:
      status === "established"
        ? `This is the earliest reliably dated relevant source among ${candidates.length} acquired source${candidates.length === 1 ? "" : "s"}; it does not by itself establish origin.`
        : "This is the earliest dated relevant candidate returned, but its date metadata is not strong enough to establish first publication or origin.",
  };
}
