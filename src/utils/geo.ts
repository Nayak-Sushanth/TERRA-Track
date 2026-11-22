const EARTH_RADIUS_METERS = 6371000;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return NaN;
  }
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return EARTH_RADIUS_METERS * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function projectCoordinate(
  lat: number,
  lng: number,
  distanceMeters: number,
  bearingDeg: number
): { latitude: number; longitude: number } {
  const angDist = distanceMeters / EARTH_RADIUS_METERS;
  const brng = toRadians(bearingDeg);
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (((lng2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function initialBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dLambda = toRadians(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
}

export function formatDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return 'N/A';
  }
  const rounded = Math.round(distanceMeters);
  if (rounded < 1000) {
    return `${rounded} m`;
  }
  if (distanceMeters <= 100000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }
  return 'Far away';
}

export function formatRelativeTime(isoString: string | null, nowMs = Date.now()): string {
  if (!isoString) return 'N/A';
  const parsed = new Date(isoString).getTime();
  if (Number.isNaN(parsed)) return 'N/A';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 60) return `${diffSec} s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  return `${Math.floor(diffHr / 24)} d ago`;
}

export function formatDateTime(isoString: string | null): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime24(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatRoadName(roadName: string | null | undefined): string {
  if (typeof roadName !== 'string') return 'Unnamed road';
  const trimmed = roadName.trim();
  return trimmed.length > 0 ? trimmed : 'Unnamed road';
}

export function formatNullableString(value: string | null | undefined): string {
  if (typeof value !== 'string') return 'N/A';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'N/A';
}

export function formatVerificationLabel(verified: boolean | null): 'Verified' | 'Not Verified' | 'N/A' {
  if (verified === true) return 'Verified';
  if (verified === false) return 'Not Verified';
  return 'N/A';
}
