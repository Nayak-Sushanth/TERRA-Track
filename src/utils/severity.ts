import type { PotholeRecord, RepairStatus, SeverityLevel } from '../types/terra';

export interface SeverityStyle {
  label: string;
  bgHex: string;
  textHex: string;
  dotHex: string;
  rank: number;
}

export const SEVERITY_STYLES: Record<SeverityLevel, SeverityStyle> = {
  CRITICAL: {
    label: 'CRITICAL',
    bgHex: '#DC2626',
    textHex: '#FFFFFF',
    dotHex: '#DC2626',
    rank: 4,
  },
  HIGH: {
    label: 'HIGH',
    bgHex: '#C2410C',
    textHex: '#FFFFFF',
    dotHex: '#C2410C',
    rank: 3,
  },
  MEDIUM: {
    label: 'MEDIUM',
    bgHex: '#FACC15',
    textHex: '#111827',
    dotHex: '#FACC15',
    rank: 2,
  },
  LOW: {
    label: 'LOW',
    bgHex: '#1D4ED8',
    textHex: '#FFFFFF',
    dotHex: '#1D4ED8',
    rank: 1,
  },
};

export const REPAIRED_STYLE: SeverityStyle = {
  label: 'REPAIRED',
  bgHex: '#16A34A',
  textHex: '#FFFFFF',
  dotHex: '#16A34A',
  rank: 0,
};

export const UNKNOWN_SEVERITY_STYLE: SeverityStyle = {
  label: 'N/A',
  bgHex: '#6B7280',
  textHex: '#FFFFFF',
  dotHex: '#6B7280',
  rank: 0,
};

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  REPAIRED: 'Repaired',
};

export const ALL_SEVERITIES: SeverityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function isActiveHazard(pothole: PotholeRecord): boolean {
  return pothole.repairStatus !== 'REPAIRED';
}

export function getSeverityStyle(severity: SeverityLevel | null): SeverityStyle {
  return severity ? SEVERITY_STYLES[severity] : UNKNOWN_SEVERITY_STYLE;
}

export function getMarkerStyle(pothole: PotholeRecord): SeverityStyle {
  if (pothole.repairStatus === 'REPAIRED') {
    return REPAIRED_STYLE;
  }
  return getSeverityStyle(pothole.severity);
}

export function getSeverityRank(severity: SeverityLevel | null): number {
  return severity ? SEVERITY_STYLES[severity].rank : 0;
}
