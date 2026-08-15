import { Link } from "wouter";
import { useListLineages } from "@workspace/api-client-react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { BookOpen } from "lucide-react";

/**
 * Verified investigations and teaching records share a library, but never the
 * same evidentiary label. Illustrative records demonstrate the interface; they
 * do not claim an origin or a real-world mutation history was established.
 */
export default function Claims() {
  const { data: lineages, isLoading, isError } = useListLineages();

  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-12 max-w-5xl w-full">
        <header className="mb-10">
          <h1 className="font-serif text-4xl font-bold tracking-tight mb-3">
            Investigation library
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Two externally verified cases sit alongside fifteen illustrative
            teaching records. Illustrative records show a possible mutation
            pattern; their origin and lineage are not established evidence.
          </p>
        </header>

        {isLoading && (
          <p
            className="font-mono text-sm text-muted-foreground"
            aria-live="polite"
          >
            Loading the library…
          </p>
        )}

        {isError && (
          <div role="alert" className="border-l-4 border-destructive pl-4 py-3">
            <p className="text-sm">
              We couldn't load the lineage library. Check that the API server is
              running.
            </p>
          </div>
        )}

        <ul className="grid md:grid-cols-2 gap-5">
          {lineages?.map((lineage) => (
            <li key={lineage.id}>
              <article className="border border-border h-full p-5 rounded-sm flex flex-col hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded">
                    {lineage.topic.replace("_", " ")}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded">
                    {lineage.hop_count}{" "}
                    {lineage.dataset_provenance === "externally_verified"
                      ? "documented hops"
                      : "example steps"}
                  </span>
                  {/* The verified/illustrative distinction is surfaced here,
                      not buried, so nobody mistakes a constructed teaching
                      example for a documented investigation. */}
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                      lineage.dataset_provenance === "externally_verified"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {lineage.dataset_provenance === "externally_verified"
                      ? "verified case"
                      : "illustrative"}
                  </span>
                </div>

                <h2 className="font-serif text-lg font-bold leading-snug mb-3">
                  {lineage.canonical_claim}
                </h2>

                <p className="text-sm text-muted-foreground mb-4">
                  {lineage.dataset_provenance === "externally_verified" ? (
                    <>
                      <span className="font-medium text-foreground/70">
                        Origin:{" "}
                      </span>
                      {lineage.origin_source}
                      {lineage.origin_date && ` · ${lineage.origin_date}`}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground/70">
                        Origin not established.
                      </span>{" "}
                      Teaching reference: {lineage.origin_source}
                    </>
                  )}
                </p>

                <div className="mt-auto pt-4 border-t border-border flex gap-3">
                  <BookOpen
                    className="w-4 h-4 text-primary shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-foreground/80">
                    {lineage.media_literacy_lesson}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-muted-foreground border-t border-border pt-6">
          Want to trace something that isn't here?{" "}
          <Link
            href="/trace"
            className="underline underline-offset-2 hover:text-primary"
          >
            Try the tracer
          </Link>
          . If we have no record of a claim we'll say so, rather than guessing.
        </p>
      </div>
    </PageWrapper>
  );
}
