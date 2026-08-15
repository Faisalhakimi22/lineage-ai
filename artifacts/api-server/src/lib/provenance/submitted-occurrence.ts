import { createHash } from "node:crypto";
import { normalizeClaimProposition } from "./version-extraction";
import type {
  ImageEvidence,
  LineageEdgeEvidence,
  SubmittedOccurrence,
  SubmittedOccurrenceEvidenceType,
} from "./types";

export interface SubmittedOccurrenceInput {
  sourceUrl?: string | null;
  sourceName?: string | null;
  sourcePostId?: string | null;
  observedAt?: string | null;
  exactQuote?: string | null;
  context?: string | null;
}

export interface BuildSubmittedOccurrenceInput {
  claim: string;
  rawText: string;
  occurrence?: SubmittedOccurrenceInput | null;
  imageEvidence?: ImageEvidence | null;
}

function boundedText(value: string | null | undefined, limit: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
  return cleaned || null;
}

function httpUrl(value: string | null | undefined): string | null {
  const candidate = boundedText(value, 2_048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function timestamp(value: string | null | undefined): string | null {
  const candidate = boundedText(value, 100);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function stableId(parts: Array<string | null>): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 24);
  return `submitted-occurrence:${digest}`;
}

function occurrenceEvidence(
  id: string,
  exactText: string,
  context: string | null,
  sourceUrl: string | null,
  sourceIdentifier: string | null,
  observedAt: string | null,
): LineageEdgeEvidence {
  const metadata = [
    sourceUrl ? `URL: ${sourceUrl}` : null,
    sourceIdentifier ? `Source: ${sourceIdentifier}` : null,
    observedAt ? `Observed: ${observedAt}` : null,
    context ? `Context: ${context}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    sourceId: id,
    passageId: `${id}:occurrence`,
    exactText: [exactText, ...metadata].join("\n").slice(0, 8_000),
    role: "occurrence",
  };
}

function evidenceTypeFor(
  sourceUrl: string | null,
  sourceName: string | null,
  sourcePostId: string | null,
  observedAt: string | null,
  exactQuote: string | null,
  context: string | null,
): SubmittedOccurrenceEvidenceType | null {
  if (sourceUrl) return "supplied_url";
  if (sourcePostId && sourceName) return "source_post";
  if (exactQuote && (sourceName || sourcePostId || context)) {
    return "quoted_context";
  }
  if (observedAt && (sourceName || sourcePostId || context)) {
    return "source_metadata";
  }
  return null;
}

/**
 * Builds a request-specific occurrence. Pasted/normalized claim wording alone
 * deliberately returns null: it is the proposition being investigated, not
 * evidence of where or when that proposition occurred.
 */
export function buildSubmittedOccurrence(
  input: BuildSubmittedOccurrenceInput,
): SubmittedOccurrence | null {
  const claim = boundedText(input.claim, 5_000) ?? "";
  if (!claim) return null;

  if (input.imageEvidence) {
    const image = input.imageEvidence;
    const exactText = boundedText(image.extractedText, 5_000) ?? claim;
    const sourceContext = boundedText(image.originalFilename, 500);
    const id = stableId([image.id, image.sha256, exactText]);
    const evidence = occurrenceEvidence(
      id,
      exactText,
      sourceContext,
      null,
      image.id,
      null,
    );
    return {
      id,
      claim,
      exactText,
      normalizedProposition: normalizeClaimProposition(exactText),
      evidenceType: "screenshot",
      sourceUrl: null,
      sourceIdentifier: image.id,
      timestamp: null,
      sourceContext,
      evidenceIds: [...new Set([...image.evidenceIds, evidence.passageId])],
      evidence: [evidence],
      // This score reflects confidence that a file was supplied in this
      // request. It says nothing about the image's truth or earlier history.
      confidence: 1,
      sourceRelationship: null,
    };
  }

  const supplied = input.occurrence;
  if (!supplied) return null;
  const sourceUrl = httpUrl(supplied.sourceUrl);
  const sourceName = boundedText(supplied.sourceName, 300);
  const sourcePostId = boundedText(supplied.sourcePostId, 500);
  const observedAt = timestamp(supplied.observedAt);
  const exactQuote = boundedText(supplied.exactQuote, 5_000);
  const context = boundedText(supplied.context, 5_000);
  const evidenceType = evidenceTypeFor(
    sourceUrl,
    sourceName,
    sourcePostId,
    observedAt,
    exactQuote,
    context,
  );
  if (!evidenceType) return null;

  const exactText = exactQuote ?? boundedText(input.rawText, 5_000) ?? claim;
  const sourceIdentifier = sourcePostId ?? sourceName;
  const sourceContext = context ?? sourceName;
  const id = stableId([
    sourceUrl,
    sourceIdentifier,
    observedAt,
    exactText,
    sourceContext,
  ]);
  const evidence = occurrenceEvidence(
    id,
    exactText,
    sourceContext,
    sourceUrl,
    sourceIdentifier,
    observedAt,
  );

  return {
    id,
    claim,
    exactText,
    normalizedProposition: normalizeClaimProposition(exactText),
    evidenceType,
    sourceUrl,
    sourceIdentifier,
    timestamp: observedAt,
    sourceContext,
    evidenceIds: [evidence.passageId],
    evidence: [evidence],
    // Supplied metadata establishes that the caller identified an occurrence;
    // it is not independently verified and creates no source relationship.
    confidence: sourceUrl || (sourcePostId && sourceName) ? 0.8 : 0.65,
    sourceRelationship: null,
  };
}

