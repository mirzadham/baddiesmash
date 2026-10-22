import type { AllTimeLeaderboardRow } from '../../domain/standings.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { StatusBadge } from '../StatusBadge.tsx';

export interface RankingRowProps {
  row: AllTimeLeaderboardRow;
  isCurrentUser: boolean;
  onSelectPlayer: (playerId: string) => void;
}

function formatRowStats(wins: number, losses: number): string {
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
  return `${wins}W - ${losses}L • ${winRate}% Win Rate`;
}

/**
 * Ranked List Row for rank #4 and below, matching new ui design/leaderboard.jfif
 * - Left: #Rank, Player Avatar, Display Name, Status Badges
 * - Right: Points ({pts} pts), Record ({wins}W - {losses}L • {winRate}% Win Rate)
 * - Tap to navigate to player profile
 */
export function RankingRow({ row, isCurrentUser, onSelectPlayer }: RankingRowProps) {
  const statsDisplay = formatRowStats(row.wins, row.losses);
  return (
    <div
      data-testid={`leaderboard-row-${row.playerId}`}
      onClick={() => onSelectPlayer(row.playerId)}
      className={`group relative flex items-center justify-between px-3.5 py-3 sm:px-4 sm:py-3.5 transition-colors cursor-pointer border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-surface-subtle)] ${
        isCurrentUser ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : ''
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
      {/* Left: #Rank, Avatar, Player Name & Badges */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 pr-2">
        {/* Rank Number with # */}
        <div className="w-7 sm:w-8 text-left flex-shrink-0 font-medium text-xs sm:text-sm text-[var(--text-secondary)]">
          <span>#{row.rank}</span>
        </div>

        {/* Player Avatar */}
        <PlayerAvatar
          displayName={row.displayName}
          avatarUrl={row.avatarUrl}
          playerId={row.playerId}
          size={40}
          isCurrentUser={isCurrentUser}
        />

        {/* Player Name and Badges */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`font-semibold text-sm sm:text-base truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px] text-[var(--text-primary)] group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors ${
                isCurrentUser ? 'text-emerald-600 dark:text-emerald-400' : ''
              }`}
              title={row.displayName}
            >
              {row.displayName}
            </span>

            {/* "You" Pill for authenticated viewer */}
            {isCurrentUser && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-600 text-white tracking-wide">
                You
              </span>
            )}

            {/* Micro Badges */}
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
        </div>
      </div>

      {/* Right: Elo Points and Win-Loss & Win Rate Record */}
      <div className="text-right flex-shrink-0 pl-2">
        <div className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
          <span className="rating-mono">{row.ratingDisplay}</span> pts
        </div>
        <div className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-normal mt-0.5 whitespace-nowrap">
          {statsDisplay}
        </div>
      </div>
    </div>
  );
}
