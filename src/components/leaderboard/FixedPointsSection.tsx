import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { FixedPointsLeaderboardRow } from '../../domain/standings.ts';
import { StatusBadge } from '../StatusBadge.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export interface FixedPointsSectionProps {
  rows: readonly FixedPointsLeaderboardRow[];
  viewerLinkedPlayerId: string | null;
  scope: 'all_time' | 'weekly';
  onSelectPlayer: (playerId: string) => void;
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold';
  }
  if (rank === 2) {
    return 'bg-slate-400/15 text-slate-200 border border-slate-400/30 font-bold';
  }
  if (rank === 3) {
    return 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-bold';
  }
  return 'text-[var(--text-secondary)] font-medium';
}

function getPointsTextClass(fixedPoints: number): string {
  if (fixedPoints > 0) {
    return 'text-emerald-400';
  }
  if (fixedPoints < 0) {
    return 'text-rose-400';
  }
  return 'text-[var(--text-primary)]';
}

/**
 * Dedicated "Ammar's Style 🤙🏻" Fixed-Points Leaderboard section rendered directly
 * below the untouched primary Elo Leaderboard on the Players screen:
 * - Baseline: 0 pts
 * - Win: +3 pts, Loss: -3 pts
 * - Pure win/loss ranking with exact shared competition ranks (e.g., #3 (T))
 */
export function FixedPointsSection({
  rows,
  viewerLinkedPlayerId,
  scope,
  onSelectPlayer,
}: FixedPointsSectionProps) {
  const [showRulesInfo, setShowRulesInfo] = useState(false);

  return (
    <section
      data-testid="leaderboard-ammars-style-section"
      aria-labelledby="ammars-style-heading"
      className="mt-6 rounded-2xl overflow-hidden border border-slate-800/90"
      style={{ background: 'var(--bg-surface)' }}
    >
      {/* Section Header */}
      <div className="px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/60 flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id="ammars-style-heading"
              className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] m-0"
            >
              Ammar&apos;s Style 🤙🏻
            </h2>
            {scope === 'weekly' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Weekly Scope
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 m-0">
            Start 0 • Win <span className="text-emerald-400 font-semibold">+3 pts</span> • Loss{' '}
            <span className="text-rose-400 font-semibold">-3 pts</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">
            {rows.length} {rows.length === 1 ? 'Player' : 'Players'}
          </span>
          <button
            type="button"
            data-testid="ammars-style-rules-btn"
            className="inline-flex items-center gap-1 min-h-[28px] px-2.5 py-1 rounded-md border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white font-medium transition-colors cursor-pointer"
            onClick={() => setShowRulesInfo((prev) => !prev)}
            aria-expanded={showRulesInfo}
          >
            <Info size={12} />
            <span>Rules</span>
            {showRulesInfo ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expandable Rules Explanation */}
      {showRulesInfo && (
        <div
          data-testid="ammars-style-rules-panel"
          className="p-3.5 bg-slate-900/80 border-b border-slate-800 text-xs text-slate-400 leading-relaxed space-y-1"
        >
          <p className="m-0">
            <strong>Pure Win/Loss Points:</strong> Every player starts at 0 pts. Every completed match win adds +3 pts and every loss subtracts -3 pts, regardless of partner or opponent rating.
          </p>
          <p className="m-0">
            <strong>Shared Ties:</strong> Players with the exact same point total share the same rank and display a (T) badge. Official Elo ratings above remain completely separate.
          </p>
        </div>
      )}

      {/* Player Rows */}
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">
          No players to display for this scope yet.
        </div>
      ) : (
        <div>
          {rows.map((row) => {
            const isCurrentUser = viewerLinkedPlayerId === row.playerId;
            return (
              <div
                key={row.playerId}
                data-testid={`fixed-points-row-${row.playerId}`}
                onClick={() => onSelectPlayer(row.playerId)}
                className={`group relative flex items-center justify-between px-3.5 py-3 sm:px-4 sm:py-3.5 transition-colors cursor-pointer border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-surface-subtle)] ${
                  isCurrentUser
                    ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500'
                    : ''
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPlayer(row.playerId);
                  }
                }}
                aria-label={`View stats for Ammar's Style rank ${row.rank}, ${row.displayName}`}
              >
                {/* Left: Rank Pill, Avatar, Name & Badges */}
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 pr-2">
                  <div className="w-8 sm:w-9 flex-shrink-0 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md text-xs ${getRankBadgeClass(
                        row.rank,
                      )}`}
                    >
                      #{row.rank}
                    </span>
                  </div>

                  <PlayerAvatar
                    displayName={row.displayName}
                    avatarUrl={row.avatarUrl}
                    playerId={row.playerId}
                    size={38}
                    isCurrentUser={isCurrentUser}
                  />

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-semibold text-sm sm:text-base truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px] text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors ${
                          isCurrentUser ? 'text-emerald-400' : ''
                        }`}
                      >
                        {row.displayName}
                      </span>

                      {isCurrentUser && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-600 text-white tracking-wide">
                          You
                        </span>
                      )}

                      {row.isTiedRank && (
                        <span
                          data-testid="fixed-points-tied-badge"
                          className="text-[10px] font-bold text-amber-500"
                          title="Tied Rank"
                        >
                          (T)
                        </span>
                      )}

                      {row.isGuest && (
                        <StatusBadge variant="guest" customLabel="Guest" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Signed Fixed Points + W-L Record */}
                <div className="text-right flex-shrink-0 pl-2">
                  <div
                    className={`font-bold text-sm sm:text-base ${getPointsTextClass(
                      row.fixedPoints,
                    )}`}
                  >
                    <span className="rating-mono">{row.fixedPointsDisplay}</span>{' '}
                    pts
                  </div>
                  <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-normal mt-0.5 whitespace-nowrap">
                    {row.wins}W - {row.losses}L • {row.winRatePercentDisplay}{' '}
                    Win Rate
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
