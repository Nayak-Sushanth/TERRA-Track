import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, Square } from 'lucide-react';
import { GpsStatusPill } from '../components/CommonBadges';
import { useAppData } from '../context/AppDataContext';
import type { ActiveRideAlert } from '../types/terra';
import {
  AlertCooldownMemory,
  evaluateRideAlert,
  findNearestQualifyingHazard,
  primeAlertAudio,
  triggerAlertFeedback,
  useAlertSettings,
  wakeLockController,
} from '../utils/alertEngine';
import { formatDistance, formatRoadName } from '../utils/geo';
import { SEVERITY_STYLES } from '../utils/severity';

export const RideModePage: React.FC = () => {
  const navigate = useNavigate();
  const { potholes, dataError, riderPosition, gpsState, gpsError, retryGps } = useAppData();
  const { settings } = useAlertSettings();

  const cooldownRef = useRef<AlertCooldownMemory>(new AlertCooldownMemory());
  const activeIdRef = useRef<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<ActiveRideAlert | null>(null);
  const [weakGps, setWeakGps] = useState<boolean>(false);

  useEffect(() => {
    void wakeLockController.enable();
    primeAlertAudio();
    return () => {
      void wakeLockController.disable();
    };
  }, []);

  useEffect(() => {
    if (!riderPosition) {
      activeIdRef.current = null;
      setActiveAlert(null);
      setWeakGps(false);
      return;
    }

    const result = evaluateRideAlert({
      potholes,
      riderPosition: {
        lat: riderPosition.latitude,
        lng: riderPosition.longitude,
        accuracy: riderPosition.accuracyMeters,
      },
      heading: riderPosition.heading,
      speedMps: riderPosition.speedMps,
      settings,
      cooldownMemory: cooldownRef.current,
    });

    if (result.weakGps) {
      activeIdRef.current = null;
      setActiveAlert(null);
      setWeakGps(true);
      return;
    }

    setWeakGps(false);

    if (result.alert) {
      activeIdRef.current = result.alert.potholeId;
      setActiveAlert(result.alert);
      triggerAlertFeedback(result.alert.severity, settings);
      return;
    }

    const prevId = activeIdRef.current;
    if (prevId) {
      const existing = potholes.find((p) => p.eventId === prevId);
      const stillApproaching = existing
        ? findNearestQualifyingHazard(
            {
              potholes: [existing],
              riderPosition: {
                lat: riderPosition.latitude,
                lng: riderPosition.longitude,
                accuracy: riderPosition.accuracyMeters,
              },
              heading: riderPosition.heading,
              speedMps: riderPosition.speedMps,
              settings,
            },
            { ignoreCooldown: true }
          )
        : null;

      if (stillApproaching) {
        setActiveAlert({
          potholeId: stillApproaching.pothole.eventId,
          severity: stillApproaching.severity,
          distanceMeters: stillApproaching.distanceMeters,
          roadName: formatRoadName(stillApproaching.pothole.roadName),
          directionKnown: stillApproaching.directionKnown,
          triggerDistanceMeters: stillApproaching.triggerDistanceMeters,
          baseDistanceMeters: stillApproaching.baseDistanceMeters,
          speedBonusMeters: stillApproaching.speedBonusMeters,
        });
        return;
      }
    }

    activeIdRef.current = null;
    setActiveAlert(null);
  }, [potholes, riderPosition, settings]);

  const handleEndRide = () => {
    void wakeLockController.disable();
    navigate('/');
  };

  const speedKmh = useMemo(() => {
    if (!riderPosition || riderPosition.speedMps === null || riderPosition.speedMps < 0) {
      return null;
    }
    return Math.round(riderPosition.speedMps * 3.6);
  }, [riderPosition]);

  const alertStyle = activeAlert ? SEVERITY_STYLES[activeAlert.severity] : null;
  const waitingForFirstFix = gpsState === 'initializing' && !riderPosition;

  return (
    <div
      style={{
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
      }}
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-between px-4 md:px-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-[#111827]">
            TERRA Track
          </span>
        </div>
        <GpsStatusPill compact />
      </header>

      <main className="my-6 flex flex-1 flex-col items-center justify-center gap-6">
        <div className="neu-inset flex min-w-[180px] flex-col items-center rounded-3xl px-8 py-5 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#1F2937]">
            Speed
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold tabular-nums text-[#111827]">
              {speedKmh === null ? '—' : speedKmh}
            </span>
            <span className="font-display text-lg font-bold text-[#1F2937]">km/h</span>
          </div>
        </div>

        {riderPosition ? (
          weakGps ? (
            <section
              role="status"
              aria-label="GPS signal weak"
              className="neu-raised-2 w-full rounded-3xl p-7 text-center"
            >
              <AlertTriangle className="mx-auto h-9 w-9 text-[#C2410C]" aria-hidden="true" />
              <h1 className="mt-4 font-display text-2xl font-bold leading-snug text-[#111827] sm:text-3xl">
                GPS signal weak
              </h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
                Waiting for stronger GPS accuracy before showing hazard distances.
              </p>
            </section>
          ) : activeAlert && alertStyle ? (
            <div className="w-full space-y-2.5 text-center">
              <section
                aria-label="Nearest reported pothole"
                style={{ backgroundColor: alertStyle.bgHex, color: alertStyle.textHex }}
                className="w-full rounded-3xl p-7 text-center shadow-lg"
              >
                <div className="font-display text-2xl font-bold uppercase tracking-[0.08em]">
                  {alertStyle.label}
                </div>
                <div className="mt-4 font-display text-6xl font-bold leading-none tabular-nums sm:text-7xl">
                  {formatDistance(activeAlert.distanceMeters)}
                </div>
                <div className="mt-5 font-display text-xl font-bold leading-snug whitespace-normal break-words">
                  {activeAlert.roadName}
                </div>
              </section>
              {!activeAlert.directionKnown && (
                <p className="text-xs font-semibold text-[#1F2937] whitespace-normal break-words">
                  Direction unknown, showing distance only
                </p>
              )}
            </div>
          ) : dataError && potholes.length === 0 ? (
            <section
              role="alert"
              aria-label="Data connection error"
              className="neu-raised-2 w-full rounded-3xl p-7 text-center"
            >
              <AlertTriangle className="mx-auto h-8 w-8 text-[#DC2626]" aria-hidden="true" />
              <h1 className="mt-4 font-display text-2xl font-bold leading-snug text-[#DC2626]">
                {dataError.message}
              </h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
                Unable to load reported potholes from Firestore.
              </p>
            </section>
          ) : (
            <section
              aria-label="Ride mode status"
              className="neu-raised-2 w-full rounded-3xl p-7 text-center"
            >
              <h1 className="font-display text-2xl font-bold leading-snug text-[#111827] sm:text-3xl">
                No known potholes ahead
              </h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
                Based on reported data only, not a guarantee of road condition.
              </p>
            </section>
          )
        ) : (
          <div className="neu-raised-2 w-full rounded-3xl p-6 text-center">
            <div
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                waitingForFirstFix
                  ? 'bg-[#14B8A6]/15 text-[#006B5F]'
                  : 'bg-[#C2410C]/15 text-[#C2410C]'
              }`}
            >
              {waitingForFirstFix ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#111827]">
              {waitingForFirstFix
                ? 'Waiting for first fix'
                : gpsState === 'denied'
                  ? 'Location permission denied'
                  : 'Location unavailable'}
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
              {gpsError ??
                (waitingForFirstFix
                  ? 'Waiting for first GPS fix. Ride mode monitors reported potholes once your position is received.'
                  : 'Location access is required for Ride Mode. Enable GPS in settings to check reported potholes near your position.')}
            </p>
            {!waitingForFirstFix && gpsState !== 'unsupported' && (
              <button
                type="button"
                onClick={retryGps}
                className="neu-btn-slate mt-5 inline-flex min-h-[56px] items-center justify-center rounded-full px-6 py-3 font-display text-sm font-bold text-[#006B5F]"
              >
                Retry location access
              </button>
            )}
          </div>
        )}
      </main>

      <footer>
        <button
          type="button"
          onClick={handleEndRide}
          className="neu-btn-slate flex min-h-[60px] w-full items-center justify-center gap-3 rounded-full px-6 py-4 font-display text-lg font-bold text-[#111827] transition-transform active:scale-[0.98]"
        >
          <Square className="h-5 w-5 fill-current text-[#DC2626]" aria-hidden="true" />
          <span>End ride mode</span>
        </button>
      </footer>
    </div>
  );
};
