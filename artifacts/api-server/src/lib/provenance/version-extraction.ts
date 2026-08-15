import { z } from "zod";
import {
  completeStructured,
  llm,
  type LLMProvider,
} from "../llm";
import type {
  ClaimType,
  ClaimCertainty,
  CorrectionVerdict,
  EvidencePassage,
  EvidenceSnapshot,
  SourceStance,
  SourceClaimVersion,
  SubmittedOccurrence,
} from "./types";

const STOPWORDS = new Set([
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

const FINITE_VERB =
  /\b(?:is|are|was|were|has|have|had|will|would|can|could|may|might|must|should|did|does|do|caused|causes|cause|shows|showed|depicts|depicted|wears|wore|said|says|claimed|claims|reported|reports)\b/i;

export interface VersionExtractionOptions {
  /** Ignore provider passages below this relevance unless no better passage exists. */
  minimumPassageRelevance?: number;
}

export interface VersionExtractionAidOptions extends VersionExtractionOptions {
  provider?: LLMProvider;
  maxAssistedSources?: number;
}

const VersionAidSchema = z.object({
  selections: z
    .array(
      z.object({
        sourceId: z.string().min(1).max(200),
        passageId: z.string().min(1).max(200),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(10),
});

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

function clean(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 1 && !STOPWORDS.has(token)) ?? [],
  );
}

function diceSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return (2 * overlap) / (a.size + b.size);
}

function passageScore(passage: EvidencePassage, submittedClaim: string): number {
  const kindWeight = passage.kind === "claim" ? 1 : 0.72;
  return kindWeight * (0.65 * clamp(passage.relevance) + 0.35 * diceSimilarity(passage.text, submittedClaim));
}

/**
 * Claim passages are preferred. A provenance passage is used only when it has
 * substantial lexical overlap with the submitted claim; generic page context
 * must not silently become a sourced claim version.
 */
function selectPassage(
  snapshot: EvidenceSnapshot,
  submittedClaim: string,
  minimumRelevance: number,
): EvidencePassage | null {
  const eligible = snapshot.relevantPassages.filter((passage) => {
    if (!clean(passage.text)) return false;
    // `claim` is a passage-shape label, not a relevance guarantee. Requiring
    // both the acquisition-time relevance signal and direct wording overlap
    // prevents an arbitrary declarative sentence from a weak search result
    // becoming a version of the submitted claim.
    if (passage.kind === "claim") {
      return (
        passage.relevance >= minimumRelevance &&
        diceSimilarity(passage.text, submittedClaim) >= 0.28
      );
    }
    return (
      passage.kind === "provenance" &&
      passage.relevance >= minimumRelevance &&
      diceSimilarity(passage.text, submittedClaim) >= 0.25
    );
  });

  return (
    eligible.sort(
      (left, right) =>
        passageScore(right, submittedClaim) - passageScore(left, submittedClaim) ||
        left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

function certaintyFor(claim: string): ClaimCertainty {
  const value = claim.toLocaleLowerCase();
  if (/\b(?:confirmed|proven|verified|established|demonstrated)\b/.test(value)) {
    return "confirmed";
  }
  if (/\b(?:likely|probably|probable|expected to)\b/.test(value)) return "probable";
  if (/\b(?:reportedly|allegedly|unconfirmed|appears? to|seems? to|suggests?)\b/.test(value)) {
    return "uncertain";
  }
  if (/\b(?:may|might|could|possibly|possible)\b/.test(value)) return "possibility";
  return FINITE_VERB.test(value) ? "asserted" : "unknown";
}

function quoteSegments(value: string): string[] {
  return [
    ...value.matchAll(/["“]([^"”]{2,500})["”]/g),
    ...value.matchAll(/'([^']{2,500})'/g),
  ]
    .map((match) => clean(match[1] ?? ""))
    .filter(Boolean);
}

function quotedSpeakerFor(claim: string): string | null {
  if (quoteSegments(claim).length === 0) return null;
  return firstCaptured(claim, [
    /^([^,;:"“]{2,100}?)\s+(?:said|says|stated|claimed|told|wrote|posted|announced)\b/i,
    /\b(?:said|stated|claimed|wrote|posted)\s+by\s+([^,.;:"“]{2,100})/i,
  ]);
}

function correctionVerdictFor(claim: string): CorrectionVerdict {
  const value = claim.toLocaleLowerCase();
  if (
    /\b(?:false|fake|fabricated|hoax|not true|not authentic|not genuine|did not happen|never happened|no evidence (?:that|to support)|incorrect)\b/.test(
      value,
    )
  ) {
    return "false";
  }
  if (/\b(?:misleading|missing context|out of context)\b/.test(value)) {
    return "misleading";
  }
  if (/\b(?:partly true|partially true|mixture of true and false|mixed)\b/.test(value)) {
    return "mixed";
  }
  if (/\b(?:unverified|unsubstantiated|cannot be verified|not confirmed)\b/.test(value)) {
    return "unverified";
  }
  if (/\b(?:verified as true|confirmed as true|authentic|accurate)\b/.test(value)) {
    return "true";
  }
  return "not_applicable";
}

function sourceStanceFor(
  claim: string,
  verdict: CorrectionVerdict,
  quotedSpeaker: string | null,
): SourceStance {
  const value = claim.toLocaleLowerCase();
  if (verdict === "false" || verdict === "misleading") {
    return /\b(?:actually|in fact|correction|corrected|fact[- ]check)\b/.test(value)
      ? "corrects"
      : "rejects";
  }
  if (verdict === "mixed" || verdict === "unverified") return "corrects";
  if (quotedSpeaker) return "quotes";
  if (/\?$/.test(claim.trim())) return "questions";
  if (/\b(?:according to|reported|reports|said|says|claimed|claims|alleged|alleges)\b/i.test(claim)) {
    return "reports";
  }
  return FINITE_VERB.test(claim) ? "asserts" : "unknown";
}

function claimTypeFor(
  claim: string,
  snapshot: EvidenceSnapshot,
  verdict: CorrectionVerdict,
  quotedSpeaker: string | null,
): ClaimType {
  const value = claim.trim();
  if (
    /^(?:claim|fact[- ]check|fact check claim|viral claim|social media users claim)\s*[:—-]/i.test(
      value,
    )
  ) {
    return "fact_check_framing";
  }
  if (
    verdict !== "not_applicable" &&
    /\b(?:actually|in fact|correction|corrected|fact[- ]check|false|misleading)\b/i.test(value)
  ) {
    return "correction";
  }
  if (quotedSpeaker) return "quotation";
  if (/\b(?:caption|captioned|image|photo|photograph|video|footage)\b/i.test(value)) {
    return "caption";
  }
  if (keyForComparison(value) === keyForComparison(snapshot.title)) return "headline";
  return FINITE_VERB.test(value) ? "claim" : "unknown";
}

function keyForComparison(value: string): string {
  return clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
}

/**
 * Removes presentation/narrator framing without changing the proposition's
 * polarity. This intentionally does not turn a fact-check verdict into a new
 * proposition; stance and verdict are carried in separate fields.
 */
function normalizedPropositionFor(
  claim: string,
  quotedSpeaker: string | null,
): string {
  let value = clean(claim)
    .replace(/^(?:claim|fact[- ]check(?:\s+claim)?|viral claim)\s*[:—-]\s*/i, "")
    .replace(/^according to\s+[^,.;]{2,120},?\s*/i, "");

  const quoted = quoteSegments(value);
  if (quotedSpeaker && quoted.length > 0) {
    value = quoted.sort((left, right) => right.length - left.length)[0] ?? value;
  } else {
    value = value.replace(
      /^[^,.;]{2,100}?\s+(?:said|says|stated|claimed|reported|reports)\s+(?:that\s+)?/i,
      "",
    );
  }

  return clean(value)
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[.!?]+$/g, "")
    .toLocaleLowerCase();
}

export function normalizeClaimProposition(claim: string): string {
  const cleaned = clean(claim);
  return normalizedPropositionFor(cleaned, quotedSpeakerFor(cleaned));
}

/** Builds structured fields for an already validated request occurrence. */
export function buildSubmittedOccurrenceVersion(
  occurrence: SubmittedOccurrence,
): SourceClaimVersion {
  const claim = clean(occurrence.exactText);
  const attribution = attributionFor(claim);
  const quotedSpeaker = quotedSpeakerFor(claim);
  const correctionVerdict = correctionVerdictFor(claim);
  const sourceStance = sourceStanceFor(claim, correctionVerdict, quotedSpeaker);
  const evidencePassageId =
    occurrence.evidence.find((item) => item.role === "occurrence")?.passageId ??
    occurrence.evidenceIds[0] ??
    `occurrence:${occurrence.id}`;

  return {
    id: `version:${occurrence.id}:${evidencePassageId}`,
    sourceId: occurrence.id,
    claim,
    normalizedProposition:
      occurrence.normalizedProposition.trim() || normalizeClaimProposition(claim),
    narrator: occurrence.sourceIdentifier,
    quotedSpeaker,
    sourceStance,
    correctionVerdict,
    claimType:
      occurrence.evidenceType === "quoted_context"
        ? "quotation"
        : occurrence.evidenceType === "screenshot" ||
            occurrence.evidenceType === "image"
          ? "caption"
          : FINITE_VERB.test(claim)
            ? "claim"
            : "unknown",
    evidencePassageId,
    subject: subjectFor(claim),
    event: eventFor(claim),
    eventDate: eventDateFor(claim),
    location: locationFor(claim),
    actor: actorFor(claim, attribution),
    attribution,
    causalLanguage: causalLanguageFor(claim),
    certainty: certaintyFor(claim),
    captionContext: captionContextFor(claim),
    qualifiers: qualifiersFor(claim, attribution),
    evidenceIds: [...new Set(occurrence.evidenceIds.filter(Boolean))],
    confidence: round(occurrence.confidence),
    extractionMethod: "deterministic",
  };
}

function subjectFor(claim: string): string | null {
  const match = FINITE_VERB.exec(claim);
  if (!match || match.index < 2) return null;
  const subject = clean(claim.slice(0, match.index).replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""));
  return subject.length >= 2 && subject.length <= 120 ? subject : null;
}

function eventFor(claim: string): string | null {
  const match = FINITE_VERB.exec(claim);
  if (!match) return null;
  const event = clean(claim.slice(match.index));
  return event.length >= 2 ? event : null;
}

function firstCaptured(claim: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(claim);
    const captured = clean(match?.[1] ?? "");
    if (captured) return captured;
  }
  return null;
}

function attributionFor(claim: string): string | null {
  return firstCaptured(claim, [
    /\baccording to\s+([^,.;]{2,120})/i,
    /^([^,.;]{2,100}?)\s+(?:said|stated|claimed|reported|announced|confirmed)\b/i,
  ]);
}

function actorFor(claim: string, attribution: string | null): string | null {
  return (
    firstCaptured(claim, [
      /\bby\s+([^,.;]{2,100}?)(?=\s+(?:in|on|at|after|before|because|due)\b|[,.;]|$)/i,
    ]) ?? attribution
  );
}

function locationFor(claim: string): string | null {
  return firstCaptured(claim, [
    /\b(?:in|at|near|outside|inside)\s+([\p{Lu}][\p{L}\p{N}'’.-]*(?:\s+[\p{Lu}][\p{L}\p{N}'’.-]*){0,4})(?=[,.;]|\s+(?:on|after|before|because|due|when|where)\b|$)/u,
  ]);
}

function causalLanguageFor(claim: string): string | null {
  return firstCaptured(claim, [
    /\b((?:because of|due to|caused by|resulted from|attributed to)\s+[^,.;]{1,160})/i,
    /\b([^,.;]{1,100}\s+caused\s+[^,.;]{1,100})/i,
  ]);
}

function normaliseDate(value: string): string | null {
  const dateOnly = value.trim().match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return null;
    }
    return `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  const namedDate = value
    .trim()
    .match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})$/i,
    );
  if (namedDate) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const year = Number(namedDate[3]);
    const month = months.indexOf(namedDate[1]!.toLocaleLowerCase()) + 1;
    const day = Number(namedDate[2]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      month < 1 ||
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return null;
    }
    return `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function eventDateFor(claim: string): string | null {
  const iso = claim.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/)?.[1];
  if (iso) return normaliseDate(iso);

  const named = claim.match(
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})\b/i,
  )?.[1];
  if (named) return normaliseDate(named.replace(/(\d)(?:st|nd|rd|th)/i, "$1"));

  // A bare year is not a day-level event date. Inventing January 1 would make
  // later temporal comparisons look precise when the evidence is not.
  return null;
}

function captionContextFor(claim: string): string | null {
  if (!/\b(?:image|photo|photograph(?:ed)?|picture|video|footage|clip|caption|artwork)\b/i.test(claim)) {
    return null;
  }

  const contexts: string[] = [];
  if (
    /\b(?:ai[- ]generated|generated (?:by|with|using) (?:ai|midjourney)|synthetic (?:image|photo)|digital artwork)\b/i.test(
      claim,
    )
  ) {
    contexts.push("AI-generated artwork");
  }
  if (
    /\b(?:real|genuine|authentic|actual) (?:image|photo|photograph|picture)\b/i.test(
      claim,
    ) ||
    (/\bwas photographed\b/i.test(claim) && contexts.length === 0)
  ) {
    contexts.push("Presented as a genuine photograph");
  }

  const presentedAs = claim.match(
    /\b(?:captioned|shared|circulated|presented|described|claimed|portrayed|purported)(?:\s+\w+){0,3}\s+as\s+([^.;]{2,160})/i,
  )?.[1];
  if (presentedAs) contexts.push(`Presented as ${clean(presentedAs)}`);

  const quotedCaption = claim.match(
    /\bcaption(?:\s+(?:reads|read|says|said|stated))?\s*[:,-]?\s*["â€œ]([^"â€]{2,160})["â€]/i,
  )?.[1];
  if (quotedCaption) contexts.push(`Caption: ${clean(quotedCaption)}`);

  return [...new Set(contexts)].join("; ") || null;
}

function qualifiersFor(claim: string, attribution: string | null): string[] {
  const qualifiers: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\bmay\b/i, "may"],
    [/\bmight\b/i, "might"],
    [/\bcould\b/i, "could"],
    [/\breportedly\b/i, "reportedly"],
    [/\ballegedly\b/i, "allegedly"],
    [/\bunconfirmed\b/i, "unconfirmed"],
    [/\b(?:about|approximately|roughly)\b/i, "approximate quantity"],
    [/\bat least\b/i, "at least"],
    [/\bat most\b/i, "at most"],
    [/\bif\b/i, "conditional"],
    [/\bunless\b/i, "conditional"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(claim)) qualifiers.push(label);
  }
  if (attribution) qualifiers.push(`according to ${attribution}`);
  return [...new Set(qualifiers)];
}

function buildVersion(
  submittedClaim: string,
  snapshot: EvidenceSnapshot,
  passage: EvidencePassage,
): SourceClaimVersion {
  const claim = clean(passage.text);
  const attribution = attributionFor(claim);
  const quotedSpeaker = quotedSpeakerFor(claim);
  const correctionVerdict = correctionVerdictFor(claim);
  const sourceStance = sourceStanceFor(claim, correctionVerdict, quotedSpeaker);
  const semanticFieldCount = [
    subjectFor(claim),
    eventFor(claim),
    eventDateFor(claim),
    locationFor(claim),
    actorFor(claim, attribution),
    attribution,
    causalLanguageFor(claim),
    captionContextFor(claim),
  ].filter(Boolean).length;
  const confidence = round(
    0.42 * clamp(snapshot.extractionConfidence) +
      0.43 * clamp(passage.relevance) +
      0.1 * diceSimilarity(claim, submittedClaim) +
      0.05 * Math.min(1, semanticFieldCount / 4),
  );

  return {
    id: `version:${snapshot.id}:${passage.id}`,
    sourceId: snapshot.id,
    claim,
    normalizedProposition: normalizedPropositionFor(claim, quotedSpeaker),
    narrator: snapshot.publisher ?? snapshot.author ?? snapshot.domain ?? null,
    quotedSpeaker,
    sourceStance,
    correctionVerdict,
    claimType: claimTypeFor(
      claim,
      snapshot,
      correctionVerdict,
      quotedSpeaker,
    ),
    evidencePassageId: passage.id,
    subject: subjectFor(claim),
    event: eventFor(claim),
    eventDate: eventDateFor(claim),
    location: locationFor(claim),
    actor: actorFor(claim, attribution),
    attribution,
    causalLanguage: causalLanguageFor(claim),
    certainty: certaintyFor(claim),
    captionContext: captionContextFor(claim),
    qualifiers: qualifiersFor(claim, attribution),
    evidenceIds: [passage.id],
    confidence,
    extractionMethod: "deterministic",
  };
}

/**
 * Extracts one evidence-grounded claim version per source. No version is
 * produced unless a concrete passage id supports it. This deliberately avoids
 * treating an entire fetched page, provider title, or search score as a claim.
 */
export function extractClaimVersions(
  submittedClaim: string,
  snapshots: EvidenceSnapshot[],
  options: VersionExtractionOptions = {},
): SourceClaimVersion[] {
  const claim = clean(submittedClaim);
  if (!claim) return [];
  const minimumRelevance = options.minimumPassageRelevance ?? 0.55;

  return snapshots
    .filter(
      (snapshot) =>
        snapshot.acquisitionStatus === "acquired" ||
        (snapshot.acquisitionStatus === "partial" &&
          snapshot.extractionConfidence >= 0.55),
    )
    .map((snapshot) => {
      const passage = selectPassage(snapshot, claim, minimumRelevance);
      return passage ? buildVersion(claim, snapshot, passage) : null;
    })
    .filter((version): version is SourceClaimVersion => version !== null);
}

/**
 * Optional semantic aid for passages that narrowly miss deterministic wording
 * gates. The model can only select an existing bounded passage id. The claim
 * text and semantic fields are then derived locally from that exact passage,
 * so model output never becomes evidence and cannot author facts or citations.
 */
export async function extractClaimVersionsWithAid(
  submittedClaim: string,
  snapshots: EvidenceSnapshot[],
  options: VersionExtractionAidOptions = {},
): Promise<SourceClaimVersion[]> {
  const deterministic = extractClaimVersions(submittedClaim, snapshots, options);
  const provider = options.provider ?? llm;
  if (!provider.available) return deterministic;

  const claim = clean(submittedClaim);
  const resolvedSourceIds = new Set(
    deterministic.map((version) => version.sourceId),
  );
  const maximum = Math.max(
    1,
    Math.min(10, options.maxAssistedSources ?? 6),
  );
  const unresolved = snapshots
    .filter(
      (snapshot) =>
        !resolvedSourceIds.has(snapshot.id) &&
        (snapshot.acquisitionStatus === "acquired" ||
          (snapshot.acquisitionStatus === "partial" &&
            snapshot.extractionConfidence >= 0.55)),
    )
    .slice(0, maximum);

  const candidates = new Map<
    string,
    { snapshot: EvidenceSnapshot; passage: EvidencePassage; overlap: number }
  >();
  const untrusted: Record<string, string> = { submitted_claim: claim };

  unresolved.forEach((snapshot, index) => {
    const passages = snapshot.relevantPassages
      .filter((passage) => {
        if (
          passage.kind !== "claim" &&
          passage.kind !== "context" &&
          passage.kind !== "provenance"
        ) {
          return false;
        }
        const overlap = diceSimilarity(passage.text, claim);
        return overlap >= 0.16 && (passage.relevance >= 0.32 || overlap >= 0.22);
      })
      .sort(
        (left, right) =>
          passageScore(right, claim) - passageScore(left, claim) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, 3);

    if (passages.length === 0) return;
    for (const passage of passages) {
      candidates.set(`${snapshot.id}\u0000${passage.id}`, {
        snapshot,
        passage,
        overlap: diceSimilarity(passage.text, claim),
      });
    }
    untrusted[`source_${index}`] = JSON.stringify({
      sourceId: snapshot.id,
      title: snapshot.title,
      passages: passages.map((passage) => ({
        passageId: passage.id,
        kind: passage.kind,
        text: passage.text,
      })),
    });
  });

  if (candidates.size === 0) return deterministic;

  const aided = await completeStructured(
    provider,
    {
      system:
        "You identify whether bounded passages from acquired pages represent the same factual allegation as a submitted claim. You do not judge truth, infer provenance, write claims, or create evidence. You may only select supplied sourceId and passageId values.",
      task:
        'Return JSON exactly as {"selections":[{"sourceId":"...","passageId":"...","confidence":0.0}]}. Select at most one passage per source. Omit a source unless its passage represents the same core subject and event or allegation; topical similarity is insufficient.',
      untrusted,
    },
    VersionAidSchema,
  );
  if (!aided) return deterministic;

  const assisted: SourceClaimVersion[] = [];
  const usedSources = new Set<string>();
  for (const selection of aided.selections) {
    if (selection.confidence < 0.65 || usedSources.has(selection.sourceId)) {
      continue;
    }
    const candidate = candidates.get(
      `${selection.sourceId}\u0000${selection.passageId}`,
    );
    if (!candidate) continue;

    const { snapshot, passage, overlap } = candidate;
    const confidence = round(
      Math.min(
        0.85,
        0.5 * clamp(snapshot.extractionConfidence) +
          0.2 * Math.max(0.35, clamp(passage.relevance)) +
          0.15 * overlap +
          0.15 * selection.confidence,
      ),
    );
    if (confidence < 0.6) continue;

    assisted.push({
      ...buildVersion(claim, snapshot, passage),
      confidence,
      extractionMethod: "llm_assisted",
    });
    usedSources.add(selection.sourceId);
  }

  return [...deterministic, ...assisted];
}
