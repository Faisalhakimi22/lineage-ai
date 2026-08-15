import { useEffect } from "react";
import type {
  AnalyzeResult,
  InvestigationStage,
  InvestigationStageId,
  InvestigationStageStatus,
  MutationChainNode,
  Signal,
  TraceStatus,
} from "@workspace/api-client-react";
import {
  ArrowDown,
  Check,
  CircleMinus,
  ExternalLink,
  ShieldQuestion,
} from "lucide-react";
import { strings } from "@/lib/strings";
import { track } from "@/lib/analytics";
import { MutationMap, RuntimeLineageMap, mutationLabel } from "./MutationMap";

/**
 * Status presentation.
 *
 * Every state is carried by an explicit word first and colour only second, so
 * the distinction between traced and untraced survives greyscale, colour
 * blindness, and a screen reader. UNTRACED deliberately has no alarming
 * styling: it is an absence of evidence, not a finding against the claim.
 */
const STATUS_STYLES: Record<TraceStatus, string> = {
  TRACED: "border-primary text-primary",
  PARTIALLY_TRACED: "border-amber-500 text-amber-600 dark:text-amber-500",
  UNTRACED: "border-muted-foreground text-muted-foreground",
};

/** The written detail for one documented mutation hop. */
function Hop({ node }: { node: MutationChainNode }) {
  return (
    <li
      id={`hop-${node.hop}`}
      className="relative pl-8 pb-8 border-l border-border last:border-transparent last:pb-0"
    >
      <span
        aria-hidden="true"
        className="absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-background"
      />
      <p className="font-mono text-[11px] uppercase tracking-wider inline-block px-2 py-0.5 border border-border rounded mb-2">
        Hop {node.hop} · {mutationLabel(node.type)}
      </p>

      {/* All lineage text is rendered as text nodes by React, never as HTML,
          so nothing in a record or in user input can inject markup. */}
      <p className="font-medium text-foreground">{node.text}</p>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            What changed
          </dt>
          <dd className="text-foreground/80">{node.what_changed}</dd>
        </div>
        {node.previously !== null && (
          <div className="grid sm:grid-cols-2 gap-2 pt-1">
            <div className="bg-muted/40 p-3 rounded">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Previously
              </dt>
              <dd className="text-foreground/70 mt-1">{node.previously}</dd>
            </div>
            <div className="bg-muted/40 p-3 rounded">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Now
              </dt>
              <dd className="text-foreground/70 mt-1">{node.now}</dd>
            </div>
          </div>
        )}
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Why it matters
          </dt>
          <dd className="text-foreground/80">{node.why_it_matters}</dd>
        </div>
      </dl>
    </li>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const width = signal.score ?? 0;

  return (
    <li className="py-3 border-b border-border last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs uppercase tracking-wider">
          {signal.label}
        </span>
        <span className="font-mono text-xs font-semibold">{signal.level}</span>
      </div>
      <div
        className="h-1.5 bg-muted mt-2 rounded-full overflow-hidden"
        role="img"
        aria-label={`${signal.label}: ${signal.level}`}
      >
        <div
          className="h-full bg-foreground/60 rounded-full"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-sm text-foreground/75 mt-2">{signal.explanation}</p>
      <p className="text-sm text-muted-foreground mt-1">
        <span className="font-medium text-foreground/70">Check: </span>
        {signal.what_to_check}
      </p>
    </li>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="space-y-1.5 text-sm text-foreground/80 list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const STAGE_LABELS: Record<InvestigationStageId, string> = {
  claim_extracted: "Claim extraction",
  live_search: "Live web search",
  source_discovery: "Source discovery",
  earliest_source: "Earlier source",
  context_comparison: "Claim / context comparison",
  mutation_detection: "Mutation detection",
  origin_assessment: "Origin assessment",
  lineage: "Complete lineage",
};

const ESTABLISHED_STAGE_LABELS: Record<InvestigationStageId, string> = {
  claim_extracted: "Claim extracted",
  live_search: "Live web search completed",
  source_discovery: "Source leads discovered",
  earliest_source: "Earlier source identified",
  context_comparison: "Claim and context compared",
  mutation_detection: "Mutation detected",
  origin_assessment: "Origin assessment established",
  lineage: "Complete lineage established",
};

function stageHeading(stage: InvestigationStage): string {
  const label = STAGE_LABELS[stage.id];
  switch (stage.status) {
    case "established":
      return ESTABLISHED_STAGE_LABELS[stage.id];
    case "candidate":
      return `${label} candidate`;
    case "in_progress":
      return `${label} in progress`;
    case "not_attempted":
      return `${label} not attempted`;
    case "blocked":
      return `${label} blocked`;
    case "error":
      return `${label} could not be completed`;
    case "insufficient_evidence":
      return `${label} not established`;
  }
}

function stageStatusClass(status: InvestigationStageStatus): string {
  if (status === "established") {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (status === "candidate" || status === "in_progress") {
    return "text-amber-600 dark:text-amber-400";
  }
  if (status === "error") return "text-destructive";
  return "text-muted-foreground";
}

function InvestigationStatus({
  stages,
  scope,
}: {
  stages: InvestigationStage[];
  scope: "live" | "known";
}) {
  const establishedCount = stages.filter(
    (stage) => stage.status === "established",
  ).length;
  const headingId = `${scope}-investigation-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="border border-border bg-card rounded-sm overflow-hidden"
    >
      <div className="p-5 border-b border-border flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2
            id={headingId}
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2"
          >
            {scope === "live"
              ? "Live investigation status"
              : "Known-case evidence status"}
          </h2>
          {stages.length > 0 ? (
            <p className="font-serif text-3xl font-bold tracking-tight">
              {establishedCount} / {stages.length}
            </p>
          ) : (
            <p className="font-medium">Stage data unavailable</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">stages established</p>
      </div>

      {stages.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">
          This legacy result does not include structured investigation stages.
        </p>
      )}
      <ol className="grid sm:grid-cols-2">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className="flex gap-3 p-4 border-b border-border sm:odd:border-r last:border-b-0"
          >
            {stage.status === "established" ? (
              <Check
                className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <CircleMinus
                className={`w-4 h-4 mt-0.5 shrink-0 ${stageStatusClass(stage.status)}`}
                aria-hidden="true"
              />
            )}
            <div>
              <p
                className={`font-medium text-sm ${stageStatusClass(stage.status)}`}
              >
                {stageHeading(stage)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {stage.reason}
              </p>
              {(stage.confidence !== null || stage.evidenceIds.length > 0) && (
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
                  {[
                    stage.confidence !== null
                      ? `${Math.round(stage.confidence * 100)}% stage confidence`
                      : null,
                    stage.evidenceIds.length > 0
                      ? `${stage.evidenceIds.length} evidence item${stage.evidenceIds.length === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InvestigationScores({ result }: { result: AnalyzeResult }) {
  const scores = [
    {
      label: "Source relevance",
      value: result.sourceRelevance,
      detail: "How closely acquired source material relates to the claim",
    },
    {
      label: "Provenance confidence",
      value: result.provenanceConfidence,
      detail: "Strength of evidence connecting sources over time",
    },
    {
      label: "Mutation confidence",
      value: result.mutationConfidence,
      detail: "Strength of evidence for detected changes between versions",
    },
    {
      label: "Origin confidence",
      value: result.originConfidence,
      detail: "Strength of evidence for the assessed origin",
    },
    {
      label: "Lineage completeness",
      value: result.dynamicLineage.submittedOccurrenceConnected
        ? result.lineageCompleteness
        : 0,
      detail: result.dynamicLineage.submittedOccurrenceConnected
        ? "Share of the directed path backed by established transitions"
        : "0% because the submitted occurrence is not connected",
    },
  ];

  return (
    <section aria-labelledby="score-heading">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2
          id="score-heading"
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          Live evidence measures
        </h2>
        <p className="text-xs text-muted-foreground">
          Separate questions — none is a truth score
        </p>
      </div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px border border-border bg-border">
        {scores.map((score) => (
          <div key={score.label} className="bg-card p-4">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {score.label}
            </dt>
            <dd className="font-serif text-2xl font-bold mt-1">
              {score.value === null || score.value === undefined
                ? "Not established"
                : `${Math.round(score.value * 100)}%`}
            </dd>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {score.detail}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function KnownRecordScores({ result }: { result: AnalyzeResult }) {
  if (!result.knownRecordMatch.matched) return null;
  const known = result.knownRecordScores;
  const scores = [
    {
      label: "Known-record wording similarity",
      value: result.knownRecordMatch.similarity,
      detail: `${result.matching_strategy.replace(/_/g, " ")} library comparison`,
    },
    {
      label: "Curated provenance confidence",
      value: known.provenanceConfidence,
      detail: "Evidence strength within the curated record only",
    },
    {
      label: "Curated mutation confidence",
      value: known.mutationConfidence,
      detail: "Cited mutation evidence in the known case",
    },
    {
      label: "Curated origin confidence",
      value: known.originConfidence,
      detail: "Cited origin evidence in the known case",
    },
    {
      label: "Curated lineage completeness",
      value: known.lineageCompleteness,
      detail: "Established explicit curated transitions; related strands do not count",
    },
  ];

  return (
    <section aria-labelledby="known-score-heading">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 id="known-score-heading" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Known-case evidence measures
        </h2>
        <p className="text-xs text-muted-foreground">Separate from the live investigation</p>
      </div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px border border-border bg-border">
        {scores.map((score) => (
          <div key={score.label} className="bg-card p-4">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{score.label}</dt>
            <dd className="font-serif text-2xl font-bold mt-1">
              {score.value === null || score.value === undefined
                ? "Not established"
                : `${Math.round(score.value * 100)}%`}
            </dd>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{score.detail}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function KnownRecordPanel({ result }: { result: AnalyzeResult }) {
  const match = result.knownRecordMatch;
  if (!match?.matched) return null;

  const candidate = result.candidates.find(
    (item) => item.lineage_id === match.lineageId,
  );
  const canonicalClaim =
    (result.lineage?.id === match.lineageId
      ? result.lineage.canonical_claim
      : null) ??
    candidate?.canonical_claim ??
    match.lineageId ??
    "Matched library record";
  const provenance =
    match.datasetProvenance === "externally_verified"
      ? "Externally verified record"
      : match.datasetProvenance === "illustrative"
        ? "Illustrative teaching record"
        : "Record provenance not established";

  return (
    <section
      aria-labelledby="known-record-heading"
      className="border border-border bg-muted/20 p-5 rounded-sm"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2
            id="known-record-heading"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            Known-record match
          </h2>
          <p className="font-serif text-lg mt-2">
            &ldquo;{canonicalClaim}&rdquo;
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider border border-border rounded px-2 py-1">
          {provenance}
        </span>
      </div>
      <div className="flex gap-x-6 gap-y-2 flex-wrap mt-4 text-sm">
        <p>
          <span className="text-muted-foreground">Wording similarity: </span>
          <span className="font-medium">
            {Math.round(match.similarity * 100)}%
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Verified fast path: </span>
          <span className="font-medium">
            {match.eligibleAsVerifiedFastPath ? "Eligible" : "Not eligible"}
          </span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        This library comparison is separate from the live web-evidence
        investigation.
      </p>
    </section>
  );
}

function AcquiredEvidence({ result }: { result: AnalyzeResult }) {
  if (result.evidenceSnapshots.length === 0) return null;

  const versionsBySource = new Map(
    result.sourceVersions.map((version) => [version.sourceId, version]),
  );

  return (
    <section aria-labelledby="acquired-evidence-heading">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <div>
          <h2
            id="acquired-evidence-heading"
            className="font-serif text-2xl font-bold"
          >
            Acquired source evidence
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bounded page snapshots used by the provenance engine. Search
            snippets alone never become claim versions.
          </p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {result.evidenceSnapshots.length} snapshot
          {result.evidenceSnapshots.length === 1 ? "" : "s"} ·{" "}
          {result.sourceVersions.length} extracted version
          {result.sourceVersions.length === 1 ? "" : "s"}
        </p>
      </div>

      <ol className="grid gap-3">
        {result.evidenceSnapshots.map((snapshot) => {
          const version = versionsBySource.get(snapshot.id);
          const sourceUrl =
            snapshot.canonicalUrl || snapshot.finalUrl || snapshot.originalUrl;
          const acquired =
            snapshot.acquisitionStatus === "acquired" ||
            snapshot.acquisitionStatus === "partial";

          return (
            <li
              key={snapshot.id}
              className="border border-border bg-card rounded-sm p-4"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {snapshot.sourceType.replace(/_/g, " ")} ·{" "}
                    {snapshot.domain}
                  </p>
                  <h3 className="font-medium mt-1 break-words">
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary underline underline-offset-2 decoration-border"
                      >
                        {snapshot.title}
                        <ExternalLink
                          className="inline w-3.5 h-3.5 ml-1"
                          aria-hidden="true"
                        />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      snapshot.title
                    )}
                  </h3>
                </div>
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 border rounded-sm ${
                    acquired
                      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                      : "text-muted-foreground border-border"
                  }`}
                >
                  {snapshot.acquisitionStatus.replace(/_/g, " ")}
                </span>
              </div>

              <dl className="grid sm:grid-cols-3 gap-3 mt-3 text-xs text-foreground/80">
                <div>
                  <dt className="text-muted-foreground">Publisher / author</dt>
                  <dd>
                    {[snapshot.publisher, snapshot.author]
                      .filter(Boolean)
                      .join(" · ") || "Not established"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Publication date</dt>
                  <dd>
                    {snapshot.publishedAt || "Not established"}
                    {snapshot.publishedAt && (
                      <span className="text-muted-foreground">
                        {` · ${snapshot.dateType.replace(/_/g, " ")} · ${Math.round(snapshot.dateConfidence * 100)}% date confidence`}
                      </span>
                    )}
                    {snapshot.dateEvidence && (
                      <span className="block text-muted-foreground mt-1 break-words">
                        Evidence: {snapshot.dateEvidence}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Extraction</dt>
                  <dd>
                    {Math.round(snapshot.extractionConfidence * 100)}%
                    {snapshot.providerScore !== null && (
                      <span className="text-muted-foreground">
                        {` · ${Math.round(snapshot.providerScore * 100)}% provider relevance`}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {version && (
                <div className="mt-3 bg-muted/30 p-3 rounded-sm">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Claim version represented by this source
                  </p>
                  <p className="text-sm mt-1">{version.claim}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {[
                      `certainty: ${version.certainty}`,
                      version.causalLanguage,
                      `${version.extractionMethod.replace(/_/g, " ")} · ${Math.round(version.confidence * 100)}% extraction confidence`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              )}

              {snapshot.acquisitionError && (
                <p className="text-xs text-muted-foreground mt-3">
                  Acquisition note: {snapshot.acquisitionError}
                </p>
              )}

              {snapshot.relevantPassages.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-primary">
                    Inspect bounded evidence passages
                  </summary>
                  <ul className="space-y-2 mt-2">
                    {snapshot.relevantPassages.slice(0, 3).map((passage) => (
                      <li
                        key={passage.id}
                        className="text-xs text-foreground/75 border-l-2 border-border pl-3"
                      >
                        <span className="font-mono text-[10px] uppercase text-muted-foreground">
                          {passage.kind} · {Math.round(passage.relevance * 100)}%
                          relevance
                        </span>
                        <p className="mt-1">
                          {passage.text.length > 500
                            ? `${passage.text.slice(0, 500)}…`
                            : passage.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function TraceResult({ result }: { result: AnalyzeResult }) {
  const isPartial = result.trace_status === "PARTIALLY_TRACED";
  const liveStages = Array.isArray(result.investigationStages)
    ? result.investigationStages
    : [];
  const knownStages = Array.isArray(result.knownRecordStages)
    ? result.knownRecordStages
    : [];
  const establishedCount = liveStages.filter(
    (stage) => stage.status === "established",
  ).length;
  const lineageStage = liveStages.find((stage) => stage.id === "lineage");
  const completeLiveLineage = lineageStage?.status === "established";
  const lineageCandidate = lineageStage?.status === "candidate";
  const hasDynamicLineage = Boolean(
    result.dynamicLineage?.nodes.length && result.dynamicLineage?.edges.length,
  );
  const sourceCount = result.live_search.sources.length;
  const knowledgeHeadline = completeLiveLineage
    ? strings.trace.lineageEstablished
    : lineageCandidate
      ? strings.trace.lineageCandidate
      : lineageStage
        ? strings.trace.lineageNotEstablished
        : strings.trace.lineageNotEstablished;
  const knowledgeSummary = completeLiveLineage
    ? lineageStage?.reason || strings.trace.lineageEstablishedSummary
    : lineageStage?.reason ||
      (sourceCount > 0
        ? strings.trace.untracedWithWebLeads
        : strings.status.UNTRACED.summary);
  const statusStyle = completeLiveLineage
    ? STATUS_STYLES.TRACED
    : lineageCandidate
      ? STATUS_STYLES.PARTIALLY_TRACED
      : STATUS_STYLES.UNTRACED;
  useEffect(() => {
    track("self_check_opened", { trace_status: result.trace_status });
  }, [result.trace_status]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="knowledge-heading">
        <h2
          id="knowledge-heading"
          className="font-serif text-3xl sm:text-4xl font-bold tracking-tight"
        >
          {strings.trace.knowledgeHeading}
        </h2>
        {liveStages.length > 0 ? (
          <p className="text-foreground/80 mt-2 text-lg">
            The live investigation found evidence for{" "}
            <span className="font-semibold">
              {establishedCount} of {liveStages.length}
            </span>{" "}
            investigation stages.
          </p>
        ) : (
          <p className="text-foreground/80 mt-2 text-lg">
            Structured investigation status is unavailable for this legacy
            result.
          </p>
        )}

        <div className={`border-l-4 pl-5 py-4 mt-6 ${statusStyle}`}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="font-mono text-sm font-bold uppercase tracking-widest">
              {knowledgeHeadline}
            </h3>
            {result.live_search.status === "searched" && (
              <span className="font-mono text-xs text-muted-foreground">
                {sourceCount} web lead{sourceCount === 1 ? "" : "s"} discovered
              </span>
            )}
          </div>
          <p className="text-foreground/80 mt-2 max-w-2xl">
            {knowledgeSummary}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="live-investigation-section-heading"
        className="space-y-8 border border-border rounded-sm p-5 sm:p-6"
      >
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary mb-2">
            Live investigation
          </p>
          <h2
            id="live-investigation-section-heading"
            className="font-serif text-2xl font-bold"
          >
            Acquired web evidence
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            These results come only from the current request. Curated records do
            not change this stage count or these confidence measures.
          </p>
        </div>

        <InvestigationStatus stages={liveStages} scope="live" />
        <InvestigationScores result={result} />
        <AcquiredEvidence result={result} />
        {hasDynamicLineage && (
          <RuntimeLineageMap
            graph={result.dynamicLineage}
            evidenceSnapshots={result.evidenceSnapshots}
          />
        )}
      </section>

      {result.knownRecordMatch.matched && (
        <section
          aria-labelledby="known-case-section-heading"
          className="space-y-8 border border-border rounded-sm p-5 sm:p-6 bg-muted/10"
        >
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary mb-2">
              Known case / curated evidence
            </p>
            <h2
              id="known-case-section-heading"
              className="font-serif text-2xl font-bold"
            >
              Separate library result
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              This cited record is displayed independently. It does not become
              live provenance for the submitted occurrence.
            </p>
          </div>

          <KnownRecordPanel result={result} />
          {result.lineage ? (
            <>
              <InvestigationStatus stages={knownStages} scope="known" />
              <KnownRecordScores result={result} />
              <MutationMap lineage={result.lineage} />

              <section aria-labelledby="known-signals-heading">
            <h3
              id="known-signals-heading"
              className="font-serif text-2xl font-bold mb-1"
            >
              Curated investigation signals
            </h3>
            <p className="text-muted-foreground text-sm mb-3">
              Prompts from this known record—not findings from the live request.
            </p>
            <ul>
              {result.lineage.signals.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </ul>
              </section>

              <p className="text-sm text-muted-foreground border-t border-border pt-5">
                <span className="font-medium text-foreground/80">
                  {strings.trace.lessonLabel}{" "}
                </span>
                {result.lineage.media_literacy_lesson}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This wording matches an illustrative library record. Its authored
              teaching chain is not displayed as verified evidence.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="claim-read-heading">
        <h2
          id="claim-read-heading"
          className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2"
        >
          {strings.trace.understoodHeading}
        </h2>
        <p className="font-serif text-xl italic text-foreground/90 break-words">
          &ldquo;{result.extracted_claim}&rdquo;
        </p>
      </section>

      {result.live_search.status === "searched" && (
        <section
          aria-labelledby="live-search-heading"
          className="border border-border bg-muted/20 p-5 rounded-sm"
        >
          <h2
            id="live-search-heading"
            className="font-serif text-2xl font-bold mb-1"
          >
            {strings.trace.liveSearchHeading}
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            {strings.trace.liveSearchSubtitle}
          </p>
          {result.live_search.query && (
            <p className="text-sm text-foreground/80 mb-4 break-words">
              <span className="font-medium">
                {strings.trace.liveSearchQuery}:{" "}
              </span>
              &ldquo;{result.live_search.query}&rdquo;
            </p>
          )}
          {result.live_search.sources.length === 0 ? (
            <p className="text-sm text-foreground/80">
              {strings.trace.liveSearchNoResults}
            </p>
          ) : (
            <ol className="space-y-4">
              {result.live_search.sources.map((source) => (
                <li
                  key={source.url}
                  className="border-t border-border pt-4 first:border-t-0 first:pt-0"
                >
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-medium underline underline-offset-2 hover:text-primary inline-flex items-start gap-1"
                  >
                    <span>{source.title}</span>
                    <ExternalLink
                      className="w-3.5 h-3.5 mt-1 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      ({strings.trace.liveSearchOpen})
                    </span>
                  </a>
                  {(source.publisher || source.published_date) && (
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
                      {[
                        source.publisher,
                        source.published_date &&
                          `${strings.trace.liveSearchPublished} ${source.published_date}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="text-sm text-foreground/75 mt-2">
                    {source.description}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section
        aria-labelledby="evidence-heading"
        className="grid sm:grid-cols-2 gap-6"
      >
        <h2 id="evidence-heading" className="sr-only">
          Evidence summary
        </h2>
        <EvidenceList
          title={strings.trace.foundHeading}
          items={result.what_we_found}
        />
        <EvidenceList
          title={strings.trace.notFoundHeading}
          items={result.what_we_did_not_find}
        />
      </section>

      {result.uncertainty_notes.length > 0 && (
        <section
          aria-labelledby="uncertainty-heading"
          className="border border-border bg-muted/30 p-5 rounded-sm"
        >
          <h2
            id="uncertainty-heading"
            className="font-mono text-xs uppercase tracking-wider mb-2 flex items-center gap-2"
          >
            <ShieldQuestion className="w-4 h-4" aria-hidden="true" />
            {strings.trace.uncertaintyHeading}
          </h2>
          <ul className="space-y-2 text-sm text-foreground/80">
            {result.uncertainty_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {result.lineage && false && (
        <>
          {/*
            A partial match means we found something similar but could not
            establish it is the same claim. Presenting its chain as "how your
            message changed" would assert exactly the connection we just said
            we could not make, so the framing switches with the state.
          */}
          {isPartial && (
            <section
              aria-labelledby="candidate-heading"
              className="border border-amber-500/40 bg-amber-500/5 rounded-sm p-5"
            >
              <h2
                id="candidate-heading"
                className="font-mono text-xs uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-2"
              >
                {strings.trace.candidateHeading}
              </h2>
              <p className="font-serif text-lg">
                &ldquo;{result.lineage!.canonical_claim}&rdquo;
              </p>
            </section>
          )}

          {!hasDynamicLineage && !completeLiveLineage && (
            <MutationMap lineage={result.lineage!} isPartial={isPartial} />
          )}

          <section aria-labelledby="chain-heading">
            <h2
              id="chain-heading"
              className="font-serif text-2xl font-bold mb-1"
            >
              {isPartial
                ? strings.trace.chainHeadingPartial
                : strings.trace.chainHeading}
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              {isPartial
                ? strings.trace.chainSubtitlePartial
                : strings.trace.chainSubtitle}
            </p>
            <ol>
              {result.lineage!.mutation_chain.map((node) => (
                <Hop key={node.hop} node={node} />
              ))}
            </ol>
            <p className="flex items-center gap-2 text-muted-foreground text-sm mt-2 pl-8">
              <ArrowDown className="w-4 h-4" aria-hidden="true" />
              {isPartial
                ? strings.trace.chainEndPartial
                : strings.trace.chainEnd}
            </p>
          </section>

          <section aria-labelledby="signals-heading">
            <h2
              id="signals-heading"
              className="font-serif text-2xl font-bold mb-1"
            >
              {strings.trace.signalsHeading}
            </h2>
            <p className="text-muted-foreground text-sm mb-3">
              {strings.trace.signalsSubtitle}
            </p>
            <ul>
              {result.lineage!.signals.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </ul>
          </section>
        </>
      )}

      {result.messenger_safe_explanation && (
        <section
          aria-labelledby="explain-heading"
          className="bg-primary/10 border border-primary/30 p-5 rounded-sm"
        >
          <h2
            id="explain-heading"
            className="font-serif text-xl font-bold mb-2"
          >
            {strings.trace.replyHeading}
          </h2>
          <p className="text-foreground/85 leading-relaxed">
            {result.messenger_safe_explanation}
          </p>
        </section>
      )}

      <section aria-labelledby="selfcheck-heading">
        <h2
          id="selfcheck-heading"
          className="font-serif text-2xl font-bold mb-1"
        >
          {strings.trace.selfCheckHeading}
        </h2>
        <p className="text-muted-foreground text-sm mb-4">
          {strings.trace.selfCheckSubtitle}
        </p>
        <ol className="space-y-4">
          {result.self_check_steps.map((step, index) => (
            <li key={step.id} className="flex gap-4">
              <span className="font-mono text-sm text-muted-foreground shrink-0 pt-0.5">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-medium">{step.text}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {step.rationale}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {result.lineage && false && (
        <p className="text-sm text-muted-foreground border-t border-border pt-5">
          <span className="font-medium text-foreground/80">
            {strings.trace.lessonLabel}{" "}
          </span>
          {result.lineage!.media_literacy_lesson}
        </p>
      )}
    </div>
  );
}
