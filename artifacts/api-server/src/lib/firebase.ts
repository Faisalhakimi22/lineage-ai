import { logger } from "./logger";

export interface VerifiedUser {
  userId: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AdminModule {
  apps: unknown[];
  initializeApp: (options?: unknown) => unknown;
  credential: { cert: (serviceAccount: unknown) => unknown; applicationDefault: () => unknown };
  auth: () => {
    verifyIdToken: (token: string) => Promise<{
      uid: string;
      email?: string;
      name?: string;
      picture?: string;
    }>;
  };
  firestore: () => unknown;
}

let adminPromise: Promise<AdminModule | null> | null = null;

/**
 * Server-side Firebase is configured with a service account, supplied either as
 * a JSON blob in FIREBASE_SERVICE_ACCOUNT or via the standard
 * GOOGLE_APPLICATION_CREDENTIALS file path.
 *
 * When neither is present the whole auth subsystem reports itself unconfigured
 * rather than half-working: unauthenticated use of the public product continues
 * to function, and anything requiring identity fails with a clear, specific
 * error instead of silently trusting the client.
 */
/** Whether credentials were supplied, before their validity has been checked. */
export function firebaseCredentialsPresent(): boolean {
  return Boolean(
    process.env["FIREBASE_SERVICE_ACCOUNT"] ||
      process.env["GOOGLE_APPLICATION_CREDENTIALS"],
  );
}

async function loadAdmin(): Promise<AdminModule | null> {
  if (!firebaseCredentialsPresent()) return null;

  try {
    const moduleName = "firebase-admin";
    const imported = (await import(/* @vite-ignore */ moduleName)) as
      | AdminModule
      | { default: AdminModule };
    const admin = "default" in imported ? imported.default : imported;

    if (admin.apps.length === 0) {
      const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
      if (raw) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(raw)),
        });
      } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
      logger.info("Firebase Admin initialised");
    }

    return admin;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Firebase Admin failed to initialise; authenticated features disabled",
    );
    return null;
  }
}

function admin(): Promise<AdminModule | null> {
  adminPromise ??= loadAdmin();
  return adminPromise;
}

/**
 * Checks that Firebase Admin actually initialised. This intentionally differs
 * from merely seeing an environment variable: malformed JSON, a missing
 * credential file, or a broken deployment must not be advertised as ready.
 */
export async function firebaseAvailable(): Promise<boolean> {
  return (await admin()) !== null;
}

/**
 * Verifies a Firebase ID token. Returns null for any failure - expired,
 * malformed, wrong project, or unconfigured - so callers never distinguish
 * between "bad token" and "no token" in a way that leaks information.
 */
export async function verifyIdToken(token: string): Promise<VerifiedUser | null> {
  const sdk = await admin();
  if (!sdk) return null;

  try {
    const decoded = await sdk.auth().verifyIdToken(token);
    return {
      userId: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      photoURL: decoded.picture ?? null,
    };
  } catch {
    // Deliberately not logging the token or the decode error detail.
    return null;
  }
}

export async function firestore(): Promise<unknown | null> {
  const sdk = await admin();
  if (!sdk) return null;
  try {
    return sdk.firestore();
  } catch {
    return null;
  }
}
