import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

/**
 * TERRA Track Rider connects to the existing shared TERRA Track Firebase project
 * (`terra-track-53004`) and its `(default)` Firestore database so ESP32 -> Node.js Backend ->
 * Firestore updates synchronize in real time with the Municipal Web App and Rider App.
 */
export const TARGET_PROJECT_ID = firebaseAppletConfig.projectId || 'terra-track-53004';
export const TARGET_DATABASE_ID = '(default)';

export const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: TARGET_PROJECT_ID,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
};

export interface ConfigPresenceEntry {
  name: string;
  present: boolean;
}

export function getFirebaseConfigStatus(): ConfigPresenceEntry[] {
  const entries: Array<[string, string | undefined]> = [
    ['projectId', firebaseConfig.projectId],
    ['appId', firebaseConfig.appId],
    ['apiKey', firebaseConfig.apiKey],
    ['authDomain', firebaseConfig.authDomain],
    ['storageBucket', firebaseConfig.storageBucket],
    ['messagingSenderId', firebaseConfig.messagingSenderId],
  ];
  return entries.map(([name, val]) => ({
    name,
    present: typeof val === 'string' && val.trim().length > 0,
  }));
}

export const missingConfigKeys = getFirebaseConfigStatus()
  .filter((item) => !item.present)
  .map((item) => item.name);

export const isFirebaseConfigured = missingConfigKeys.length === 0;

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let initErrorMessage: string | null = isFirebaseConfigured
  ? null
  : `Missing required Firebase configuration key(s): ${missingConfigKeys.join(', ')}`;

if (isFirebaseConfigured) {
  try {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(appInstance);
    try {
      dbInstance = initializeFirestore(
        appInstance,
        {
          experimentalAutoDetectLongPolling: true,
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        TARGET_DATABASE_ID
      );
    } catch {
      dbInstance = getFirestore(appInstance, TARGET_DATABASE_ID);
    }
  } catch (error) {
    initErrorMessage =
      error instanceof Error ? error.message : 'Failed to initialize Firebase SDK.';
    appInstance = null;
    authInstance = null;
    dbInstance = null;
  }
}

export const app = appInstance;
export const auth = authInstance;
export const db = dbInstance;
export const firebaseInitError = initErrorMessage;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const currentUser = auth?.currentUser ?? null;
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
}

export function reportFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = reportFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (Firestore client is offline).');
    }
  }
}

void testConnection();
