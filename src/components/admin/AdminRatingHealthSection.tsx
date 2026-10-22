import { Activity, ShieldCheck, Database } from 'lucide-react';
import { PublicationStatusBanner } from '../PublicationStatusBanner';
import type { EffectivePublicationBannerState } from '../../services/trackerRepository';
import type { MembershipRole } from '../../types/database';

export interface AdminRatingHealthSectionProps {
  publication: EffectivePublicationBannerState | null | undefined;
  viewerRole: MembershipRole;
  isDemoMode: boolean;
  onRetryRecalculation?: (() => Promise<void>) | undefined;
}

export function AdminRatingHealthSection({
  publication,
  viewerRole,
  isDemoMode,
  onRetryRecalculation,
}: AdminRatingHealthSectionProps) {
  if (!publication) {
    return null;
  }

  const isCurrent = publication.isCurrent;

  return (
    <div
      data-testid="admin-section-ratings"
      className="bg-[#121c28] border border-slate-800/80 rounded-2xl p-4 sm:p-6 relative overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md">
                System Engine
              </span>
              <span className="text-xs text-slate-500">Section 6</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
              Rating System Health &amp; Recalculation
            </h3>
          </div>
        </div>

        <div className="self-start sm:self-auto">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
              isCurrent
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <ShieldCheck size={13} />
            {isCurrent ? 'Engine Healthy' : 'Recalculation Pending'}
          </span>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-400 mt-3 mb-5 leading-relaxed">
        Ratings and rankings are derived deterministically from the authoritative match history.
        If a server recalculation is interrupted or fails due to network timeouts, you can trigger a safe, idempotent recalculation from this panel.
      </p>

      {/* Embedded Publication Status Banner & Control */}
      <div className="bg-[#0b121b] border border-slate-800 rounded-xl p-3 sm:p-4">
        <PublicationStatusBanner
          publication={publication}
          viewerRole={viewerRole}
          isDemoMode={isDemoMode}
          onRetryRecalculation={onRetryRecalculation}
        />
      </div>

      {/* Metadata footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
        <span className="flex items-center gap-1.5">
          <Database size={12} className="text-slate-400" />
          Match State: #{publication.publishedSeq ?? 'none'} / Required #{publication.requiredSeq}
        </span>
        <span>Deterministic Chronological Recalculation</span>
      </div>
    </div>
  );
}
