export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RepairStatus = 'PENDING' | 'IN_PROGRESS' | 'REPAIRED';

export type VerificationStatus = true | false | null;

export interface PotholeRecord {
  eventId: string;
  sourceCollection: 'pothole_events' | 'potholes';
  deviceId: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsReliable: boolean;
  gpsUnreliableReason: string | null;
  gpsAccuracy: number | null;
  satellites: number | null;
  timestamp: string | null;
  lastDetectedAt: string | null;
  classification: string | null;
  confidence: number | null;
  severity: SeverityLevel | null;
  detectionCount: number | null;
  repairStatus: RepairStatus | null;
  verified: VerificationStatus;
  roadName: string | null;
  municipalZone: string | null;
  peakAcceleration: number | null;
  speedKmh: number | null;
  depthCm: number | null;
}

export interface DeviceRecord {
  deviceId: string;
  name: string | null;
  status: string | null;
  lastSeen: string | null;
  gpsFix: boolean | null;
  satellites: number | null;
  batteryLevel: number | null;
  firmwareVersion: string | null;
}

export interface SystemAlertRecord {
  alertId: string;
  title: string | null;
  message: string | null;
  severity: SeverityLevel | null;
  active: boolean | null;
  roadName: string | null;
  deviceId: string | null;
  createdAt: string | null;
}

export interface RiderPosition {
  latitude: number;
  longitude: number;
  speedMps: number | null;
  heading: number | null;
  accuracyMeters: number | null;
  updatedAt: number;
}

export type GpsState = 'initializing' | 'active' | 'denied' | 'timeout' | 'unavailable' | 'unsupported';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

export interface AlertSettings {
  enabled: boolean;
  enabledSeverities: SeverityLevel[];
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  cooldownMinutes: 5 | 10 | 30;
  distanceMultiplier: number;
}

export interface ActiveRideAlert {
  potholeId: string;
  severity: SeverityLevel;
  distanceMeters: number;
  roadName: string;
  directionKnown: boolean;
  triggerDistanceMeters: number;
  baseDistanceMeters: number;
  speedBonusMeters: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteModel {
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  source: 'simulated';
}

export interface RouteHazard {
  id: string;
  severity: SeverityLevel | null;
  roadName: string;
  distanceFromRouteMeters: number;
  distanceAlongRouteMeters: number;
  pothole: PotholeRecord;
}

export interface AffectedSection {
  roadName: string;
  hazardCount: number;
  highestSeverity: SeverityLevel | null;
  startDistanceMeters: number;
  endDistanceMeters: number;
  hazardIds: string[];
}

export interface RouteAnalysis {
  hazards: RouteHazard[];
  totalCount: number;
  severityCounts: Record<SeverityLevel, number>;
  affectedSections: AffectedSection[];
  bufferMeters: number;
}

export interface QueryCheckSummary {
  ok: boolean;
  count: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SampleDocSchema {
  id: string;
  collection: string;
  fields: { name: string; type: string }[];
}

export interface DiagnosticsResult {
  ranAt: number;
  projectId: string;
  databaseId: string;
  uid: string;
  navigatorOnLine: boolean;
  unfilteredQuery: QueryCheckSummary;
  filteredQuery: QueryCheckSummary;
  devicesQuery: QueryCheckSummary;
  alertsQuery: QueryCheckSummary;
  sampleDocSchemas: SampleDocSchema[];
}

export interface DeploymentCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface DeploymentCheckResult {
  ranAt: number;
  items: DeploymentCheckItem[];
  configKeys: { name: string; present: boolean }[];
  passedCount: number;
  totalCount: number;
}

export class RepositoryError extends Error {
  code: string;
  rawCode?: string;

  constructor(code: string, message: string, rawCode?: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.rawCode = rawCode;
  }
}
