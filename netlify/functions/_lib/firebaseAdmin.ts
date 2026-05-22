import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialise the Firebase Admin SDK once per cold start.
// The service-account JSON is provided as a single-line env var on Netlify:
//   FIREBASE_SERVICE_ACCOUNT = '{"type":"service_account", ...}'
let initialised = false;

export function getDb() {
  if (!initialised && getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
    initialised = true;
  }
  return getFirestore();
}

export { FieldValue };
