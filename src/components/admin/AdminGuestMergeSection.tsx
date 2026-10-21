import React from 'react';
import { GitMerge, ArrowRight, AlertTriangle, CheckCircle2, XCircle, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import type { GuestMergePreviewResponse } from '../../types/database';

export interface MergePlayerOption {
  id: string;
  display_name: string;
}

interface AdminGuestMergeSectionProps {
  unmergedGuestPlayers: MergePlayerOption[];
  unmergedPermanentPlayers: MergePlayerOption[];
  mergeSourceGuestId: string;
  setMergeSourceGuestId: (val: string) => void;
  mergeTargetPermanentId: string;
  setMergeTargetPermanentId: (val: string) => void;
  mergePreview: GuestMergePreviewResponse | null;
  setMergePreview: React.Dispatch<React.SetStateAction<GuestMergePreviewResponse | null>>;
  setMergePreviewMatchSeq: React.Dispatch<React.SetStateAction<number | null>>;
  mergeConfirmedCheckbox: boolean;
  setMergeConfirmedCheckbox: (val: boolean) => void;
  mergeReason: string;
  setMergeReason: (val: string) => void;
  isPreviewStale: boolean;
  lastMergeOutcome: { published_rating_version_id: string } | null;
  handlePreviewGuestMerge: () => Promise<void>;
  handleExecuteGuestMerge: (e: React.FormEvent) => Promise<void>;
  isDemoMode: boolean;
  isMutating: boolean;
}

export function AdminGuestMergeSection({
  unmergedGuestPlayers,
  unmergedPermanentPlayers,
  mergeSourceGuestId,
  setMergeSourceGuestId,
  mergeTargetPermanentId,
  setMergeTargetPermanentId,
  mergePreview,
  setMergePreview,
  setMergePreviewMatchSeq,
  mergeConfirmedCheckbox,
  setMergeConfirmedCheckbox,
  mergeReason,
  setMergeReason,
  isPreviewStale,
  lastMergeOutcome,
  handlePreviewGuestMerge,
  handleExecuteGuestMerge,
  isDemoMode,
  isMutating,
}: AdminGuestMergeSectionProps) {
  const isFormReadyForPreview = Boolean(mergeSourceGuestId && mergeTargetPermanentId);

  return (
    <div
      data-testid="admin-section-guest-merge"
      className="bg-[#121c28] border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden"
    >
      {/* Decorative accent glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <GitMerge size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-full">
                Identity Reconciliation
              </span>
              <span className="text-xs text-slate-500">Section 4</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
              Guest-to-Permanent Player Merge
            </h3>
          </div>
        </div>

        <div className="self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
            <ShieldAlert size={13} className="text-amber-400" />
            Atomic Recalculation
          </span>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-400 mt-3 mb-5 leading-relaxed">
        Merging a temporary guest into a permanent player transfers all historical match participation,
        deduplicates session attendances, and automatically triggers an atomic chronological recalculation of all group ratings.
        Same-match conflicts are pre-checked before execution.
      </p>

      {/* Selector Grid */}
      <div className="bg-[#0b121b] border border-slate-800 rounded-xl p-4 sm:p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source Guest */}
          <div>
            <label
              htmlFor="admin-merge-source-guest"
              className="block text-xs font-semibold text-amber-300 uppercase tracking-wider mb-2"
            >
              Source Temporary Guest (UUID)
            </label>
            <div className="relative">
              <select
                id="admin-merge-source-guest"
                value={mergeSourceGuestId}
                onChange={(e) => {
                  setMergeSourceGuestId(e.target.value);
                  setMergePreview(null);
                  setMergePreviewMatchSeq(null);
                  setMergeConfirmedCheckbox(false);
                }}
                disabled={isDemoMode || isMutating}
                className="w-full h-11 px-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
              >
                <option value="">-- Select unmerged guest UUID --</option>
                {unmergedGuestPlayers.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.display_name} (UUID: {g.id})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Available guests: {unmergedGuestPlayers.length}
            </p>
          </div>

          {/* Target Permanent */}
          <div>
            <label
              htmlFor="admin-merge-target-permanent"
              className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2"
            >
              Target Permanent Player (UUID)
            </label>
            <div className="relative">
              <select
                id="admin-merge-target-permanent"
                value={mergeTargetPermanentId}
                onChange={(e) => {
                  setMergeTargetPermanentId(e.target.value);
                  setMergePreview(null);
                  setMergePreviewMatchSeq(null);
                  setMergeConfirmedCheckbox(false);
                }}
                disabled={isDemoMode || isMutating}
                className="w-full h-11 px-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
              >
                <option value="">-- Select permanent player UUID --</option>
                {unmergedPermanentPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} (UUID: {p.id})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Permanent players: {unmergedPermanentPlayers.length}
            </p>
          </div>
        </div>

        {/* Step 1 Generate Button */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold text-[10px] flex items-center justify-center">
              1
            </span>
            Generate server impact preview before confirming merge.
          </div>

          <button
            type="button"
            disabled={isDemoMode || isMutating || !isFormReadyForPreview}
            onClick={() => void handlePreviewGuestMerge()}
            data-testid="preview-guest-merge-btn"
            className="h-11 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider border border-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
          >
            {isMutating ? (
              <>
                <RefreshCw size={14} className="animate-spin text-amber-400" />
                Loading Preview...
              </>
            ) : (
              <>
                <Zap size={14} className="text-amber-400" />
                1. Generate Server Impact Preview
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step 2 Impact Preview Box */}
      {mergePreview && (
        <div
          data-testid="guest-merge-preview-box"
          className="bg-[#0b121b] border border-slate-700/80 rounded-xl p-4 sm:p-5 mb-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-800">
            <ArrowRight size={16} className="text-amber-400" />
            <h4 className="text-sm font-bold text-white tracking-tight">
              Server Merge Impact Preview:{' '}
              <span className="text-amber-300 font-mono">
                {mergePreview.source_guest_display_name}
              </span>{' '}
              →{' '}
              <span className="text-emerald-400 font-mono">
                {mergePreview.target_permanent_display_name}
              </span>
            </h4>
          </div>

          {/* Impact Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Matches to Re-attribute
              </span>
              <span
                data-testid="preview-affected-matches"
                className="text-xl font-black text-white font-mono mt-0.5 block"
              >
                {mergePreview.affected_match_count}
              </span>
            </div>

            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Guest Attendances
              </span>
              <span
                data-testid="preview-affected-attendance"
                className="text-xl font-black text-white font-mono mt-0.5 block"
              >
                {mergePreview.affected_session_attendance_count}
              </span>
            </div>

            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Overlap (Deduplicated)
              </span>
              <span
                data-testid="preview-overlapping-attendance"
                className="text-xl font-black text-amber-300 font-mono mt-0.5 block"
              >
                {mergePreview.overlapping_attendance_session_count}
              </span>
            </div>
          </div>

          {/* Eligibility Indicator */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Merge Feasibility Check:</span>
            {mergePreview.can_merge ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-lg">
                <CheckCircle2 size={14} />
                Eligible for Atomic Merge
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-950/60 border border-rose-800/60 px-3 py-1 rounded-lg">
                <XCircle size={14} />
                Blocked — Same-Match Conflict Detected
              </span>
            )}
          </div>

          {/* Conflict Alert */}
          {!mergePreview.can_merge && (
            <div
              role="alert"
              data-testid="guest-merge-conflict-alert"
              className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 mb-4 leading-relaxed"
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <div>
                <strong>Cannot merge:</strong> both identities participated in the same match(es):{' '}
                <span className="font-mono">{mergePreview.conflicting_match_ids.join(', ')}</span>.
                Merging would create an impossible state where a player plays against or with themselves.
              </div>
            </div>
          )}

          {/* Stale Warning Alert */}
          {isPreviewStale && (
            <div
              role="alert"
              data-testid="guest-merge-stale-preview-alert"
              className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5 mb-4 leading-relaxed"
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <strong>Warning:</strong> Group match history changed after this preview was generated.
                Please click &ldquo;1. Generate Server Impact Preview&rdquo; to refresh before executing.
              </div>
            </div>
          )}

          {/* Step 2 Execution Form */}
          {mergePreview.can_merge && !isPreviewStale && (
            <form
              onSubmit={(e) => void handleExecuteGuestMerge(e)}
              noValidate
              className="pt-3 border-t border-slate-800"
            >
              <div className="mb-4">
                <label
                  htmlFor="admin-merge-reason"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Audit Reason for Guest Merge (Required, min 3 chars)
                </label>
                <input
                  id="admin-merge-reason"
                  type="text"
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  disabled={isDemoMode || isMutating}
                  placeholder="e.g. Confirmed drop-in guest Ethan is permanent member Diana"
                  className="w-full h-11 px-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
                />
              </div>

              <div className="mb-4 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={mergeConfirmedCheckbox}
                    onChange={(e) => setMergeConfirmedCheckbox(e.target.checked)}
                    disabled={isDemoMode || isMutating}
                    data-testid="confirm-guest-merge-checkbox"
                    className="w-4 h-4 mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                  />
                  <span className="leading-relaxed">
                    I confirm merging guest UUID{' '}
                    <code className="text-amber-300 font-mono">
                      {mergePreview.source_guest_player_id}
                    </code>{' '}
                    into permanent player UUID{' '}
                    <code className="text-emerald-400 font-mono">
                      {mergePreview.target_permanent_player_id}
                    </code>{' '}
                    and recalculating chronological Elo ratings.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={
                  isDemoMode ||
                  isMutating ||
                  !mergeConfirmedCheckbox ||
                  isPreviewStale ||
                  mergeReason.trim().length < 3
                }
                data-testid="execute-guest-merge-btn"
                className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-[0.98] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
              >
                {isMutating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Executing Atomic Merge...
                  </>
                ) : (
                  <>
                    <GitMerge size={15} />
                    2. Confirm &amp; Execute Atomic Guest Merge
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Last Merge Outcome Notification */}
      {lastMergeOutcome && (
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-2 font-mono">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span>Last merge published rating version: {lastMergeOutcome.published_rating_version_id}</span>
        </div>
      )}
    </div>
  );
}
