import { Link } from "wouter";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageWrapper>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="w-20 h-20 bg-muted/60 rounded-2xl flex items-center justify-center mb-6 border border-border/50 shadow-sm">
          <img
            src="/Lineagelogo.png"
            alt="Lineage"
            className="w-12 h-12 object-contain opacity-80"
          />
        </div>
        <h1 className="text-4xl font-serif font-bold text-foreground mb-4">
          Trail Lost
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto mb-8">
          The page you're looking for doesn't exist or has been moved. Let's get you back to the investigation.
        </p>
        <Link href="/">
          <Button size="lg" className="font-serif">
            Return to Base
          </Button>
        </Link>
      </div>
    </PageWrapper>
  );
}