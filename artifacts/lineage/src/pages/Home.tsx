import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { track } from "@/lib/analytics";

const UNKNOWNS = [
  "where it originally came from",
  "whether the context was changed",
  "whether the photo is from this event at all",
  "whether the cause was ever established",
  "how far it has drifted from the original",
];

export default function Home() {
  useEffect(() => {
    track("landing_viewed");
  }, []);

  return (
    <PageWrapper>
      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-16 max-w-4xl text-center">
        <p className="font-mono text-xs sm:text-sm tracking-wider text-primary mb-6 uppercase">
          Smart City Hackathon · UNESCO
        </p>
        <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-6">
          Tracing truth through <span className="text-primary">mutation</span>{" "}
          and noise.
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          {strings.product.tagline}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/trace">
            <Button size="lg">
              Trace a claim
              <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
          </Link>
          <Link href="/how-it-works">
            <Button size="lg" variant="outline">
              How it works
            </Button>
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section
        aria-labelledby="problem-heading"
        className="border-t border-border py-16"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            id="problem-heading"
            className="font-serif text-3xl font-bold mb-5"
          >
            A screenshot tells you nothing about where it came from
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-6">
            Most information now arrives stripped of everything you would need
            to weigh it. No author, no date, no outlet, no link — just a message
            forwarded by someone who trusted it. When it reaches you, you have
            no way to know:
          </p>
          <ul className="space-y-2.5 mb-6">
            {UNKNOWNS.map((item) => (
              <li key={item} className="flex gap-3 text-foreground/80">
                <span className="text-primary shrink-0" aria-hidden="true">
                  —
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            "Check the source" is good advice that assumes a source is visible.
            Usually it isn&apos;t.
          </p>
        </div>
      </section>

      {/* Solution */}
      <section
        aria-labelledby="solution-heading"
        className="border-t border-border py-16 bg-muted/20"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            id="solution-heading"
            className="font-serif text-3xl font-bold mb-5"
          >
            Lineage reconstructs the path
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-8">
            Paste the message or upload the screenshot. We work out what claim
            is actually being made, search the live web for leads, and compare
            it with evidence-backed cases. If the origin and changes are
            established, we show the route it travelled. If they are not, we say
            so.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-border rounded-sm p-5 bg-background">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
                A fact checker gives you
              </h3>
              <div className="font-mono text-sm space-y-1.5">
                <p>Claim</p>
                <p className="text-muted-foreground">↓</p>
                <p className="font-bold">Verdict</p>
              </div>
            </div>
            <div className="border border-primary/40 bg-primary/5 rounded-sm p-5">
              <h3 className="font-mono text-xs uppercase tracking-wider text-primary mb-4">
                When established, Lineage gives you
              </h3>
              <div className="font-mono text-sm space-y-1.5">
                <p>Origin</p>
                <p className="text-muted-foreground">↓</p>
                <p>What changed</p>
                <p className="text-muted-foreground">↓</p>
                <p>Evidence</p>
                <p className="text-muted-foreground">↓</p>
                <p className="font-bold">Your judgment</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core statement */}
      <section className="border-t border-border py-20">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <p className="font-mono text-sm text-primary mb-5 uppercase tracking-wider">
            {strings.product.motto}
          </p>
          <blockquote className="font-serif text-2xl sm:text-3xl font-bold leading-snug mb-8">
            We never tell you a claim is false because we have no record of it.
            We show you what we found, what we didn&apos;t, and what we&apos;re
            still unsure about.
          </blockquote>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10">
            The goal isn&apos;t to make you trust us. It&apos;s to make you
            better at reading the next claim without us.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/why-lineage">
              <Button variant="outline">Why we work this way</Button>
            </Link>
            <Link href="/claims">
              <Button>See documented examples</Button>
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
