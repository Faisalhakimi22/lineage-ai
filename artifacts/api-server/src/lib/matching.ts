import { z } from "zod";
import type { Lineage, MatchCandidate, MatchingStrategy } from "@workspace/api-zod";
import { completeStructured, llm } from "./llm";
import { embeddings } from "./embeddings";
import { logger } from "./logger";

/**
 * Confidence bands.
 *
 * Above TRACE: we are willing to show a documented lineage as the answer.
 * Between PARTIAL and TRACE: there is real signal but not enough to assert a
 * connection, which the product reports as PARTIALLY_TRACED rather than
 * silently rounding up to a match.
 * Below PARTIAL: untraced.
 */
export const TRACE_THRESHOLD = 0.62;
export const PARTIAL_THRESHOLD = 0.34;

/** The band where lexical and semantic layers disagree or are inconclusive. */
const ADJUDICATION_FLOOR = 0.28;
const ADJUDICATION_CEILING = 0.78;

const STOPWORDS = new Set([
  "the", "a", "an", "is", "was", "were", "are", "be", "been", "to", "of", "in",
  "on", "at", "and", "or", "by", "it", "its", "this", "that", "for", "with",
  "as", "from", "did", "you", "your", "they", "them", "has", "have",
  "but", "all", "can", "will", "would", "about", "into", "than", "then",
]);

const NEGATION_WORDS = new Set(["not", "never", "no", "without"]);
const NEGATION_MODIFIERS = new Set([
  "actually",
  "directly",
  "entirely",
  "necessarily",
  "really",
  "simply",
  "solely",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Returns the meaningful terms governed by an explicit negation. Similarity
 * alone cannot tell "caused the blackout" from "did not cause the blackout";
 * treating those as the same claim would reverse its meaning.
 */
function negatedTerms(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/\b(?:can(?:not|'t)|(?:is|are|was|were|do|does|did|has|have|had|will|would|should|could)n['’]t)\b/g, " not ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const terms = new Set<string>();

  for (let index = 0; index < words.length; index += 1) {
    if (!NEGATION_WORDS.has(words[index]!)) continue;

    // "Do not <verb>" is commonly an imperative safety instruction (and is
    // present in the tap-water lineage), not the opposite of a factual claim.
    if (words[index - 1] === "do") continue;

    // Capture the negated predicate, skipping only adverbs that modify it. We
    // deliberately do not treat every later noun as negated: "do not drink
    // tap water" is advice, not a denial that water exists or is contaminated.
    for (let next = index + 1; next < words.length; next += 1) {
      const word = words[next]!;
      if (word.length <= 1 || STOPWORDS.has(word) || NEGATION_WORDS.has(word)) continue;
      if (NEGATION_MODIFIERS.has(word)) continue;
      terms.add(word);
      break;
    }
  }

  return terms;
}

function hasPolarityConflict(claim: string, lineage: Lineage): boolean {
  const negated = negatedTerms(claim);
  if (negated.size === 0) return false;

  const canonicalTerms = new Set(tokenize(lineage.canonical_claim));
  const canonicalNegated = negatedTerms(lineage.canonical_claim);

  return [...negated].some(
    (term) => canonicalTerms.has(term) && !canonicalNegated.has(term),
  );
}

/**
 * Inverse document frequency over the lineage corpus.
 *
 * Plain overlap treats "the blackout was caused by sanctions" as mostly common
 * words. Weighting by IDF makes the rare, discriminating terms - "blackout",
 * "sanctions", "barnacles" - dominate the score, which is what actually
 * distinguishes one claim from another.
 */
class IdfIndex {
  private readonly idf = new Map<string, number>();
  private readonly fallbackIdf: number;

  constructor(documents: string[]) {
    const docCount = documents.length || 1;
    const seen = new Map<string, number>();

    for (const doc of documents) {
      for (const term of new Set(tokenize(doc))) {
        seen.set(term, (seen.get(term) ?? 0) + 1);
      }
    }

    for (const [term, count] of seen) {
      this.idf.set(term, Math.log((docCount + 1) / (count + 0.5)));
    }

    this.fallbackIdf = Math.log((docCount + 1) / 0.5);
  }

  weight(term: string): number {
    return this.idf.get(term) ?? this.fallbackIdf;
  }
}

/** Cosine similarity over IDF-weighted term vectors. */
function weightedCosine(a: string, b: string, idf: IdfIndex): number {
  const termsA = new Set(tokenize(a));
  const termsB = new Set(tokenize(b));
  if (termsA.size === 0 || termsB.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const term of termsA) {
    const w = idf.weight(term);
    normA += w * w;
    if (termsB.has(term)) dot += w * w;
  }
  for (const term of termsB) {
    const w = idf.weight(term);
    normB += w * w;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

function lexicalScore(claim: string, lineage: Lineage, idf: IdfIndex): number {
  // A claim only has to resemble the canonical phrasing OR any recorded
  // alias - real rewordings are what aliases exist to capture.
  return Math.max(
    ...[lineage.canonical_claim, ...lineage.aliases].map((candidate) =>
      weightedCosine(claim, candidate, idf),
    ),
  );
}

const AdjudicationSchema = z.object({
  id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(400).optional(),
});

export interface MatchResult {
  lineage: Lineage | null;
  confidence: number;
  strategy: MatchingStrategy;
  candidates: MatchCandidate[];
  /** Populated when the LLM layer supplied a rationale. */
  reason: string | null;
}

/**
 * Layered matching: lexical, then semantic, then LLM adjudication for the
 * ambiguous middle band only.
 *
 * Every layer is optional and every layer degrades downward. With no API key
 * and no embedding model the lexical layer alone still produces a usable,
 * fully deterministic answer - it simply reports lower confidence and lets the
 * trace status reflect that, rather than guessing.
 */
export async function matchClaim(
  claim: string,
  lineages: Lineage[],
): Promise<MatchResult> {
  if (lineages.length === 0) {
    return { lineage: null, confidence: 0, strategy: "none", candidates: [], reason: null };
  }

  const idf = new IdfIndex(
    lineages.flatMap((l) => [l.canonical_claim, ...l.aliases]),
  );

  // --- Layer 1: lexical -------------------------------------------------
  const lexical = lineages
    .map((lineage) => {
      const polarityConflict = hasPolarityConflict(claim, lineage);
      return {
        lineage,
        polarityConflict,
        score: polarityConflict ? 0 : lexicalScore(claim, lineage, idf),
      };
    })
    .sort((a, b) => b.score - a.score);

  let scored = lexical;
  let strategy: MatchingStrategy = "lexical";

  // --- Layer 2: semantic ------------------------------------------------
  if (await embeddings.isAvailable()) {
    const semantic = await embeddings.rank(
      claim,
      lineages.map((lineage) => ({
        id: lineage.id,
        texts: [lineage.canonical_claim, ...lineage.aliases],
      })),
    );

    if (semantic) {
      const byId = new Map(semantic.map((s) => [s.id, s.score]));
      scored = lineages
        .map((lineage) => {
          const polarityConflict = hasPolarityConflict(claim, lineage);
          const lex = lexicalScore(claim, lineage, idf);
          const sem = byId.get(lineage.id) ?? 0;
          // Semantic dominates but lexical still contributes: exact wording
          // overlap is real evidence, not noise.
          return {
            lineage,
            polarityConflict,
            score: polarityConflict ? 0 : 0.65 * sem + 0.35 * lex,
          };
        })
        .sort((a, b) => b.score - a.score);
      strategy = "semantic";
    }
  }

  const top = scored[0]!;
  const runnerUp = scored[1];

  const candidates: MatchCandidate[] = scored.slice(0, 4).map((entry) => ({
    lineage_id: entry.lineage.id,
    canonical_claim: entry.lineage.canonical_claim,
    confidence: round(entry.score),
  }));

  // --- Layer 3: LLM adjudication ---------------------------------------
  // Only consulted when the deterministic layers are genuinely uncertain:
  // a mid-band top score, or a top score too close to the runner-up to call.
  const ambiguous =
    (top.score >= ADJUDICATION_FLOOR && top.score <= ADJUDICATION_CEILING) ||
    (runnerUp !== undefined && top.score - runnerUp.score < 0.08);

  if (ambiguous && llm.available) {
    const shortlist = scored
      .filter((entry) => !entry.polarityConflict)
      .slice(0, 6)
      .map((entry) => entry.lineage);

    if (shortlist.length === 0) {
      return { lineage: null, confidence: 0, strategy, candidates, reason: null };
    }

    const adjudicated = await completeStructured(
      llm,
      {
        system:
          "You match a claim to a known claim from a fixed list. You only ever " +
          "respond with strict JSON. You never invent an id that is not in the list.",
        task:
          "Decide which known claim, if any, states the same underlying factual " +
          "claim as the submitted claim. Paraphrases, rewordings and translations " +
          "count as the same claim. If none match, return id null.\n\n" +
          `Known claims:\n${shortlist
            .map((l) => `- id: "${l.id}" | claim: "${l.canonical_claim}"`)
            .join("\n")}\n\n` +
          'Respond with only: {"id": "<id or null>", "confidence": <0..1>, "reason": "<short>"}',
        untrusted: { submitted_claim: claim },
      },
      AdjudicationSchema,
    );

    if (adjudicated) {
      if (adjudicated.id === null) {
        // A confident "none of these" from the model beats a weak lexical hit.
        return {
          lineage: null,
          confidence: Math.min(top.score, 1 - adjudicated.confidence),
          strategy: "llm_adjudicated",
          candidates,
          reason: adjudicated.reason ?? null,
        };
      }

      // Guard against a hallucinated id: only ids from the shortlist we sent
      // are accepted.
      const chosen = shortlist.find((l) => l.id === adjudicated.id);
      if (chosen) {
        return {
          lineage: chosen,
          confidence: round(adjudicated.confidence),
          strategy: "llm_adjudicated",
          candidates,
          reason: adjudicated.reason ?? null,
        };
      }

      logger.warn(
        { returned: adjudicated.id },
        "LLM returned an id outside the shortlist; ignoring",
      );
    }
  }

  return {
    lineage: top.lineage,
    confidence: round(top.score),
    strategy,
    candidates,
    reason: null,
  };
}

function round(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;
}
