import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  LogOut,
  Play,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  User,
  Vibrate,
  Volume2,
  XCircle,
} from 'lucide-react';
import { GpsStatusPill, InstallAppButton, LiveSyncPill } from '../components/CommonBadges';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { TARGET_DATABASE_ID, TARGET_PROJECT_ID } from '../firebase/config';
import {
  getDiagnosticsMeta,
  runConnectionDiagnostics,
  runDeploymentCheck,
} from '../services/firestoreRepository';
import type { DeploymentCheckResult, DiagnosticsResult, SeverityLevel } from '../types/terra';
import { useAlertSettings } from '../utils/alertEngine';
import { formatNullableString, formatRelativeTime } from '../utils/geo';
import { ALL_SEVERITIES, SEVERITY_STYLES } from '../utils/severity';

const COOLDOWN_OPTIONS: Array<5 | 10 | 30> = [5, 10, 30];

export const ProfilePage: React.FC = () => {
  const { potholes, devices, systemAlerts, droppedCount, lastServerSyncAt } = useAppData();
  const { user, logout, isSubmitting } = useAuth();
  const { settings, updateSettings } = useAlertSettings();

  const [diagOpen, setDiagOpen] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagnosticsResult | null>(null);

  const [deployOpen, setDeployOpen] = useState(false);
  const [deployRunning, setDeployRunning] = useState(false);
  const [deployResult, setDeployResult] = useState<DeploymentCheckResult | null>(null);

  const diagMeta = getDiagnosticsMeta();

  const toggleSeverity = (sev: SeverityLevel) => {
    updateSettings((prev) => {
      const next = prev.enabledSeverities.includes(sev)
        ? prev.enabledSeverities.filter((s) => s !== sev)
        : [...prev.enabledSeverities, sev];
      return { ...prev, enabledSeverities: next };
    });
  };

  const handleRunDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const result = await runConnectionDiagnostics();
      setDiagResult(result);
    } finally {
      setDiagRunning(false);
    }
  };

  const handleRunDeploymentCheck = async () => {
    setDeployRunning(true);
    try {
      const result = await runDeploymentCheck(user?.email ?? null);
      setDeployResult(result);
    } finally {
      setDeployRunning(false);
    }
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
            Profile &amp; Settings
          </h1>
        </div>
        <GpsStatusPill compact />
      </header>

      <div className="mt-4">
        <LiveSyncPill />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="neu-raised-1 rounded-3xl p-6">
          <div className="flex items-center gap-4">
            <div className="neu-inset flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[#006B5F]">
              <User className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-[#111827] whitespace-normal break-words">
                {user?.displayName || 'TERRA Rider'}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-[#1F2937] whitespace-normal break-all">
                {user?.email ?? 'Signed in'}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <InstallAppButton variant="card" />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void logout()}
              className="neu-btn-slate flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 font-display text-base font-bold text-[#DC2626] transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{isSubmitting ? 'Signing out…' : 'Logout'}</span>
            </button>
          </div>
        </section>

        <section className="neu-raised-1 rounded-3xl p-6">
          <div className="flex items-center gap-3">
            <div className="neu-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#006B5F]">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="font-display text-lg font-bold text-[#111827]">Data Source</h2>
          </div>

          <div className="neu-inset-sm mt-4 rounded-2xl p-4 text-sm font-medium text-[#1F2937] whitespace-normal break-words">
            Cloud Firestore ({TARGET_PROJECT_ID} • {TARGET_DATABASE_ID}) active — {potholes.length}{' '}
            valid pothole record(s) loaded.
          </div>

          <p className="mt-2.5 text-xs font-semibold text-[#111827] whitespace-normal break-words">
            Data mode: live (real-time onSnapshot)
          </p>
          <p className="mt-1.5 text-xs font-medium text-[#1F2937] tabular-nums">
            Dev diagnostics: dropped {droppedCount} invalid Firestore document(s).
          </p>

          <div className="mt-4 flex items-start gap-2.5 text-xs font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#C2410C]" aria-hidden="true" />
            <span>
              Information shown in TERRA Track Rider is based on reported IoT sensor data only and
              is not a guarantee of road condition.
            </span>
          </div>
        </section>
      </div>

      {/* Real-time IoT Devices summary when device records exist in Firestore */}
      {devices.length > 0 && (
        <section
          aria-labelledby="iot-devices-heading"
          className="neu-raised-1 mt-6 rounded-3xl p-6"
        >
          <div className="flex items-center gap-3">
            <div className="neu-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#006B5F]">
              <Cpu className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="iot-devices-heading" className="font-display text-lg font-bold text-[#111827]">
                IoT Sensor Devices ({devices.length})
              </h2>
              <p className="text-xs font-medium text-[#1F2937]">
                Live status synced from Firestore devices collection.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {devices.map((dev) => (
              <div key={dev.deviceId} className="neu-inset-sm rounded-2xl p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-[#111827] break-all">
                    {dev.name ?? dev.deviceId}
                  </span>
                  <span className="rounded-full bg-[#E6EBF2] px-2.5 py-0.5 font-bold text-[#006B5F]">
                    {formatNullableString(dev.status)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-medium text-[#1F2937]">
                  <span>ID: {dev.deviceId}</span>
                  <span>
                    GPS Fix:{' '}
                    {dev.gpsFix === true ? 'Valid' : dev.gpsFix === false ? 'No Fix' : 'N/A'}
                  </span>
                  <span>Last seen: {formatRelativeTime(dev.lastSeen)}</span>
                  {dev.batteryLevel !== null && <span>Battery: {Math.round(dev.batteryLevel)}%</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alerts settings */}
      <section
        aria-labelledby="alerts-settings-heading"
        className="neu-raised-1 mt-6 rounded-3xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="neu-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#006B5F]">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="alerts-settings-heading"
                className="font-display text-lg font-bold text-[#111827]"
              >
                Alerts
              </h2>
              <p className="text-xs font-medium text-[#1F2937] whitespace-normal break-words">
                Nearby pothole alerts for Ride Mode.
                {systemAlerts.length > 0 ? ` ${systemAlerts.length} Firestore alert(s) synced.` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => updateSettings({ enabled: !settings.enabled })}
            className={`min-h-[56px] rounded-full px-5 py-2.5 font-display text-sm font-bold transition-all ${
              settings.enabled ? 'neu-teal text-white' : 'neu-btn-slate text-[#1F2937]'
            }`}
          >
            {settings.enabled ? 'Alerts On' : 'Alerts Off'}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]">
              Alert severities
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {ALL_SEVERITIES.map((sev) => {
                const checked = settings.enabledSeverities.includes(sev);
                const style = SEVERITY_STYLES[sev];
                return (
                  <label
                    key={sev}
                    className={`flex min-h-[56px] cursor-pointer items-center gap-2.5 rounded-2xl px-3.5 py-2 transition-all ${
                      checked ? 'neu-inset-sm' : 'neu-raised-1'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSeverity(sev)}
                      className="h-5 w-5 shrink-0 accent-[#006B5F]"
                    />
                    <span
                      style={{ backgroundColor: style.bgHex, color: style.textHex }}
                      className="inline-flex rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.06em]"
                    >
                      {style.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                role="switch"
                aria-checked={settings.soundEnabled}
                onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
                className={`flex min-h-[56px] w-full items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
                  settings.soundEnabled
                    ? 'neu-inset-sm text-[#006B5F]'
                    : 'neu-raised-1 text-[#1F2937]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Sound</span>
                </span>
                <span>{settings.soundEnabled ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={settings.vibrationEnabled}
                onClick={() => updateSettings({ vibrationEnabled: !settings.vibrationEnabled })}
                className={`flex min-h-[56px] w-full items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
                  settings.vibrationEnabled
                    ? 'neu-inset-sm text-[#006B5F]'
                    : 'neu-raised-1 text-[#1F2937]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Vibrate className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Vibration</span>
                </span>
                <span>{settings.vibrationEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                Repeat cooldown
              </div>
              <div
                role="group"
                aria-label="Alert repeat cooldown"
                className="mt-2 flex flex-wrap gap-2"
              >
                {COOLDOWN_OPTIONS.map((mins) => {
                  const active = settings.cooldownMinutes === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => updateSettings({ cooldownMinutes: mins })}
                      aria-pressed={active}
                      className={`min-h-[56px] flex-1 rounded-full px-4 py-2 text-xs font-bold tabular-nums transition-all ${
                        active ? 'neu-inset-sm text-[#006B5F]' : 'neu-raised-1 text-[#1F2937]'
                      }`}
                    >
                      {mins} min
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connection diagnostics */}
      <section className="neu-raised-1 mt-6 rounded-3xl p-5">
        <button
          type="button"
          onClick={() => setDiagOpen((v) => !v)}
          aria-expanded={diagOpen}
          className="flex min-h-[56px] w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="neu-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#1F2937]">
              <Terminal className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-base font-bold text-[#111827]">
                Connection diagnostics
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                Developer only
              </div>
            </div>
          </div>
          {diagOpen ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-[#1F2937]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-[#1F2937]" aria-hidden="true" />
          )}
        </button>

        {diagOpen && (
          <div className="mt-4 space-y-4 border-t border-[#111827]/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-[#1F2937] whitespace-normal break-words">
                Developer-only server check against Cloud Firestore (no writes, field values
                hidden).
              </p>
              <button
                type="button"
                disabled={diagRunning}
                onClick={() => void handleRunDiagnostics()}
                className="neu-btn-slate inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full px-5 py-2.5 font-display text-sm font-bold text-[#006B5F] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{diagRunning ? 'Running test…' : 'Run test'}</span>
              </button>
            </div>

            <dl className="neu-inset-sm grid grid-cols-1 gap-3 rounded-2xl p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                  Initialized projectId
                </dt>
                <dd className="mt-1 font-mono font-semibold text-[#111827] break-all">
                  {diagResult?.projectId ?? diagMeta.projectId}
                </dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                  Initialized databaseId
                </dt>
                <dd className="mt-1 font-mono font-semibold text-[#111827] break-all">
                  {diagResult?.databaseId ?? diagMeta.databaseId}
                </dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                  Signed-in user uid
                </dt>
                <dd className="mt-1 font-mono font-semibold text-[#111827] break-all">
                  {diagResult?.uid ?? diagMeta.uid}
                </dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                  navigator.onLine
                </dt>
                <dd className="mt-1 font-mono font-semibold text-[#111827]">
                  {String(diagResult?.navigatorOnLine ?? diagMeta.navigatorOnLine)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                  Last successful server snapshot
                </dt>
                <dd className="mt-1 font-mono font-semibold text-[#111827] whitespace-normal break-words">
                  {lastServerSyncAt === null
                    ? 'None received yet'
                    : new Date(lastServerSyncAt).toLocaleString()}
                </dd>
              </div>
            </dl>

            {diagResult ? (
              <div className="space-y-3">
                <div className="neu-inset-sm rounded-2xl p-4 text-xs">
                  <div className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                    Unfiltered server query: potholes (limit 5)
                  </div>
                  {diagResult.unfilteredQuery.ok ? (
                    <p className="mt-1 font-mono font-semibold text-[#006B5F]">
                      {diagResult.unfilteredQuery.count} document(s) returned
                    </p>
                  ) : (
                    <p className="mt-1 font-mono font-semibold text-[#DC2626] whitespace-normal break-words">
                      Error [{diagResult.unfilteredQuery.errorCode}]:{' '}
                      {diagResult.unfilteredQuery.errorMessage}
                    </p>
                  )}
                </div>

                <div className="neu-inset-sm rounded-2xl p-4 text-xs">
                  <div className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                    Filtered server query: potholes where(&quot;classification&quot;, &quot;==&quot;,
                    &quot;POTHOLE&quot;) (limit 5)
                  </div>
                  {diagResult.filteredQuery.ok ? (
                    <p className="mt-1 font-mono font-semibold text-[#006B5F]">
                      {diagResult.filteredQuery.count} document(s) returned
                    </p>
                  ) : (
                    <p className="mt-1 font-mono font-semibold text-[#DC2626] whitespace-normal break-words">
                      Error [{diagResult.filteredQuery.errorCode}]:{' '}
                      {diagResult.filteredQuery.errorMessage}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="neu-inset-sm rounded-2xl p-4 text-xs">
                    <div className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                      Server query: devices (limit 5)
                    </div>
                    {diagResult.devicesQuery.ok ? (
                      <p className="mt-1 font-mono font-semibold text-[#006B5F]">
                        {diagResult.devicesQuery.count} document(s) returned
                      </p>
                    ) : (
                      <p className="mt-1 font-mono font-semibold text-[#DC2626] whitespace-normal break-words">
                        Error [{diagResult.devicesQuery.errorCode}]:{' '}
                        {diagResult.devicesQuery.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="neu-inset-sm rounded-2xl p-4 text-xs">
                    <div className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                      Server query: alerts (limit 5)
                    </div>
                    {diagResult.alertsQuery.ok ? (
                      <p className="mt-1 font-mono font-semibold text-[#006B5F]">
                        {diagResult.alertsQuery.count} document(s) returned
                      </p>
                    ) : (
                      <p className="mt-1 font-mono font-semibold text-[#DC2626] whitespace-normal break-words">
                        Error [{diagResult.alertsQuery.errorCode}]:{' '}
                        {diagResult.alertsQuery.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="neu-inset-sm rounded-2xl p-4 text-xs">
                  <div className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                    Sample document schemas (up to 3 docs — ID, field names &amp; types only)
                  </div>
                  {diagResult.sampleDocSchemas.length === 0 ? (
                    <p className="mt-1.5 font-medium text-[#1F2937]">
                      No sample documents available from unfiltered server query.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-2.5">
                      {diagResult.sampleDocSchemas.map((sample) => (
                        <div key={sample.id} className="rounded-xl bg-[#E6EBF2] p-3">
                          <div className="font-mono font-bold text-[#111827] break-all">
                            docId: {sample.id}
                          </div>
                          {sample.fields.length === 0 ? (
                            <div className="mt-1 font-mono text-[#1F2937]">(empty document)</div>
                          ) : (
                            <ul className="mt-1.5 space-y-0.5 font-mono text-[#1F2937]">
                              {sample.fields.map((field) => (
                                <li key={field.name} className="break-all">
                                  {field.name}: {field.type}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-[#1F2937]">
                Tap &quot;Run test&quot; to execute server queries and inspect field schemas.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Deployment check */}
      <section className="neu-raised-1 mt-6 rounded-3xl p-5">
        <button
          type="button"
          onClick={() => setDeployOpen((v) => !v)}
          aria-expanded={deployOpen}
          className="flex min-h-[56px] w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="neu-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#006B5F]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-base font-bold text-[#111827]">
                Deployment check
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                Developer only
              </div>
            </div>
          </div>
          {deployOpen ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-[#1F2937]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-[#1F2937]" aria-hidden="true" />
          )}
        </button>

        {deployOpen && (
          <div className="mt-4 space-y-4 border-t border-[#111827]/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-[#1F2937] whitespace-normal break-words">
                Checks hosting HTTPS, Firebase config presence (keys hidden), browser APIs, and PWA
                readiness.
              </p>
              <button
                type="button"
                disabled={deployRunning}
                onClick={() => void handleRunDeploymentCheck()}
                className="neu-btn-slate inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full px-5 py-2.5 font-display text-sm font-bold text-[#006B5F] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{deployRunning ? 'Running check…' : 'Run check'}</span>
              </button>
            </div>

            {deployResult ? (
              <div className="space-y-4">
                <div className="neu-inset-sm flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs font-bold">
                  <span className="text-[#111827]">
                    Passed {deployResult.passedCount} of {deployResult.totalCount} checks
                  </span>
                  <span className="text-[#1F2937] tabular-nums">
                    {new Date(deployResult.ranAt).toLocaleTimeString()}
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {deployResult.items.map((item) => {
                    const passed = item.status === 'pass';
                    return (
                      <li
                        key={item.id}
                        className="neu-inset-sm flex items-start justify-between gap-3 rounded-2xl p-3.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[#111827]">{item.label}</div>
                          <div className="mt-0.5 font-mono text-[#1F2937] whitespace-normal break-all">
                            {item.detail}
                          </div>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] ${
                            passed
                              ? 'bg-[#CCFBF1] text-[#006B5F]'
                              : 'bg-[#FEE2E2] text-[#DC2626]'
                          }`}
                        >
                          {passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>{passed ? 'Pass' : 'Fail'}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="neu-inset-sm rounded-2xl p-4 text-xs">
                  <div className="font-bold uppercase tracking-[0.05em] text-[#1F2937]">
                    Firebase configuration keys (values hidden)
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {deployResult.configKeys.map((entry) => (
                      <li key={entry.name} className="flex items-center justify-between gap-2 font-mono">
                        <span className="min-w-0 truncate text-[#111827]">{entry.name}</span>
                        <span
                          className={`shrink-0 font-bold uppercase ${
                            entry.present ? 'text-[#006B5F]' : 'text-[#DC2626]'
                          }`}
                        >
                          {entry.present ? 'Present' : 'Missing'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-[#1F2937]">
                Tap &quot;Run check&quot; to verify web deployment and device readiness.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
