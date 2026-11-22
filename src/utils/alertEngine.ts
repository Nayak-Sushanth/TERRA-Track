import { useCallback, useEffect, useState } from 'react';
import type { ActiveRideAlert, AlertSettings, PotholeRecord, SeverityLevel } from '../types/terra';
import { formatRoadName, haversineDistanceMeters, initialBearingDeg } from './geo';
import { getSeverityRank, isActiveHazard } from './severity';

const SETTINGS_STORAGE_KEY = 'terra_track_alert_settings_v1';
const SETTINGS_EVENT = 'terra-alert-settings-changed';
const VALID_SEVERITIES = new Set<SeverityLevel>(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: true,
  enabledSeverities: ['CRITICAL', 'HIGH'],
  soundEnabled: true,
  vibrationEnabled: true,
  cooldownMinutes: 10,
  distanceMultiplier: 1,
};

export const BASE_TRIGGER_METERS: Record<SeverityLevel, number> = {
  CRITICAL: 250,
  HIGH: 250,
  MEDIUM: 150,
  LOW: 100,
};

function cloneDefaults(): AlertSettings {
  return {
    ...DEFAULT_ALERT_SETTINGS,
    enabledSeverities: [...DEFAULT_ALERT_SETTINGS.enabledSeverities],
  };
}

export function sanitizeAlertSettings(raw: unknown): AlertSettings {
  if (typeof raw !== 'object' || raw === null) return cloneDefaults();
  const obj = raw as Record<string, unknown>;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_ALERT_SETTINGS.enabled;
  const soundEnabled =
    typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : DEFAULT_ALERT_SETTINGS.soundEnabled;
  const vibrationEnabled =
    typeof obj.vibrationEnabled === 'boolean'
      ? obj.vibrationEnabled
      : DEFAULT_ALERT_SETTINGS.vibrationEnabled;
  const cooldownMinutes =
    obj.cooldownMinutes === 5 || obj.cooldownMinutes === 10 || obj.cooldownMinutes === 30
      ? obj.cooldownMinutes
      : DEFAULT_ALERT_SETTINGS.cooldownMinutes;
  const distanceMultiplier =
    typeof obj.distanceMultiplier === 'number' &&
    Number.isFinite(obj.distanceMultiplier) &&
    obj.distanceMultiplier > 0 &&
    obj.distanceMultiplier <= 3
      ? obj.distanceMultiplier
      : DEFAULT_ALERT_SETTINGS.distanceMultiplier;

  let enabledSeverities: SeverityLevel[];
  if (Array.isArray(obj.enabledSeverities)) {
    enabledSeverities = Array.from(
      new Set(
        obj.enabledSeverities.filter(
          (item): item is SeverityLevel =>
            typeof item === 'string' && VALID_SEVERITIES.has(item as SeverityLevel)
        )
      )
    );
  } else {
    enabledSeverities = [...DEFAULT_ALERT_SETTINGS.enabledSeverities];
  }

  return {
    enabled,
    enabledSeverities,
    soundEnabled,
    vibrationEnabled,
    cooldownMinutes,
    distanceMultiplier,
  };
}

export function loadAlertSettings(): AlertSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return cloneDefaults();
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return stored ? sanitizeAlertSettings(JSON.parse(stored)) : cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export function saveAlertSettings(next: AlertSettings): AlertSettings {
  const sanitized = sanitizeAlertSettings(next);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
    }
  } catch {
    // Ignore storage quota errors
  }
  return sanitized;
}

export function useAlertSettings() {
  const [settings, setSettings] = useState<AlertSettings>(() => loadAlertSettings());

  useEffect(() => {
    const sync = () => setSettings(loadAlertSettings());
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const updateSettings = useCallback(
    (updater: Partial<AlertSettings> | ((prev: AlertSettings) => AlertSettings)) => {
      setSettings((prev) =>
        saveAlertSettings(typeof updater === 'function' ? updater(prev) : { ...prev, ...updater })
      );
    },
    []
  );

  return { settings, updateSettings };
}

// Web Audio + Vibration feedback matching reference app
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioCtx();
  }
  return audioCtx;
}

export function primeAlertAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // Ignore audio context autoplay errors
  }
}

function playAlertTone(severity: SeverityLevel): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(severity === 'CRITICAL' ? 960 : 780, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    // Ignore audio errors
  }
}

function triggerVibration(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    // Ignore vibration errors
  }
}

export function triggerAlertFeedback(severity: SeverityLevel, settings: AlertSettings): void {
  if (settings.soundEnabled) {
    playAlertTone(severity);
  }
  if (settings.vibrationEnabled) {
    triggerVibration();
  }
}

// Screen Wake Lock manager
class WakeLockController {
  private sentinel: WakeLockSentinel | null = null;
  private isEnabled = false;
  private listenerAttached = false;

  private handleVisibilityChange = () => {
    if (this.isEnabled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.acquireLock();
    }
  };

  async acquireLock(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } };
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') return false;
    try {
      if (!this.sentinel || this.sentinel.released) {
        this.sentinel = await nav.wakeLock.request('screen');
      }
      return true;
    } catch {
      return false;
    }
  }

  async enable(): Promise<boolean> {
    this.isEnabled = true;
    if (!this.listenerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.listenerAttached = true;
    }
    return this.acquireLock();
  }

  async disable(): Promise<void> {
    this.isEnabled = false;
    if (this.listenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.listenerAttached = false;
    }
    if (this.sentinel) {
      try {
        if (!this.sentinel.released) {
          await this.sentinel.release();
        }
      } catch {
        // Ignore release errors
      } finally {
        this.sentinel = null;
      }
    }
  }
}

export const wakeLockController = new WakeLockController();

// Cooldown memory
export class AlertCooldownMemory {
  private entries = new Map<
    string,
    { alertedAtMs: number; latitude: number | null; longitude: number | null }
  >();

  recordAlert(
    id: string,
    nowMs = Date.now(),
    latitude: number | null = null,
    longitude: number | null = null
  ): void {
    this.entries.set(id, { alertedAtMs: nowMs, latitude, longitude });
  }

  isSuppressed(id: string, cooldownMinutes: number, nowMs = Date.now()): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const cooldownMs = Math.max(0, cooldownMinutes) * 60000;
    if (nowMs - entry.alertedAtMs >= cooldownMs) {
      this.entries.delete(id);
      return false;
    }
    return true;
  }

  updateRiderDistances(
    potholeMap: Map<string, PotholeRecord>,
    riderLat: number,
    riderLng: number
  ): void {
    for (const [id, entry] of this.entries.entries()) {
      const record = potholeMap.get(id);
      const lat = record?.latitude ?? entry.latitude;
      const lng = record?.longitude ?? entry.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }
      const dist = haversineDistanceMeters(riderLat, riderLng, lat, lng);
      if (Number.isFinite(dist) && dist > 500) {
        this.entries.delete(id);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

function isWeakGps(accuracy: number | null | undefined): boolean {
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 50;
}

function normalizeHeading(heading: number | null | undefined): number | null {
  if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

function angularDifferenceDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

interface CandidateMatch {
  pothole: PotholeRecord;
  severity: SeverityLevel;
  distanceMeters: number;
  directionKnown: boolean;
  triggerDistanceMeters: number;
  baseDistanceMeters: number;
  speedBonusMeters: number;
}

export function findNearestQualifyingHazard(
  params: {
    potholes: PotholeRecord[];
    riderPosition: { lat: number; lng: number; accuracy: number | null };
    heading: number | null;
    speedMps: number | null;
    settings: AlertSettings;
  },
  options?: {
    nowMs?: number;
    cooldownMemory?: AlertCooldownMemory;
    ignoreCooldown?: boolean;
  }
): CandidateMatch | null {
  const { potholes, riderPosition, heading, speedMps, settings } = params;
  if (
    !settings.enabled ||
    settings.enabledSeverities.length === 0 ||
    !Number.isFinite(riderPosition.lat) ||
    !Number.isFinite(riderPosition.lng) ||
    isWeakGps(riderPosition.accuracy)
  ) {
    return null;
  }

  const normalizedHeading = normalizeHeading(heading);
  const validSpeed =
    typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0 ? speedMps : null;
  const directionKnown = normalizedHeading !== null && validSpeed !== null && validSpeed > 2;
  const speedBonusMeters = validSpeed === null ? 0 : Math.min(100, validSpeed);
  const multiplier =
    Number.isFinite(settings.distanceMultiplier) && settings.distanceMultiplier > 0
      ? settings.distanceMultiplier
      : 1;
  const allowedSeverities = new Set(settings.enabledSeverities);
  const maxTriggerMeters =
    Math.max(
      BASE_TRIGGER_METERS.CRITICAL,
      BASE_TRIGGER_METERS.HIGH,
      BASE_TRIGGER_METERS.MEDIUM,
      BASE_TRIGGER_METERS.LOW
    ) *
      multiplier +
    100;

  const latDelta = maxTriggerMeters / 111000;
  const lngDelta =
    maxTriggerMeters / (111000 * Math.max(0.01, Math.cos((riderPosition.lat * Math.PI) / 180)));

  const nowMs = options?.nowMs ?? Date.now();
  const cooldownMemory = options?.cooldownMemory;
  const ignoreCooldown = options?.ignoreCooldown ?? false;

  const candidates: CandidateMatch[] = [];

  for (const pothole of potholes) {
    // Only trigger Ride Mode alerts for active potholes with reliable GPS and known enabled severity
    if (
      !pothole.gpsReliable ||
      pothole.latitude === null ||
      pothole.longitude === null ||
      !isActiveHazard(pothole) ||
      !pothole.severity ||
      !allowedSeverities.has(pothole.severity)
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
      Math.abs(pothole.latitude - riderPosition.lat) > latDelta ||
      Math.abs(pothole.longitude - riderPosition.lng) > lngDelta
    ) {
      continue;
    }

    if (!ignoreCooldown && cooldownMemory && cooldownMemory.isSuppressed(pothole.eventId, settings.cooldownMinutes, nowMs)) {
      continue;
    }

    const dist = haversineDistanceMeters(
      riderPosition.lat,
      riderPosition.lng,
      pothole.latitude,
      pothole.longitude
    );
    if (!Number.isFinite(dist)) continue;

    const baseDistanceMeters = BASE_TRIGGER_METERS[pothole.severity] * multiplier;
    const triggerDistanceMeters = baseDistanceMeters + speedBonusMeters;

    if (dist > triggerDistanceMeters) continue;

    if (directionKnown && normalizedHeading !== null && dist > 0.5) {
      const bearing = initialBearingDeg(
        riderPosition.lat,
        riderPosition.lng,
        pothole.latitude,
        pothole.longitude
      );
      if (angularDifferenceDeg(normalizedHeading, bearing) > 60) {
        continue;
      }
    }

    candidates.push({
      pothole,
      severity: pothole.severity,
      distanceMeters: dist,
      directionKnown,
      triggerDistanceMeters,
      baseDistanceMeters,
      speedBonusMeters,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const diff = a.distanceMeters - b.distanceMeters;
    if (Math.abs(diff) > 0.01) return diff;
    return getSeverityRank(b.severity) - getSeverityRank(a.severity);
  });

  return candidates[0];
}

export function evaluateRideAlert(params: {
  potholes: PotholeRecord[];
  riderPosition: { lat: number; lng: number; accuracy: number | null };
  heading: number | null;
  speedMps: number | null;
  settings: AlertSettings;
  cooldownMemory: AlertCooldownMemory;
  nowMs?: number;
}): { alert: ActiveRideAlert | null; weakGps: boolean } {
  const nowMs = params.nowMs ?? Date.now();
  if (isWeakGps(params.riderPosition.accuracy)) {
    return { alert: null, weakGps: true };
  }
  if (!Number.isFinite(params.riderPosition.lat) || !Number.isFinite(params.riderPosition.lng)) {
    return { alert: null, weakGps: false };
  }

  if (params.cooldownMemory.size() > 0) {
    const map = new Map<string, PotholeRecord>();
    for (const p of params.potholes) map.set(p.eventId, p);
    params.cooldownMemory.updateRiderDistances(map, params.riderPosition.lat, params.riderPosition.lng);
  }

  const match = findNearestQualifyingHazard(params, {
    cooldownMemory: params.cooldownMemory,
    nowMs,
    ignoreCooldown: false,
  });

  if (!match) {
    return { alert: null, weakGps: false };
  }

  params.cooldownMemory.recordAlert(
    match.pothole.eventId,
    nowMs,
    match.pothole.latitude,
    match.pothole.longitude
  );

  return {
    weakGps: false,
    alert: {
      potholeId: match.pothole.eventId,
      severity: match.severity,
      distanceMeters: match.distanceMeters,
      roadName: formatRoadName(match.pothole.roadName),
      directionKnown: match.directionKnown,
      triggerDistanceMeters: match.triggerDistanceMeters,
      baseDistanceMeters: match.baseDistanceMeters,
      speedBonusMeters: match.speedBonusMeters,
    },
  };
}
