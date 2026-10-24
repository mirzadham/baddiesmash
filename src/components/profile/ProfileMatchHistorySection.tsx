import React, { useEffect, useState } from 'react';
import { CheckCircle2, History } from 'lucide-react';
import { StatusBadge } from '../StatusBadge.tsx';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import type { DbSessionRow } from '../../types/database.ts';

export type MatchStatusFilter = 'all' | 'completed' | 'disputed' | 'voided';

export interface ProfileMatchHistorySectionProps {
  filteredMatches: EnrichedMatchCard[];
  effectivePlayerId: string;
  sessionFilter: string;
  statusFilter: MatchStatusFilter;
  sessions: readonly DbSessionRow[];
  onSessionFilterChange: (sessionId: string) => void;
  onStatusFilterChange: (status: MatchStatusFilter) => void;
  formatMalaysiaDate: (iso: string) => string;
}

export const ProfileMatchHistorySection: React.FC<ProfileMatchHistorySectionProps> = ({
  filteredMatches,
  effectivePlayerId,
  sessionFilter,
  statusFilter,
  sessions,
  onSessionFilterChange,
  onStatusFilterChange,
  formatMalaysiaDate,
}) => {
  const [visibleCount, setVisibleCount] = useState<number>(10);

  // Reset pagination slice whenever filters change or player changes
  useEffect(() => {
    setVisibleCount(10);
  }, [sessionFilter, statusFilter, effectivePlayerId]);

  const displayedMatches = filteredMatches.slice(0, visibleCount);

  return (
    <section className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 flex flex-col gap-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History size={20} className="text-emerald-400" />
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Match History ({filteredMatches.length})
            </h3>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Ordered newest first. Displayed before/after ratings (whole numbers) and
          change (1 decimal) are rounded independently from internal rating calculations.
        </p>

        {/* Filter Selectors */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {/* Session Filter */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
            <label
              htmlFor="profile-session-filter"
              className="text-xs font-semibold text-slate-400"
            >
              Session:
            </label>
            <select
              id="profile-session-filter"
              value={sessionFilter}
              onChange={(e) => onSessionFilterChange(e.target.value)}
              className="w-full bg-[#16202e] text-slate-200 text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatMalaysiaDate(s.session_started_at)}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
            <label
              htmlFor="profile-status-filter"
              className="text-xs font-semibold text-slate-400"
            >
              Status:
            </label>
            <select
              id="profile-status-filter"
              value={statusFilter}
              onChange={(e) =>
                onStatusFilterChange(e.target.value as MatchStatusFilter)
              }
              className="w-full bg-[#16202e] text-slate-200 text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed Only</option>
              <option value="disputed">Disputed Only</option>
              <option value="voided">Voided Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Match Cards List */}
      {filteredMatches.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 italic bg-[#101722] rounded-xl border border-slate-800/80">
          No matches match the selected filters for this player.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedMatches.map((card) => {
            const playerSlot = [...card.teamA, ...card.teamB].find(
              (s) => s.playerId === effectivePlayerId,
            )!;
            const won =
              card.winnerSide !== null &&
              card.winnerSide === playerSlot.teamSide;
            const isCompleted = card.match.status === 'completed';
            const isVoided = card.match.status === 'voided';
            const teamAWon = card.winnerSide === 'A';

            return (
              <article
                key={card.match.id}
                className={`p-3.5 rounded-xl border flex flex-col gap-2.5 transition-colors ${
                  isVoided
                    ? 'bg-slate-900/30 border-slate-800/50 opacity-65'
                    : 'bg-[#16202e] border-slate-800/80'
                }`}
              >
                {/* Header: Session Date, Match #, and Status */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="font-semibold text-white">
                      {card.sessionDateDisplay}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Match #{card.match.sequence_number ?? 'Draft'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {card.match.is_disputed && (
                      <StatusBadge variant="disputed" />
                    )}
                    {isVoided ? (
                      <StatusBadge variant="voided" />
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Official
                      </span>
                    )}
                  </div>
                </div>

                {/* Scoreboard Strip: Team 1 (Left) | Score (Center) | Team 2 (Right) */}
                <div className="flex items-center justify-between gap-2 sm:gap-4 bg-[#101722] p-2.5 rounded-xl border border-slate-800/80">
                  {/* Left Team */}
                  <div className="flex-1 min-w-0 flex items-center justify-start gap-1.5 text-left">
                    <div
                      className={`flex flex-col gap-0.5 min-w-0 ${
                        teamAWon
                          ? 'font-bold text-white'
                          : 'font-medium text-slate-300'
                      }`}
                    >
                      <span className="truncate text-xs sm:text-sm leading-tight block">
                        {card.teamA[0]?.displayName}
                      </span>
                      <span className="truncate text-xs sm:text-sm leading-tight block">
                        {card.teamA[1]?.displayName}
                      </span>
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
                  <div className="flex-shrink-0 px-3 py-1 rounded-lg bg-[#16202e] border border-slate-700/60 font-bold rating-mono text-xs sm:text-sm flex items-center justify-center gap-1.5">
                    <span
                      className={
                        teamAWon
                          ? 'text-emerald-400 font-extrabold'
                          : 'text-slate-400'
                      }
                    >
                      {card.match.team_a_score ?? 0}
                    </span>
                    <span className="text-slate-500 font-normal text-xs">-</span>
                    <span
                      className={
                        !teamAWon
                          ? 'text-emerald-400 font-extrabold'
                          : 'text-slate-400'
                      }
                    >
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
                    <div
                      className={`flex flex-col gap-0.5 min-w-0 ${
                        !teamAWon
                          ? 'font-bold text-white'
                          : 'font-medium text-slate-300'
                      }`}
                    >
                      <span className="truncate text-xs sm:text-sm leading-tight block">
                        {card.teamB[0]?.displayName}
                      </span>
                      <span className="truncate text-xs sm:text-sm leading-tight block">
                        {card.teamB[1]?.displayName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Rating Impact Footer */}
                <div className="flex items-center justify-between gap-2 text-xs pt-0.5 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Rating:</span>
                    <span className="font-semibold text-white rating-mono text-xs">
                      {playerSlot.beforeDisplay !== null &&
                      playerSlot.afterDisplay !== null
                        ? `${playerSlot.beforeDisplay} → ${playerSlot.afterDisplay}`
                        : '–'}
                    </span>
                    {isCompleted && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          won
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-rose-400 bg-rose-500/10'
                        }`}
                      >
                        {won ? '(W)' : '(L)'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">Change:</span>
                    <span
                      className={`font-bold rating-mono text-xs ${
                        (playerSlot.changeDisplay ?? '').startsWith('+')
                          ? 'text-emerald-400'
                          : (playerSlot.changeDisplay ?? '').startsWith('-')
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {playerSlot.changeDisplay ?? '–'}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Load More Matches Progressive Disclosure */}
          {filteredMatches.length > visibleCount && (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                data-testid="load-more-matches-btn"
                onClick={() => setVisibleCount((prev) => prev + 10)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#16202e] hover:bg-[#1c293a] border border-slate-700/80 text-emerald-400 hover:text-emerald-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Load More Matches (+10)</span>
                <span className="text-slate-500 text-[11px] font-normal">
                  (Showing {displayedMatches.length} of {filteredMatches.length})
                </span>
              </button>
              <button
                type="button"
                data-testid="show-all-matches-btn"
                onClick={() => setVisibleCount(filteredMatches.length)}
                className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Show All ({filteredMatches.length})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
