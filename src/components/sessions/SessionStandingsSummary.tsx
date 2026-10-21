import { Trophy } from 'lucide-react';

export interface SessionStandingSummaryItem {
  playerId: string;
  displayName: string;
  isGuest: boolean;
  rank: number | null;
  wins: number;
  losses: number;
  winRatePercentDisplay: string;
  netEloChange: number;
}

export interface SessionStandingsSummaryProps {
  standings: readonly SessionStandingSummaryItem[];
  onSelectPlayer: (playerId: string) => void;
  onOpenFullStandings?: () => void;
}

/**
 * Live Session Standings Summary matching session_new_2.jfif:
 * - Header: "Session Standings" with "Live Standings" link
 * - Rows: #Rank, Player Name, W-L record, and session Elo delta (+18, +15 Elo)
 */
export function SessionStandingsSummary({
  standings,
  onSelectPlayer,
  onOpenFullStandings,
}: SessionStandingsSummaryProps) {
  const topRows = standings.slice(0, 4);

  return (
    <div className="py-3 px-4 border-b border-slate-800/80 flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-sm sm:text-base text-slate-200">
          <Trophy size={16} className="text-amber-400" />
          <span>Session Standings</span>
        </div>
        {onOpenFullStandings && (
          <button
            type="button"
            onClick={onOpenFullStandings}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
          >
            Live Standings
          </button>
        )}
      </div>

      {/* Standings List */}
      {topRows.length === 0 ? (
        <div className="py-2 text-center text-xs text-slate-500 italic">
          No matches played yet in this session.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {topRows.map((row) => {
            const isPositive = row.netEloChange > 0;
            const isNegative = row.netEloChange < 0;
            const deltaDisplay = isPositive
              ? `+${row.netEloChange.toFixed(0)}`
              : row.netEloChange.toFixed(0);

            return (
              <div
                key={row.playerId}
                onClick={() => onSelectPlayer(row.playerId)}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#16202e] hover:bg-slate-800/60 transition-colors cursor-pointer border border-slate-800/60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                      row.rank === 1
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : row.rank === 2
                          ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                          : row.rank === 3
                            ? 'bg-amber-700/20 text-amber-400 border border-amber-700/40'
                            : 'text-slate-500'
                    }`}
                  >
                    {row.rank}
                  </span>
                  <span className="font-semibold text-xs sm:text-sm text-white truncate">
                    {row.displayName}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium flex-shrink-0">
                  <span className="text-slate-300">
                    {row.wins}-{row.losses}
                  </span>
                  <span
                    className={`font-semibold rating-mono ${
                      isPositive
                        ? 'text-emerald-400'
                        : isNegative
                          ? 'text-rose-400'
                          : 'text-slate-400'
                    }`}
                  >
                    ({deltaDisplay} Elo)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
