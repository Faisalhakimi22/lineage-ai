import { z } from "zod";
import { completeStructured, llm } from "./llm";

const URL_RE = /https?:\/\/\S+/g;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Deterministic fallback: strip URLs and emoji, split into sentences, and
 * return the longest declarative one. A rough proxy for "the core claim" in
 * messy forwarded text, but a predictable one.
 */
export function heuristicExtract(rawText: string): string {
  const cleaned = rawText
    .replace(URL_RE, " ")
    .replace(EMOJI_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[a-zA-Z]/.test(s));

  if (sentences.length === 0) return cleaned;

  return sentences.reduce((longest, s) => (s.length > longest.length ? s : longest));
}

const ExtractionSchema = z.object({
  claim: z.string().min(1).max(500),
});

export interface ExtractionResult {
  claim: string;
  /** True when the LLM normalised the claim rather than the heuristic. */
  normalised: boolean;
}

/**
 * Reduces messy input to a single neutral declarative claim so that
 * differently-worded versions of the same assertion converge before matching.
 */
export async function extractClaim(rawText: string): Promise<ExtractionResult> {
  const structured = await completeStructured(
    llm,
    {
      system:
        "You extract the single core factual claim from messy forwarded social " +
        "media text. You only respond with strict JSON.",
      task:
        "Restate the central factual claim as one short, neutral, declarative " +
        "sentence. Preserve the specific entities, places, numbers and causal " +
        "relationship asserted - do not generalise them away. Strip emotional " +
        "framing, urgency and commentary. Normalise wording so that paraphrases " +
        "of the same claim produce near-identical output.\n\n" +
        'Respond with only: {"claim": "<the claim>"}',
      untrusted: { forwarded_text: rawText },
    },
    ExtractionSchema,
  );

  if (structured) {
    return {
      claim: structured.claim.replace(/^["']|["']$/g, "").trim(),
      normalised: true,
    };
  }

  return { claim: heuristicExtract(rawText), normalised: false };
}
