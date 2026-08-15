/**
 * Privacy-conscious product analytics.
 *
 * Deliberately tiny: a named event plus a small set of non-identifying
 * properties. There is no vendor SDK, no user id, no device fingerprint and no
 * automatic page capture, because none of those are needed to answer the only
 * questions this project has - does anyone reach the workspace, and what
 * proportion of traces come back untraced.
 *
 * The allow-list below is the whole contract. Anything not named here is not
 * sent, which makes it impossible to leak a claim or a token by accident.
 */
export type AnalyticsEvent =
  | 'landing_viewed'
  | 'google_login'
  | 'analysis_started'
  | 'analysis_completed'
  | 'analysis_traced'
  | 'analysis_partially_traced'
  | 'analysis_untraced'
  | 'image_analysis_started'
  | 'history_opened'
  | 'claim_example_opened'
  | 'self_check_opened';

/**
 * Only these property keys may be attached, and only with primitive values.
 * Note the absence of anything carrying user content: claim text, OCR output,
 * file names and tokens have no representable form here.
 */
export interface AnalyticsProperties {
  trace_status?: 'TRACED' | 'PARTIALLY_TRACED' | 'UNTRACED';
  input_type?: 'text' | 'image';
  matching_strategy?: string;
  /** Bucketed, never the raw score, so results cannot be correlated back. */
  confidence_band?: 'low' | 'medium' | 'high';
  lineage_id?: string;
  duration_ms?: number;
}

export function confidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.62) return 'high';
  if (confidence >= 0.34) return 'medium';
  return 'low';
}

type Sink = (event: AnalyticsEvent, properties: AnalyticsProperties) => void;

const sinks: Sink[] = [];

/**
 * Register a destination. Nothing is registered by default, so a deployment
 * with no analytics provider simply drops events rather than buffering them.
 */
export function registerAnalyticsSink(sink: Sink): void {
  sinks.push(sink);
}

export function track(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): void {
  for (const sink of sinks) {
    try {
      sink(event, properties);
    } catch {
      // Analytics must never break the product.
    }
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, properties);
  }
}
