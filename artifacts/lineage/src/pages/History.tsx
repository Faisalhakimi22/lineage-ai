import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useListAnalyses,
  useGetAnalysis,
  useDeleteAnalysis,
  getListAnalysesQueryKey,
  type AnalysisSummary,
  type TraceStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, ArrowLeft, FileText, Image as ImageIcon } from "lucide-react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TraceResult } from "@/components/trace/TraceResult";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { track } from "@/lib/analytics";

const STATUS_TEXT: Record<TraceStatus, string> = {
  TRACED: "Verified case matched",
  PARTIALLY_TRACED: "Lineage not established",
  UNTRACED: "Untraced",
};

function HistoryRow({
  item,
  onDelete,
  deleting,
}: {
  item: AnalysisSummary;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const Icon = item.inputType === "image" ? ImageIcon : FileText;

  return (
    <li className="border border-border rounded-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Icon
            className="w-3.5 h-3.5 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded">
            {STATUS_TEXT[item.traceStatus]}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            known-record wording similarity {Math.round(item.confidence * 100)}%
            ·{" "}
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleDateString()}
            </time>
          </span>
        </div>
        <p className="text-sm text-foreground/90 truncate">
          {item.extractedClaim}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link href={`/history/${item.id}`}>
          <Button variant="outline" size="sm">
            {strings.history.open}
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          disabled={deleting}
          onClick={() => onDelete(item.id)}
          aria-label={`${strings.history.delete}: ${item.extractedClaim}`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function HistoryDetail({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetAnalysis(id);

  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-10 max-w-4xl w-full">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-8"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to your analyses
        </Link>

        {isLoading && (
          <p
            className="font-mono text-sm text-muted-foreground"
            aria-live="polite"
          >
            Loading…
          </p>
        )}

        {isError && (
          <div role="alert" className="border-l-4 border-destructive pl-4 py-3">
            <p className="text-sm">
              We couldn&apos;t open that analysis. It may have been deleted.
            </p>
          </div>
        )}

        {data && <TraceResult result={data.result} />}
      </div>
    </PageWrapper>
  );
}

function HistoryList() {
  const { data, isLoading, isError } = useListAnalyses();
  const queryClient = useQueryClient();
  const deleteAnalysis = useDeleteAnalysis();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    track("history_opened");
  }, []);

  const handleDelete = (id: string) => {
    if (!window.confirm(strings.history.confirmDelete)) return;
    setDeleteError(null);
    deleteAnalysis.mutate(
      { id },
      {
        onSuccess: () =>
          void queryClient.invalidateQueries({
            queryKey: getListAnalysesQueryKey(),
          }),
        onError: () => setDeleteError(strings.history.deleteFailed),
      },
    );
  };

  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-12 max-w-3xl w-full">
        <header className="mb-8">
          <h1 className="font-serif text-4xl font-bold tracking-tight mb-3">
            {strings.history.heading}
          </h1>
          <p className="text-muted-foreground">{strings.history.subtitle}</p>
        </header>

        {isLoading && (
          <p
            className="font-mono text-sm text-muted-foreground"
            aria-live="polite"
          >
            Loading…
          </p>
        )}

        {isError && (
          <div role="alert" className="border-l-4 border-destructive pl-4 py-3">
            <p className="text-sm">{strings.history.loadFailed}</p>
          </div>
        )}

        {deleteError && (
          <div
            role="alert"
            className="border-l-4 border-destructive pl-4 py-3 mb-4"
          >
            <p className="text-sm">{deleteError}</p>
          </div>
        )}

        {data && data.length === 0 && (
          <div className="border border-dashed border-border rounded-sm p-8 text-center">
            <p className="text-muted-foreground mb-4">
              {strings.history.empty}
            </p>
            <Link href="/trace">
              <Button>{strings.history.emptyCta}</Button>
            </Link>
          </div>
        )}

        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                onDelete={handleDelete}
                deleting={deleteAnalysis.isPending}
              />
            ))}
          </ul>
        )}
      </div>
    </PageWrapper>
  );
}

export default function History() {
  const [isDetail, params] = useRoute("/history/:id");

  if (isDetail && params?.id) return <HistoryDetail id={params.id} />;
  return <HistoryList />;
}
