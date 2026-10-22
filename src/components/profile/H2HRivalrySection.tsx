import React from 'react';
import { ChevronDown, Swords } from 'lucide-react';
import type { deriveLeaderboardFromSnapshot } from '../../services/readViewModels.ts';

export type LeaderboardRow = ReturnType<typeof deriveLeaderboardFromSnapshot>[number];

export interface H2HStatsData {
  vsMatches: number;
  vsWins: number;
  vsLosses: number;
  vsWinRate: string;
  partnerMatches: number;
  partnerWins: number;
  partnerLosses: number;
  partnerWinRate: string;
}

export interface H2HRivalrySectionProps {
  otherPlayers: LeaderboardRow[];
  activeOpponentId: string;
  activeOpponent: LeaderboardRow | null;
  h2hStats: H2HStatsData | null;
  onSelectOpponent: (id: string) => void;
}

export const H2HRivalrySection: React.FC<H2HRivalrySectionProps> = ({
  otherPlayers,
  activeOpponentId,
  activeOpponent,
  h2hStats,
  onSelectOpponent,
}) => {
  return (
    <section
      data-testid="profile-h2h-section"
      className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 flex flex-col gap-3.5"
    >
      {/* Section Title matching profile.jfif */}
      <div className="flex items-center gap-2">
        <Swords size={20} className="text-emerald-400" />
        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
          H2H Rivalry &amp; Partnerships
        </h3>
      </div>

      {/* Select a Player Dropdown matching profile.jfif */}
      {otherPlayers.length > 0 && (
        <div className="relative">
          <label
            htmlFor="h2h-opponent-select"
            className="block text-[11px] font-semibold text-slate-400 mb-1"
          >
            Select a Player
          </label>
          <div className="relative">
            <select
              id="h2h-opponent-select"
              value={activeOpponentId}
              onChange={(e) => onSelectOpponent(e.target.value)}
              className="w-full appearance-none bg-[#16202e] border border-slate-700/80 rounded-xl py-2.5 pl-3.5 pr-10 text-xs sm:text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {otherPlayers.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName} {p.isGuest ? '(Guest)' : ''}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      )}

      {/* Comparison Grid matching profile.jfif */}
      {h2hStats && activeOpponent ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 pt-1">
          {/* Card A: Rivalry (vs) */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-xs sm:text-sm font-bold text-white">
                Rivalry (vs)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Played: {h2hStats.vsMatches}
              </div>
            </div>

            {/* Split Visual Bar matching profile.jfif */}
            <div className="mt-3">
              {h2hStats.vsMatches > 0 ? (
                <>
                  <div className="flex h-8 sm:h-9 rounded-lg overflow-hidden text-xs font-bold">
                    {h2hStats.vsWins > 0 && (
                      <div
                        style={{ flex: h2hStats.vsWins }}
                        className="bg-emerald-500 text-slate-950 flex items-center justify-center px-1 truncate"
                        title={`Wins: ${h2hStats.vsWins}`}
                      >
                        Wins: {h2hStats.vsWins}
                      </div>
                    )}
                    {h2hStats.vsLosses > 0 && (
                      <div
                        style={{ flex: h2hStats.vsLosses }}
                        className="bg-rose-500 text-white flex items-center justify-center px-1 truncate"
                        title={`Losses: ${h2hStats.vsLosses}`}
                      >
                        Losses: {h2hStats.vsLosses}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs font-semibold text-slate-300 mt-2 text-center">
                    {h2hStats.vsWinRate} Win Rate
                  </div>
                </>
              ) : (
                <div className="py-2 text-center text-xs text-slate-500 italic">
                  No matches as opponents
                </div>
              )}
            </div>
          </div>

          {/* Card B: Partnership (with) */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-xs sm:text-sm font-bold text-white">
                Partnership (with)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Played: {h2hStats.partnerMatches}
              </div>
            </div>

            {/* Split Visual Bar matching profile.jfif */}
            <div className="mt-3">
              {h2hStats.partnerMatches > 0 ? (
                <>
                  <div className="flex h-8 sm:h-9 rounded-lg overflow-hidden text-xs font-bold">
                    {h2hStats.partnerWins > 0 && (
                      <div
                        style={{ flex: h2hStats.partnerWins }}
                        className="bg-emerald-500 text-slate-950 flex items-center justify-center px-1 truncate"
                        title={`Wins: ${h2hStats.partnerWins}`}
                      >
                        Wins: {h2hStats.partnerWins}
                      </div>
                    )}
                    {h2hStats.partnerLosses > 0 && (
                      <div
                        style={{ flex: h2hStats.partnerLosses }}
                        className="bg-rose-500 text-white flex items-center justify-center px-1 truncate"
                        title={`Losses: ${h2hStats.partnerLosses}`}
                      >
                        Losses: {h2hStats.partnerLosses}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs font-semibold text-slate-300 mt-2 text-center">
                    {h2hStats.partnerWinRate} Win Rate
                  </div>
                </>
              ) : (
                <div className="py-2 text-center text-xs text-slate-500 italic">
                  No matches as partners
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">
          Select another player in the group to view direct head-to-head records.
        </p>
      )}
    </section>
  );
};
