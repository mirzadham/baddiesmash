import {
  AlertTriangle,
  Check,
  Flag,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type StatusBadgeVariant =
  | 'current'
  | 'recalculating'
  | 'stale_or_failed'
  | 'unverified'
  | 'provisional'
  | 'guest'
  | 'disputed'
  | 'voided'
  | 'active_session'
  | 'completed_session'
  | 'reopened_session'
  | 'demo_mode';

export interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  customLabel?: string;
}

const BADGE_CONFIG: Record<
  StatusBadgeVariant,
  { icon: ReactNode; defaultLabel: string; className: string }
> = {
  current: {
    icon: <Check size={12} strokeWidth={3} />,
    defaultLabel: 'Current',
    className: 'status-badge status-badge-current',
  },
  recalculating: {
    icon: <RefreshCw size={12} strokeWidth={2.5} />,
    defaultLabel: 'Recalculating',
    className: 'status-badge status-badge-recalculating',
  },
  stale_or_failed: {
    icon: <AlertTriangle size={12} strokeWidth={2.5} />,
    defaultLabel: 'Stale / Failed',
    className: 'status-badge status-badge-stale',
  },
  unverified: {
    icon: <AlertTriangle size={12} strokeWidth={2.5} />,
    defaultLabel: 'Status Unverified',
    className: 'status-badge status-badge-stale',
  },
  provisional: {
    icon: null,
    defaultLabel: 'Provisional (<3 matches)',
    className: 'status-badge status-badge-warning status-badge-provisional',
  },
  guest: {
    icon: <Star size={12} strokeWidth={2.5} fill="currentColor" />,
    defaultLabel: 'Guest',
    className: 'status-badge status-badge-neutral',
  },
  disputed: {
    icon: <Flag size={12} strokeWidth={2.5} />,
    defaultLabel: 'Disputed (Official)',
    className: 'status-badge status-badge-warning',
  },
  voided: {
    icon: <X size={12} strokeWidth={3} />,
    defaultLabel: 'Voided',
    className: 'status-badge status-badge-stale',
  },
  active_session: {
    icon: <PlayCircle size={12} strokeWidth={2.5} />,
    defaultLabel: 'Active Session',
    className: 'status-badge status-badge-current',
  },
  completed_session: {
    icon: <Check size={12} strokeWidth={3} />,
    defaultLabel: 'Finalized',
    className: 'status-badge status-badge-neutral',
  },
  reopened_session: {
    icon: <RefreshCw size={12} strokeWidth={2.5} />,
    defaultLabel: 'Reopened',
    className: 'status-badge status-badge-warning',
  },
  demo_mode: {
    icon: <Sparkles size={12} strokeWidth={2.5} />,
    defaultLabel: 'Demo Mode (Read-Only)',
    className: 'status-badge status-badge-recalculating',
  },
};

/**
 * Accessible status badge that pairs a crisp SVG icon with descriptive text
 * so status is never communicated by colour alone (UI-02).
 */
export function StatusBadge({ variant, customLabel }: StatusBadgeProps) {
  const cfg = BADGE_CONFIG[variant];
  const label = customLabel ?? cfg.defaultLabel;
  return (
    <span className={cfg.className} data-testid={`status-badge-${variant}`}>
      {cfg.icon ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {cfg.icon}
        </span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}
