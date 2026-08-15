import type {
  DatasetProvenance,
  Lineage,
  MutationChainNode,
  MutationType,
  Region,
  Signal,
  SignalId,
  Source,
  SourceAvailability,
  SourceType,
  Topic,
  Verdict,
} from "@workspace/api-zod";

/**
 * Authoring format for a documented lineage.
 *
 * Only the fields that genuinely require human judgement are authored here.
 * Everything mechanically derivable (a hop's `previously`/`now`, the signal
 * explanations, the hop count) is computed by `buildLineage` so it stays
 * consistent across the whole library and cannot drift out of sync with the
 * mutation chain it is supposed to describe.
 */
export interface HopInput {
  type: MutationType;
  /** Short summary of the state of the information at this hop. */
  text: string;
  /** What specifically changed between the previous hop and this one. */
  what_changed: string;
  /** Why that change matters to a reader trying to judge the claim. */
  why_it_matters: string;
  sources?: SourceInput[];
}

/**
 * An explicitly authored relationship in the curated evidence graph.
 *
 * Mutation-chain array order is presentation order only.  It must never be
 * interpreted as chronology, transmission, or causality.  A connection is
 * drawn only when one of these records names both endpoints and describes the
 * evidence-supported relationship between them.
 */
export type CuratedRelationshipType =
  | "temporal_order"
  | "same_claim"
  | "same_event"
  | "related_claim"
  | "derived_from"
  | "reposted_from"
  | "quoted_from"
  | "corrected_by"
  | "same_media";

export interface CuratedRelationshipInput {
  /** `origin` names the curated origin account; numbered nodes use `hop-N`. */
  from_node_id: "origin" | `hop-${number}`;
  to_node_id: `hop-${number}`;
  relationship: CuratedRelationshipType;
  status: "established" | "candidate" | "insufficient_evidence";
  confidence: number;
  mutation_type?: MutationType | null;
  /** Explains exactly what the cited target-hop sources establish. */
  reason: string;
}

export interface SourceInput {
  publisher: string;
  /**
   * A real URL, or null. Never invent one: a lineage with no linkable source
   * is represented honestly rather than dressed up with a plausible-looking
   * link.
   */
  url?: string | null;
  published_date?: string | null;
  type: SourceType;
  /**
   * Defaults to `organisation_only` when a URL points at an organisation's
   * home page rather than a specific published item, and `unavailable` when
   * there is no URL at all.
   */
  availability?: SourceAvailability;
  primary?: boolean;
  /** What this source establishes - not a description of the source itself. */
  evidence: string;
}

export interface LineageInput {
  id: string;
  canonical_claim: string;
  aliases: string[];
  verdict: Verdict;
  topic: Topic;
  region: Region;
  dataset_provenance: DatasetProvenance;
  origin: {
    source: string;
    date: string | null;
    what_actually_happened: string;
    sources?: SourceInput[];
  };
  mutation_chain: HopInput[];
  /**
   * Optional, explicit graph connections.  There is intentionally no
   * sequential fallback: an absent relationship renders as an unconnected
   * evidence node rather than a plausible-looking lineage arrow.
   */
  curated_relationships?: CuratedRelationshipInput[];
  /** 0-100 magnitudes retained from the original curated assessment. */
  scores: Record<SignalId, number>;
  /** The transferable lesson a reader can carry to the next claim they see. */
  media_literacy_lesson: string;
  sources?: SourceInput[];
}

function buildSource(input: SourceInput): Source {
  const url = input.url ?? null;

  // A bare origin URL ("https://www.noaa.gov/") names the body that holds the
  // evidence but is not a citation of a specific published item. Saying so
  // explicitly stops the UI from implying an article exists that we never
  // actually linked.
  const inferredAvailability: SourceAvailability =
    url === null
      ? "unavailable"
      : isBareOrigin(url)
        ? "organisation_only"
        : "linked";

  return {
    publisher: input.publisher,
    url,
    published_date: input.published_date ?? null,
    source_type: input.type,
    availability: input.availability ?? inferredAvailability,
    is_primary: input.primary ?? false,
    evidence_description: input.evidence,
  };
}

function isBareOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return false;
  }
}

const SIGNAL_LABELS: Record<SignalId, string> = {
  evidence_quality: "Evidence quality",
  emotional_framing: "Emotional framing",
  missing_context: "Missing context",
  ai_generated_likelihood: "Synthetic media likelihood",
  manipulation_risk: "Manipulation risk",
};

/**
 * Signals are deliberately *derived from the recorded mutation chain* rather
 * than authored free-hand. That keeps every explanation anchored to something
 * documented in the record - a signal can only cite a mutation that is actually
 * present - instead of inviting invented justification.
 */
const MUTATION_EVIDENCE: Record<
  MutationType,
  Partial<Record<SignalId, string>>
> = {
  original_event: {},
  stripped_context: {
    missing_context: "context that was present at the source was dropped",
    evidence_quality: "the supporting detail was removed rather than refuted",
  },
  exaggeration: {
    emotional_framing: "the scale of the claim was inflated as it spread",
    manipulation_risk: "the inflated version travels better than the accurate one",
  },
  fabricated_cause: {
    evidence_quality: "a cause was asserted that the source never established",
    manipulation_risk: "an invented cause redirects blame",
  },
  recycled_old_media: {
    missing_context: "media from another time or place was reused",
    ai_generated_likelihood: "the imagery does not originate with this event",
  },
  misattribution: {
    evidence_quality: "the claim was credited to a person or body that did not say it",
  },
  edited_media: {
    ai_generated_likelihood: "the media itself was altered",
    manipulation_risk: "altered media is persuasive precisely because it looks direct",
  },
  selective_evidence: {
    missing_context: "supporting data was selected and the rest omitted",
    evidence_quality: "the evidence shown is unrepresentative",
  },
  false_caption: {
    missing_context: "the caption describes something the media does not show",
  },
  translation_distortion: {
    missing_context: "meaning shifted when the claim crossed languages",
  },
  out_of_date_information: {
    missing_context: "the information was accurate once but has since been superseded",
  },
  false_quotation: {
    evidence_quality: "words were attributed to someone who did not say them",
  },
  context_shift: {
    missing_context: "the claim was moved into a setting it was never about",
  },
};

const SIGNAL_CHECKS: Record<SignalId, string> = {
  evidence_quality:
    "Find the earliest source that states this directly, and see whether it actually supports the version you received.",
  emotional_framing:
    "Reread the message and separate what it reports from how it wants you to feel about it.",
  missing_context:
    "Ask what the original source said that this version leaves out - dates, location, scale, or caveats.",
  ai_generated_likelihood:
    "Reverse image search any photo or video to find where and when it first appeared.",
  manipulation_risk:
    "Notice what the message wants you to do next - share, panic, or blame - and who benefits from that.",
};

function levelFor(score: number): Signal["level"] {
  if (score >= 66) return "high";
  if (score >= 33) return "medium";
  return "low";
}

/**
 * `evidence_quality` runs the opposite direction to the other signals: a high
 * number is reassuring, not alarming. Inverting it here means "high" always
 * reads as "worth your attention" everywhere in the UI.
 */
function levelForSignal(id: SignalId, score: number): Signal["level"] {
  return id === "evidence_quality" ? levelFor(100 - score) : levelFor(score);
}

function buildSignals(input: LineageInput): Signal[] {
  const types = new Set(input.mutation_chain.map((hop) => hop.type));

  return (Object.keys(SIGNAL_LABELS) as SignalId[]).map((id) => {
    const score = input.scores[id];

    const reasons = [...types]
      .map((type) => MUTATION_EVIDENCE[type]?.[id])
      .filter((reason): reason is string => Boolean(reason));

    const explanation =
      reasons.length > 0
        ? `In this lineage, ${joinClauses(reasons)}.`
        : "No mutation in the recorded chain bears directly on this signal.";

    return {
      id,
      label: SIGNAL_LABELS[id],
      level: levelForSignal(id, score),
      score,
      explanation,
      what_to_check: SIGNAL_CHECKS[id],
    };
  });
}

function joinClauses(clauses: string[]): string {
  const unique = [...new Set(clauses)];
  if (unique.length === 1) return unique[0]!;
  return `${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
}

function buildChain(input: LineageInput): MutationChainNode[] {
  const relationshipByTarget = new Map(
    (input.curated_relationships ?? []).map((relationship) => [
      relationship.to_node_id,
      relationship,
    ]),
  );

  return input.mutation_chain.map((hop, index) => ({
    hop: index + 1,
    type: hop.type,
    text: hop.text,
    what_changed: hop.what_changed,
    // `previously` follows the explicitly authored relationship, never the
    // mutation-chain array order.  Related evidence without a relationship has
    // no asserted predecessor.
    previously: (() => {
      const relationship = relationshipByTarget.get(`hop-${index + 1}`);
      if (!relationship) return null;
      if (relationship.from_node_id === "origin") {
        return input.origin.what_actually_happened;
      }
      const sourceHop = Number(relationship.from_node_id.slice("hop-".length));
      return input.mutation_chain[sourceHop - 1]?.text ?? null;
    })(),
    now: hop.text,
    why_it_matters: hop.why_it_matters,
    sources: (hop.sources ?? []).map(buildSource),
  }));
}

function buildCuratedRelationships(input: LineageInput) {
  return (input.curated_relationships ?? []).map((relationship, index) => {
    const targetHopNumber = Number(
      relationship.to_node_id.slice("hop-".length),
    );
    const targetHop = input.mutation_chain[targetHopNumber - 1];

    if (!targetHop) {
      throw new Error(
        `Curated relationship ${input.id}:${index + 1} references missing ${relationship.to_node_id}`,
      );
    }

    if (relationship.from_node_id !== "origin") {
      const sourceHopNumber = Number(
        relationship.from_node_id.slice("hop-".length),
      );
      if (!input.mutation_chain[sourceHopNumber - 1]) {
        throw new Error(
          `Curated relationship ${input.id}:${index + 1} references missing ${relationship.from_node_id}`,
        );
      }
    }

    if (relationship.from_node_id === relationship.to_node_id) {
      throw new Error(
        `Curated relationship ${input.id}:${index + 1} cannot connect a node to itself`,
      );
    }

    return {
      id: `curated:${input.id}:relationship:${index + 1}`,
      ...relationship,
      mutation_type: relationship.mutation_type ?? null,
      // The source evidence belongs to the assertion at the target node.  It
      // is copied onto the relationship so the UI can show why the connection
      // exists without guessing from array adjacency.
      sources: (targetHop.sources ?? []).map(buildSource),
    };
  });
}

export function buildLineage(input: LineageInput): Lineage {
  return {
    id: input.id,
    canonical_claim: input.canonical_claim,
    aliases: input.aliases,
    verdict: input.verdict,
    topic: input.topic,
    region: input.region,
    dataset_provenance: input.dataset_provenance,
    origin: {
      source: input.origin.source,
      date: input.origin.date,
      what_actually_happened: input.origin.what_actually_happened,
      sources: (input.origin.sources ?? []).map(buildSource),
    },
    mutation_chain: buildChain(input),
    curated_relationships: buildCuratedRelationships(input),
    signals: buildSignals(input),
    sources: (input.sources ?? []).map(buildSource),
    media_literacy_lesson: input.media_literacy_lesson,
  };
}
