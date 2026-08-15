import type { EvidenceSnapshot } from "./types";

const MAX_DISCOVERY_QUERIES = 3;
const MAX_QUERY_CHARACTERS = 400;
const MAX_QUERY_WORDS = 50;
const DEFAULT_ACQUISITION_LIMIT = 6;
const MAX_ACQUISITION_LIMIT = 10;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
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

export interface RankableSearchSource {
  title: string;
  url: string;
  description: string;
  domain: string;
  provider_score: number | null;
}

export interface RankedSearchSource<T extends RankableSearchSource> {
  source: T;
  /** Search-time retrieval signal used only to decide which pages to acquire. */
  retrievalRelevance: number;
  /** Backwards-compatible alias for retrievalRelevance. */
  relevance: number;
  rank: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function boundedQuery(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_CHARACTERS)
    .split(/\s+/)
    .slice(0, MAX_QUERY_WORDS)
    .join(" ");
}

/**
 * Produces three bounded, deterministic discovery angles. These are generic
 * query variants, not claim-specific fixtures: exact-ish wording, independent
 * context/fact-checking, and first-occurrence/origin language.
 */
export function buildDiscoveryQueries(claim: string): string[] {
  const raw = boundedQuery(claim);
  if (!raw) return [];

  const quoted = raw.length <= 260 ? `"${raw.replace(/"/g, "")}"` : raw;
  const variants = [
    raw,
    boundedQuery(`${quoted} fact check context`),
    boundedQuery(`${quoted} origin "first posted"`),
  ];

  const seen = new Set<string>();
  return variants
    .filter((query) => {
      const key = query.toLocaleLowerCase("en-US");
      if (!query || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_DISCOVERY_QUERIES);
}

function terms(value: string): string[] {
  return value
    .toLocaleLowerCase("en-US")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

/** A bounded lexical relevance signal. It never represents source veracity. */
export function textRelevance(claim: string, candidate: string): number {
  const claimTerms = [...new Set(terms(claim))];
  const candidateTerms = new Set(terms(candidate));
  if (claimTerms.length === 0 || candidateTerms.size === 0) return 0;

  const overlap = claimTerms.filter((term) => candidateTerms.has(term)).length;
  const coverage = overlap / claimTerms.length;
  const union = new Set([...claimTerms, ...candidateTerms]).size;
  const jaccard = union > 0 ? overlap / union : 0;
  const normalizedClaim = claim.replace(/\s+/g, " ").trim().toLowerCase();
  const phraseBonus =
    normalizedClaim.length >= 12 &&
    candidate.toLowerCase().includes(normalizedClaim)
      ? 0.12
      : 0;

  return clamp(coverage * 0.72 + jaccard * 0.16 + phraseBonus);
}

export function normalizedUrlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (
        parameter.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(
          parameter.toLowerCase(),
        )
      ) {
        url.searchParams.delete(parameter);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function rankSearchSources<T extends RankableSearchSource>(
  claim: string,
  sources: readonly T[],
): RankedSearchSource<T>[] {
  const deduplicated = new Map<
    string,
    { source: T; relevance: number; index: number }
  >();

  sources.forEach((source, index) => {
    const lexical = textRelevance(
      claim,
      `${source.title}\n${source.description}`,
    );
    const provider =
      typeof source.provider_score === "number"
        ? clamp(source.provider_score)
        : null;
    // Provider rank is useful for acquisition order, but never dominates exact
    // claim overlap and is never interpreted as credibility.
    const relevance = clamp(
      provider === null ? lexical : lexical * 0.72 + provider * 0.28,
    );
    const key = normalizedUrlKey(source.url);
    const previous = deduplicated.get(key);
    if (
      !previous ||
      relevance > previous.relevance ||
      (relevance === previous.relevance && index < previous.index)
    ) {
      deduplicated.set(key, { source, relevance, index });
    }
  });

  return [...deduplicated.values()]
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        a.index - b.index ||
        normalizedUrlKey(a.source.url).localeCompare(
          normalizedUrlKey(b.source.url),
        ),
    )
    .map((entry, index) => ({
      source: entry.source,
      retrievalRelevance: entry.relevance,
      relevance: entry.relevance,
      rank: index + 1,
    }));
}

/**
 * Chooses a small, relevant, domain-diverse acquisition set. This caps both
 * total fetches and any one publisher's representation.
 */
export function selectSourcesForAcquisition<T extends RankableSearchSource>(
  claim: string,
  sources: readonly T[],
  requestedLimit = DEFAULT_ACQUISITION_LIMIT,
): RankedSearchSource<T>[] {
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(MAX_ACQUISITION_LIMIT, requestedLimit))
    : DEFAULT_ACQUISITION_LIMIT;
  const perDomain = new Map<string, number>();
  const selected: RankedSearchSource<T>[] = [];

  for (const candidate of rankSearchSources(claim, sources)) {
    const domain = candidate.source.domain.toLowerCase();
    const domainCount = perDomain.get(domain) ?? 0;
    if (domainCount >= 2) continue;
    selected.push(candidate);
    perDomain.set(domain, domainCount + 1);
    if (selected.length >= limit) break;
  }

  return selected;
}

export interface RankedEvidenceSnapshot {
  snapshot: EvidenceSnapshot;
  claimRelevance: number;
  evidenceRelevance: number;
  relevance: number;
  rank: number;
}

export function rankEvidenceSnapshots(
  claim: string,
  snapshots: readonly EvidenceSnapshot[],
): RankedEvidenceSnapshot[] {
  return snapshots
    .map((snapshot, index) => {
      const measuredEvidenceRelevance = snapshot.relevantPassages.reduce(
        (maximum, passage) =>
          passage.kind === "date" || passage.kind === "metadata"
            ? maximum
            : Math.max(maximum, passage.relevance),
        0,
      );
      const usable =
        snapshot.acquisitionStatus === "acquired" ||
        snapshot.acquisitionStatus === "partial";
      const claimRelevance = usable
        ? (snapshot.claimRelevance ??
          textRelevance(
            claim,
            `${snapshot.title}\n${snapshot.text.slice(0, 20_000)}`,
          ))
        : 0;
      const evidenceRelevance = usable
        ? (snapshot.evidenceRelevance ?? measuredEvidenceRelevance)
        : 0;
      // Search-provider score is intentionally absent. It is retrieval
      // diagnostics, not evidence that the acquired page supports the claim.
      const relevance = clamp(evidenceRelevance * 0.68 + claimRelevance * 0.32);
      return {
        snapshot,
        claimRelevance,
        evidenceRelevance,
        relevance,
        index,
      };
    })
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        a.index - b.index ||
        a.snapshot.id.localeCompare(b.snapshot.id),
    )
    .map(
      ({ snapshot, claimRelevance, evidenceRelevance, relevance }, index) => ({
        snapshot,
        claimRelevance,
        evidenceRelevance,
        relevance,
        rank: index + 1,
      }),
    );
}

export function meanSourceRelevance(
  ranked: readonly RankedEvidenceSnapshot[],
): number | null {
  if (ranked.length === 0) return null;
  const strongest = ranked.slice(0, 5);
  return (
    strongest.reduce((total, item) => total + item.relevance, 0) /
    strongest.length
  );
}
