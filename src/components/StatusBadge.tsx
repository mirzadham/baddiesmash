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
  { icon: string; defaultLabel: string; className: string }
> = {
  current: {
    icon: '✓',
    defaultLabel: 'Current',
    className: 'status-badge status-badge-current',
  },
  recalculating: {
    icon: '↻',
    defaultLabel: 'Recalculating',
    className: 'status-badge status-badge-recalculating',
  },
  stale_or_failed: {
    icon: '⚠',
    defaultLabel: 'Stale / Failed',
    className: 'status-badge status-badge-stale',
  },
  unverified: {
    icon: '⚠',
    defaultLabel: 'Status Unverified',
    className: 'status-badge status-badge-stale',
  },
  provisional: {
    icon: '◐',
    defaultLabel: 'Provisional (<3 matches)',
    className: 'status-badge status-badge-warning',
  },
  guest: {
    icon: '★',
    defaultLabel: 'Guest',
    className: 'status-badge status-badge-neutral',
  },
  disputed: {
    icon: '⚑',
    defaultLabel: 'Disputed (Official)',
    className: 'status-badge status-badge-warning',
  },
  voided: {
    icon: '✕',
    defaultLabel: 'Voided',
    className: 'status-badge status-badge-stale',
  },
  active_session: {
    icon: '●',
    defaultLabel: 'Active Session',
    className: 'status-badge status-badge-current',
  },
  completed_session: {
    icon: '✓',
    defaultLabel: 'Finalized',
    className: 'status-badge status-badge-neutral',
  },
  reopened_session: {
    icon: '↺',
    defaultLabel: 'Reopened',
    className: 'status-badge status-badge-warning',
  },
  demo_mode: {
    icon: '◈',
    defaultLabel: 'Demo Mode (Read-Only)',
    className: 'status-badge status-badge-recalculating',
  },
};

/**
 * Accessible status badge that pairs an explicit icon/symbol with descriptive text
 * so status is never communicated by colour alone (UI-02).
 */
export function StatusBadge({ variant, customLabel }: StatusBadgeProps) {
  const cfg = BADGE_CONFIG[variant];
  const label = customLabel ?? cfg.defaultLabel;
  return (
    <span className={cfg.className} data-testid={`status-badge-${variant}`}>
      <span aria-hidden="true">{cfg.icon}</span>
      <span>{label}</span>
    </span>
  );
}
