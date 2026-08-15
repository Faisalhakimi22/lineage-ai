import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  useAnalyzeText,
  useAnalyzeImage,
  type AnalyzeResult,
} from "@workspace/api-client-react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TraceResult } from "@/components/trace/TraceResult";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Search, AlertCircle } from "lucide-react";
import { strings } from "@/lib/strings";
import { confidenceBand, track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";

const COMPLETION_EVENT = {
  TRACED: "analysis_traced",
  PARTIALLY_TRACED: "analysis_partially_traced",
  UNTRACED: "analysis_untraced",
} as const;

/**
 * Pulls the server's structured error message out of the client error. The API
 * returns a stable code plus a message written for end users, so surfacing it
 * directly is better than substituting a generic string - the server knows
 * whether OCR found nothing, the file was too large, or the rate limit was hit.
 */
function messageFor(err: unknown): string {
  const body = (err as { data?: { error?: { message?: string } } })?.data
    ?.error;
  return body?.message ?? strings.trace.apiUnavailable;
}

export default function Trace() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated } = useAuth();

  const analyzeText = useAnalyzeText();
  const analyzeImage = useAnalyzeImage();
  const pending = analyzeText.isPending || analyzeImage.isPending;

  const onSuccess = (data: AnalyzeResult, startedAt: number) => {
    setResult(data);
    setError(null);
    track("analysis_completed", {
      trace_status: data.trace_status,
      input_type: data.input_type,
      matching_strategy: data.matching_strategy,
      confidence_band: confidenceBand(data.confidence),
      duration_ms: Date.now() - startedAt,
    });
    track(COMPLETION_EVENT[data.trace_status], {
      trace_status: data.trace_status,
      lineage_id: data.lineage?.id,
    });
  };

  const onError = (err: unknown) => {
    setError(messageFor(err));
  };

  const submitText = () => {
    if (text.trim().length === 0) return;
    const startedAt = Date.now();
    setResult(null);
    setError(null);
    track("analysis_started", { input_type: "text" });
    analyzeText.mutate(
      { data: { text } },
      { onSuccess: (data) => onSuccess(data, startedAt), onError },
    );
  };

  const submitImage = (file: File) => {
    const startedAt = Date.now();
    setResult(null);
    setError(null);
    track("analysis_started", { input_type: "image" });
    track("image_analysis_started", { input_type: "image" });
    analyzeImage.mutate(
      { data: { image: file } },
      { onSuccess: (data) => onSuccess(data, startedAt), onError },
    );
  };

  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-10 max-w-4xl w-full">
        <h1 className="sr-only">{strings.trace.heading}</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitText();
          }}
          className="border border-border bg-card p-6 rounded-sm"
        >
          <label
            htmlFor="claim-input"
            className="font-mono text-sm font-bold uppercase tracking-wider block mb-3"
          >
            {strings.trace.inputLabel}
          </label>
          <Textarea
            id="claim-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={5000}
            rows={4}
            placeholder={strings.trace.inputPlaceholder}
            aria-describedby="claim-input-help"
          />
          <p
            id="claim-input-help"
            className="text-xs text-muted-foreground mt-2"
          >
            {strings.trace.inputHelp}
          </p>

          <div className="flex items-center justify-between gap-4 mt-5 pt-5 border-t border-border flex-wrap">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff"
                className="sr-only"
                id="screenshot-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) submitImage(file);
                  // Reset so re-picking the same file fires change again.
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
              >
                <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
                {strings.trace.upload}
              </Button>
            </div>

            <Button
              type="submit"
              disabled={pending || text.trim().length === 0}
            >
              {pending ? strings.trace.submitting : strings.trace.submit}
              <Search className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
          </div>
        </form>

        {/* Named stages, no invented percentage - we cannot know how far along
            an OCR or model call is, so we do not pretend to. */}
        <div aria-live="polite" aria-busy={pending} className="mt-6">
          {pending && (
            <ol className="font-mono text-sm text-muted-foreground space-y-1">
              <li>{strings.trace.stageReading}</li>
              <li>{strings.trace.stageUnderstanding}</li>
              <li>{strings.trace.stageLooking}</li>
              <li>{strings.trace.stagePreparing}</li>
            </ol>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 border-l-4 border-destructive pl-4 py-3 flex gap-3"
          >
            <AlertCircle
              className="w-5 h-5 text-destructive shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {result && !pending && (
          <div className="mt-10">
            <TraceResult result={result} />

            {result.analysis_id ? (
              <p className="text-sm text-muted-foreground border-t border-border mt-8 pt-5">
                Saved to{" "}
                <Link
                  href="/history"
                  className="underline underline-offset-2 hover:text-primary"
                >
                  your history
                </Link>
                .
              </p>
            ) : (
              isAuthenticated === false && (
                <p className="text-sm text-muted-foreground border-t border-border mt-8 pt-5">
                  Sign in to save analyses and reopen them later.
                </p>
              )
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
