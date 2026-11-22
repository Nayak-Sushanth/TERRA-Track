/**
 * Phase 0: Payload-First Security TDD specification for TERRA Track Rider Firestore rules.
 * Run against the Firebase Emulator Suite (`@firebase/rules-unit-testing`) when verifying locally.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  actor: 'unauthenticated' | 'rider' | 'spoofedAdmin';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated single read on pothole_events',
    actor: 'unauthenticated',
    operation: 'get',
    path: 'pothole_events/EVT-001',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unauthenticated collection list on pothole_events',
    actor: 'unauthenticated',
    operation: 'list',
    path: 'pothole_events',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Rider forging a pothole record',
    actor: 'rider',
    operation: 'create',
    path: 'pothole_events/FAKE-001',
    payload: { eventId: 'FAKE-001', severity: 'CRITICAL', repairStatus: 'PENDING' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Rider modifying verification or repairStatus on a pothole',
    actor: 'rider',
    operation: 'update',
    path: 'pothole_events/EVT-001',
    payload: { verified: true, repairStatus: 'REPAIRED' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Rider deleting a pothole record',
    actor: 'rider',
    operation: 'delete',
    path: 'pothole_events/EVT-001',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Rider creating a forged ESP32 device document',
    actor: 'rider',
    operation: 'create',
    path: 'devices/ESP32-FAKE',
    payload: { deviceId: 'ESP32-FAKE', status: 'ONLINE' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Rider reading another rider PII profile',
    actor: 'rider',
    operation: 'get',
    path: 'users/other-rider-uid',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Rider listing all user profiles',
    actor: 'rider',
    operation: 'list',
    path: 'users',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Rider self-assigning admin role',
    actor: 'rider',
    operation: 'create',
    path: 'users/rider-1',
    payload: { uid: 'rider-1', role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Rider injecting shadow field into profile',
    actor: 'rider',
    operation: 'update',
    path: 'users/rider-1',
    payload: { uid: 'rider-1', role: 'rider', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Resource poisoning with oversized document ID',
    actor: 'rider',
    operation: 'create',
    path: `users/${'a'.repeat(200)}`,
    payload: { uid: 'a'.repeat(200), role: 'rider' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unverified email spoofing admin email on write',
    actor: 'spoofedAdmin',
    operation: 'create',
    path: 'pothole_events/SPOOF-1',
    payload: { eventId: 'SPOOF-1', severity: 'HIGH', repairStatus: 'PENDING' },
    expected: 'PERMISSION_DENIED',
  },
];
