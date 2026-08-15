import { Link } from "wouter";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";

export default function WhyLineage() {
  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-16 max-w-3xl w-full">
        <header className="mb-14">
          <p className="font-mono text-sm text-primary mb-3">
            {strings.product.motto}
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Why Lineage works differently
          </h1>
          <p className="text-lg text-muted-foreground">
            {strings.product.tagline}
          </p>
        </header>

        <section className="mb-14">
          <h2 className="font-serif text-2xl font-bold mb-5">
            Two different shapes
          </h2>

          <div className="grid sm:grid-cols-2 gap-5 mb-6">
            <div className="border border-border rounded-sm p-5">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
                Traditional fact check
              </h3>
              <div className="font-mono text-sm space-y-1.5">
                <p>Claim</p>
                <p className="text-muted-foreground">↓</p>
                <p className="font-bold">Verdict</p>
              </div>
              <p className="text-sm text-foreground/70 mt-5">
                Two steps. The reasoning happened somewhere you cannot see, and
                what reaches you is the conclusion.
              </p>
            </div>

            <div className="border border-primary/40 bg-primary/5 rounded-sm p-5">
              <h3 className="font-mono text-xs uppercase tracking-wider text-primary mb-4">
                Lineage
              </h3>
              <div className="font-mono text-sm space-y-1.5">
                <p>Claim</p>
                <p className="text-muted-foreground">↓</p>
                <p>Origin</p>
                <p className="text-muted-foreground">↓</p>
                <p>Mutation</p>
                <p className="text-muted-foreground">↓</p>
                <p>Mutation</p>
                <p className="text-muted-foreground">↓</p>
                <p>Current version</p>
                <p className="text-muted-foreground">↓</p>
                <p>Evidence</p>
                <p className="text-muted-foreground">↓</p>
                <p className="font-bold">Your judgment</p>
              </div>
            </div>
          </div>

          <p className="text-foreground/80 leading-relaxed">
            Verdicts are not useless — but they are fragile. They ask you to
            transfer trust from a stranger who sent you a message to a stranger
            who runs a fact-checking service, and they teach you nothing you can
            use on the next claim. If you already doubt the institution issuing
            the verdict, it does not land at all.
          </p>
        </section>

        <section className="mb-14 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-5">
            Showing the path is more durable
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4">
            A mutation chain does not ask for trust in the same way. It says:
            here is what happened, here is what changed, here is the evidence
            for each step — check it yourself. You can disagree with our
            conclusion and still learn something from the path.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            It also transfers. Once you have seen how a real event acquires an
            invented cause, or how a genuine photograph becomes false evidence
            purely by being placed beside an unrelated claim, you start noticing
            those moves everywhere. That is the actual goal: not to be believed,
            but to be needed less over time.
          </p>
        </section>

        <section className="mb-14 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-5">
            Never blame the messenger
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4">
            Most misinformation arrives from someone you know and trust — a
            parent, a colleague, a group chat. They are not lying to you. They
            were shown something convincing and passed it on, which is what
            people do with information that seems to matter.
          </p>
          <p className="text-foreground/80 leading-relaxed mb-4">
            So Lineage never says <em>you shared misinformation</em> or{" "}
            <em>your friend lied</em>. Every explanation we produce is about
            what happened to the <em>information</em>, not about the character
            of whoever forwarded it. When we hand you wording to reply with, it
            is written to be safe to send to your own family.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            This is not only politeness. Corrections that carry an accusation
            get rejected, and the person defends the claim instead of
            reconsidering it. Blame is also simply ineffective.
          </p>
          <p className="text-sm text-muted-foreground mt-5 border-l-2 border-border pl-4">
            That wording is generated from fixed templates, never by a language
            model — so its tone cannot drift. It is one of the few places in the
            product where we deliberately do not use AI.
          </p>
        </section>

        <section className="mb-12 border-t border-border pt-10">
          <h2 className="font-serif text-2xl font-bold mb-5">
            What we refuse to do
          </h2>
          <ul className="space-y-3 text-foreground/80">
            <li className="flex gap-3">
              <span className="text-primary shrink-0" aria-hidden="true">
                —
              </span>
              <span>
                Call something false because we have no record of it. Absence of
                a lineage is absence of a lineage.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary shrink-0" aria-hidden="true">
                —
              </span>
              <span>
                Present a guess as a finding. When the evidence is incomplete we
                say the lineage is not established, and explain what is missing.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary shrink-0" aria-hidden="true">
                —
              </span>
              <span>
                Let a language model invent an origin, a date, or a source. It
                helps us read claims; it never supplies facts.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary shrink-0" aria-hidden="true">
                —
              </span>
              <span>
                Dress up our own teaching examples as independent
                investigations. Every record says which it is.
              </span>
            </li>
          </ul>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border pt-10">
          <Link href="/about">
            <Button variant="outline">About the project</Button>
          </Link>
          <Link href="/trace">
            <Button>Trace something</Button>
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
