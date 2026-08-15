import type { Lineage, LineageSummary } from "@workspace/api-zod";
import { lineages, lineagesById } from "../data/lineages";

/**
 * The application talks to lineage data only through this interface.
 *
 * Today there is exactly one implementation, backed by the seventeen curated
 * records held in memory. The point of the seam is that a future retrieval or
 * verified-source backend can be introduced by adding an implementation rather
 * than by rewriting the analysis pipeline. Nothing above this interface knows
 * or cares where a lineage came from.
 */
export interface LineageRepository {
  readonly kind: string;
  list(): Promise<Lineage[]>;
  listSummaries(): Promise<LineageSummary[]>;
  getById(id: string): Promise<Lineage | null>;
  /** Every lineage that matching should consider. */
  candidates(): Promise<Lineage[]>;
}

export function toSummary(lineage: Lineage): LineageSummary {
  return {
    id: lineage.id,
    canonical_claim: lineage.canonical_claim,
    verdict: lineage.verdict,
    topic: lineage.topic,
    region: lineage.region,
    dataset_provenance: lineage.dataset_provenance,
    origin_source: lineage.origin.source,
    origin_date: lineage.origin.date,
    hop_count: lineage.mutation_chain.length,
    media_literacy_lesson: lineage.media_literacy_lesson,
  };
}

/** The curated, hand-documented lineage library shipped with the app. */
export class SeedLineageRepository implements LineageRepository {
  readonly kind = "seed";

  async list(): Promise<Lineage[]> {
    return lineages;
  }

  async listSummaries(): Promise<LineageSummary[]> {
    return lineages.map(toSummary);
  }

  async getById(id: string): Promise<Lineage | null> {
    return lineagesById.get(id) ?? null;
  }

  async candidates(): Promise<Lineage[]> {
    return lineages;
  }
}

export const lineageRepository: LineageRepository = new SeedLineageRepository();
