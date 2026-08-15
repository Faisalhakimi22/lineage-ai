import type { ReactNode } from 'react';
import { LogIn, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { strings } from '@/lib/strings';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/button';

/**
 * Gates a protected route.
 *
 * Renders the sign-in prompt in place rather than redirecting. A redirect to a
 * login page and back is where loops come from - especially while auth state is
 * still resolving, when a premature redirect fires before the session is known.
 * Staying on the route means the URL never changes, so there is nothing to loop
 * between, and the user lands exactly where they intended after signing in.
 */
export function RequireAuth({
  children,
  requiresAccount = false,
}: {
  children: ReactNode;
  /**
   * Set for routes that are meaningless without an account - history is
   * per-user, so it has nothing to show a signed-out visitor.
   */
  requiresAccount?: boolean;
}) {
  const { isAuthenticated, loading, configured, signInWithGoogle, error } =
    useAuth();

  /**
   * When no Firebase project is attached there is no way to sign in, so
   * gating the workspace would lock everyone out of the core product to
   * protect a feature (saved history) that does not exist in this build.
   * Degrading to open access is the graceful reading of "handle missing
   * configuration"; the server still refuses history endpoints on its own.
   */
  if (!configured && !requiresAccount) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <PageWrapper>
        <div className="container mx-auto px-4 py-20 max-w-2xl">
          <p className="font-mono text-sm text-muted-foreground" aria-live="polite">
            {strings.auth.checking}
          </p>
        </div>
      </PageWrapper>
    );
  }

  if (isAuthenticated) return <>{children}</>;

  return (
    <PageWrapper>
      <div className="container mx-auto px-4 py-20 max-w-2xl">
        {!configured ? (
          <div className="border border-border rounded-sm p-6">
            <h1 className="font-serif text-2xl font-bold mb-3 flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
              {strings.auth.notConfiguredTitle}
            </h1>
            <p className="text-foreground/80">{strings.auth.notConfiguredBody}</p>
          </div>
        ) : (
          <div className="border border-border rounded-sm p-6">
            <h1 className="font-serif text-2xl font-bold mb-3">
              {strings.auth.requiredTitle}
            </h1>
            <p className="text-foreground/80 mb-6">{strings.auth.requiredBody}</p>

            {error && (
              <div role="alert" className="border-l-4 border-destructive pl-4 py-2 mb-5">
                <p className="text-sm">{error}</p>
              </div>
            )}

            <Button onClick={() => void signInWithGoogle()}>
              <LogIn className="w-4 h-4 mr-2" aria-hidden="true" />
              {strings.auth.signIn}
            </Button>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
