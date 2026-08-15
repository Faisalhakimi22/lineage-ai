import { logger } from "./logger";

export interface RankTarget {
  id: string;
  texts: string[];
}

export interface RankedTarget {
  id: string;
  score: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  /** True only when semantic matching is enabled and its package can load. */
  isAvailable(): Promise<boolean>;
  /** Returns null if the provider cannot answer, so callers fall back. */
  rank(query: string, targets: RankTarget[]): Promise<RankedTarget[] | null>;
}

interface TransformersModule {
  pipeline: (task: string, model: string) => Promise<unknown>;
}

/**
 * Semantic matching is opt-in.
 *
 * The embedding model is a real sentence-transformer, not a lexical trick
 * wearing a semantic label - which is precisely why it is not on by default:
 * it pulls a model down on first use, and a demo machine without network
 * access would otherwise stall at exactly the wrong moment. When it is off,
 * matching runs on the deterministic lexical layer and reports that honestly
 * via `matching_strategy`.
 *
 * Enable with SEMANTIC_MATCHING=on (requires the optional
 * `@xenova/transformers` dependency to be installed).
 */
class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly name = "xenova-all-MiniLM-L6-v2";
  private pipeline: unknown = null;
  private modulePromise: Promise<TransformersModule | null> | null = null;
  private loadFailed = false;

  private get enabled(): boolean {
    return process.env["SEMANTIC_MATCHING"] === "on";
  }

  private async module(): Promise<TransformersModule | null> {
    if (!this.enabled || this.loadFailed) return null;

    this.modulePromise ??= (async () => {
      try {
        // Imported dynamically so the model package remains genuinely optional.
        const moduleName = "@xenova/transformers";
        return (await import(/* @vite-ignore */ moduleName)) as TransformersModule;
      } catch (err) {
        this.loadFailed = true;
        logger.warn(
          { err: err instanceof Error ? err.message : "unknown" },
          "Semantic matching package unavailable; falling back to lexical matching",
        );
        return null;
      }
    })();

    return this.modulePromise;
  }

  /**
   * Health checks this without downloading the model. It therefore reports
   * false when the documented optional package is absent, while avoiding a
   * network/model download merely because someone polled /healthz.
   */
  async isAvailable(): Promise<boolean> {
    return (await this.module()) !== null;
  }

  private async load(): Promise<((text: string, opts: unknown) => Promise<{ data: Float32Array }>) | null> {
    if (!this.enabled || this.loadFailed) return null;
    if (this.pipeline) {
      return this.pipeline as (text: string, opts: unknown) => Promise<{ data: Float32Array }>;
    }

    try {
      const mod = await this.module();
      if (!mod) return null;
      this.pipeline = await mod.pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      );
      logger.info({ provider: this.name }, "Semantic matching enabled");
      return this.pipeline as (text: string, opts: unknown) => Promise<{ data: Float32Array }>;
    } catch (err) {
      this.loadFailed = true;
      logger.warn(
        { err: err instanceof Error ? err.message : "unknown" },
        "Embedding model unavailable; falling back to lexical matching",
      );
      return null;
    }
  }

  async rank(query: string, targets: RankTarget[]): Promise<RankedTarget[] | null> {
    const extractor = await this.load();
    if (!extractor) return null;

    try {
      const embed = async (text: string): Promise<Float32Array> => {
        const out = await extractor(text, { pooling: "mean", normalize: true });
        return out.data;
      };

      const queryVec = await embed(query);

      return await Promise.all(
        targets.map(async (target) => {
          const scores = await Promise.all(
            target.texts.map(async (text) => cosine(queryVec, await embed(text))),
          );
          return { id: target.id, score: Math.max(...scores) };
        }),
      );
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : "unknown" },
        "Embedding ranking failed; falling back to lexical matching",
      );
      return null;
    }
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export const embeddings: EmbeddingProvider = new TransformersEmbeddingProvider();

export function semanticMatchingAvailable(): Promise<boolean> {
  return embeddings.isAvailable();
}
