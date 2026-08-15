import { Link } from "wouter";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-16 max-w-3xl w-full">
        <header className="mb-14">
          <p className="font-mono text-sm text-muted-foreground mb-3">
            UNESCO Youth Hackathon 2026 · Media &amp; Information Literacy
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            About this project
          </h1>
          <p className="text-lg text-muted-foreground">
            What we are trying to solve, what we actually built, and what it
            cannot yet do.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold mb-4">The problem</h2>
          <p className="text-foreground/80 leading-relaxed mb-4">
            Information now reaches most people stripped of everything that
            would let them evaluate it. A screenshot of a screenshot has no
            author, no date, no outlet and no link. By the time it arrives in a
            group chat, the one thing you cannot recover is the one thing you
            need: where it came from.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Advice like "check the source" assumes a source is visible. Usually
            it isn't. That is the gap this project is aimed at.
          </p>
        </section>

        <section className="mb-12 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-4">
            Why provenance matters more than verdicts
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4">
            Claims are rarely wholly true or wholly false. Far more often
            something real has been altered — the scale inflated, the date
            dropped, a cause supplied that no investigator proposed, a genuine
            photograph attached to an unrelated event.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            A single label cannot describe that. A path can. Showing the path
            also teaches a pattern that transfers to the next claim, which a
            verdict never does.
          </p>
        </section>

        <section className="mb-12 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-4">
            What AI does here — and what it doesn't
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4">
            AI does two jobs. It reads messy forwarded text and works out what
            the underlying claim is, and it recognises that a reworded claim is
            the same claim. Both are genuine language problems where models are
            good and where a mistake is recoverable — the worst case is that we
            match the wrong record, which you can see and dismiss.
          </p>
          <p className="text-foreground/80 leading-relaxed mb-4">
            AI does not decide what is true, does not write the correction
            wording, and never supplies an origin, a date or a source. Every
            established provenance claim comes from a human-reviewed record with
            linked evidence. Live-search results appear separately as leads to
            inspect, never as an automated finding.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            The system also runs without any AI at all. With no API key
            configured it falls back to deterministic text comparison, reports
            lower confidence, and tells you it did so. We would rather be
            visibly less capable than invisibly unreliable.
          </p>
        </section>

        <section className="mb-12 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-4">
            Why we make uncertainty visible
          </h2>
          <p className="text-foreground/80 leading-relaxed">
            Every result separates what we found, what we looked for and did not
            find, and what remains uncertain. A tool built to fight
            overconfident claims cannot itself be overconfident. If we are
            unsure, the interface says so, in words, before it says anything
            else.
          </p>
        </section>

        <section className="mb-12 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-4">
            What this prototype is, precisely
          </h2>

          <div className="grid sm:grid-cols-2 gap-5 mb-6">
            <div className="border border-border rounded-sm p-5">
              <h3 className="font-mono text-xs uppercase tracking-wider text-primary mb-3">
                Built and working today
              </h3>
              <ul className="text-sm text-foreground/80 space-y-2">
                <li>
                  2 externally verified cases and 15 clearly labelled
                  illustrative teaching records
                </li>
                <li>Claim extraction from text and from screenshots</li>
                <li>Layered matching with deterministic fallback</li>
                <li>Live web source-lead discovery when a search key is set</li>
                <li>
                  A source-backed mutation map for the fully documented blackout
                  case
                </li>
                <li>Contextual self-verification guidance</li>
                <li>Saved history for signed-in users</li>
              </ul>
            </div>

            <div className="border border-dashed border-border rounded-sm p-5">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
                Not built — future infrastructure
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>Automated verification of live-search leads</li>
                <li>Automated provenance discovery</li>
                <li>Reverse image search integration</li>
                <li>Automatic mutation-chain construction</li>
                <li>A verified-source partner network</li>
              </ul>
            </div>
          </div>

          <p className="text-foreground/80 leading-relaxed mb-4">
            We want to be exact about this, because overstating it would be the
            same failure the product exists to oppose. Lineage cannot currently
            trace an arbitrary claim from the internet. It can establish a
            lineage only when a submission matches an externally verified case.
            Illustrative matches and everything outside that evidence set come
            back untraced.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Two of those seventeen are externally verified cases. The other
            fifteen are illustrative — realistic mutation patterns we
            constructed to demonstrate the concept, grounded in real subject
            matter but not the product of independent investigation. Every
            record is labelled, in the data and in the interface, and we never
            present the illustrative ones as documented investigations.
          </p>
        </section>

        <section className="mb-12 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-4">The goal</h2>
          <p className="text-foreground/80 leading-relaxed">
            The measure of success for this project is not how much people trust
            Lineage. It is whether someone who has read a few mutation chains
            starts asking, unprompted, where a claim came from and what changed
            on the way. If that happens, they need the tool less — which is the
            point.
          </p>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border pt-10">
          <Link href="/why-lineage">
            <Button variant="outline">The philosophy</Button>
          </Link>
          <Link href="/claims">
            <Button>See the documented examples</Button>
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
