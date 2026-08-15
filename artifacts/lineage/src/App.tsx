import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/lib/auth-context';
import { RequireAuth } from '@/components/auth/RequireAuth';
import NotFound from '@/pages/NotFound';
import Home from '@/pages/Home';
import HowItWorks from '@/pages/HowItWorks';
import WhyLineage from '@/pages/WhyLineage';
import About from '@/pages/About';
import Claims from '@/pages/Claims';

// The workspace pulls in the result renderer and upload handling, neither of
// which a visitor reading the marketing pages needs. Splitting them keeps the
// public entry payload down, which is where first impressions are made.
const Trace = lazy(() => import('@/pages/Trace'));
const History = lazy(() => import('@/pages/History'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The lineage library is static for the life of a deployment, and
      // history changes only through this tab's own mutations, so refetching
      // on every window focus is pure waste.
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public - readable without an account. */}
      <Route path="/" component={Home} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/why-lineage" component={WhyLineage} />
      <Route path="/about" component={About} />
      <Route path="/claims" component={Claims} />

      {/* Protected - the workspace and anything user-owned. */}
      <Route path="/trace">
        <RequireAuth>
          <Trace />
        </RequireAuth>
      </Route>
      <Route path="/history">
        <RequireAuth requiresAccount>
          <History />
        </RequireAuth>
      </Route>
      <Route path="/history/:id">
        <RequireAuth requiresAccount>
          <History />
        </RequireAuth>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Suspense
              fallback={
                <p className="p-10 font-mono text-sm text-muted-foreground">
                  Loading…
                </p>
              }
            >
              <Router />
            </Suspense>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
