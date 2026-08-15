import { useEffect, useMemo, useState } from "react";
import type {
  CuratedLineageRelationship,
  EvidenceSnapshot,
  Lineage,
  LineageEdgeEvidence,
  LineageEdgeStatus,
  ProvenanceRelationshipType,
  RuntimeLineageEdge,
  RuntimeLineageGraph,
  RuntimeLineageNode,
  Source,
} from "@workspace/api-client-react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { strings } from "@/lib/strings";

interface MutationStyle {
  label: string;
  border: string;
  badge: string;
}

const DEFAULT_STYLE: MutationStyle = {
  label: "Changed",
  border: "border-border",
  badge: "bg-muted text-muted-foreground",
};

const MUTATION_STYLES: Record<string, MutationStyle> = {
  original_event: {
    label: "Original event",
    border: "border-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  stripped_context: {
    label: "Context removed",
    border: "border-amber-500",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  exaggeration: {
    label: "Exaggerated",
    border: "border-orange-500",
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  },
  fabricated_cause: {
    label: "Cause introduced",
    border: "border-rose-500",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
  recycled_old_media: {
    label: "Media recycled",
    border: "border-violet-500",
    badge: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  misattribution: {
    label: "Misattributed",
    border: "border-sky-500",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  edited_media: {
    label: "Media edited",
    border: "border-fuchsia-500",
    badge: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400",
  },
  selective_evidence: {
    label: "Evidence selected",
    border: "border-yellow-500",
    badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  false_caption: {
    label: "False caption",
    border: "border-cyan-500",
    badge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  },
  translation_distortion: {
    label: "Translation distorted",
    border: "border-teal-500",
    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  },
  out_of_date_information: {
    label: "Out of date",
    border: "border-slate-500",
    badge: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  },
  false_quotation: {
    label: "False quotation",
    border: "border-red-500",
    badge: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
  context_shift: {
    label: "Context shifted",
    border: "border-indigo-500",
    badge: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  },
};

const CURRENT_STYLE: MutationStyle = {
  label: "Current submission",
  border: "border-primary",
  badge: "bg-primary/15 text-primary",
};

const TRANSMISSION_RELATIONSHIPS = new Set<ProvenanceRelationshipType>([
  "derived_from",
  "reposted_from",
  "quoted_from",
  "corrected_by",
  "same_media",
]);

export function mutationLabel(type: string): string {
  return MUTATION_STYLES[type]?.label ?? type.replace(/_/g, " ");
}

function relationshipLabel(type: ProvenanceRelationshipType): string {
  const labels: Record<ProvenanceRelationshipType, string> = {
    temporal_order: "Temporal order only",
    same_claim: "Same claim",
    same_event: "Same event",
    related_claim: "Related claim",
    derived_from: "Derived from",
    reposted_from: "Reposted from",
    quoted_from: "Quoted from",
    corrected_by: "Corrected by",
    same_media: "Same media",
  };
  return labels[type];
}

function statusLabel(status: LineageEdgeStatus): string {
  return status.replace(/_/g, " ");
}

interface NodeDetail {
  badge: string;
  text: string;
  sources: Source[];
  sourceFallback: string | null;
  dates: string[];
  whatChanged: string | null;
  evidence: string[];
}

interface NodeData {
  id: string;
  badge: string;
  text: string;
  style: MutationStyle;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  footer: string | null;
  selected: boolean;
  onSelect: (id: string) => void;
  detail: NodeDetail;
}

function CustomNode({ data }: { data: NodeData }) {
  return (
    <div
      className={`px-4 py-3 shadow-lg border-2 rounded-sm w-[260px] bg-background transition-shadow ${data.style.border} ${
        data.selected
          ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
          : ""
      }`}
    >
      {data.hasIncoming && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-2 h-2 !bg-primary/50"
        />
      )}
      <button
        type="button"
        className="block w-full text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-pressed={data.selected}
        aria-controls="lineage-node-detail"
        onClick={() => data.onSelect(data.id)}
      >
        <span
          className={`inline-block w-fit font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${data.style.badge}`}
        >
          {data.badge}
        </span>
        <p className="text-sm text-foreground font-medium leading-snug mt-2">
          {data.text}
        </p>
        {data.footer && (
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-2 pt-2 border-t border-border">
            {data.footer}
          </p>
        )}
      </button>
      {data.hasOutgoing && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-2 h-2 !bg-primary"
        />
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function evidenceDescriptions(sources: Source[]): string[] {
  return uniqueValues(
    sources
      .filter(
        (source) =>
          source.availability === "linked" && Boolean(source.url?.trim()),
      )
      .map((source) => source.evidence_description || null),
  );
}

function layoutNodes(
  ids: string[],
  links: Array<{ from: string; to: string }>,
): Map<string, { x: number; y: number }> {
  const levels = new Map<string, number>(ids.map((id) => [id, 0]));

  // Relax explicit directed relationships only. Array position never creates a
  // level or an arrow.
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    for (const link of links) {
      const next = (levels.get(link.from) ?? 0) + 1;
      if (next > (levels.get(link.to) ?? 0)) {
        levels.set(link.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const level = levels.get(id) ?? 0;
    const group = byLevel.get(level) ?? [];
    group.push(id);
    byLevel.set(level, group);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [level, group] of byLevel) {
    group.forEach((id, index) => {
      positions.set(id, {
        x: level * 340,
        y: 150 + (index - (group.length - 1) / 2) * 210,
      });
    });
  }
  return positions;
}

function edgeAppearance(
  status: LineageEdgeStatus,
  relationship: ProvenanceRelationshipType,
) {
  const nonTransmission = !TRANSMISSION_RELATIONSHIPS.has(relationship);
  if (status === "established" && !nonTransmission) {
    return {
      stroke: "#059669",
      dash: undefined,
      label: `ESTABLISHED · ${relationshipLabel(relationship)}`,
      marker: true,
    };
  }
  if (status === "candidate") {
    return {
      stroke: "#d97706",
      dash: "8 6",
      label: `CANDIDATE · ${relationshipLabel(relationship)}`,
      marker: true,
    };
  }
  if (status === "insufficient_evidence") {
    return {
      stroke: "#64748b",
      dash: "2 7",
      label: `INSUFFICIENT · ${relationshipLabel(relationship)}`,
      marker: false,
    };
  }
  return {
    stroke: "#64748b",
    dash: "7 6",
    label: `RELATED EVIDENCE · ${relationshipLabel(relationship)} · NO TRANSMISSION CLAIMED`,
    marker: false,
  };
}

function reactFlowEdge(
  id: string,
  source: string,
  target: string,
  relationship: ProvenanceRelationshipType,
  status: LineageEdgeStatus,
  mutationType: string | null,
): Edge {
  const appearance = edgeAppearance(status, relationship);
  return {
    id,
    source,
    target,
    animated: status === "established" && appearance.marker,
    label: [appearance.label, mutationType && mutationLabel(mutationType)]
      .filter(Boolean)
      .join(" · "),
    style: {
      stroke: appearance.stroke,
      strokeWidth: status === "established" ? 2.5 : 2,
      strokeDasharray: appearance.dash,
    },
    labelStyle: {
      fill: appearance.stroke,
      fontSize: 10,
      fontWeight: 700,
    },
    markerEnd: appearance.marker
      ? { type: MarkerType.ArrowClosed, color: appearance.stroke }
      : undefined,
  };
}

function SourceList({
  sources,
  fallback,
}: {
  sources: Source[];
  fallback: string | null;
}) {
  if (sources.length === 0) {
    return <p>{fallback ?? "Source not established."}</p>;
  }

  return (
    <>
      {fallback && <p className="mb-1">{fallback}</p>}
      <ul className="space-y-1">
        {sources.map((source, index) => (
          <li key={`${source.publisher}-${source.url ?? index}`}>
            {source.url && source.availability === "linked" ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                {source.publisher}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              source.publisher
            )}
            {source.availability !== "linked" && (
              <span className="text-muted-foreground">
                {" "}— specific published source not established
              </span>
            )}
            {source.published_date && (
              <span className="text-muted-foreground">
                {" "}· published {source.published_date}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function NodeDetailPanel({ detail }: { detail: NodeDetail }) {
  return (
    <aside
      id="lineage-node-detail"
      aria-live="polite"
      className="mt-4 border border-border rounded-sm bg-background p-5"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-primary mb-2">
        {detail.badge}
      </p>
      <h3 className="font-serif text-xl font-bold leading-snug mb-5">
        {detail.text}
      </h3>
      <dl className="grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Source
          </dt>
          <dd className="text-sm leading-relaxed">
            <SourceList sources={detail.sources} fallback={detail.sourceFallback} />
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Date
          </dt>
          <dd className="text-sm leading-relaxed">
            {detail.dates.length > 0
              ? detail.dates.map((date) => (
                  <time key={date} dateTime={date} className="block">
                    {date}
                  </time>
                ))
              : "Date not established."}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            What changed
          </dt>
          <dd className="text-sm leading-relaxed">
            {detail.whatChanged || "What changed is not established."}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Evidence
          </dt>
          <dd className="text-sm leading-relaxed">
            {detail.evidence.length > 0 ? (
              <ul className="space-y-2">
                {detail.evidence.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            ) : (
              "Evidence not established."
            )}
          </dd>
        </div>
      </dl>
    </aside>
  );
}

function runtimeSource(snapshot: EvidenceSnapshot): Source {
  const sourceType: Source["source_type"] =
    snapshot.sourceType === "primary"
      ? "primary_document"
      : snapshot.sourceType === "official"
        ? "official_statement"
        : snapshot.sourceType === "academic"
          ? "research"
          : snapshot.sourceType === "fact_check"
            ? "fact_check"
            : snapshot.sourceType === "news"
              ? "news_report"
              : "reference_organisation";

  return {
    publisher: snapshot.publisher || snapshot.domain || snapshot.title,
    url:
      snapshot.canonicalUrl || snapshot.finalUrl || snapshot.originalUrl || null,
    published_date: snapshot.publishedAt,
    source_type: sourceType,
    availability: "linked",
    is_primary: snapshot.sourceType === "primary",
    evidence_description: snapshot.relevantPassages[0]?.text ?? "",
  };
}

function evidenceForIds(
  evidenceIds: string[],
  snapshots: EvidenceSnapshot[],
): string[] {
  const wanted = new Set(evidenceIds);
  return uniqueValues(
    snapshots.flatMap((snapshot) =>
      snapshot.relevantPassages
        .filter((passage) => wanted.has(passage.id))
        .map((passage) => passage.text),
    ),
  );
}

function buildCuratedGraph(
  lineage: Lineage,
  selectedNodeId: string,
  onSelect: (id: string) => void,
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const relationships = lineage.curated_relationships;
  const hopById = new Map(
    lineage.mutation_chain.map((hop) => [`hop-${hop.hop}`, hop]),
  );
  const ids = ["origin", ...hopById.keys()];
  const positions = layoutNodes(
    ids,
    relationships.map((item) => ({
      from: item.from_node_id,
      to: item.to_node_id,
    })),
  );
  const incoming = new Set(relationships.map((item) => item.to_node_id));
  const outgoing = new Set(relationships.map((item) => item.from_node_id));

  const nodes: Node<NodeData>[] = [
    {
      id: "origin",
      type: "custom",
      position: positions.get("origin") ?? { x: 0, y: 150 },
      data: {
        id: "origin",
        badge: "Documented event",
        text: lineage.origin.what_actually_happened,
        style: MUTATION_STYLES.original_event ?? DEFAULT_STYLE,
        hasIncoming: incoming.has("origin"),
        hasOutgoing: outgoing.has("origin"),
        footer: strings.trace.mapOriginBadge,
        selected: selectedNodeId === "origin",
        onSelect,
        detail: {
          badge: "Documented event",
          text: lineage.origin.what_actually_happened,
          sources: lineage.origin.sources,
          sourceFallback: lineage.origin.source || null,
          dates: uniqueValues([lineage.origin.date]),
          whatChanged: null,
          evidence: evidenceDescriptions(lineage.origin.sources),
        },
      },
    },
    ...lineage.mutation_chain.map((hop) => {
      const id = `hop-${hop.hop}`;
      return {
        id,
        type: "custom",
        position: positions.get(id) ?? { x: hop.hop * 330, y: 150 },
        data: {
          id,
          badge: mutationLabel(hop.type),
          text: hop.text,
          style: MUTATION_STYLES[hop.type] ?? DEFAULT_STYLE,
          hasIncoming: incoming.has(id),
          hasOutgoing: outgoing.has(id),
          footer:
            !incoming.has(id) && !outgoing.has(id)
              ? "Unconnected curated evidence"
              : null,
          selected: selectedNodeId === id,
          onSelect,
          detail: {
            badge: mutationLabel(hop.type),
            text: hop.text,
            sources: hop.sources,
            sourceFallback: null,
            dates: uniqueValues(hop.sources.map((source) => source.published_date)),
            whatChanged: hop.what_changed || null,
            evidence: evidenceDescriptions(hop.sources),
          },
        },
      } satisfies Node<NodeData>;
    }),
  ];

  const edges = relationships.map((relationship) =>
    reactFlowEdge(
      relationship.id,
      relationship.from_node_id,
      relationship.to_node_id,
      relationship.relationship,
      relationship.status as LineageEdgeStatus,
      relationship.mutation_type,
    ),
  );
  return { nodes, edges };
}

function buildRuntimeGraph(
  graph: RuntimeLineageGraph,
  snapshots: EvidenceSnapshot[],
  selectedNodeId: string,
  onSelect: (id: string) => void,
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const snapshotById = new Map(
    snapshots.map((snapshot) => [snapshot.id, snapshot]),
  );
  const nodeBySourceId = new Map(
    graph.nodes.map((node) => [node.sourceId, node]),
  );
  const links = graph.edges.flatMap((edge) => {
    const from = nodeBySourceId.get(edge.fromSourceId)?.id;
    const to = nodeBySourceId.get(edge.toSourceId)?.id;
    return from && to ? [{ from, to }] : [];
  });
  const positions = layoutNodes(
    graph.nodes.map((node) => node.id),
    links,
  );
  const incoming = new Set(links.map((link) => link.to));
  const outgoing = new Set(links.map((link) => link.from));

  const nodes = graph.nodes.map((node, index) => {
    const snapshot = snapshotById.get(node.sourceId);
    const isNormalizedClaim = node.kind === "submitted_claim";
    const isOccurrence = node.kind === "submitted_occurrence";
    const badge = isNormalizedClaim
      ? "Normalized claim"
      : isOccurrence
        ? "Submitted occurrence"
        : "Acquired source";
    const fallback = isNormalizedClaim
      ? "Normalized wording is not occurrence evidence."
      : isOccurrence
        ? "Request-specific submitted occurrence"
        : null;
    const sources: Source[] = snapshot
      ? [runtimeSource(snapshot)]
      : node.url
        ? [
            {
              publisher: isOccurrence ? "Submitted occurrence source" : node.url,
              url: node.url,
              published_date: node.date,
              source_type: "news_report",
              availability: "linked",
              is_primary: false,
              evidence_description: "Request-specific source supplied with this occurrence.",
            },
          ]
        : [];

    return {
      id: node.id,
      type: "custom",
      position: positions.get(node.id) ?? { x: index * 330, y: 150 },
      data: {
        id: node.id,
        badge,
        text: node.claim,
        style: node.kind === "source" ? DEFAULT_STYLE : CURRENT_STYLE,
        hasIncoming: incoming.has(node.id),
        hasOutgoing: outgoing.has(node.id),
        footer: isNormalizedClaim
          ? "Not occurrence evidence"
          : isOccurrence && !graph.submittedOccurrenceConnected
            ? "Occurrence disconnected"
            : null,
        selected: selectedNodeId === node.id,
        onSelect,
        detail: {
          badge,
          text: node.claim,
          sources,
          sourceFallback: fallback,
          dates: uniqueValues([node.date, snapshot?.publishedAt]),
          whatChanged: null,
          evidence: evidenceForIds(node.evidenceIds, snapshots),
        },
      },
    } satisfies Node<NodeData>;
  });

  const nodeIdBySourceId = new Map(
    graph.nodes.map((node) => [node.sourceId, node.id]),
  );
  const edges = graph.edges.flatMap((edge) => {
    const source = nodeIdBySourceId.get(edge.fromSourceId);
    const target = nodeIdBySourceId.get(edge.toSourceId);
    if (!source || !target) return [];
    return [
      reactFlowEdge(
        edge.id,
        source,
        target,
        edge.relationship,
        edge.status,
        edge.mutationType,
      ),
    ];
  });
  return { nodes, edges };
}

function relationshipStatusClass(status: LineageEdgeStatus): string {
  if (status === "established") {
    return "border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "candidate") {
    return "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function sourceForEvidence(
  evidence: LineageEdgeEvidence,
  snapshots: Map<string, EvidenceSnapshot>,
): EvidenceSnapshot | undefined {
  return snapshots.get(evidence.sourceId);
}

function RuntimeEdgeEvidencePanel({
  edge,
  snapshots,
}: {
  edge: RuntimeLineageEdge;
  snapshots: Map<string, EvidenceSnapshot>;
}) {
  const allEvidence = uniqueEdgeEvidence([
    ...edge.evidence,
    ...(edge.beforeEvidence ? [edge.beforeEvidence] : []),
    ...(edge.afterEvidence ? [edge.afterEvidence] : []),
  ]);

  return (
    <details className={`border rounded-sm p-4 ${relationshipStatusClass(edge.status)}`}>
      <summary className="cursor-pointer font-medium text-sm">
        <span className="font-mono text-[10px] uppercase tracking-wider mr-2">
          {statusLabel(edge.status)}
        </span>
        {relationshipLabel(edge.relationship)}
        {edge.mutationType ? ` · ${mutationLabel(edge.mutationType)}` : ""}
      </summary>
      <div className="mt-4 text-sm text-foreground space-y-4">
        <p>{edge.reason || edge.explanation}</p>
        <dl className="grid sm:grid-cols-3 gap-3">
          <div>
            <dt className="font-mono text-[10px] uppercase text-muted-foreground">Status</dt>
            <dd>{statusLabel(edge.status)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase text-muted-foreground">Relationship</dt>
            <dd>{relationshipLabel(edge.relationship)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase text-muted-foreground">Confidence</dt>
            <dd>{Math.round(edge.confidence * 100)}%</dd>
          </div>
        </dl>

        {(edge.beforeEvidence || edge.afterEvidence) && (
          <div className="grid sm:grid-cols-2 gap-3">
            <EvidenceQuote label="Before" evidence={edge.beforeEvidence} snapshots={snapshots} />
            <EvidenceQuote label="After" evidence={edge.afterEvidence} snapshots={snapshots} />
          </div>
        )}

        {allEvidence.length > 0 ? (
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Supporting passages
            </h4>
            <ul className="space-y-3">
              {allEvidence.map((evidence) => {
                const source = sourceForEvidence(evidence, snapshots);
                const url = source?.canonicalUrl || source?.finalUrl || source?.originalUrl;
                return (
                  <li key={`${evidence.sourceId}:${evidence.passageId}:${evidence.role}`} className="border-l-2 border-border pl-3">
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">
                      {evidence.role.replace(/_/g, " ")} · {source?.publisher || source?.domain || evidence.sourceId} · passage {evidence.passageId}
                    </p>
                    <p className="mt-1">“{evidence.exactText}”</p>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs mt-1 inline-block">
                        Open source
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">No supporting passage was returned for this relationship.</p>
        )}
      </div>
    </details>
  );
}

function uniqueEdgeEvidence(items: LineageEdgeEvidence[]): LineageEdgeEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sourceId}:${item.passageId}:${item.role}:${item.exactText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function EvidenceQuote({
  label,
  evidence,
  snapshots,
}: {
  label: string;
  evidence: LineageEdgeEvidence | null;
  snapshots: Map<string, EvidenceSnapshot>;
}) {
  if (!evidence) {
    return (
      <div className="bg-muted/40 p-3 rounded-sm text-muted-foreground">
        <p className="font-mono text-[10px] uppercase">{label}</p>
        <p className="mt-1">Not established.</p>
      </div>
    );
  }
  const source = sourceForEvidence(evidence, snapshots);
  return (
    <div className="bg-muted/40 p-3 rounded-sm">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">
        {label} · {source?.publisher || source?.domain || evidence.sourceId}
      </p>
      <p className="mt-1">“{evidence.exactText}”</p>
      <p className="font-mono text-[10px] text-muted-foreground mt-2">
        passage {evidence.passageId}
      </p>
    </div>
  );
}

function CuratedRelationshipPanel({
  relationship,
  lineage,
}: {
  relationship: CuratedLineageRelationship;
  lineage: Lineage;
}) {
  const fromText =
    relationship.from_node_id === "origin"
      ? lineage.origin.what_actually_happened
      : lineage.mutation_chain.find(
          (hop) => `hop-${hop.hop}` === relationship.from_node_id,
        )?.text;
  const toText = lineage.mutation_chain.find(
    (hop) => `hop-${hop.hop}` === relationship.to_node_id,
  )?.text;
  const nonTransmission = !TRANSMISSION_RELATIONSHIPS.has(
    relationship.relationship,
  );

  return (
    <details className={`border rounded-sm p-4 ${relationshipStatusClass(relationship.status as LineageEdgeStatus)}`}>
      <summary className="cursor-pointer font-medium text-sm">
        <span className="font-mono text-[10px] uppercase tracking-wider mr-2">
          {statusLabel(relationship.status as LineageEdgeStatus)}
        </span>
        {relationshipLabel(relationship.relationship)}
        {nonTransmission ? " · no transmission claimed" : ""}
      </summary>
      <div className="mt-4 space-y-4 text-sm text-foreground">
        <p>{relationship.reason}</p>
        <dl className="grid sm:grid-cols-3 gap-3">
          <div>
            <dt className="font-mono text-[10px] uppercase text-muted-foreground">Status</dt>
            <dd>{statusLabel(relationship.status as LineageEdgeStatus)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase text-muted-foreground">Relationship</dt>
            <dd>{relationshipLabel(relationship.relationship)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase text-muted-foreground">Confidence</dt>
            <dd>{Math.round(relationship.confidence * 100)}%</dd>
          </div>
        </dl>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-muted/40 p-3 rounded-sm">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Before / related record</p>
            <p className="mt-1">{fromText ?? "Not established."}</p>
          </div>
          <div className="bg-muted/40 p-3 rounded-sm">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">After / documented strand</p>
            <p className="mt-1">{toText ?? "Not established."}</p>
          </div>
        </div>
        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Cited evidence</h4>
          <SourceList sources={relationship.sources} fallback={null} />
          <ul className="mt-2 space-y-2">
            {relationship.sources.map((source, index) => (
              <li key={`${source.publisher}:${index}`}>“{source.evidence_description}”</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function GraphCanvas({ nodes, edges }: { nodes: Node<NodeData>[]; edges: Edge[] }) {
  return (
    <div className="w-full h-[460px] border border-border rounded-sm bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        onInit={(instance) => {
          requestAnimationFrame(() => instance.fitView({ padding: 0.15 }));
        }}
        attributionPosition="bottom-right"
        zoomOnScroll={false}
        preventScrolling={false}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        minZoom={0.2}
      >
        <Background gap={20} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function MutationMap({ lineage }: { lineage: Lineage; isPartial?: boolean }) {
  const [selectedNodeId, setSelectedNodeId] = useState("origin");
  useEffect(() => setSelectedNodeId("origin"), [lineage.id]);
  const { nodes, edges } = useMemo(
    () => buildCuratedGraph(lineage, selectedNodeId, setSelectedNodeId),
    [lineage, selectedNodeId],
  );
  const selectedDetail =
    nodes.find((node) => node.id === selectedNodeId)?.data.detail ??
    nodes[0]?.data.detail;

  return (
    <section aria-labelledby="curated-map-heading">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
        Known case / curated evidence
      </p>
      <h2 id="curated-map-heading" className="font-serif text-2xl font-bold mb-1">
        {strings.trace.mapHeading}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">{strings.trace.mapSubtitle}</p>
      <GraphCanvas nodes={nodes} edges={edges} />
      <p className="text-xs text-muted-foreground mt-2">{strings.trace.mapSelectHint}</p>
      {selectedDetail && <NodeDetailPanel detail={selectedDetail} />}
      {lineage.curated_relationships.length > 0 && (
        <div className="mt-4 space-y-3" aria-label="Curated relationship evidence">
          {lineage.curated_relationships.map((relationship) => (
            <CuratedRelationshipPanel key={relationship.id} relationship={relationship} lineage={lineage} />
          ))}
        </div>
      )}
    </section>
  );
}

export function RuntimeLineageMap({
  graph,
  evidenceSnapshots,
}: {
  graph: RuntimeLineageGraph;
  evidenceSnapshots: EvidenceSnapshot[];
}) {
  const [selectedNodeId, setSelectedNodeId] = useState(graph.nodes[0]?.id ?? "");
  useEffect(() => setSelectedNodeId(graph.nodes[0]?.id ?? ""), [graph]);
  const { nodes, edges } = useMemo(
    () => buildRuntimeGraph(graph, evidenceSnapshots, selectedNodeId, setSelectedNodeId),
    [graph, evidenceSnapshots, selectedNodeId],
  );
  const selectedDetail =
    nodes.find((node) => node.id === selectedNodeId)?.data.detail ??
    nodes[0]?.data.detail;
  const snapshotById = useMemo(
    () => new Map(evidenceSnapshots.map((snapshot) => [snapshot.id, snapshot])),
    [evidenceSnapshots],
  );

  if (nodes.length === 0) return null;
  const heading =
    graph.status === "established"
      ? "Established live provenance graph"
      : graph.status === "candidate"
        ? "Candidate live source relationships"
        : "Live lineage not established";

  return (
    <section aria-labelledby="runtime-map-heading">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
        Live investigation
      </p>
      <h2 id="runtime-map-heading" className="font-serif text-2xl font-bold mb-1">
        {heading}
      </h2>
      <p className="text-muted-foreground text-sm mb-2">{strings.trace.runtimeMapSubtitle}</p>
      <p className="text-sm text-foreground/80 mb-2">{graph.reason}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-4">
        {graph.establishedTransitionCount} established transition
        {graph.establishedTransitionCount === 1 ? "" : "s"} · submitted occurrence {graph.submittedOccurrenceConnected ? "connected" : "disconnected"}
      </p>
      <GraphCanvas nodes={nodes} edges={edges} />
      <p className="text-xs text-muted-foreground mt-2">{strings.trace.mapSelectHint}</p>
      {selectedDetail && <NodeDetailPanel detail={selectedDetail} />}
      {graph.edges.length > 0 && (
        <div className="mt-4 space-y-3" aria-label="Live relationship evidence">
          {graph.edges.map((edge) => (
            <RuntimeEdgeEvidencePanel key={edge.id} edge={edge} snapshots={snapshotById} />
          ))}
        </div>
      )}
    </section>
  );
}
