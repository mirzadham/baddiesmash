import type React from 'react';
import { ArrowUpDown, RotateCcw, Shuffle, AlertTriangle, Check, Clock, X } from 'lucide-react';
import type { DbPlayerRow } from '../../types/database.ts';
import type { ScoreValidationResult } from '../../domain/scoring.ts';

export interface ActiveUndoPromptState {
  matchId: string;
  sequenceNumber: number;
  undoExpiresAtIso: string;
  recordedByUserId: string;
}

export interface LiveDoublesRecorderCardProps {
  attendees: DbPlayerRow[];
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
  isController: boolean;
  isSaving: boolean;
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
}

/**
 * Live Doubles Match Recorder Card matching session_new_2.jfif:
 * - Header: "Live Doubles Recorder" with "Side Swap ⇄"
 * - Player Selectors: Team 1 (A1, A2) vs Team 2 (B1, B2)
 * - Large Score Inputs: [ 18 ] - [ 15 ] with 21pt rules validation indicator
 * - Actions: "Save Draft" & "Record Match" (emerald CTA)
 * - 10-Second Immediate Undo Banner
 */
export function LiveDoublesRecorderCard({
  attendees,
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
  isController,
  isSaving,
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
}: LiveDoublesRecorderCardProps) {
  const canSubmit =
    isController &&
    scoreValidation.valid &&
    !duplicateParticipantError &&
    !isSaving &&
    playerA1Id &&
    playerA2Id &&
    playerB1Id &&
    playerB2Id;

  return (
    <div className="py-3 px-4 border-b border-slate-800/80 flex flex-col gap-3">
      {/* Header with Quick Action */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm sm:text-base text-slate-200">
          Live Doubles Recorder
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSwapPartners}
            className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors cursor-pointer flex items-center gap-1"
            data-testid="swap-partners-btn"
            title="Switch partners between Team 1 and Team 2 (A2 ⇄ B1)"
          >
            <Shuffle size={12} strokeWidth={2.5} />
            <span>Swap Partners</span>
          </button>
          <button
            type="button"
            onClick={onSwapTeams}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1"
            data-testid="swap-teams-btn"
            title="Swap Sides (Team 1 ⇄ Team 2)"
          >
            <ArrowUpDown size={12} strokeWidth={2.5} />
            <span>Side Swap</span>
          </button>
        </div>
      </div>

      {/* Match Entry Form */}
      <form
        data-testid="match-entry-panel"
        onSubmit={onRecordMatch}
        className="flex flex-col gap-3"
      >
        {/* Resuming Draft Banner (SES-03) */}
        {resumingDraftMatchId && (
          <div
            role="status"
            data-testid="resuming-draft-banner"
            className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between"
          >
            <span>
              Resuming incomplete draft match. Submitting will complete this match and void the draft.
            </span>
            {onCancelResumeDraft && (
              <button
                type="button"
                onClick={onCancelResumeDraft}
                className="text-amber-400 hover:text-white font-semibold cursor-pointer text-xs ml-2 flex-shrink-0"
              >
                Cancel
              </button>
            )}
          </div>
        )}
        {/* Hidden Client Submission ID for Idempotency Test Assertions */}
        <span
          data-testid="match-submission-id"
          style={{ display: 'none' }}
        >
          {submissionId}
        </span>

        {/* Player Selectors: Team 1 vs Team 2 */}
        <div className="rounded-xl border border-slate-800/80 bg-[#16202e] p-3 flex flex-col gap-2.5">
          {/* Team 1 Slots */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-emerald-400">Team 1</span>
            <div className="grid grid-cols-2 gap-2">
              <select
                id="match-slot-a1"
                name="match_slot_a1"
                data-testid="match-slot-a1"
                aria-label="Team 1 Player 1"
                value={playerA1Id}
                onChange={(e) => onSelectA1(e.target.value)}
                disabled={!isController || isSaving}
                className="w-full bg-[#101722] border border-slate-700/80 text-white text-xs sm:text-sm rounded-lg px-2.5 py-2 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">Select T1 Player 1...</option>
                {attendees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>

              <select
                id="match-slot-a2"
                name="match_slot_a2"
                data-testid="match-slot-a2"
                aria-label="Team 1 Player 2"
                value={playerA2Id}
                onChange={(e) => onSelectA2(e.target.value)}
                disabled={!isController || isSaving}
                className="w-full bg-[#101722] border border-slate-700/80 text-white text-xs sm:text-sm rounded-lg px-2.5 py-2 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">Select T1 Player 2...</option>
                {attendees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-[11px] font-bold text-slate-500 bg-[#101722] px-2.5 py-0.5 rounded-full border border-slate-800">
              VS
            </span>
          </div>

          {/* Team 2 Slots */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-blue-400">Team 2</span>
            <div className="grid grid-cols-2 gap-2">
              <select
                id="match-slot-b1"
                name="match_slot_b1"
                data-testid="match-slot-b1"
                aria-label="Team 2 Player 1"
                value={playerB1Id}
                onChange={(e) => onSelectB1(e.target.value)}
                disabled={!isController || isSaving}
                className="w-full bg-[#101722] border border-slate-700/80 text-white text-xs sm:text-sm rounded-lg px-2.5 py-2 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">Select T2 Player 1...</option>
                {attendees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>

              <select
                id="match-slot-b2"
                name="match_slot_b2"
                data-testid="match-slot-b2"
                aria-label="Team 2 Player 2"
                value={playerB2Id}
                onChange={(e) => onSelectB2(e.target.value)}
                disabled={!isController || isSaving}
                className="w-full bg-[#101722] border border-slate-700/80 text-white text-xs sm:text-sm rounded-lg px-2.5 py-2 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">Select T2 Player 2...</option>
                {attendees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Duplicate Participant Error Banner */}
        {duplicateParticipantError && (
          <div
            role="alert"
            data-testid="match-duplicate-player-error"
            className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1.5"
          >
            <AlertTriangle size={13} className="shrink-0" />
            <span>{duplicateParticipantError}</span>
          </div>
        )}

        {/* Large Score Inputs (18 - 15) */}
        <div className="flex flex-col items-center gap-1.5 my-1">
          <div className="flex items-center justify-center gap-3 w-full">
            <div className="flex flex-col items-center">
              <label htmlFor="match-score-a-input" className="sr-only">
                Team 1 Score
              </label>
              <input
                id="match-score-a-input"
                name="match_score_a"
                data-testid="match-score-a-input"
                aria-label="Team 1 Score"
                type="number"
                min="0"
                max="30"
                value={scoreAInput}
                onChange={(e) => onScoreAChange(e.target.value)}
                disabled={!isController || isSaving}
                placeholder="21"
                className="w-20 sm:w-24 text-center font-bold text-2xl sm:text-3xl text-white bg-[#16202e] border border-slate-700/80 rounded-xl py-2.5 px-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none rating-mono"
              />
              <span className="text-[10px] text-emerald-400 font-semibold mt-1">
                T1 Score
              </span>
            </div>

            <span className="text-xl font-bold text-slate-500 pb-4">-</span>

            <div className="flex flex-col items-center">
              <label htmlFor="match-score-b-input" className="sr-only">
                Team 2 Score
              </label>
              <input
                id="match-score-b-input"
                name="match_score_b"
                data-testid="match-score-b-input"
                aria-label="Team 2 Score"
                type="number"
                min="0"
                max="30"
                value={scoreBInput}
                onChange={(e) => onScoreBChange(e.target.value)}
                disabled={!isController || isSaving}
                placeholder="19"
                className="w-20 sm:w-24 text-center font-bold text-2xl sm:text-3xl text-white bg-[#16202e] border border-slate-700/80 rounded-xl py-2.5 px-2 focus:ring-2 focus:ring-blue-500 focus:outline-none rating-mono"
              />
              <span className="text-[10px] text-blue-400 font-semibold mt-1">
                T2 Score
              </span>
            </div>
          </div>

          {/* Validation Rule Helper */}
          {scoreValidation.valid ? (
            <div
              data-testid="match-score-validation-valid"
              className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5"
            >
              <Check size={12} className="shrink-0" />
              <span>
                Valid score: Team {scoreValidation.winner} wins
              </span>
            </div>
          ) : (
            <div
              data-testid="match-score-validation-error"
              className="text-[11px] font-medium text-slate-400 text-center"
            >
              <span>Standard 21pt rules • win by 2, cap 30</span>
              {scoreValidation.reason && (
                <div className="text-amber-400 text-[10px] mt-0.5">
                  ({scoreValidation.reason})
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Failure Alert */}
        {matchSaveError && (
          <div
            role="alert"
            data-testid="match-save-failed-alert"
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-1.5">
              <X size={13} className="shrink-0" />
              <span>{matchSaveError}</span>
            </span>
            {onRetryMatchSave && (
              <button
                type="button"
                onClick={onRetryMatchSave}
                data-testid="retry-match-save-btn"
                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] flex-shrink-0 cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Action Buttons: Save Draft & Record Match */}
        <div className="grid grid-cols-2 gap-2.5 mt-1">
          <button
            type="button"
            data-testid="save-draft-btn"
            onClick={onSaveDraft}
            disabled={!isController || isSaving || !playerA1Id}
            className="w-full py-2.5 px-3 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Draft
          </button>

          <button
            type="submit"
            data-testid="record-match-submit-btn"
            disabled={!canSubmit}
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSaving ? 'Recording...' : 'Record Match'}
          </button>
        </div>
      </form>

      {/* 10-Second Immediate Undo Banner */}
      {activeUndoPrompt && (
        <div
          role="region"
          aria-label="Immediate match undo window"
          data-testid="immediate-undo-banner"
          className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
            <Clock size={13} className="shrink-0" />
            <span>
              Match #{activeUndoPrompt.sequenceNumber} Recorded! Undo window: (
              {undoSecondsRemaining}s)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              data-testid="immediate-undo-btn"
              onClick={onImmediateUndo}
              disabled={isUndoing}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
            >
              <RotateCcw size={12} strokeWidth={2.5} />
              <span>{isUndoing ? 'Undoing...' : `Undo (${undoSecondsRemaining}s)`}</span>
            </button>
            <button
              type="button"
              onClick={onDismissUndo}
              aria-label="Dismiss undo notification"
              className="text-slate-400 hover:text-white text-xs px-2 py-1 min-h-[28px] min-w-[28px] inline-flex items-center justify-center rounded hover:bg-slate-800/60 cursor-pointer"
              title="Dismiss"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
