import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Map as MapIcon,
  Play,
} from 'lucide-react';
import {
  GpsStatusPill,
  InstallAppButton,
  LiveSyncPill,
  ProfileAvatarButton,
  RepairStatusBadge,
  SeverityBadge,
  VerificationBadge,
} from '../components/CommonBadges';
import { useAppData } from '../context/AppDataContext';
import type { PotholeRecord, SeverityLevel } from '../types/terra';
import { primeAlertAudio } from '../utils/alertEngine';
import {
  formatDistance,
  formatNullableString,
  formatRelativeTime,
  formatRoadName,
  haversineDistanceMeters,
} from '../utils/geo';
import { ALL_SEVERITIES, getSeverityRank, isActiveHazard, SEVERITY_STYLES } from '../utils/severity';

const RADIUS_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 100, label: '100 m' },
  { value: 250, label: '250 m' },
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: null, label: 'All' },
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    potholes,
    systemAlerts,
    isLoading,
    isOnline,
    hasServerSnapshot,
    dataError,
    refreshData,
    riderPosition,
    gpsState,
    gpsError,
    retryGps,
    setSelectedPothole,
  } = useAppData();

  const [radiusMeters, setRadiusMeters] = useState<number | null>(1000);
  const [showRepaired, setShowRepaired] = useState<boolean>(false);

  const rankedPotholes = useMemo(() => {
    const mapped = potholes.map((pothole) => {
      if (
        !riderPosition ||
        !pothole.gpsReliable ||
        pothole.latitude === null ||
        pothole.longitude === null
      ) {
        return { pothole, distanceMeters: null as number | null };
      }
      const d = haversineDistanceMeters(
        riderPosition.latitude,
        riderPosition.longitude,
        pothole.latitude,
        pothole.longitude
      );
      return { pothole, distanceMeters: Number.isFinite(d) ? d : null };
    });

    mapped.sort((a, b) => {
      if (a.distanceMeters !== null && b.distanceMeters !== null) {
        return a.distanceMeters - b.distanceMeters;
      }
      const rankDiff = getSeverityRank(b.pothole.severity) - getSeverityRank(a.pothole.severity);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.pothole.lastDetectedAt ? new Date(a.pothole.lastDetectedAt).getTime() : 0;
      const bTime = b.pothole.lastDetectedAt ? new Date(b.pothole.lastDetectedAt).getTime() : 0;
      return bTime - aTime;
    });

    return mapped;
  }, [potholes, riderPosition]);

  const totalActiveCount = useMemo(
    () => rankedPotholes.filter((item) => isActiveHazard(item.pothole)).length,
    [rankedPotholes]
  );

  const activeList = useMemo(() => {
    const active = rankedPotholes.filter((item) => isActiveHazard(item.pothole));
    if (radiusMeters === null || !riderPosition) return active;
    return active.filter(
      (item) => item.distanceMeters !== null && item.distanceMeters <= radiusMeters
    );
  }, [rankedPotholes, riderPosition, radiusMeters]);

  const repairedList = useMemo(() => {
    const repaired = rankedPotholes.filter((item) => !isActiveHazard(item.pothole));
    if (radiusMeters === null || !riderPosition) return repaired;
    return repaired.filter(
      (item) => item.distanceMeters !== null && item.distanceMeters <= radiusMeters
    );
  }, [rankedPotholes, riderPosition, radiusMeters]);

  const severityCounts = useMemo(() => {
    const counts: Record<SeverityLevel, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    if (!riderPosition && radiusMeters !== null) return counts;
    for (const item of activeList) {
      if (item.pothole.severity) {
        counts[item.pothole.severity] += 1;
      }
    }
    return counts;
  }, [activeList, riderPosition, radiusMeters]);

  const activeSystemAlerts = useMemo(
    () => systemAlerts.filter((a) => a.active !== false && (a.message || a.title)),
    [systemAlerts]
  );

  const visibleList = showRepaired ? repairedList : activeList;
  const noLocation = !riderPosition;
  const radiusLabel = RADIUS_OPTIONS.find((r) => r.value === radiusMeters)?.label ?? 'All';

  const handleOpenDetail = (pothole: PotholeRecord) => {
    setSelectedPothole(pothole);
  };

  return (
    <div
      style={{
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))',
      }}
      className="mx-auto w-full max-w-5xl px-4 md:px-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#111827] sm:text-[28px]">
            TERRA Track
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <InstallAppButton variant="compact" />
          <ProfileAvatarButton />
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <GpsStatusPill />
        <LiveSyncPill />
      </div>

      {dataError && (
        <div
          role="alert"
          className="neu-inset mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4 py-3.5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#111827] whitespace-normal break-words">
              {dataError.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshData()}
            className="neu-btn-slate min-h-[56px] rounded-full px-5 py-2 text-xs font-bold text-[#006B5F]"
          >
            Retry
          </button>
        </div>
      )}

      {noLocation && (
        <div
          role="status"
          className="neu-inset mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4 py-3.5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                gpsState === 'initializing' ? 'text-[#006B5F]' : 'text-[#C2410C]'
              }`}
              aria-hidden="true"
            />
            <p className="text-sm font-medium leading-relaxed text-[#111827] whitespace-normal break-words">
              {gpsError ?? 'Waiting for location'}
            </p>
          </div>
          {gpsState !== 'unsupported' && gpsState !== 'initializing' && (
            <button
              type="button"
              onClick={retryGps}
              className="neu-btn-slate min-h-[56px] rounded-full px-5 py-2 text-xs font-bold text-[#006B5F]"
            >
              Retry GPS
            </button>
          )}
        </div>
      )}

      {activeSystemAlerts.length > 0 && (
        <section
          aria-label="Active road safety alerts"
          className="neu-raised-1 mt-4 space-y-2.5 rounded-3xl p-4"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-[#C2410C]">
            <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Active System Alerts ({activeSystemAlerts.length})</span>
          </div>
          <div className="space-y-2">
            {activeSystemAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.alertId}
                className="neu-inset-sm flex flex-wrap items-start justify-between gap-2 rounded-2xl px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {alert.severity && <SeverityBadge severity={alert.severity} size="sm" />}
                    <span className="font-display text-sm font-bold text-[#111827]">
                      {alert.title ?? alert.roadName ?? 'Road Alert'}
                    </span>
                  </div>
                  {alert.message && (
                    <p className="mt-1 text-xs font-medium text-[#1F2937] whitespace-normal break-words">
                      {alert.message}
                    </p>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-[#6B7280] tabular-nums">
                  {formatRelativeTime(alert.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            primeAlertAudio();
            navigate('/ride');
          }}
          className="neu-teal flex min-h-[58px] w-full items-center justify-center gap-3 rounded-full px-6 py-3.5 font-display text-lg font-bold text-white transition-transform active:scale-[0.98]"
        >
          <Play className="h-5 w-5 fill-current shrink-0" aria-hidden="true" />
          <span>Start ride mode</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/map')}
          className="neu-btn-slate flex min-h-[58px] w-full items-center justify-center gap-3 rounded-full px-6 py-3.5 font-display text-lg font-bold text-[#111827] transition-transform active:scale-[0.98]"
        >
          <MapIcon className="h-5 w-5 shrink-0 text-[#006B5F]" aria-hidden="true" />
          <span>Open road map</span>
        </button>
      </div>

      <p className="mt-4 text-xs font-medium text-[#1F2937] whitespace-normal break-words">
        Simulation unavailable in live mode
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <section
          aria-labelledby="severity-summary-heading"
          className="neu-raised-1 rounded-3xl p-5 lg:col-span-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="severity-summary-heading" className="font-display text-lg font-bold text-[#111827]">
              Active Hazard Summary
            </h2>
            <span className="text-xs font-semibold text-[#1F2937]">Excludes repaired</span>
          </div>

          <div role="group" aria-label="Summary radius" className="mt-3.5 flex flex-wrap gap-2">
            {RADIUS_OPTIONS.map((opt) => {
              const active = radiusMeters === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setRadiusMeters(opt.value)}
                  aria-pressed={active}
                  className={`min-h-[56px] rounded-full px-4 py-2 text-xs font-bold tracking-wide tabular-nums transition-all ${
                    active
                      ? 'neu-inset-sm text-[#006B5F]'
                      : 'neu-raised-1 text-[#1F2937] hover:text-[#111827]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {noLocation && radiusMeters !== null && (
            <p className="mt-3 text-xs font-semibold text-[#1F2937] whitespace-normal break-words">
              Waiting for location to compute counts within {radiusLabel}. Select{' '}
              <button
                type="button"
                onClick={() => setRadiusMeters(null)}
                className="font-bold text-[#006B5F] underline"
              >
                All
              </button>{' '}
              to summarize all reported hazards.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            {ALL_SEVERITIES.map((level) => {
              const style = SEVERITY_STYLES[level];
              const count = severityCounts[level];
              const showDash = noLocation && radiusMeters !== null;
              return (
                <div
                  key={level}
                  className="neu-inset-sm flex flex-col justify-between rounded-2xl p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      style={{ backgroundColor: style.bgHex, color: style.textHex }}
                      className="inline-flex rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.06em]"
                    >
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-3 font-display text-3xl font-bold tabular-nums text-[#111827]">
                    {showDash ? '—' : count}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="nearby-hazards-heading" className="lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="nearby-hazards-heading" className="font-display text-xl font-bold text-[#111827]">
              Nearby road hazards
            </h2>
            <div className="flex items-center gap-2" role="group" aria-label="Hazard list filter">
              <button
                type="button"
                onClick={() => setShowRepaired(false)}
                aria-pressed={!showRepaired}
                className={`min-h-[56px] rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  showRepaired ? 'neu-raised-1 text-[#1F2937]' : 'neu-inset-sm text-[#006B5F]'
                }`}
              >
                Active ({activeList.length})
              </button>
              <button
                type="button"
                onClick={() => setShowRepaired(true)}
                aria-pressed={showRepaired}
                className={`min-h-[56px] rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  showRepaired ? 'neu-inset-sm text-[#16A34A]' : 'neu-raised-1 text-[#1F2937]'
                }`}
              >
                Repaired ({repairedList.length})
              </button>
            </div>
          </div>

          {showRepaired && (
            <div className="neu-inset-sm mt-3 flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#1F2937]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" aria-hidden="true" />
              <span className="whitespace-normal break-words">
                Repaired potholes are not shown as active hazards and do not trigger Ride Mode
                alerts.
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((k) => (
                <div key={k} className="neu-raised-1 h-24 animate-pulse rounded-3xl p-4" />
              ))}
            </div>
          ) : dataError ? (
            <div className="neu-inset mt-4 rounded-3xl p-6 text-center text-sm font-semibold text-[#DC2626] whitespace-normal break-words">
              {dataError.message}
            </div>
          ) : potholes.length === 0 ? (
            <div className="neu-inset mt-4 rounded-3xl p-6 text-center text-sm font-semibold text-[#1F2937] whitespace-normal break-words">
              {hasServerSnapshot
                ? 'No potholes reported'
                : isOnline
                  ? 'Connecting…'
                  : 'Offline • no saved potholes'}
            </div>
          ) : visibleList.length === 0 ? (
            <div className="neu-inset mt-4 rounded-3xl p-6 text-center text-sm font-semibold text-[#1F2937] whitespace-normal break-words">
              {noLocation && radiusMeters !== null ? (
                <span>Waiting for location</span>
              ) : (
                <div className="space-y-3">
                  <p>
                    No {showRepaired ? 'repaired' : 'active'} potholes reported within{' '}
                    {radiusLabel}.
                  </p>
                  {radiusMeters !== null && totalActiveCount > 0 && !showRepaired && (
                    <button
                      type="button"
                      onClick={() => setRadiusMeters(null)}
                      className="neu-btn-slate inline-flex min-h-[48px] items-center justify-center rounded-full px-5 py-2 text-xs font-bold text-[#006B5F]"
                    >
                      Show all {totalActiveCount} reported active hazard(s)
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3.5">
              {visibleList.map(({ pothole, distanceMeters }) => {
                const roadName = formatRoadName(pothole.roadName);
                const repaired = !isActiveHazard(pothole);
                return (
                  <button
                    key={pothole.eventId}
                    type="button"
                    onClick={() => handleOpenDetail(pothole)}
                    className="neu-raised-1 flex min-h-[56px] w-full items-center justify-between gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={pothole.severity} repaired={repaired} size="sm" />
                        <RepairStatusBadge status={pothole.repairStatus} />
                        <VerificationBadge verified={pothole.verified} />
                        <span className="font-display text-sm font-bold tabular-nums text-[#111827] whitespace-normal">
                          {!pothole.gpsReliable
                            ? 'Unreliable GPS'
                            : distanceMeters === null
                              ? 'Waiting for location'
                              : formatDistance(distanceMeters)}
                        </span>
                      </div>
                      <div className="font-display text-base font-bold leading-snug text-[#111827] whitespace-normal break-words">
                        {roadName}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#1F2937] whitespace-normal break-words">
                        <span>Last detected {formatRelativeTime(pothole.lastDetectedAt)}</span>
                        <span aria-hidden="true">•</span>
                        <span>{formatNullableString(pothole.municipalZone)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[#1F2937]" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
