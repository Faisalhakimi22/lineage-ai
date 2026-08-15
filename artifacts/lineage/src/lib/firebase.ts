import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';

/**
 * Client Firebase configuration.
 *
 * These values identify the project; they do not authorise access. Access is
 * controlled by Firebase security rules and by server-side ID-token
 * verification, so shipping them in the bundle is expected and safe. Nothing
 * secret belongs here.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Sign-in is an optional capability. When the project has not been configured
 * the app must still run as a fully functional public product rather than
 * crashing on a missing key, so this is checked before any Firebase call.
 */
export const firebaseConfigured: boolean = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;

  if (!authInstance) {
    app ??= initializeApp(config);
    authInstance = getAuth(app);
    // Keeps the session across reloads and tabs.
    void setPersistence(authInstance, browserLocalPersistence);
  }

  return authInstance;
}
