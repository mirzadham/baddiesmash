import React, { useState } from 'react';
import { CheckCircle2, Edit2, History } from 'lucide-react';
import type { DbPlayerRow } from '../../types/database.ts';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import { StatusBadge } from '../StatusBadge.tsx';

export interface SessionMatchHistorySectionProps {
  matches: readonly EnrichedMatchCard[];
  isAdminOrOwner: boolean;
  canViewerMutateSession: boolean;
  presentAttendeePlayers?: DbPlayerRow[];
  onSelectPlayer: (playerId: string) => void;
  onSubmitCorrection?: (
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
  isDemoMode?: boolean;
}

/**
 * Match Corrections & History section matching session_new_2.jfif:
 * - Header: "Match Corrections & History"
 * - Chronological match list with "Edit" and "Void" action buttons
 * - Rating breakdown inspection table
 * - Inline reasoned correction & void form preserving match sequence_number
 */
export function SessionMatchHistorySection({
  matches,
  isAdminOrOwner,
  canViewerMutateSession,
  presentAttendeePlayers = [],
  onSelectPlayer,
  onSubmitCorrection,
  isDemoMode = false,
}: SessionMatchHistorySectionProps) {
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [correctionAction, setCorrectionAction] = useState<'correct' | 'void'>('correct');
  const [corrScoreA, setCorrScoreA] = useState('');
  const [corrScoreB, setCorrScoreB] = useState('');
  const [corrTeamA1, setCorrTeamA1] = useState('');
  const [corrTeamA2, setCorrTeamA2] = useState('');
  const [corrTeamB1, setCorrTeamB1] = useState('');
  const [corrTeamB2, setCorrTeamB2] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCorrectionForm = (card: EnrichedMatchCard) => {
    setEditingMatchId(card.match.id);
    setCorrectionAction('correct');
    setCorrScoreA(String(card.match.team_a_score));
    setCorrScoreB(String(card.match.team_b_score));
    setCorrTeamA1(card.teamA[0]?.playerId ?? '');
    setCorrTeamA2(card.teamA[1]?.playerId ?? '');
    setCorrTeamB1(card.teamB[0]?.playerId ?? '');
    setCorrTeamB2(card.teamB[1]?.playerId ?? '');
    setCorrectionReason('');
  };

  const handleFormSubmit = async (e: React.FormEvent, matchId: string) => {
    e.preventDefault();
    if (!onSubmitCorrection) return;

    setIsSubmitting(true);
    try {
      await onSubmitCorrection(matchId, {
        action: correctionAction,
        reason: correctionReason,
        teamAScore: Number(corrScoreA),
        teamBScore: Number(corrScoreB),
        teamAPlayer1: corrTeamA1,
        teamAPlayer2: corrTeamA2,
        teamBPlayer1: corrTeamB1,
        teamBPlayer2: corrTeamB2,
      });
      setEditingMatchId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="session-match-history"
      className="py-3 px-4 border-b border-slate-800/80 flex flex-col gap-2.5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-sm sm:text-base text-slate-200">
          <History size={16} className="text-emerald-400" />
          <span>Match Corrections &amp; History</span>
        </div>
        <span className="text-xs text-slate-400">
          {matches.length} matches
        </span>
      </div>

      {/* Matches List */}
      {matches.length === 0 ? (
        <div className="py-2 text-center text-xs text-slate-500 italic">
          No matches recorded in this session.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {matches.map((card) => {
            const isCompleted = card.match.status === 'completed';
            const isVoided = card.match.status === 'voided';
            const isDisputed = card.match.is_disputed;
            const teamAWon = card.winnerSide === 'A';
            const isEditingCorrection = editingMatchId === card.match.id;

            return (
              <article
                key={card.match.id}
                data-testid={`match-card-${card.match.id}`}
                className={`p-3 rounded-xl border flex flex-col gap-2 transition-colors ${
                  isVoided
                    ? 'bg-slate-900/30 border-slate-800/50 opacity-65'
                    : 'bg-[#16202e] border-slate-800/80'
                }`}
              >
                {/* Status & Match # */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200">
                      Match #{card.match.sequence_number ?? 'Draft'}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span
                      className={`font-semibold ${
                        isCompleted
                          ? 'text-emerald-400'
                          : isVoided
                            ? 'text-rose-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {isCompleted ? 'Completed' : isVoided ? 'Voided' : 'Draft'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isDisputed && <StatusBadge variant="disputed" />}
                    {isVoided && <StatusBadge variant="voided" />}
                  </div>
                </div>

                {/* Teams & Score Box: Team 1 (Left) | Scores (Center) | Team 2 (Right) */}
                <div className="flex items-center justify-between gap-2 sm:gap-4 bg-[#101722] p-3 rounded-xl border border-slate-800/80">
                  {/* Left Team */}
                  <div className="flex-1 min-w-0 flex items-center justify-start gap-1.5 text-left">
                    <div className={`flex flex-col gap-0.5 min-w-0 ${teamAWon ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                      <button
                        type="button"
                        onClick={() => card.teamA[0] && onSelectPlayer(card.teamA[0].playerId)}
                        className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer text-left truncate text-xs sm:text-sm leading-tight block"
                      >
                        {card.teamA[0]?.displayName}
                      </button>
                      <button
                        type="button"
                        onClick={() => card.teamA[1] && onSelectPlayer(card.teamA[1].playerId)}
                        className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer text-left truncate text-xs sm:text-sm leading-tight block"
                      >
                        {card.teamA[1]?.displayName}
                      </button>
                    </div>
                    {teamAWon && (
                      <CheckCircle2
                        size={15}
                        className="text-emerald-400 shrink-0"
                        aria-label="Winner"
                        data-testid="winner-tick"
                      />
                    )}
                  </div>

                  {/* Scores (Center) */}
                  <div className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#16202e] border border-slate-700/60 font-bold rating-mono text-sm sm:text-base flex items-center justify-center gap-1.5">
                    <span className={teamAWon ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}>
                      {card.match.team_a_score ?? 0}
                    </span>
                    <span className="text-slate-500 font-normal text-xs">-</span>
                    <span className={!teamAWon ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}>
                      {card.match.team_b_score ?? 0}
                    </span>
                  </div>

                  {/* Right Team */}
                  <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5 text-right">
                    {!teamAWon && card.winnerSide === 'B' && (
                      <CheckCircle2
                        size={15}
                        className="text-emerald-400 shrink-0"
                        aria-label="Winner"
                        data-testid="winner-tick"
                      />
                    )}
                    <div className={`flex flex-col gap-0.5 min-w-0 ${!teamAWon ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                      <button
                        type="button"
                        onClick={() => card.teamB[0] && onSelectPlayer(card.teamB[0].playerId)}
                        className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer text-right truncate text-xs sm:text-sm leading-tight block"
                      >
                        {card.teamB[0]?.displayName}
                      </button>
                      <button
                        type="button"
                        onClick={() => card.teamB[1] && onSelectPlayer(card.teamB[1].playerId)}
                        className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer text-right truncate text-xs sm:text-sm leading-tight block"
                      >
                        {card.teamB[1]?.displayName}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Match Actions: Correct / Void Trigger */}
                {(canViewerMutateSession || isAdminOrOwner) && (
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      aria-expanded={isEditingCorrection}
                      data-testid={`open-correction-btn-${card.match.id}`}
                      onClick={() => {
                        if (isEditingCorrection) {
                          setEditingMatchId(null);
                        } else {
                          openCorrectionForm(card);
                        }
                      }}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit2 size={11} />
                      <span>
                        {isEditingCorrection
                          ? 'Close Correction Form'
                          : 'Correct or Void Match'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Inline Reasoned Correction Form */}
                {isEditingCorrection && (
                  <form
                    onSubmit={(e) => handleFormSubmit(e, card.match.id)}
                    data-testid={`correction-form-${card.match.id}`}
                    className="mt-2 p-3 rounded-xl bg-[#101722] border border-amber-500/30 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-amber-300">
                        Post-Window Reasoned Correction / Void
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer text-slate-300">
                          <input
                            type="radio"
                            name={`corr-action-${card.match.id}`}
                            value="correct"
                            checked={correctionAction === 'correct'}
                            onChange={() => setCorrectionAction('correct')}
                          />
                          <span>Correct</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-rose-300">
                          <input
                            type="radio"
                            name={`corr-action-${card.match.id}`}
                            value="void"
                            checked={correctionAction === 'void'}
                            onChange={() => setCorrectionAction('void')}
                          />
                          <span>Void</span>
                        </label>
                      </div>
                    </div>

                    {correctionAction === 'correct' && (
                      <div className="flex flex-col gap-2 text-xs">
                        {/* Slots */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">T1 Player 1:</label>
                            <select
                              data-testid={`corr-slot-a1-${card.match.id}`}
                              value={corrTeamA1}
                              onChange={(e) => setCorrTeamA1(e.target.value)}
                              className="w-full bg-[#16202e] border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                            >
                              {presentAttendeePlayers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">T1 Player 2:</label>
                            <select
                              data-testid={`corr-slot-a2-${card.match.id}`}
                              value={corrTeamA2}
                              onChange={(e) => setCorrTeamA2(e.target.value)}
                              className="w-full bg-[#16202e] border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                            >
                              {presentAttendeePlayers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">T2 Player 1:</label>
                            <select
                              data-testid={`corr-slot-b1-${card.match.id}`}
                              value={corrTeamB1}
                              onChange={(e) => setCorrTeamB1(e.target.value)}
                              className="w-full bg-[#16202e] border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                            >
                              {presentAttendeePlayers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">T2 Player 2:</label>
                            <select
                              data-testid={`corr-slot-b2-${card.match.id}`}
                              value={corrTeamB2}
                              onChange={(e) => setCorrTeamB2(e.target.value)}
                              className="w-full bg-[#16202e] border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                            >
                              {presentAttendeePlayers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Scores */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">T1 Score:</label>
                            <input
                              type="number"
                              data-testid={`corr-score-a-${card.match.id}`}
                              value={corrScoreA}
                              onChange={(e) => setCorrScoreA(e.target.value)}
                              className="w-full bg-[#16202e] border border-slate-700 rounded-lg p-1.5 text-xs text-white rating-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">T2 Score:</label>
                            <input
                              type="number"
                              data-testid={`corr-score-b-${card.match.id}`}
                              value={corrScoreB}
                              onChange={(e) => setCorrScoreB(e.target.value)}
                              className="w-full bg-[#16202e] border border-slate-700 rounded-lg p-1.5 text-xs text-white rating-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Reason input */}
                    <div>
                      <label
                        htmlFor={`corr-reason-${card.match.id}`}
                        className="text-[10px] font-semibold text-slate-300 block mb-0.5"
                      >
                        Correction / Void Reason (Required):
                      </label>
                      <input
                        id={`corr-reason-${card.match.id}`}
                        type="text"
                        placeholder="e.g. Scoreboard was read in reverse"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        data-testid={`correction-reason-input-${card.match.id}`}
                        className="w-full bg-[#16202e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isDemoMode || isSubmitting || !correctionReason.trim()}
                      data-testid={`submit-correction-btn-${card.match.id}`}
                      className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {isSubmitting
                        ? 'Submitting...'
                        : correctionAction === 'correct'
                          ? 'Submit Match Correction'
                          : 'Confirm Void Match'}
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
