import { Link } from "wouter";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: "01",
    title: "Submit",
    body: "Paste a message, a post, or a forward — or upload a screenshot. Most misinformation reaches people as an image of text rather than text itself, so we read screenshots too, using OCR that runs on our server.",
  },
  {
    n: "02",
    title: "Understand",
    body: "Forwarded messages are messy. They carry reactions, urgency, emoji and commentary wrapped around the actual assertion. The first thing we do is separate the claim from the packaging, and restate it plainly, so that two differently-worded versions of the same claim end up looking the same.",
  },
  {
    n: "03",
    title: "Trace",
    body: "We search the live web for source leads and compare the claim with our externally verified cases. Illustrative teaching records may surface as leads, but they can never establish a lineage.",
  },
  {
    n: "04",
    title: "Inspect",
    body: "If the evidence establishes a lineage, we show the whole path. Select any node to see its source, date, what changed, and the evidence. Missing fields say not established.",
  },
  {
    n: "05",
    title: "Judge",
    body: "We stop there, deliberately. You get the established stages, the missing stages, the source leads, and an honest account of uncertainty. The conclusion is yours to draw.",
  },
];

export default function HowItWorks() {
  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-16 max-w-3xl w-full">
        <header className="mb-14">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            How Lineage works
          </h1>
          <p className="text-lg text-muted-foreground">
            Five steps, from a message someone forwarded you to a decision you
            make yourself.
          </p>
        </header>

        <ol className="space-y-10 mb-16">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-6">
              <span
                className="font-mono text-sm text-primary shrink-0 pt-1"
                aria-hidden="true"
              >
                {step.n}
              </span>
              <div>
                <h2 className="font-serif text-2xl font-bold mb-2">
                  {step.title}
                </h2>
                <p className="text-foreground/80 leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <section className="border-t border-border pt-10 mb-12">
          <h2 className="font-serif text-2xl font-bold mb-4">
            What a mutation chain is
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-5">
            Almost no misinformation is invented from nothing. It usually starts
            with something real, and then changes a little at each retelling — a
            detail dropped here, a cause added there, an old photo attached as
            proof. Each of those steps is small enough to seem harmless. Stacked
            together, they produce something the original event would not
            recognise.
          </p>
          <p className="text-foreground/80 leading-relaxed mb-6">
            A mutation chain is that sequence, written down. Reading one is
            usually more useful than being told a verdict, because it shows you
            the specific move that did the damage — and that move is one you
            will recognise next time, in a completely different story.
          </p>

          <div className="border border-border rounded-sm p-5 font-mono text-sm space-y-2 bg-muted/30">
            <p>A nationwide blackout happens.</p>
            <p className="text-muted-foreground">↓ a cause is invented</p>
            <p>Posts claim sanctions caused it.</p>
            <p className="text-muted-foreground">↓ old footage is attached</p>
            <p>Unrelated 2020 video circulates as proof.</p>
          </div>
        </section>

        <section className="border-t border-border pt-10 mb-12">
          <h2 className="font-serif text-2xl font-bold mb-4">
            When we don't know
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4">
            Our library is small and hand-built. Most claims you could type in
            are not in it. When that happens we say so plainly — we return{" "}
            <strong>untraced</strong>, which means{" "}
            <em>we have no record of this</em>, and nothing more than that.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            It does not mean the claim is false. A tool that quietly turned
            "unknown" into "false" would be teaching you the exact habit that
            makes misinformation work. Instead we hand back a short list of
            checks you can run yourself, chosen for the kind of claim you
            submitted.
          </p>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border pt-10">
          <Link href="/claims">
            <Button variant="outline">See documented examples</Button>
          </Link>
          <Link href="/trace">
            <Button>Trace something</Button>
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
