import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  LocateFixed,
  LocateOff,
  RefreshCw,
  Share,
  ShieldAlert,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import type { RepairStatus, SeverityLevel, VerificationStatus } from '../types/terra';
import { formatTime24, formatVerificationLabel } from '../utils/geo';
import { getSeverityStyle, REPAIR_STATUS_LABELS, REPAIRED_STYLE } from '../utils/severity';

export const GpsStatusPill: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { gpsState, retryGps } = useAppData();
  const sizeClass = compact
    ? 'min-h-[34px] px-2.5 py-1 text-[11px] gap-1.5'
    : 'min-h-[44px] px-4 py-2 text-xs gap-2';

  if (gpsState === 'active') {
    return (
      <div
        className={`neu-inset-sm inline-flex shrink-0 items-center rounded-full font-bold text-[#111827] whitespace-nowrap ${sizeClass}`}
      >
        <LocateFixed className="h-3.5 w-3.5 shrink-0 text-[#006B5F]" aria-hidden="true" />
        <span className="tracking-wide">GPS Active</span>
      </div>
    );
  }

  if (gpsState === 'initializing') {
    return (
      <div
        className={`neu-inset-sm inline-flex shrink-0 items-center rounded-full font-bold text-[#1F2937] whitespace-nowrap ${sizeClass}`}
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#006B5F]" aria-hidden="true" />
        <span className="tracking-wide">
          {compact ? 'Waiting for fix…' : 'Waiting for first fix…'}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={retryGps}
      title="Retry location request"
      className={`neu-raised-1 inline-flex shrink-0 items-center rounded-full font-bold text-[#DC2626] whitespace-nowrap transition-transform active:scale-[0.98] ${
        compact ? 'min-h-[36px] px-2.5 py-1 text-[11px] gap-1.5' : 'min-h-[56px] px-4 py-2 text-xs gap-2'
      }`}
    >
      <LocateOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="tracking-wide">
        {gpsState === 'denied' ? 'Permission denied' : 'Location unavailable'}
      </span>
    </button>
  );
};

export const LiveSyncPill: React.FC = () => {
  const {
    isOnline,
    fromCache,
    hasServerSnapshot,
    hasEarlierData,
    lastServerSyncAt,
    dataError,
    refreshData,
  } = useAppData();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isOnline || (dataError !== null && hasEarlierData)) {
    return (
      <button
        type="button"
        onClick={() => void refreshData()}
        title="Retry server sync"
        className="neu-inset-sm inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[#1F2937] transition-transform active:scale-[0.98]"
      >
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" aria-hidden="true" />
        <span className="tabular-nums whitespace-normal text-left">
          {lastServerSyncAt === null
            ? 'Offline • showing saved data'
            : `Offline • showing saved data, last synced ${formatTime24(lastServerSyncAt)}`}
        </span>
      </button>
    );
  }

  if (dataError !== null) {
    return (
      <button
        type="button"
        onClick={() => void refreshData()}
        title="Retry server connection"
        className="neu-inset-sm inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[#DC2626] transition-transform active:scale-[0.98]"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="whitespace-normal text-left">{dataError.message}</span>
      </button>
    );
  }

  if (!hasServerSnapshot || fromCache || lastServerSyncAt === null) {
    return (
      <button
        type="button"
        onClick={() => void refreshData()}
        title="Connecting to Firestore server"
        className="neu-inset-sm inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[#1F2937] transition-transform active:scale-[0.98]"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#006B5F]" aria-hidden="true" />
        <span>Connecting…</span>
      </button>
    );
  }

  const diffSec = Math.max(0, Math.floor((nowMs - lastServerSyncAt) / 1000));
  const agoLabel = diffSec < 60 ? `${diffSec} s ago` : `${Math.floor(diffSec / 60)} min ago`;

  return (
    <button
      type="button"
      onClick={() => void refreshData()}
      title="Refresh live data"
      className="neu-raised-1 inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[#1F2937] transition-transform active:scale-[0.98]"
    >
      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-[#006B5F]" aria-hidden="true" />
      <span className="tabular-nums">Live • updated {agoLabel}</span>
    </button>
  );
};

export const ProfileAvatarButton: React.FC = () => (
  <Link
    to="/profile"
    aria-label="Open rider profile and settings"
    className="neu-raised-1 flex h-14 w-14 min-h-[56px] min-w-[56px] shrink-0 items-center justify-center rounded-full text-[#111827] transition-transform active:scale-95"
  >
    <span className="neu-inset-sm flex h-10 w-10 items-center justify-center rounded-full text-[#006B5F]">
      <User className="h-5 w-5" aria-hidden="true" />
    </span>
  </Link>
);

export const SeverityBadge: React.FC<{
  severity: SeverityLevel | null;
  repaired?: boolean;
  size?: 'sm' | 'md' | 'lg';
}> = ({ severity, repaired = false, size = 'sm' }) => {
  const style = repaired ? REPAIRED_STYLE : getSeverityStyle(severity);
  const sizeClass =
    size === 'lg'
      ? 'px-4 py-1.5 text-sm tracking-[0.06em]'
      : size === 'md'
        ? 'px-3 py-1 text-xs tracking-[0.06em]'
        : 'px-2.5 py-1 text-[11px] tracking-[0.06em]';

  return (
    <span
      style={{ backgroundColor: style.bgHex, color: style.textHex }}
      className={`inline-flex items-center justify-center rounded-full font-display font-bold uppercase whitespace-nowrap shrink-0 ${sizeClass}`}
    >
      {style.label}
    </span>
  );
};

export const RepairStatusBadge: React.FC<{ status: RepairStatus | null }> = ({ status }) => {
  const label = status ? REPAIR_STATUS_LABELS[status] : 'N/A';
  if (status === 'REPAIRED') {
    return (
      <span
        style={{ backgroundColor: '#16A34A', color: '#FFFFFF' }}
        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide whitespace-nowrap shrink-0"
      >
        {label}
      </span>
    );
  }
  if (status === 'IN_PROGRESS') {
    return (
      <span className="neu-inset-sm inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-[#006B5F] whitespace-nowrap shrink-0">
        {label}
      </span>
    );
  }
  return (
    <span className="neu-inset-sm inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-[#1F2937] whitespace-nowrap shrink-0">
      {label}
    </span>
  );
};

export const VerificationBadge: React.FC<{ verified: VerificationStatus }> = ({ verified }) => {
  const label = formatVerificationLabel(verified);
  if (verified === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#CCFBF1] px-2.5 py-1 text-[11px] font-bold text-[#006B5F] whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (verified === false) {
    return (
      <span className="neu-inset-sm inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-[#C2410C] whitespace-nowrap shrink-0">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="neu-inset-sm inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold text-[#6B7280] whitespace-nowrap shrink-0">
      Verification: N/A
    </span>
  );
};

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallAppButton: React.FC<{ variant?: 'compact' | 'card' }> = ({
  variant = 'compact',
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSDialog, setShowIOSDialog] = useState<boolean>(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            setIsInstalled(true);
            setDeferredPrompt(null);
          }
        }}
        className={
          variant === 'card'
            ? 'neu-teal flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 font-display text-base font-bold text-white transition-transform active:scale-[0.98]'
            : 'neu-raised-1 inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-[#006B5F] transition-transform active:scale-[0.98]'
        }
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSDialog(true)}
          className={
            variant === 'card'
              ? 'neu-btn-slate flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 font-display text-base font-bold text-[#111827] transition-transform active:scale-[0.98]'
              : 'neu-raised-1 inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-[#111827] transition-transform active:scale-[0.98]'
          }
        >
          <Share className="h-4 w-4 shrink-0 text-[#006B5F]" aria-hidden="true" />
          <span>Install on iOS</span>
        </button>

        {showIOSDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="neu-raised-2 w-full max-w-sm rounded-3xl p-6">
              <div className="flex items-start justify-between gap-3">
                <h3
                  id="ios-install-title"
                  className="font-display text-lg font-bold text-[#111827]"
                >
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSDialog(false)}
                  aria-label="Close installation instructions"
                  className="neu-raised-1 flex h-14 w-14 min-h-[56px] min-w-[56px] shrink-0 items-center justify-center rounded-full text-[#111827]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm font-medium text-[#1F2937]">
                <li>1. Tap the Share icon in your Safari toolbar.</li>
                <li>2. Scroll down and select Add to Home Screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSDialog(false)}
                className="neu-teal mt-6 flex min-h-[56px] w-full items-center justify-center rounded-full font-display text-sm font-bold text-white"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const AuthErrorBanner: React.FC<{
  message: string | null;
  errorCode: string | null;
}> = ({ message, errorCode }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [message, errorCode]);

  if (!message) return null;

  const isUnauthorizedDomain = errorCode === 'auth/unauthorized-domain';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const copyHostname = async () => {
    if (!hostname) return;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(hostname);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && typeof document !== 'undefined') {
      try {
        const ta = document.createElement('textarea');
        ta.value = hostname;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="alert"
      className="neu-inset-sm mt-4 rounded-2xl px-4 py-3 text-sm font-semibold text-[#DC2626]"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-normal break-words">
          {isUnauthorizedDomain
            ? "This site's address is not authorised in Firebase yet."
            : message}
        </span>
      </div>
      {isUnauthorizedDomain && (
        <div className="mt-3 space-y-2.5 text-[#111827]">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#E6EBF2] px-3 py-2">
            <code className="min-w-0 flex-1 font-mono text-xs font-bold text-[#111827] break-all">
              {hostname || '(unknown hostname)'}
            </code>
            <button
              type="button"
              onClick={() => void copyHostname()}
              aria-label="Copy site hostname"
              className="neu-raised-1 inline-flex min-h-[56px] shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 font-display text-xs font-bold text-[#006B5F] transition-transform active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
            Add this under Firebase console &gt; Authentication &gt; Settings &gt; Authorized
            domains.
          </p>
        </div>
      )}
    </div>
  );
};
