import { GeoPoint, Timestamp } from 'firebase/firestore';
import type {
  DeviceRecord,
  PotholeRecord,
  RepairStatus,
  SeverityLevel,
  SystemAlertRecord,
  VerificationStatus,
} from '../types/terra';

function parseIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    const sec = (value as { seconds: number }).seconds;
    const d = new Date(sec * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Handle seconds vs milliseconds
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function parseSeverity(value: unknown): SeverityLevel | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (upper === 'CRITICAL' || upper === 'SEVERE') return 'CRITICAL';
  if (upper === 'HIGH') return 'HIGH';
  if (upper === 'MEDIUM' || upper === 'MODERATE') return 'MEDIUM';
  if (upper === 'LOW' || upper === 'MINOR') return 'LOW';
  return null;
}

function parseRepairStatus(data: Record<string, unknown>): RepairStatus | null {
  if (data.repaired === true || data.isRepaired === true || data.is_repaired === true) {
    return 'REPAIRED';
  }
  const raw = data.repairStatus ?? data.repair_status ?? data.status ?? data.state;
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (upper === 'REPAIRED' || upper === 'FIXED' || upper === 'RESOLVED' || upper === 'COMPLETED') {
    return 'REPAIRED';
  }
  if (upper === 'IN_PROGRESS' || upper === 'ASSIGNED' || upper === 'SCHEDULED' || upper === 'UNDER_REPAIR') {
    return 'IN_PROGRESS';
  }
  if (upper === 'PENDING' || upper === 'OPEN' || upper === 'REPORTED' || upper === 'ACTIVE' || upper === 'DETECTED' || upper === 'UNREPAIRED') {
    return 'PENDING';
  }
  return null;
}

function parseVerification(data: Record<string, unknown>): VerificationStatus {
  if (typeof data.verified === 'boolean') return data.verified;
  if (typeof data.isVerified === 'boolean') return data.isVerified;
  if (typeof data.is_verified === 'boolean') return data.is_verified;

  const statusRaw = data.verificationStatus ?? data.verification_status;
  if (typeof statusRaw === 'string') {
    const upper = statusRaw.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (upper === 'VERIFIED' || upper === 'CONFIRMED' || upper === 'TRUE') return true;
    if (upper === 'NOT_VERIFIED' || upper === 'UNVERIFIED' || upper === 'FALSE' || upper === 'PENDING') {
      return false;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof GeoPoint) && !(value instanceof Timestamp)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractCoordinates(data: Record<string, unknown>): {
  latitude: number | null;
  longitude: number | null;
} {
  const directLat = parseOptionalNumber(data.latitude ?? data.lat);
  const directLng = parseOptionalNumber(data.longitude ?? data.lng ?? data.lon);
  if (directLat !== null && directLng !== null) {
    return { latitude: directLat, longitude: directLng };
  }

  const loc = data.location ?? data.coordinates ?? data.gps ?? data.coords ?? data.position;
  if (loc instanceof GeoPoint) {
    return { latitude: loc.latitude, longitude: loc.longitude };
  }
  const locObj = asRecord(loc);
  if (locObj) {
    const nestedLat = parseOptionalNumber(locObj.latitude ?? locObj.lat ?? locObj._lat);
    const nestedLng = parseOptionalNumber(
      locObj.longitude ?? locObj.lng ?? locObj.lon ?? locObj._long
    );
    return { latitude: nestedLat, longitude: nestedLng };
  }

  return { latitude: directLat, longitude: directLng };
}

function evaluateGpsReliability(
  data: Record<string, unknown>,
  gpsObj: Record<string, unknown> | null,
  latitude: number | null,
  longitude: number | null,
  gpsAccuracy: number | null,
  satellites: number | null
): { gpsReliable: boolean; reason: string | null } {
  if (latitude === null || longitude === null) {
    return { gpsReliable: false, reason: 'Missing GPS coordinates' };
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { gpsReliable: false, reason: 'Coordinates out of valid range' };
  }
  if (latitude === 0 && longitude === 0) {
    return { gpsReliable: false, reason: 'Unfixed GPS origin (0, 0)' };
  }

  const explicitFlags = [
    data.gpsValid,
    data.gps_valid,
    data.gpsReliable,
    data.gps_reliable,
    data.gpsFix,
    data.gps_fix,
    data.hasGpsFix,
    gpsObj?.valid,
    gpsObj?.reliable,
    gpsObj?.fix,
    gpsObj?.hasFix,
  ];
  for (const flag of explicitFlags) {
    if (flag === false) {
      return { gpsReliable: false, reason: 'Device reported unreliable GPS fix' };
    }
  }

  const gpsStatusRaw = parseOptionalString(
    data.gpsStatus ??
      data.gps_status ??
      data.gpsQuality ??
      data.gps_quality ??
      gpsObj?.status ??
      gpsObj?.quality
  );
  if (gpsStatusRaw) {
    const upper = gpsStatusRaw.toUpperCase().replace(/[\s-]+/g, '_');
    if (
      upper === 'NO_FIX' ||
      upper === 'INVALID' ||
      upper === 'UNRELIABLE' ||
      upper === 'WEAK' ||
      upper === 'POOR' ||
      upper === 'SEARCHING' ||
      upper === 'NONE'
    ) {
      return { gpsReliable: false, reason: `GPS status: ${gpsStatusRaw}` };
    }
  }

  if (satellites !== null && satellites < 3) {
    return { gpsReliable: false, reason: `Insufficient satellites (${satellites})` };
  }

  if (gpsAccuracy !== null && gpsAccuracy > 50) {
    return { gpsReliable: false, reason: `Low GPS accuracy (${Math.round(gpsAccuracy)} m)` };
  }

  return { gpsReliable: true, reason: null };
}

/**
 * Normalizes an actual Firestore document into a PotholeRecord without fabricating any
 * missing sensor readings, timestamps, verification status, or coordinates.
 */
export function mapFirestorePotholeDoc(
  docId: string,
  rawData: Record<string, unknown>,
  sourceCollection: 'pothole_events' | 'potholes'
): PotholeRecord | null {
  if (!rawData || typeof rawData !== 'object') return null;

  const gpsObj = asRecord(rawData.gps) ?? asRecord(rawData.location);
  const sensorObj = asRecord(rawData.sensor) ?? asRecord(rawData.telemetry) ?? asRecord(rawData.imu);

  const eventId = parseOptionalString(rawData.eventId ?? rawData.event_id ?? rawData.id) ?? docId;
  const deviceId = parseOptionalString(rawData.deviceId ?? rawData.device_id);
  const { latitude, longitude } = extractCoordinates(rawData);

  const gpsAccuracy = parseOptionalNumber(
    rawData.gpsAccuracy ??
      rawData.gps_accuracy ??
      rawData.hdopAccuracy ??
      rawData.accuracy ??
      gpsObj?.accuracy ??
      gpsObj?.gpsAccuracy
  );
  const satellites = parseOptionalNumber(
    rawData.satellites ??
      rawData.gpsSatellites ??
      rawData.gps_satellites ??
      rawData.satCount ??
      gpsObj?.satellites ??
      gpsObj?.satCount
  );

  const { gpsReliable, reason: gpsUnreliableReason } = evaluateGpsReliability(
    rawData,
    gpsObj,
    latitude,
    longitude,
    gpsAccuracy,
    satellites
  );

  const timestamp = parseIsoTimestamp(
    rawData.timestamp ??
      rawData.createdAt ??
      rawData.created_at ??
      rawData.firstDetectedAt ??
      rawData.first_detected_at ??
      rawData.detectedAt ??
      rawData.detected_at
  );
  const lastDetectedAt =
    parseIsoTimestamp(
      rawData.lastDetectedAt ??
        rawData.last_detected_at ??
        rawData.updatedAt ??
        rawData.updated_at
    ) ?? timestamp;

  const classification = parseOptionalString(rawData.classification ?? rawData.eventType ?? rawData.type);

  // Exclude records explicitly classified as non-potholes while keeping all pothole records
  // (including documents in `potholes` that omit `classification`), regardless of `verified` status.
  if (classification !== null && !classification.toUpperCase().includes('POTHOLE')) {
    return null;
  }

  // Normalize confidence without ever turning null/missing into 0
  let confidence = parseOptionalNumber(
    rawData.confidence ?? rawData.mlConfidence ?? rawData.score ?? sensorObj?.confidence
  );
  if (confidence !== null && confidence > 1 && confidence <= 100) {
    confidence = confidence / 100;
  }

  const severity = parseSeverity(rawData.severity ?? rawData.severityLevel ?? rawData.riskLevel);
  const detectionCount = parseOptionalNumber(
    rawData.detectionCount ?? rawData.detection_count ?? rawData.reportCount ?? rawData.count
  );
  const repairStatus = parseRepairStatus(rawData);
  const verified = parseVerification(rawData);

  const roadName = parseOptionalString(
    rawData.roadName ??
      rawData.road_name ??
      rawData.road ??
      rawData.streetName ??
      rawData.street ??
      rawData.address ??
      rawData.locationName ??
      rawData.location_name
  );
  const municipalZone = parseOptionalString(
    rawData.municipalZone ??
      rawData.municipal_zone ??
      rawData.zone ??
      rawData.ward ??
      rawData.area ??
      rawData.locality ??
      rawData.district
  );

  const peakAcceleration = parseOptionalNumber(
    rawData.peakAcceleration ??
      rawData.peak_acceleration ??
      rawData.peakG ??
      rawData.accelerationZ ??
      rawData.accelZ ??
      rawData.impactG ??
      sensorObj?.peakAcceleration ??
      sensorObj?.peak_acceleration ??
      sensorObj?.peakG ??
      sensorObj?.accelZ ??
      sensorObj?.accelerationZ
  );
  const speedKmh = parseOptionalNumber(
    rawData.speedKmh ?? rawData.speed_kmh ?? rawData.speed ?? gpsObj?.speed ?? sensorObj?.speed
  );
  const depthCm = parseOptionalNumber(
    rawData.depthCm ?? rawData.depth_cm ?? rawData.depth ?? sensorObj?.depth ?? sensorObj?.depthCm
  );

  return {
    eventId,
    sourceCollection,
    deviceId,
    latitude,
    longitude,
    gpsReliable,
    gpsUnreliableReason,
    gpsAccuracy,
    satellites,
    timestamp,
    lastDetectedAt,
    classification,
    confidence,
    severity,
    detectionCount,
    repairStatus,
    verified,
    roadName,
    municipalZone,
    peakAcceleration,
    speedKmh,
    depthCm,
  };
}

export function mapFirestoreDeviceDoc(
  docId: string,
  rawData: Record<string, unknown>
): DeviceRecord {
  return {
    deviceId: parseOptionalString(rawData.deviceId ?? rawData.device_id) ?? docId,
    name: parseOptionalString(rawData.name ?? rawData.label ?? rawData.vehicleName),
    status: parseOptionalString(rawData.status ?? rawData.state),
    lastSeen: parseIsoTimestamp(rawData.lastSeen ?? rawData.last_seen ?? rawData.updatedAt ?? rawData.timestamp),
    gpsFix: parseOptionalBoolean(rawData.gpsFix ?? rawData.gps_fix ?? rawData.gpsValid),
    satellites: parseOptionalNumber(rawData.satellites ?? rawData.gpsSatellites),
    batteryLevel: parseOptionalNumber(rawData.batteryLevel ?? rawData.battery ?? rawData.batteryPercent),
    firmwareVersion: parseOptionalString(rawData.firmwareVersion ?? rawData.firmware),
  };
}

export function mapFirestoreAlertDoc(
  docId: string,
  rawData: Record<string, unknown>
): SystemAlertRecord {
  return {
    alertId: parseOptionalString(rawData.alertId ?? rawData.id) ?? docId,
    title: parseOptionalString(rawData.title ?? rawData.type),
    message: parseOptionalString(rawData.message ?? rawData.description ?? rawData.text),
    severity: parseSeverity(rawData.severity ?? rawData.level),
    active: parseOptionalBoolean(rawData.active ?? rawData.isActive),
    roadName: parseOptionalString(rawData.roadName ?? rawData.road_name ?? rawData.locationName),
    deviceId: parseOptionalString(rawData.deviceId ?? rawData.device_id),
    createdAt: parseIsoTimestamp(rawData.createdAt ?? rawData.timestamp ?? rawData.created_at),
  };
}
