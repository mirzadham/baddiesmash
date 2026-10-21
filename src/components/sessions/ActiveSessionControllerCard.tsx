import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { StatusBadge } from '../StatusBadge.tsx';
import type {
  DbGroupMembershipRow,
  DbPlayerRow,
  DbSessionRow,
} from '../../types/database.ts';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import { formatMalaysiaDate } from '../../services/readViewModels.ts';
import { AttendanceSection } from './AttendanceSection.tsx';
import {
  LiveDoublesRecorderCard,
  type ActiveUndoPromptState,
} from './LiveDoublesRecorderCard.tsx';
import {
  SessionStandingsSummary,
  type SessionStandingSummaryItem,
} from './SessionStandingsSummary.tsx';
import { SessionMatchHistorySection } from './SessionMatchHistorySection.tsx';
import { SessionWrapUpSection } from './SessionWrapUpSection.tsx';
import type { ScoreValidationResult } from '../../domain/scoring.ts';

export interface ActiveSessionControllerCardProps {
  session: DbSessionRow;
  controllerDisplay: string;
  isViewerController: boolean;
  canTakeover: boolean;
  canRecord: boolean;
  canViewerMutateSession: boolean;
  isAdminOrOwner: boolean;
  isDemoMode: boolean;
  // Handover / Takeover
  eligibleHandoverRecipients: DbGroupMembershipRow[];
  playerMap: Map<string, DbPlayerRow>;
  handoverTargetUserId: string;
  onHandoverTargetUserIdChange: (val: string) => void;
  handoverReason: string;
  onHandoverReasonChange: (val: string) => void;
  isUpdatingController: boolean;
  onVoluntaryHandover: (e: React.FormEvent) => void;
  takeoverReason: string;
  onTakeoverReasonChange: (val: string) => void;
  onClaimOrTakeoverController: (e: React.FormEvent) => void;
  // Inactivity / Stale 12h
  isStale12hWarning: boolean;
  // Attendance
  attendees: DbPlayerRow[];
  allGroupPlayers: DbPlayerRow[];
  benchAttendees: DbPlayerRow[];
  presentAttendeeIds: Set<string>;
  playedInSessionPlayerIds: Set<string>;
  canEditAttendance: boolean;
  onToggleAttendance: (playerId: string, present: boolean) => void;
  togglingAttendancePlayerId: string | null;
  newGuestDisplayName: string;
  onNewGuestDisplayNameChange: (val: string) => void;
  duplicateGuestNameExists: boolean;
  isCreatingGuest: boolean;
  onCreateGuestAndCheckIn: (e: React.FormEvent) => void;
  // Incomplete Drafts
  incompleteDraftCards: EnrichedMatchCard[];
  failedVoidDraftId: string | null;
  onResumeDraftInForm: (draft: EnrichedMatchCard) => void;
  onVoidIncompleteDraft: (draftId: string) => void;
  // Live Recorder
  isSessionOpenForRecording: boolean;
  playerA1Id: string;
  playerA2Id: string;
  playerB1Id: string;
  playerB2Id: string;
  onSelectA1: (id: string) => void;
  onSelectA2: (id: string) => void;
  onSelectB1: (id: string) => void;
  onSelectB2: (id: string) => void;
  scoreAInput: string;
  scoreBInput: string;
  onScoreAChange: (val: string) => void;
  onScoreBChange: (val: string) => void;
  scoreValidation: ScoreValidationResult;
  isSavingMatch: boolean;
  submissionId: string;
  duplicateParticipantError: string | null;
  matchSaveError: string | null;
  resumingDraftMatchId?: string | null | undefined;
  onCancelResumeDraft?: (() => void) | undefined;
  activeUndoPrompt: ActiveUndoPromptState | null;
  undoSecondsRemaining: number;
  isUndoing: boolean;
  onRecordMatch: (e: React.FormEvent) => void;
  onSaveDraft: () => void;
  onSwapPartners: () => void;
  onSwapTeams: () => void;
  onImmediateUndo: () => void;
  onDismissUndo: () => void;
  onRetryMatchSave?: (() => void) | undefined;
  // Standings & History
  standings: readonly SessionStandingSummaryItem[];
  matches: readonly EnrichedMatchCard[];
  onSubmitCorrection: (
    matchId: string,
    payload: {
      action: 'correct' | 'void';
      reason: string;
      teamAScore?: number;
      teamBScore?: number;
      teamAPlayer1?: string;
      teamAPlayer2?: string;
      teamBPlayer1?: string;
      teamBPlayer2?: string;
    },
  ) => Promise<void>;
  onSelectPlayer: (playerId: string) => void;
  // Wrap-up & Finalize
  incompleteDraftsCount: number;
  isFinalizing: boolean;
  onFinalizeSession: () => void;
  onReopenSession?: ((reason: string) => Promise<void>) | undefined;
  isReopening?: boolean | undefined;
}

/**
 * All-In-One Active Session Card matching session_new_2.jfif:
 * - Header: "Session - Monday, Oct 19, 2026", [Active 🟢] badge, Date & Court
 * - Controller Lease with Handover / Takeover forms
 * - Start time editor
 * - 12h Inactivity warning banner
 * - Attendance with Bench Counter, Avatars & Roster
 * - Incomplete match draft cards
 * - Live Doubles Recorder with Player Selectors, Large Scores, 10s Undo Banner
 * - Live Session Standings
 * - Match Corrections & History
 * - Session Wrap-Up (Proposal 1) with Finalize & Lock Session CTA / Reopen form
 */
export function ActiveSessionControllerCard({
  session,
  controllerDisplay,
  isViewerController,
  canTakeover,
  canRecord,
  canViewerMutateSession,
  isAdminOrOwner,
  isDemoMode,
  eligibleHandoverRecipients,
  playerMap,
  handoverTargetUserId,
  onHandoverTargetUserIdChange,
  handoverReason,
  onHandoverReasonChange,
  isUpdatingController,
  onVoluntaryHandover,
  takeoverReason,
  onTakeoverReasonChange,
  onClaimOrTakeoverController,
  isStale12hWarning,
  attendees,
  allGroupPlayers,
  benchAttendees,
  presentAttendeeIds,
  playedInSessionPlayerIds,
  canEditAttendance,
  onToggleAttendance,
  togglingAttendancePlayerId,
  newGuestDisplayName,
  onNewGuestDisplayNameChange,
  duplicateGuestNameExists,
  isCreatingGuest,
  onCreateGuestAndCheckIn,
  incompleteDraftCards,
  failedVoidDraftId,
  onResumeDraftInForm,
  onVoidIncompleteDraft,
  isSessionOpenForRecording,
  playerA1Id,
  playerA2Id,
  playerB1Id,
  playerB2Id,
  onSelectA1,
  onSelectA2,
  onSelectB1,
  onSelectB2,
  scoreAInput,
  scoreBInput,
  onScoreAChange,
  onScoreBChange,
  scoreValidation,
  isSavingMatch,
  submissionId,
  duplicateParticipantError,
  matchSaveError,
  resumingDraftMatchId,
  onCancelResumeDraft,
  activeUndoPrompt,
  undoSecondsRemaining,
  isUndoing,
  onRecordMatch,
  onSaveDraft,
  onSwapPartners,
  onSwapTeams,
  onImmediateUndo,
  onDismissUndo,
  onRetryMatchSave,
  standings,
  matches,
  onSubmitCorrection,
  onSelectPlayer,
  incompleteDraftsCount,
  isFinalizing,
  onFinalizeSession,
  onReopenSession,
  isReopening,
}: ActiveSessionControllerCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const completedMatchCount = matches.filter(
    (m) => m.match.status === 'completed',
  ).length;

  return (
    <div
      data-testid="active-session-card"
      className="rounded-2xl border border-emerald-500/30 bg-[#121a24] shadow-2xl transition-all duration-200 overflow-hidden mb-6"
    >
      <div data-testid="session-detail-panel">
      {/* Active Session Header Bar */}
      <div className="p-4 sm:p-4.5 bg-gradient-to-r from-emerald-950/40 via-[#121a24] to-[#121a24] border-b border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                session.status === 'active'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <h2
              id="session-detail-heading"
              className="font-bold text-base sm:text-lg text-white tracking-tight truncate"
            >
              Session — {formatMalaysiaDate(session.session_started_at)}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge
              variant={
                session.status === 'active'
                  ? 'active_session'
                  : session.status === 'reopened'
                    ? 'reopened_session'
                    : 'completed_session'
              }
            />
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
              aria-label={isExpanded ? 'Collapse Session' : 'Expand Session'}
            >
              {isExpanded ? (
                <ChevronUp size={20} strokeWidth={2.5} />
              ) : (
                <ChevronDown size={20} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>

        {/* Sub-row: Court & Start Date */}
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-800/60 text-xs text-slate-400 flex-wrap">
          <div className="flex items-center gap-1.5 truncate">
            <Clock size={12} className="text-slate-500" />
            <span>Court 1 • Started {formatMalaysiaDate(session.session_started_at)}</span>
          </div>
        </div>

        {/* Controller Lease, Handover & Takeover Section (SES-02) */}
        <div
          data-testid="session-controller-panel"
          className="mt-2.5 pt-2 border-t border-slate-800/60 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="text-slate-400">Active Controller:</span>
              <strong
                data-testid="current-controller-display"
                className="text-white"
              >
                {controllerDisplay}
              </strong>
            </div>
            <span className="text-[11px] text-slate-500 rating-mono">
              v{session.controller_lease_version}
            </span>
          </div>

          {/* Handover / Takeover Actions */}
          {isSessionOpenForRecording && canRecord && (
            <div>
              {isViewerController ? (
                <form
                  onSubmit={onVoluntaryHandover}
                  data-testid="controller-handover-form"
                  className="p-2.5 rounded-xl bg-[#101722] border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-end gap-2"
                >
                  <div className="flex-1">
                    <label
                      htmlFor="handover-recipient-select"
                      className="block text-[10px] text-slate-400 mb-0.5"
                    >
                      Hand Over To Member:
                    </label>
                    <select
                      id="handover-recipient-select"
                      value={handoverTargetUserId}
                      onChange={(e) =>
                        onHandoverTargetUserIdChange(e.target.value)
                      }
                      data-testid="handover-recipient-select"
                      className="w-full bg-[#16202e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="">-- Select Recorder / Admin --</option>
                      {eligibleHandoverRecipients.map((m) => {
                        const p = m.linked_player_id
                          ? playerMap.get(m.linked_player_id)
                          : null;
                        return (
                          <option key={m.user_id} value={m.user_id}>
                            {p
                              ? `${p.display_name} (${m.role})`
                              : `${m.role} (${m.user_id.slice(0, 8)})`}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="handover-reason-input"
                      className="block text-[10px] text-slate-400 mb-0.5"
                    >
                      Handover Reason:
                    </label>
                    <input
                      id="handover-reason-input"
                      type="text"
                      placeholder="e.g. Stepping onto court to play"
                      value={handoverReason}
                      onChange={(e) =>
                        onHandoverReasonChange(e.target.value)
                      }
                      data-testid="handover-reason-input"
                      className="w-full bg-[#16202e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      isDemoMode ||
                      isUpdatingController ||
                      !handoverTargetUserId
                    }
                    data-testid="confirm-handover-btn"
                    className="py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
                  >
                    {isUpdatingController ? 'Handing Over...' : 'Hand Over'}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={onClaimOrTakeoverController}
                  data-testid="controller-takeover-section"
                  className="p-2.5 rounded-xl bg-[#101722] border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-end gap-2"
                >
                  <div className="flex-1">
                    <label
                      htmlFor="takeover-reason-input"
                      className="block text-[10px] text-slate-400 mb-0.5"
                    >
                      Takeover Reason (Increments Lease):
                    </label>
                    <input
                      id="takeover-reason-input"
                      type="text"
                      placeholder="e.g. Previous controller phone unavailable"
                      value={takeoverReason}
                      onChange={(e) => onTakeoverReasonChange(e.target.value)}
                      data-testid="takeover-reason-input"
                      className="w-full bg-[#16202e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      isDemoMode ||
                      isUpdatingController ||
                      !takeoverReason.trim() ||
                      !canTakeover
                    }
                    data-testid="claim-controller-btn"
                    className="py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap disabled:opacity-40"
                  >
                    <Zap size={12} />
                    <span>Takeover Controller 🏸</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 12-Hour Stale Inactivity Banner (SES-04) */}
      {isStale12hWarning && (
        <div
          role="region"
          aria-label="Stale session warning"
          data-testid="stale-session-warning-banner"
          className="p-3 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs flex items-center gap-2"
        >
          <span>⚠</span>
          <span>
            <strong>Inactive Session Notice:</strong> This session has
            had no match activity for 12+ hours. Sessions are never automatically
            closed; the current controller or an Admin/Owner may finalize it
            below.
          </span>
        </div>
      )}

      {/* Expanded Controller Body matching session_new_2.jfif */}
      {isExpanded && (
        <div className="flex flex-col">
          {/* Section 1: Attendance & Bench Tracking */}
          <AttendanceSection
            attendees={attendees}
            allGroupPlayers={allGroupPlayers}
            benchAttendees={benchAttendees}
            presentAttendeeIds={presentAttendeeIds}
            playedInSessionPlayerIds={playedInSessionPlayerIds}
            canEditAttendance={canEditAttendance}
            onToggleAttendance={onToggleAttendance}
            togglingAttendancePlayerId={togglingAttendancePlayerId}
            isDemoMode={isDemoMode}
            newGuestDisplayName={newGuestDisplayName}
            onNewGuestDisplayNameChange={onNewGuestDisplayNameChange}
            duplicateGuestNameExists={duplicateGuestNameExists}
            isCreatingGuest={isCreatingGuest}
            onCreateGuestAndCheckIn={onCreateGuestAndCheckIn}
            onSelectPlayer={onSelectPlayer}
          />

          {/* Incomplete Match Drafts Section (SES-03) */}
          {incompleteDraftCards.length > 0 && (
            <div
              data-testid="incomplete-drafts-section"
              className="py-3 px-4 border-b border-amber-500/30 bg-amber-500/5 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-300">
                  Unresolved Incomplete Match Drafts ({incompleteDraftCards.length})
                </span>
                <span className="text-[11px] text-amber-400">
                  Resolve before finalization
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {incompleteDraftCards.map((draft) => (
                  <div
                    key={draft.match.id}
                    data-testid={`incomplete-draft-${draft.match.id}`}
                    className="p-2.5 rounded-xl bg-[#16202e] border border-amber-500/30 flex items-center justify-between gap-2 text-xs flex-wrap"
                  >
                    <span className="font-semibold text-slate-200">
                      Draft: {draft.teamA[0]?.displayName} &amp;{' '}
                      {draft.teamA[1]?.displayName} vs{' '}
                      {draft.teamB[0]?.displayName} &amp;{' '}
                      {draft.teamB[1]?.displayName}
                    </span>

                    {canViewerMutateSession && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {failedVoidDraftId === draft.match.id ? (
                          <>
                            <span
                              data-testid={`failed-void-notice-${draft.match.id}`}
                              className="text-rose-400 font-semibold text-[11px]"
                            >
                              ⚠ Void Failed
                            </span>
                            <button
                              type="button"
                              data-testid={`retry-void-draft-btn-${draft.match.id}`}
                              onClick={() => onVoidIncompleteDraft(draft.match.id)}
                              className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[11px]"
                            >
                              Retry Void
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              data-testid={`resume-draft-btn-${draft.match.id}`}
                              onClick={() => onResumeDraftInForm(draft)}
                              className="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-[11px]"
                            >
                              Resume Draft
                            </button>
                            <button
                              type="button"
                              data-testid={`void-draft-btn-${draft.match.id}`}
                              onClick={() => onVoidIncompleteDraft(draft.match.id)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 font-semibold text-[11px] border border-rose-500/30"
                            >
                              Void Draft
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Live Doubles Match Recorder */}
          {isSessionOpenForRecording && (
            <LiveDoublesRecorderCard
              attendees={attendees}
              playerA1Id={playerA1Id}
              playerA2Id={playerA2Id}
              playerB1Id={playerB1Id}
              playerB2Id={playerB2Id}
              onSelectA1={onSelectA1}
              onSelectA2={onSelectA2}
              onSelectB1={onSelectB1}
              onSelectB2={onSelectB2}
              scoreAInput={scoreAInput}
              scoreBInput={scoreBInput}
              onScoreAChange={onScoreAChange}
              onScoreBChange={onScoreBChange}
              scoreValidation={scoreValidation}
              isController={isViewerController}
              isSaving={isSavingMatch}
              submissionId={submissionId}
              duplicateParticipantError={duplicateParticipantError}
              matchSaveError={matchSaveError}
              resumingDraftMatchId={resumingDraftMatchId}
              onCancelResumeDraft={onCancelResumeDraft}
              activeUndoPrompt={activeUndoPrompt}
              undoSecondsRemaining={undoSecondsRemaining}
              isUndoing={isUndoing}
              onRecordMatch={onRecordMatch}
              onSaveDraft={onSaveDraft}
              onSwapPartners={onSwapPartners}
              onSwapTeams={onSwapTeams}
              onImmediateUndo={onImmediateUndo}
              onDismissUndo={onDismissUndo}
              onRetryMatchSave={onRetryMatchSave}
            />
          )}

          {/* Section 3: Live Session Standings */}
          <SessionStandingsSummary
            standings={standings}
            onSelectPlayer={onSelectPlayer}
          />

          {/* Section 4: Match Corrections & History */}
          <SessionMatchHistorySection
            matches={matches}
            isAdminOrOwner={isAdminOrOwner}
            canViewerMutateSession={canViewerMutateSession}
            presentAttendeePlayers={attendees}
            onSelectPlayer={onSelectPlayer}
            onSubmitCorrection={onSubmitCorrection}
            isDemoMode={isDemoMode}
          />

          {/* Section 5: Session Wrap-Up & Finalize CTA (Proposal 1) */}
          <SessionWrapUpSection
            completedMatchCount={completedMatchCount}
            incompleteDraftsCount={incompleteDraftsCount}
            isControllerOrAdmin={isViewerController || isAdminOrOwner}
            isAdminOrOwner={isAdminOrOwner}
            sessionStatus={session.status}
            sessionEndedAt={session.session_ended_at}
            isFinalizing={isFinalizing}
            isReopening={isReopening}
            onFinalizeSession={onFinalizeSession}
            onReopenSession={onReopenSession}
            isDemoMode={isDemoMode}
          />
        </div>
      )}
      </div>
    </div>
  );
}
