import { Navbar } from "./Navbar";

interface PageWrapperProps {
  children: React.ReactNode;
}

export function PageWrapper({ children }: PageWrapperProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1 flex flex-col relative z-10">
        {children}
      </main>
      <footer className="border-t py-8 mt-auto bg-background/50 relative z-10">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5 font-mono">
            <img
              src="/Lineagelogo.png"
              alt="Lineage"
              className="w-4 h-4 rounded object-contain"
            />
            <span>Lineage System v1.0</span>
          </div>
          <div className="font-serif italic text-center sm:text-right">
            Empowering judgment, not dictating truth.
          </div>
        </div>
      </footer>
    </div>
  );
}