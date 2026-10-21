import React, { useState } from 'react';
import { CheckCircle2, Flag, RotateCcw } from 'lucide-react';
import { formatMalaysiaDateTime } from '../../services/readViewModels.ts';

export interface SessionWrapUpSectionProps {
  completedMatchCount: number;
  incompleteDraftsCount: number;
  isControllerOrAdmin: boolean;
  isAdminOrOwner: boolean;
  sessionStatus: 'active' | 'completed' | 'reopened';
  sessionEndedAt?: string | null | undefined;
  isFinalizing: boolean;
  isReopening?: boolean | undefined;
  onFinalizeSession: () => void;
  onReopenSession?: ((reason: string) => Promise<void>) | undefined;
  isDemoMode?: boolean | undefined;
}

/**
 * Session Wrap-Up Section (Proposal 1 UX Placement):
 * - Positioned at the bottom of the active session card
 * - Summarizes matches completed & unfinished drafts status
 * - Prominent "Finalize & Lock Session" CTA
 * - Reopen form for completed sessions (Admin / Owner — Policy 3C)
 */
export function SessionWrapUpSection({
  completedMatchCount,
  incompleteDraftsCount,
  isControllerOrAdmin,
  isAdminOrOwner,
  sessionStatus,
  sessionEndedAt,
  isFinalizing,
  isReopening = false,
  onFinalizeSession,
  onReopenSession,
  isDemoMode = false,
}: SessionWrapUpSectionProps) {
  const [reopenReason, setReopenReason] = useState('');
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);
  const hasIncompleteDrafts = incompleteDraftsCount > 0;
  const isCompleted = sessionStatus === 'completed';

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onReopenSession || !reopenReason.trim()) return;
    setIsSubmittingReopen(true);
    try {
      await onReopenSession(reopenReason.trim());
      setReopenReason('');
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  return (
    <div className="py-4 px-4 bg-[#0e1620] flex flex-col gap-3 rounded-b-2xl border-t border-slate-800/80">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-sm sm:text-base text-slate-200">
          <Flag size={16} className="text-emerald-400" />
          <span>{isCompleted ? 'Session Finalized' : 'Session Wrap-Up'}</span>
        </div>
        <span className="text-xs text-slate-400">
          {completedMatchCount} completed matches
        </span>
      </div>

      {!isCompleted ? (
        <>
          {/* Drafts Pre-check Notice */}
          {hasIncompleteDrafts ? (
            <div
              role="alert"
              data-testid="finalize-blocked-incomplete-warning"
              className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium"
            >
              ⚠ <strong>Finalization Blocker:</strong> {incompleteDraftsCount}{' '}
              incomplete match draft(s) must be completed or voided below before this
              session can be finalized.
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 size={13} />
              <span>Ready to close — All drafts resolved</span>
            </div>
          )}

          {/* Prominent Finalize Action (Proposal 1) */}
          {isControllerOrAdmin && (
            <button
              type="button"
              data-testid="finalize-session-btn"
              onClick={onFinalizeSession}
              disabled={isDemoMode || isFinalizing}
              className="w-full py-3 px-4 rounded-xl border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white font-bold text-xs sm:text-sm transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-rose-950/40"
            >
              <Flag size={15} strokeWidth={2.5} />
              <span>{isFinalizing ? 'Finalizing...' : 'Finalize & Lock Session'}</span>
            </button>
          )}
        </>
      ) : (
        /* Completed Session Status & Reopen Form (Policy 3C) */
        <div className="flex flex-col gap-2.5 text-xs">
          <p className="text-slate-400 m-0">
            Session ended{' '}
            <strong className="text-white">
              {sessionEndedAt ? formatMalaysiaDateTime(sessionEndedAt) : 'Completed'}
            </strong>
            . Match entry and attendance changes are locked unless reopened by an
            Admin or Owner.
          </p>

          {isAdminOrOwner && onReopenSession && (
            <form
              onSubmit={handleReopenSubmit}
              data-testid="reopen-session-form"
              className="mt-1 pt-2 border-t border-slate-800/60 flex flex-col sm:flex-row items-stretch sm:items-end gap-2"
            >
              <div className="flex-1">
                <label
                  htmlFor="reopen-session-reason-input"
                  className="block text-[11px] font-semibold text-slate-300 mb-1"
                >
                  Reopen Session Reason (Admin/Owner — Policy 3C):
                </label>
                <input
                  id="reopen-session-reason-input"
                  type="text"
                  placeholder="e.g. Record forgotten final match of the evening"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  data-testid="reopen-session-reason-input"
                  className="w-full bg-[#101722] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={
                  isDemoMode ||
                  isReopening ||
                  isSubmittingReopen ||
                  !reopenReason.trim()
                }
                data-testid="reopen-session-btn"
                className="py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs border border-amber-600 shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40"
              >
                <RotateCcw size={13} strokeWidth={2.5} />
                <span>
                  {isReopening || isSubmittingReopen
                    ? 'Reopening...'
                    : 'Reopen Completed Session'}
                </span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
