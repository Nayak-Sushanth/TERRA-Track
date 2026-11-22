import React, { useEffect } from 'react';
import { Activity, AlertTriangle, Clock, Cpu, MapPin, X } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import type { PotholeRecord } from '../types/terra';
import {
  formatDateTime,
  formatDistance,
  formatNullableString,
  formatRoadName,
  formatVerificationLabel,
  haversineDistanceMeters,
} from '../utils/geo';
import { isActiveHazard } from '../utils/severity';
import { RepairStatusBadge, SeverityBadge, VerificationBadge } from './CommonBadges';

export const PotholeDetailSheet: React.FC<{
  pothole: PotholeRecord | null;
  onClose: () => void;
}> = ({ pothole, onClose }) => {
  const { riderPosition } = useAppData();

  useEffect(() => {
    if (!pothole) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pothole, onClose]);

  if (!pothole) return null;

  const roadName = formatRoadName(pothole.roadName);
  const active = isActiveHazard(pothole);
  const confidencePct =
    pothole.confidence !== null
      ? Math.round(Math.min(1, Math.max(0, pothole.confidence)) * 100)
      : null;

  const hasReliableCoords =
    pothole.gpsReliable && pothole.latitude !== null && pothole.longitude !== null;

  const rawDist =
    riderPosition && hasReliableCoords
      ? haversineDistanceMeters(
          riderPosition.latitude,
          riderPosition.longitude,
          pothole.latitude!,
          pothole.longitude!
        )
      : NaN;
  const distanceMeters = Number.isFinite(rawDist) ? rawDist : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111827]/45 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pothole-detail-title"
    >
      <div
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        className="neu-raised-2 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#E6EBF2] px-5 pt-3 md:rounded-3xl md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#BBC5D3] md:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={pothole.severity} repaired={!active} size="md" />
              <RepairStatusBadge status={pothole.repairStatus} />
              <VerificationBadge verified={pothole.verified} />
            </div>
            <h2
              id="pothole-detail-title"
              className="font-display text-xl font-bold leading-snug text-[#111827] whitespace-normal break-words"
            >
              {roadName}
            </h2>
            <p className="text-sm font-medium text-[#1F2937] whitespace-normal break-words">
              {formatNullableString(pothole.municipalZone)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pothole details"
            className="neu-raised-1 flex h-14 w-14 min-h-[56px] min-w-[56px] shrink-0 items-center justify-center rounded-full text-[#111827] transition-transform active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {!active && (
          <div className="neu-inset-sm mt-4 rounded-2xl px-4 py-3 text-sm font-semibold text-[#111827]">
            Marked as repaired (originally reported as {pothole.severity ?? 'N/A'}). Not counted as
            an active hazard.
          </div>
        )}

        {!pothole.gpsReliable && (
          <div
            role="status"
            className="neu-inset-sm mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs font-semibold text-[#C2410C]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-normal break-words">
              Unreliable GPS ({pothole.gpsUnreliableReason ?? 'unconfirmed coordinates'}) — not
              shown as a confirmed map location.
            </span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="neu-inset-sm rounded-2xl p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
              Event ID
            </div>
            <div className="mt-1 font-display text-sm font-bold text-[#111827] whitespace-normal break-all">
              {pothole.eventId}
            </div>
          </div>
          <div className="neu-inset-sm rounded-2xl p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
              Distance from You
            </div>
            <div className="mt-1 font-display text-sm font-bold tabular-nums text-[#111827]">
              {!pothole.gpsReliable
                ? 'Unreliable GPS'
                : distanceMeters === null
                  ? 'Waiting for location'
                  : formatDistance(distanceMeters)}
            </div>
          </div>
        </div>

        <div className="neu-raised-1 mt-4 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]">
              <Activity className="h-4 w-4 text-[#006B5F]" aria-hidden="true" />
              Sensor Confidence
            </span>
            <span className="font-display text-base font-bold tabular-nums text-[#111827]">
              {confidencePct !== null ? `${confidencePct}%` : 'N/A'}
            </span>
          </div>
          {confidencePct !== null ? (
            <div
              className="neu-inset-sm mt-2.5 h-3.5 w-full overflow-hidden rounded-full p-0.5"
              role="progressbar"
              aria-valuenow={confidencePct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="IoT sensor confidence"
            >
              <div
                className="h-full rounded-full bg-[#14B8A6] transition-all"
                style={{ width: `${confidencePct}%` }}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs font-medium text-[#6B7280]">
              Sensor confidence reading not provided in Firestore record.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#1F2937]">
            <span>Classification: {formatNullableString(pothole.classification)}</span>
            <span className="tabular-nums">
              Detection count:{' '}
              <strong className="text-[#111827]">
                {pothole.detectionCount !== null ? pothole.detectionCount : 'N/A'}
              </strong>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#111827]/10 pt-2.5 text-xs font-semibold text-[#1F2937]">
            <span>
              Verification:{' '}
              <strong className="text-[#111827]">
                {formatVerificationLabel(pothole.verified)}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5 text-[#006B5F]" aria-hidden="true" />
              <span>Device: {formatNullableString(pothole.deviceId)}</span>
            </span>
          </div>
        </div>

        {(pothole.peakAcceleration !== null ||
          pothole.speedKmh !== null ||
          pothole.depthCm !== null ||
          pothole.gpsAccuracy !== null ||
          pothole.satellites !== null) && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="neu-inset-sm rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                Peak Impact
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-[#111827]">
                {pothole.peakAcceleration !== null ? `${pothole.peakAcceleration.toFixed(2)} g` : 'N/A'}
              </div>
            </div>
            <div className="neu-inset-sm rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                GPS Accuracy
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-[#111827]">
                {pothole.gpsAccuracy !== null ? `${Math.round(pothole.gpsAccuracy)} m` : 'N/A'}
              </div>
            </div>
            <div className="neu-inset-sm rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                Satellites
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-[#111827]">
                {pothole.satellites !== null ? pothole.satellites : 'N/A'}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="neu-inset-sm rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
              <Clock className="h-3.5 w-3.5 text-[#006B5F]" aria-hidden="true" />
              First Detected
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-[#111827]">
              {formatDateTime(pothole.timestamp)}
            </div>
          </div>
          <div className="neu-inset-sm rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
              <Clock className="h-3.5 w-3.5 text-[#006B5F]" aria-hidden="true" />
              Last Detected
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-[#111827]">
              {formatDateTime(pothole.lastDetectedAt)}
            </div>
          </div>
        </div>

        <div className="neu-inset-sm mt-3 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
            <MapPin className="h-3.5 w-3.5 text-[#006B5F]" aria-hidden="true" />
            Coordinates
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-3 text-sm font-semibold tabular-nums text-[#111827]">
            <div>
              <span className="text-xs text-[#1F2937]">Lat: </span>
              {pothole.latitude !== null ? pothole.latitude.toFixed(6) : 'N/A'}
            </div>
            <div>
              <span className="text-xs text-[#1F2937]">Lng: </span>
              {pothole.longitude !== null ? pothole.longitude.toFixed(6) : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
