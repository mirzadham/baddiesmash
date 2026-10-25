import type { PairLeaderboardRow } from '../../domain/standings.ts';
import { StatusBadge } from '../StatusBadge.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export interface PairRankingRowProps {
  row: PairLeaderboardRow;
  viewerLinkedPlayerId?: string | null;
  onSelectPlayer: (playerId: string) => void;
}

/**
 * Ranked List Row for Doubles Pairs (#4 and below), matching RankingRow.tsx styling:
 * - Left: #Rank, Overlapping Dual Partner Avatars, Stacked Partner Name Buttons, Badges
 * - Right: Pair Elo Points ({pts} pts), Record ({wins}W - {losses}L • {winRate}% Win Rate)
 */
export function PairRankingRow({
  row,
  viewerLinkedPlayerId,
  onSelectPlayer,
}: PairRankingRowProps) {
  const isViewerInPair = Boolean(
    viewerLinkedPlayerId &&
      (viewerLinkedPlayerId === row.player1.playerId ||
        viewerLinkedPlayerId === row.player2.playerId),
  );

  const statsDisplay = `${row.wins}W - ${row.losses}L • ${row.winRatePercentDisplay} Win Rate`;

  return (
    <div
      data-testid={`pair-leaderboard-row-${row.pairKey}`}
      className={`group relative flex items-center justify-between px-3.5 py-3 sm:px-4 sm:py-3.5 transition-colors border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-surface-subtle)] ${
        isViewerInPair ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : ''
      }`}
    >
      {/* Left: #Rank, Overlapping Dual Avatars, Stacked Partner Names & Badges */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 pr-2">
        <div className="w-7 sm:w-8 text-left flex-shrink-0 font-medium text-xs sm:text-sm text-[var(--text-secondary)]">
          <span>#{row.rank}</span>
        </div>

        {/* Overlapping Dual Avatars */}
        <div className="inline-flex items-center flex-shrink-0 leading-none">
          <button
            type="button"
            onClick={() => onSelectPlayer(row.player1.playerId)}
            aria-label={`View profile for ${row.player1.displayName}`}
            className="inline-flex items-center justify-center p-0 rounded-full leading-none transition-transform hover:scale-105 hover:z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
            style={{
              width: 36,
              height: 36,
              background: 'transparent',
              border: 'none',
            }}
          >
            <PlayerAvatar
              displayName={row.player1.displayName}
              avatarUrl={row.player1.avatarUrl}
              playerId={row.player1.playerId}
              size={36}
            />
          </button>
          <button
            type="button"
            onClick={() => onSelectPlayer(row.player2.playerId)}
            aria-label={`View profile for ${row.player2.displayName}`}
            className="-ml-2.5 inline-flex items-center justify-center p-0 rounded-full leading-none transition-transform hover:scale-105 hover:z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
            style={{
              width: 36,
              height: 36,
              background: 'transparent',
              border: 'none',
            }}
          >
            <PlayerAvatar
              displayName={row.player2.displayName}
              avatarUrl={row.player2.avatarUrl}
              playerId={row.player2.playerId}
              size={36}
            />
          </button>
        </div>

        {/* Stacked Partner Names & Micro Badges */}
        <div className="flex flex-col min-w-0">
          <div className="flex flex-col items-start min-w-0">
            <button
              type="button"
              onClick={() => onSelectPlayer(row.player1.playerId)}
              className="p-0 text-left font-semibold text-sm sm:text-base truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[240px] text-[var(--text-primary)] hover:text-emerald-400 transition-colors cursor-pointer leading-snug focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
              title={row.player1.displayName}
              style={{ background: 'transparent', border: 'none' }}
            >
              {row.player1.displayName}
            </button>
            <button
              type="button"
              onClick={() => onSelectPlayer(row.player2.playerId)}
              className="p-0 text-left font-semibold text-sm sm:text-base truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[240px] text-[var(--text-primary)] hover:text-emerald-400 transition-colors cursor-pointer leading-snug focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
              title={row.player2.displayName}
              style={{ background: 'transparent', border: 'none' }}
            >
              &amp; {row.player2.displayName}
            </button>
          </div>

          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {isViewerInPair && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-600 text-white tracking-wide">
                You
              </span>
            )}
            {row.isTiedRank && (
              <span className="text-[10px] font-bold text-amber-500" title="Tied Rank">
                (T)
              </span>
            )}
            {row.includesGuest && (
              <StatusBadge variant="guest" customLabel="Guest" />
            )}
            {row.isProvisional && (
              <StatusBadge variant="provisional" customLabel="Provisional" />
            )}
          </div>
        </div>
      </div>

      {/* Right: Pair Elo Points and Win-Loss & Win Rate Record */}
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
