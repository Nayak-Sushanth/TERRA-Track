import type {
  AffectedSection,
  PotholeRecord,
  RouteAnalysis,
  RouteHazard,
  RouteModel,
  RoutePoint,
  SeverityLevel,
} from '../types/terra';
import {
  formatRoadName,
  haversineDistanceMeters,
  initialBearingDeg,
  projectCoordinate,
} from './geo';
import { getSeverityRank, isActiveHazard } from './severity';

const DEFAULT_SPEED_MPS = 40 / 3.6;
const DEMO_ROUTE_OFFSETS = [10, 25, 80];
const TAIL_EXTENSION_METERS = 300;
const METERS_PER_DEG_LAT = 111320;

function computePathLengthMeters(points: RoutePoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const seg = haversineDistanceMeters(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
    if (Number.isFinite(seg)) total += seg;
  }
  return total;
}

function pointToSegmentDistanceMeters(
  lat: number,
  lng: number,
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const avgLatRad = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.max(0.01, Math.cos(avgLatRad));
  const dx = (lng2 - lng1) * metersPerDegLng;
  const dy = (lat2 - lat1) * METERS_PER_DEG_LAT;
  const px = (lng - lng1) * metersPerDegLng;
  const py = (lat - lat1) * METERS_PER_DEG_LAT;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq)) : 0;
  return haversineDistanceMeters(lat, lng, lat1 + t * (lat2 - lat1), lng1 + t * (lng2 - lng1));
}

export async function getPointToPointRoute(
  origin: RoutePoint,
  destination: RoutePoint
): Promise<RouteModel> {
  if (
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(destination.lat) ||
    !Number.isFinite(destination.lng)
  ) {
    return { points: [], distanceMeters: 0, durationSeconds: 0, source: 'simulated' };
  }
  const points = [
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng },
  ];
  const distanceMeters = computePathLengthMeters(points);
  return {
    points,
    distanceMeters,
    durationSeconds: Math.max(1, Math.round(distanceMeters / DEFAULT_SPEED_MPS)),
    source: 'simulated',
  };
}

export function buildDemoRoute(origin: RoutePoint, potholes: PotholeRecord[]): RouteModel {
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return { points: [], distanceMeters: 0, durationSeconds: 0, source: 'simulated' };
  }
  const reliableActive = potholes.filter(
    (p) =>
      p.gpsReliable &&
      p.latitude !== null &&
      p.longitude !== null &&
      isActiveHazard(p)
  );
  if (reliableActive.length === 0) {
    return { points: [], distanceMeters: 0, durationSeconds: 0, source: 'simulated' };
  }

  const nearestThree = [...reliableActive]
    .sort(
      (a, b) =>
        haversineDistanceMeters(origin.lat, origin.lng, a.latitude!, a.longitude!) -
        haversineDistanceMeters(origin.lat, origin.lng, b.latitude!, b.longitude!)
    )
    .slice(0, 3);

  const points: RoutePoint[] = [{ lat: origin.lat, lng: origin.lng }];

  for (let i = 0; i < nearestThree.length; i += 1) {
    const target = nearestThree[i];
    const offset = DEMO_ROUTE_OFFSETS[Math.min(i, DEMO_ROUTE_OFFSETS.length - 1)];
    const prev = points[points.length - 1];
    const bearing = initialBearingDeg(prev.lat, prev.lng, target.latitude!, target.longitude!);
    const leftProj = projectCoordinate(target.latitude!, target.longitude!, offset, (bearing + 90) % 360);
    const rightProj = projectCoordinate(target.latitude!, target.longitude!, offset, (bearing + 270) % 360);
    const leftPt = { lat: leftProj.latitude, lng: leftProj.longitude };
    const rightPt = { lat: rightProj.latitude, lng: rightProj.longitude };

    const nextTarget: RoutePoint =
      i < nearestThree.length - 1
        ? { lat: nearestThree[i + 1].latitude!, lng: nearestThree[i + 1].longitude! }
        : (() => {
            const ext = projectCoordinate(target.latitude!, target.longitude!, TAIL_EXTENSION_METERS, bearing);
            return { lat: ext.latitude, lng: ext.longitude };
          })();

    const leftDist = Math.min(
      pointToSegmentDistanceMeters(target.latitude!, target.longitude!, prev.lat, prev.lng, leftPt.lat, leftPt.lng),
      pointToSegmentDistanceMeters(target.latitude!, target.longitude!, leftPt.lat, leftPt.lng, nextTarget.lat, nextTarget.lng)
    );
    const rightDist = Math.min(
      pointToSegmentDistanceMeters(target.latitude!, target.longitude!, prev.lat, prev.lng, rightPt.lat, rightPt.lng),
      pointToSegmentDistanceMeters(target.latitude!, target.longitude!, rightPt.lat, rightPt.lng, nextTarget.lat, nextTarget.lng)
    );

    points.push(Math.abs(leftDist - offset) <= Math.abs(rightDist - offset) ? leftPt : rightPt);
  }

  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const endBearing = initialBearingDeg(beforeLast.lat, beforeLast.lng, last.lat, last.lng);
  const tail = projectCoordinate(last.lat, last.lng, TAIL_EXTENSION_METERS, endBearing);
  points.push({ lat: tail.latitude, lng: tail.longitude });

  const distanceMeters = computePathLengthMeters(points);
  return {
    points,
    distanceMeters,
    durationSeconds: Math.max(1, Math.round(distanceMeters / DEFAULT_SPEED_MPS)),
    source: 'simulated',
  };
}

export function analyzeRouteHazards(
  route: RouteModel,
  potholes: PotholeRecord[],
  bufferMeters = 30
): RouteAnalysis {
  const emptyCounts: Record<SeverityLevel, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const validBuffer = Number.isFinite(bufferMeters) && bufferMeters >= 0 ? bufferMeters : 30;
  const pts = route.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (pts.length < 2 || potholes.length === 0) {
    return {
      hazards: [],
      totalCount: 0,
      severityCounts: emptyCounts,
      affectedSections: [],
      bufferMeters: validBuffer,
    };
  }

  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;

  interface Segment {
    a: RoutePoint;
    b: RoutePoint;
    lengthMeters: number;
    cumulativeStartMeters: number;
    metersPerDegLng: number;
  }

  const segments: Segment[] = [];
  let cumulative = 0;

  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    minLat = Math.min(minLat, b.lat);
    maxLat = Math.max(maxLat, b.lat);
    minLng = Math.min(minLng, b.lng);
    maxLng = Math.max(maxLng, b.lng);
    const len = haversineDistanceMeters(a.lat, a.lng, b.lat, b.lng);
    if (!Number.isFinite(len)) continue;
    const avgLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
    segments.push({
      a,
      b,
      lengthMeters: len,
      cumulativeStartMeters: cumulative,
      metersPerDegLng: METERS_PER_DEG_LAT * Math.max(0.01, Math.cos(avgLatRad)),
    });
    cumulative += len;
  }

  if (segments.length === 0) {
    return {
      hazards: [],
      totalCount: 0,
      severityCounts: emptyCounts,
      affectedSections: [],
      bufferMeters: validBuffer,
    };
  }

  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const latPad = validBuffer / 111000 + 0.0005;
  const lngPad = validBuffer / (111000 * Math.max(0.01, Math.cos(midLatRad))) + 0.0005;

  const hazards: RouteHazard[] = [];

  for (const pothole of potholes) {
    if (
      !pothole.gpsReliable ||
      pothole.latitude === null ||
      pothole.longitude === null ||
      !isActiveHazard(pothole)
    ) {
      continue;
    }
    if (
      pothole.classification !== null &&
      !pothole.classification.trim().toUpperCase().includes('POTHOLE')
    ) {
      continue;
    }
    if (
      pothole.latitude < minLat - latPad ||
      pothole.latitude > maxLat + latPad ||
      pothole.longitude < minLng - lngPad ||
      pothole.longitude > maxLng + lngPad
    ) {
      continue;
    }

    let bestDist = Infinity;
    let bestAlong = Infinity;

    for (const seg of segments) {
      const dx = (seg.b.lng - seg.a.lng) * seg.metersPerDegLng;
      const dy = (seg.b.lat - seg.a.lat) * METERS_PER_DEG_LAT;
      const px = (pothole.longitude - seg.a.lng) * seg.metersPerDegLng;
      const py = (pothole.latitude - seg.a.lat) * METERS_PER_DEG_LAT;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq)) : 0;
      const dist = haversineDistanceMeters(
        pothole.latitude,
        pothole.longitude,
        seg.a.lat + t * (seg.b.lat - seg.a.lat),
        seg.a.lng + t * (seg.b.lng - seg.a.lng)
      );
      const along = seg.cumulativeStartMeters + t * seg.lengthMeters;

      if (
        Number.isFinite(dist) &&
        (dist < bestDist - 0.01 || (Math.abs(dist - bestDist) <= 0.01 && along < bestAlong))
      ) {
        bestDist = dist;
        bestAlong = along;
      }
    }

    if (bestDist <= validBuffer) {
      hazards.push({
        id: pothole.eventId,
        severity: pothole.severity,
        roadName: formatRoadName(pothole.roadName),
        distanceFromRouteMeters: bestDist,
        distanceAlongRouteMeters: bestAlong,
        pothole,
      });
    }
  }

  hazards.sort((a, b) => {
    const diff = a.distanceAlongRouteMeters - b.distanceAlongRouteMeters;
    return Math.abs(diff) > 0.01 ? diff : a.distanceFromRouteMeters - b.distanceFromRouteMeters;
  });

  const severityCounts: Record<SeverityLevel, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const affectedSections: AffectedSection[] = [];

  for (const h of hazards) {
    if (h.severity) {
      severityCounts[h.severity] += 1;
    }
    const lastSec = affectedSections[affectedSections.length - 1];
    if (lastSec && lastSec.roadName === h.roadName) {
      lastSec.hazardCount += 1;
      lastSec.endDistanceMeters = h.distanceAlongRouteMeters;
      lastSec.hazardIds.push(h.id);
      if (getSeverityRank(h.severity) > getSeverityRank(lastSec.highestSeverity)) {
        lastSec.highestSeverity = h.severity;
      }
    } else {
      affectedSections.push({
        roadName: h.roadName,
        hazardCount: 1,
        highestSeverity: h.severity,
        startDistanceMeters: h.distanceAlongRouteMeters,
        endDistanceMeters: h.distanceAlongRouteMeters,
        hazardIds: [h.id],
      });
    }
  }

  return {
    hazards,
    totalCount: hazards.length,
    severityCounts,
    affectedSections,
    bufferMeters: validBuffer,
  };
}

export function formatDurationMinutes(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return '0 min';
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}
