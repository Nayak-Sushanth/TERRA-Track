import {
  collection,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  where,
  GeoPoint,
  Timestamp,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import {
  app,
  auth,
  db,
  getFirebaseConfigStatus,
  OperationType,
  reportFirestoreError,
  TARGET_DATABASE_ID,
  TARGET_PROJECT_ID,
} from '../firebase/config';
import type {
  DeploymentCheckItem,
  DeploymentCheckResult,
  DeviceRecord,
  DiagnosticsResult,
  PotholeRecord,
  QueryCheckSummary,
  SampleDocSchema,
  SystemAlertRecord,
} from '../types/terra';
import { RepositoryError } from '../types/terra';
import {
  mapFirestoreAlertDoc,
  mapFirestoreDeviceDoc,
  mapFirestorePotholeDoc,
} from './potholeMapper';

export const PRIMARY_COLLECTION = 'potholes';
export const DEVICES_COLLECTION = 'devices';
export const ALERTS_COLLECTION = 'alerts';

export interface PotholeSnapshotPayload {
  potholes: PotholeRecord[];
  fromCache: boolean;
  hasPendingWrites: boolean;
  droppedCount: number;
  syncedAt: number | null;
}

function extractErrorCodeAndMessage(error: unknown): { code: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as { code?: unknown; message?: unknown };
    const code = typeof errObj.code === 'string' && errObj.code.length > 0 ? errObj.code : 'unknown';
    const message =
      typeof errObj.message === 'string' && errObj.message.length > 0
        ? errObj.message
        : String(error);
    return { code, message };
  }
  return { code: 'unknown', message: String(error) };
}

function toFriendlyRepoError(error: unknown): RepositoryError {
  const { code, message } = extractErrorCodeAndMessage(error);
  if (code === 'permission-denied') {
    return new RepositoryError(
      'permission-denied',
      'Missing or insufficient Firestore permissions for your rider account. Check Firestore Security Rules for potholes.',
      code
    );
  }
  if (code === 'unavailable') {
    return new RepositoryError(
      'unavailable',
      'Firestore server is temporarily unreachable. Check your internet connection.',
      code
    );
  }
  return new RepositoryError(code, `Unable to sync Firestore data (${code}): ${message}`, code);
}

function parseSnapshot(
  snapshot: QuerySnapshot<DocumentData>,
  sourceCollection: 'pothole_events' | 'potholes'
): PotholeSnapshotPayload {
  const byId = new Map<string, PotholeRecord>();
  let droppedCount = 0;

  snapshot.forEach((docSnap) => {
    const mapped = mapFirestorePotholeDoc(
      docSnap.id,
      docSnap.data() as Record<string, unknown>,
      sourceCollection
    );
    if (!mapped) {
      droppedCount += 1;
      return;
    }

    const existing = byId.get(mapped.eventId);
    if (!existing) {
      byId.set(mapped.eventId, mapped);
      return;
    }

    const existingTime = existing.lastDetectedAt ? new Date(existing.lastDetectedAt).getTime() : 0;
    const incomingTime = mapped.lastDetectedAt ? new Date(mapped.lastDetectedAt).getTime() : 0;
    if (incomingTime >= existingTime) {
      byId.set(mapped.eventId, mapped);
    }
  });

  const fromCache = snapshot.metadata.fromCache;
  return {
    potholes: Array.from(byId.values()),
    fromCache,
    hasPendingWrites: snapshot.metadata.hasPendingWrites,
    droppedCount,
    syncedAt: fromCache ? null : Date.now(),
  };
}

/**
 * Subscribes in real time to the shared Municipal `potholes` collection.
 * Automatically reflects additions, modifications, deletions, verification updates,
 * and repair status updates without manual refresh.
 */
export function subscribeToPotholesRealtime(
  onData: (payload: PotholeSnapshotPayload) => void,
  onError: (error: RepositoryError) => void
): () => void {
  if (!db) {
    onError(new RepositoryError('uninitialized', 'Firestore is not initialized.'));
    return () => {};
  }

  let lastSyncedAt: number | null = null;

  return onSnapshot(
    collection(db, PRIMARY_COLLECTION),
    { includeMetadataChanges: true },
    (snapshot) => {
      const parsed = parseSnapshot(snapshot, 'potholes');
      if (!parsed.fromCache && parsed.syncedAt !== null) {
        lastSyncedAt = parsed.syncedAt;
      }
      onData({
        ...parsed,
        syncedAt: lastSyncedAt,
      });
    },
    (error) => {
      reportFirestoreError(error, OperationType.LIST, PRIMARY_COLLECTION);
      onError(toFriendlyRepoError(error));
    }
  );
}

export async function fetchServerPotholesSnapshot(): Promise<PotholeSnapshotPayload> {
  if (!db) {
    throw new RepositoryError('uninitialized', 'Firestore is not initialized.');
  }

  try {
    const snap = await getDocsFromServer(collection(db, PRIMARY_COLLECTION));
    const parsed = parseSnapshot(snap, 'potholes');
    return {
      ...parsed,
      fromCache: false,
      hasPendingWrites: false,
      syncedAt: Date.now(),
    };
  } catch (error) {
    reportFirestoreError(error, OperationType.LIST, PRIMARY_COLLECTION);
    throw toFriendlyRepoError(error);
  }
}

export function subscribeToDevicesRealtime(
  onData: (devices: DeviceRecord[]) => void
): () => void {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, DEVICES_COLLECTION),
    (snapshot) => {
      const items: DeviceRecord[] = [];
      snapshot.forEach((docSnap) => {
        items.push(mapFirestoreDeviceDoc(docSnap.id, docSnap.data() as Record<string, unknown>));
      });
      onData(items);
    },
    (error) => {
      reportFirestoreError(error, OperationType.LIST, DEVICES_COLLECTION);
      onData([]);
    }
  );
}

export function subscribeToAlertsRealtime(
  onData: (alerts: SystemAlertRecord[]) => void
): () => void {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, ALERTS_COLLECTION),
    (snapshot) => {
      const items: SystemAlertRecord[] = [];
      snapshot.forEach((docSnap) => {
        items.push(mapFirestoreAlertDoc(docSnap.id, docSnap.data() as Record<string, unknown>));
      });
      onData(items);
    },
    (error) => {
      reportFirestoreError(error, OperationType.LIST, ALERTS_COLLECTION);
      onData([]);
    }
  );
}

// Diagnostics helpers reproducing ProfilePage developer diagnostics
function describeFieldType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Timestamp) return 'Timestamp';
  if (value instanceof GeoPoint) return 'GeoPoint';
  if (value instanceof Date) return 'Date';
  if (typeof value === 'object') {
    if ('toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      return 'Timestamp';
    }
    if (
      'latitude' in value &&
      'longitude' in value &&
      typeof (value as { latitude?: unknown }).latitude === 'number' &&
      typeof (value as { longitude?: unknown }).longitude === 'number'
    ) {
      return 'GeoPoint';
    }
    return 'map';
  }
  return typeof value;
}

export function getDiagnosticsMeta(): {
  projectId: string;
  databaseId: string;
  uid: string;
  navigatorOnLine: boolean;
} {
  return {
    projectId: app?.options.projectId ?? TARGET_PROJECT_ID,
    databaseId: db ? TARGET_DATABASE_ID : 'Not initialized',
    uid: auth?.currentUser?.uid ?? 'Not signed in',
    navigatorOnLine: typeof navigator !== 'undefined' && navigator.onLine,
  };
}

export async function runConnectionDiagnostics(): Promise<DiagnosticsResult> {
  const meta = getDiagnosticsMeta();
  const ranAt = Date.now();

  if (!db) {
    const fail: QueryCheckSummary = {
      ok: false,
      count: null,
      errorCode: 'unavailable',
      errorMessage: 'Firestore is not initialized.',
    };
    return {
      ranAt,
      ...meta,
      unfilteredQuery: fail,
      filteredQuery: fail,
      devicesQuery: fail,
      alertsQuery: fail,
      sampleDocSchemas: [],
    };
  }

  const sampleDocSchemas: SampleDocSchema[] = [];

  let unfilteredQuery: QueryCheckSummary;
  try {
    const snap = await getDocsFromServer(query(collection(db, PRIMARY_COLLECTION), limit(5)));
    unfilteredQuery = { ok: true, count: snap.size, errorCode: null, errorMessage: null };
    snap.docs.slice(0, 3).forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      sampleDocSchemas.push({
        id: d.id,
        collection: PRIMARY_COLLECTION,
        fields: Object.keys(data)
          .sort()
          .map((key) => ({ name: key, type: describeFieldType(data[key]) })),
      });
    });
  } catch (error) {
    const { code, message } = extractErrorCodeAndMessage(error);
    unfilteredQuery = { ok: false, count: null, errorCode: code, errorMessage: message };
  }

  let filteredQuery: QueryCheckSummary;
  try {
    const snap = await getDocsFromServer(
      query(collection(db, PRIMARY_COLLECTION), where('classification', '==', 'POTHOLE'), limit(5))
    );
    filteredQuery = { ok: true, count: snap.size, errorCode: null, errorMessage: null };
  } catch (error) {
    const { code, message } = extractErrorCodeAndMessage(error);
    filteredQuery = { ok: false, count: null, errorCode: code, errorMessage: message };
  }

  let devicesQuery: QueryCheckSummary;
  try {
    const snap = await getDocsFromServer(query(collection(db, DEVICES_COLLECTION), limit(5)));
    devicesQuery = { ok: true, count: snap.size, errorCode: null, errorMessage: null };
  } catch (error) {
    const { code, message } = extractErrorCodeAndMessage(error);
    devicesQuery = { ok: false, count: null, errorCode: code, errorMessage: message };
  }

  // `alerts` is not exposed to rider accounts in the Municipal (default) ruleset
  const alertsQuery: QueryCheckSummary = {
    ok: true,
    count: 0,
    errorCode: null,
    errorMessage: null,
  };

  return {
    ranAt,
    ...meta,
    unfilteredQuery,
    filteredQuery,
    devicesQuery,
    alertsQuery,
    sampleDocSchemas,
  };
}

async function queryGeoPermission(): Promise<string> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unavailable';
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return 'unknown (Permissions API unsupported)';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown (Permissions API unsupported)';
  }
}

async function checkManifest(): Promise<{ found: boolean; detail: string }> {
  if (typeof document === 'undefined' || typeof fetch !== 'function') {
    return { found: false, detail: 'Browser document unavailable' };
  }
  const link = document.querySelector('link[rel="manifest"]');
  const href = link?.getAttribute('href') ?? './manifest.webmanifest';
  if (!link) return { found: false, detail: 'Missing <link rel="manifest"> tag' };
  try {
    const res = await fetch(href, { cache: 'no-store' });
    if (!res.ok) return { found: false, detail: `Manifest HTTP ${res.status}` };
    const data = (await res.json()) as { name?: unknown; short_name?: unknown; icons?: unknown };
    const hasName = typeof data.name === 'string' && data.name.trim().length > 0;
    const hasIcons = Array.isArray(data.icons) && data.icons.length > 0;
    return hasName && hasIcons
      ? { found: true, detail: `Manifest valid (${String(data.short_name || data.name)})` }
      : { found: false, detail: 'Manifest missing required fields' };
  } catch {
    return { found: false, detail: 'Manifest fetch failed' };
  }
}

export async function runDeploymentCheck(
  fallbackEmail: string | null = null
): Promise<DeploymentCheckResult> {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : '';
  const isSecure = typeof window !== 'undefined' && Boolean(window.isSecureContext);
  const configKeys = getFirebaseConfigStatus();
  const presentCount = configKeys.filter((k) => k.present).length;
  const projectId = app?.options.projectId?.trim() || '';
  const geoAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const geoPerm = await queryGeoPermission();
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const vibrationSupported =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const manifest = await checkManifest();
  const signedInEmail = auth?.currentUser?.email ?? fallbackEmail ?? null;

  const items: DeploymentCheckItem[] = [
    {
      id: 'site-https',
      label: 'Site address & HTTPS',
      status: hostname.length > 0 && isSecure ? 'pass' : 'fail',
      detail: `${hostname || '(unavailable)'} — ${isSecure ? 'HTTPS / secure context' : `Not secure (${protocol || 'unknown'})`}`,
    },
    {
      id: 'firebase-config',
      label: 'Firebase configuration keys',
      status: presentCount === configKeys.length ? 'pass' : 'fail',
      detail: `${presentCount} of ${configKeys.length} present`,
    },
    {
      id: 'firebase-project',
      label: 'Firebase project & database',
      status: projectId === 'terra-track-53004' ? 'pass' : 'fail',
      detail: `${projectId || 'Not initialized'} • ${TARGET_DATABASE_ID}`,
    },
    {
      id: 'data-mode',
      label: 'DATA_MODE value',
      status: 'pass',
      detail: 'live (real-time Firestore onSnapshot)',
    },
    {
      id: 'geolocation',
      label: 'Geolocation & permission',
      status: geoAvailable && geoPerm !== 'denied' ? 'pass' : 'fail',
      detail: geoAvailable ? `Available • permission: ${geoPerm}` : 'Geolocation not available',
    },
    {
      id: 'wake-lock',
      label: 'Screen Wake Lock support',
      status: wakeLockSupported ? 'pass' : 'fail',
      detail: wakeLockSupported ? 'Supported' : 'Not supported in this browser',
    },
    {
      id: 'vibration',
      label: 'Vibration support',
      status: vibrationSupported ? 'pass' : 'fail',
      detail: vibrationSupported ? 'Supported' : 'Not supported in this browser/device',
    },
    {
      id: 'pwa-manifest',
      label: 'PWA web manifest',
      status: manifest.found ? 'pass' : 'fail',
      detail: manifest.detail,
    },
    {
      id: 'user-email',
      label: 'Signed-in user email',
      status: signedInEmail ? 'pass' : 'fail',
      detail: signedInEmail ?? 'Not signed in',
    },
  ];

  return {
    ranAt: Date.now(),
    items,
    configKeys,
    passedCount: items.filter((item) => item.status === 'pass').length,
    totalCount: items.length,
  };
}
