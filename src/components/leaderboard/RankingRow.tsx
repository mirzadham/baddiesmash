import { ChevronRight } from 'lucide-react';
import type { AllTimeLeaderboardRow } from '../../domain/standings.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { StatusBadge } from '../StatusBadge.tsx';

export interface RankingRowProps {
  row: AllTimeLeaderboardRow;
  isCurrentUser: boolean;
  onSelectPlayer: (playerId: string) => void;
}

/**
 * Polished ranking row for players ranked 4th and below (or all list items).
 * Matches the reference image layout:
 * - Rank number
 * - Avatar
 * - Display Name + Badges (You, Guest, Provisional, Tied)
 * - Elo Rating pill
 * - Stats: Wins, Win Rate, Matches Played
 * - Subtle Chevron '>'
 * - Highlighted state for the authenticated player profile
 */
export function RankingRow({ row, isCurrentUser, onSelectPlayer }: RankingRowProps) {
  // Extract win rate percentage (e.g. "75.0% (12/16)" -> "75%")
  const winRateShort = row.winRatePercentDisplay.split('%')[0] + '%';

  return (
    <div
      data-testid={`leaderboard-row-${row.playerId}`}
      onClick={() => onSelectPlayer(row.playerId)}
      className={`group relative flex items-center justify-between px-2.5 py-2.5 sm:px-5 sm:py-3.5 transition-all cursor-pointer border-b border-[var(--border-color)]/50 last:border-b-0 hover:bg-[var(--bg-surface-subtle)]/70 ${
        isCurrentUser
          ? 'bg-emerald-500/10 dark:bg-emerald-500/18 border-l-4 border-l-emerald-500'
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
      aria-label={`View stats for rank ${row.rank}, ${row.displayName}`}
    >
      {/* Left: Rank, Avatar, Name & Rating Pill */}
      <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1 pr-1.5 sm:pr-2">
        {/* Rank Number */}
        <div className="w-5 sm:w-8 text-center flex-shrink-0 font-bold text-xs sm:text-base text-[var(--text-secondary)]">
          <span>{row.rank}</span>
          {/* Accessible hidden rank tag for tests */}
          <span className="sr-only">#{row.rank}</span>
        </div>

        {/* Player Avatar */}
        <PlayerAvatar
          displayName={row.displayName}
          playerId={row.playerId}
          size={38}
          isCurrentUser={isCurrentUser}
        />

        {/* Player Identity & Badges */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            <span
              className={`font-bold text-xs sm:text-base truncate max-w-[95px] xs:max-w-[130px] sm:max-w-[200px] text-[var(--text-primary)] group-hover:text-emerald-500 transition-colors ${
                isCurrentUser ? 'text-emerald-500 dark:text-emerald-400' : ''
              }`}
              title={row.displayName}
            >
              {row.displayName}
            </span>

            {/* "You" Pill for authenticated viewer */}
            {isCurrentUser && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-600 text-white tracking-wide">
                You
              </span>
            )}

            {/* Badges */}
            {row.isTiedRank && (
              <span className="text-[10px] font-bold text-amber-500" title="Tied Rank">
                (T)
              </span>
            )}
            {row.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
            {row.isProvisional && (
              <StatusBadge variant="provisional" customLabel="Provisional" />
            )}
          </div>

          {/* Elo Rating Pill underneath name (matching reference layout) */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-black rating-mono tracking-tight text-emerald-500 dark:text-emerald-400 bg-emerald-500/12 dark:bg-emerald-500/25 border border-emerald-500/25"
            >
              {row.ratingDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Detailed Statistics (Wins, Win Rate, Matches) + Chevron */}
      <div className="flex items-center gap-1.5 sm:gap-4 flex-shrink-0">
        {/* 3 Statistics Columns (Reference layout: 12 Wins, 75% Win Rate, 16 Matches) */}
        <div className="flex items-center gap-1.5 sm:gap-4 text-right">
          {/* Wins */}
          <div className="flex flex-col items-center sm:items-end min-w-[26px] sm:min-w-[40px]">
            <span className="font-extrabold text-[11px] sm:text-sm text-[var(--text-primary)] rating-mono">
              {row.wins}
            </span>
            <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-medium">
              Wins
            </span>
          </div>

          {/* Win Rate */}
          <div className="flex flex-col items-center sm:items-end min-w-[34px] sm:min-w-[48px]">
            <span className="font-extrabold text-[11px] sm:text-sm text-[var(--text-primary)] rating-mono">
              {winRateShort}
            </span>
            <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-medium">
              Win Rate
            </span>
          </div>

          {/* Matches Played */}
          <div className="flex flex-col items-center sm:items-end min-w-[26px] sm:min-w-[40px]">
            <span className="font-extrabold text-[11px] sm:text-sm text-[var(--text-primary)] rating-mono">
              {row.matchesPlayed}
            </span>
            <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-medium">
              Matches
            </span>
          </div>
        </div>

        {/* Subtle Right Chevron indicating profile drilldown */}
        <ChevronRight
          size={14}
          className="text-[var(--text-muted)] group-hover:text-[#7045c6] group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
