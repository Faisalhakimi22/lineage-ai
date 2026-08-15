import type { Lineage, MutationType, SelfCheckStep, Verdict } from "@workspace/api-zod";

const VERDICT_OPENERS: Record<Verdict, string> = {
  false:
    "This started as a real event and got changed into something that isn't accurate as it was shared.",
  misleading:
    "This started as something real, but the framing changed along the way and left an inaccurate impression.",
  missing_context:
    "This started as something real, but important context got dropped as it was shared.",
  true: "This traces back to something that checks out — the origin below shows what actually happened.",
};

/**
 * The correction is template-generated, never model-generated.
 *
 * Tone is the product's central promise: a correction must never imply the
 * person who forwarded the message was lying or gullible. A model that drifts
 * accusatory even rarely would break that promise, and the failure would land
 * on a real person mid-conversation. So the social framing is fixed here, in
 * code, and the model is confined to semantic work where its worst case is a
 * wrong match rather than an insult.
 */
export function buildMessengerSafeExplanation(lineage: Lineage): string {
  const opener = VERDICT_OPENERS[lineage.verdict];

  return (
    `${opener} Whoever sent it to you probably didn't know it had been altered — this isn't about ` +
    `anyone lying, it's about how information mutates as it spreads. Here's what actually happened: ` +
    `${lineage.origin.what_actually_happened}`
  );
}

/**
 * Self-check steps keyed to the kind of distortion actually present in the
 * chain. A claim distorted by recycled media needs a different check than one
 * distorted by a fabricated cause, and telling someone to reverse image search
 * a claim that has no image is noise that teaches nothing.
 */
const STEPS_BY_MUTATION: Partial<Record<MutationType, SelfCheckStep>> = {
  recycled_old_media: {
    id: "check-media-age",
    text: "Reverse image search the photo or video to find where and when it first appeared.",
    rationale:
      "This claim spread by attaching real media from another time. If the image predates the event, it cannot be evidence of it.",
  },
  edited_media: {
    id: "check-media-edit",
    text: "Look for the uncropped original, and compare what falls outside the frame you were shown.",
    rationale:
      "Cropping changed what this image appears to show without altering a single pixel inside the frame.",
  },
  fabricated_cause: {
    id: "check-cause",
    text: "Look for evidence connecting the event to the claimed cause, rather than accepting that two things happening together means one caused the other.",
    rationale:
      "The cause in this claim was asserted by people retelling it, not established by anyone investigating it.",
  },
  stripped_context: {
    id: "check-missing-context",
    text: "Find the original statement and compare it to the version you received — look for what was left out.",
    rationale:
      "The distortion here was subtraction. The original source said more than the version that reached you.",
  },
  exaggeration: {
    id: "check-scale",
    text: "Check the specific numbers, dates or scale against the primary source.",
    rationale:
      "This claim grew as it travelled. The figures in the version you saw are larger than the ones anyone recorded.",
  },
  selective_evidence: {
    id: "check-full-data",
    text: "Look at the full dataset or time range, not only the portion quoted.",
    rationale:
      "The evidence shown here was chosen because it supported the conclusion. The rest of the data tells a different story.",
  },
  misattribution: {
    id: "check-attribution",
    text: "Check whether the person or organisation named actually said or published this.",
    rationale:
      "This claim borrows authority from a name that was attached to it later.",
  },
  false_quotation: {
    id: "check-quote",
    text: "Search for the exact quote and find the original transcript or recording.",
    rationale:
      "Quotes are checkable. If nobody can produce the source, the words were assigned rather than spoken.",
  },
  false_caption: {
    id: "check-caption",
    text: "Ask what the image itself actually shows, separately from what the caption says it shows.",
    rationale:
      "The media here is genuine. The caption is doing the work the image cannot.",
  },
  translation_distortion: {
    id: "check-translation",
    text: "Find the claim in its original language and compare the meaning.",
    rationale: "This claim shifted meaning when it crossed languages.",
  },
  out_of_date_information: {
    id: "check-currency",
    text: "Check whether this was superseded by more recent information.",
    rationale:
      "This was accurate once. It kept circulating after it stopped being current.",
  },
  context_shift: {
    id: "check-setting",
    text: "Check what situation this originally described, and whether it transfers to the one it is being applied to.",
    rationale: "This claim was moved into a setting it was never about.",
  },
  original_event: {
    id: "check-origin",
    text: "Find the earliest source you can and read what it actually said.",
    rationale:
      "Everything downstream is a retelling. The original is the only version nobody has edited yet.",
  },
};

/** Used when there is no documented lineage to key the advice to. */
const GENERIC_STEPS: SelfCheckStep[] = [
  {
    id: "generic-pause",
    text: "Pause before resharing — a strong emotional reaction is often the point, not a sign of accuracy.",
    rationale:
      "Content engineered to spread is engineered to bypass the moment where you would have checked it.",
  },
  {
    id: "generic-earliest",
    text: "Trace it back to the earliest post or source you can find, rather than the version you received.",
    rationale:
      "Each retelling can add or drop detail. The earliest version is closest to whatever actually happened.",
  },
  {
    id: "generic-reverse-image",
    text: "Reverse image search any photo or screenshot to see where and when it first appeared.",
    rationale:
      "Recycled media is one of the most common distortions, and one of the easiest to detect.",
  },
  {
    id: "generic-primary",
    text: "Check a primary source directly — the agency, outlet, or organisation actually involved.",
    rationale:
      "Primary sources are usually easier to reach than people expect, and they settle most claims quickly.",
  },
];

export function buildSelfCheckSteps(lineage: Lineage | null): SelfCheckStep[] {
  if (!lineage) return GENERIC_STEPS;

  // Order steps by the chain itself so the advice follows the distortion the
  // claim actually underwent, most recent hop first - that is the change
  // closest to the version the reader was sent.
  const seen = new Set<string>();
  const steps: SelfCheckStep[] = [];

  for (const hop of [...lineage.mutation_chain].reverse()) {
    const step = STEPS_BY_MUTATION[hop.type];
    if (step && !seen.has(step.id)) {
      seen.add(step.id);
      steps.push(step);
    }
  }

  // Always leave the reader with a general habit alongside the specific ones.
  const fallback = GENERIC_STEPS.find((s) => !seen.has(s.id));
  if (fallback && steps.length < 4) steps.push(fallback);

  return steps.length > 0 ? steps : GENERIC_STEPS;
}

export { GENERIC_STEPS };
