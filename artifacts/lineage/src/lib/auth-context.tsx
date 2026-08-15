import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { firebaseConfigured, getFirebaseAuth } from './firebase';
import { track } from './analytics';
import { strings } from './strings';

export interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  configured: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Maps Firebase's error codes onto messages that explain what happened and
 * what to do about it. A blocked popup and a cancelled sign-in are ordinary
 * user-side situations, not faults, and should not read like crashes.
 */
function describeAuthError(code: string): string | null {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      // The user chose to close it; surfacing an error would be noise.
      return null;
    case 'auth/popup-blocked':
      return strings.auth.errorPopupBlocked;
    case 'auth/network-request-failed':
      return strings.auth.errorNetwork;
    case 'auth/unauthorized-domain':
      return strings.auth.errorUnauthorizedDomain;
    default:
      return strings.auth.errorGeneric;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(
      auth,
      (next) => {
        /**
         * Wipe cached query data whenever the identity behind it changes.
         *
         * History is keyed by endpoint, not by user, so without this a
         * sign-out followed by a different sign-in on the same browser -
         * entirely plausible on a shared demo machine - would serve the
         * previous person's saved analyses from cache while the refetch was
         * still in flight. Clearing on any transition, including to null,
         * means no private data outlives the session that fetched it.
         *
         * Tracked in a ref rather than compared inside the state updater:
         * updaters must stay pure, and React may invoke them more than once.
         */
        if (lastUidRef.current !== (next?.uid ?? null)) {
          lastUidRef.current = next?.uid ?? null;
          queryClient.clear();
        }

        setUser(next);
        setLoading(false);
      },
      () => {
        setError(strings.auth.errorGeneric);
        setLoading(false);
      },
    );
  }, [queryClient]);

  /**
   * Registered once, here. Every generated API hook runs through the shared
   * fetch mutator, so this is the single place a token is ever attached -
   * components never handle tokens themselves.
   *
   * The token is fetched per request rather than cached, so Firebase can
   * refresh it transparently and an expired session recovers without the user
   * noticing.
   */
  useEffect(() => {
    setAuthTokenGetter(async () => {
      const auth = getFirebaseAuth();
      const current = auth?.currentUser;
      if (!current) return null;
      try {
        return await current.getIdToken();
      } catch {
        return null;
      }
    });

    return () => setAuthTokenGetter(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setError(strings.auth.errorNotConfigured);
      return;
    }

    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      track('google_login');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setError(describeAuthError(code));
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
      queryClient.clear();
    } catch {
      setError(strings.auth.errorSignOut);
    }
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAuthenticated: user !== null,
      configured: firebaseConfigured,
      error,
      signInWithGoogle,
      signOut,
      clearError: () => setError(null),
    }),
    [user, loading, error, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
