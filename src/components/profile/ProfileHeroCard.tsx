import React from 'react';
import { StatusBadge } from '../StatusBadge.tsx';
import type { deriveLeaderboardFromSnapshot } from '../../services/readViewModels.ts';
import type { DbPlayerRow } from '../../types/database.ts';

export type LeaderboardRow = ReturnType<typeof deriveLeaderboardFromSnapshot>[number];

export interface ProfileHeroCardProps {
  selectedRow: LeaderboardRow;
  selectedPlayerRecord: DbPlayerRow;
  viewerLinkedPlayerId: string | null;
  allPlayers: LeaderboardRow[];
  effectivePlayerId: string;
  onSelectPlayer: (playerId: string) => void;
  formatMalaysiaDate: (iso: string) => string;
}

export function getPlayerTier(
  rating: number,
  isProvisional: boolean,
): { tier: string; color: string; bg: string; border: string } {
  if (isProvisional) {
    return {
      tier: 'Provisional Tier',
      color: 'text-sky-300',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/30',
    };
  }
  if (rating >= 1400) {
    return {
      tier: 'Diamond Tier',
      color: 'text-cyan-300',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
    };
  }
  if (rating >= 1200) {
    return {
      tier: 'Gold Tier',
      color: 'text-amber-300',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
    };
  }
  if (rating >= 1050) {
    return {
      tier: 'Silver Tier',
      color: 'text-slate-300',
      bg: 'bg-slate-700/30',
      border: 'border-slate-600/50',
    };
  }
  return {
    tier: 'Bronze Tier',
    color: 'text-amber-500',
    bg: 'bg-amber-900/20',
    border: 'border-amber-700/40',
  };
}

export const ProfileHeroCard: React.FC<ProfileHeroCardProps> = ({
  selectedRow,
  selectedPlayerRecord,
  viewerLinkedPlayerId,
  allPlayers,
  effectivePlayerId,
  onSelectPlayer,
  formatMalaysiaDate,
}) => {
  const isLinkedViewer = selectedRow.playerId === viewerLinkedPlayerId;
  const ratingNum = parseFloat(selectedRow.ratingNumeric4) || 1200;
  const tierInfo = getPlayerTier(ratingNum, selectedRow.isProvisional);

  // Generate avatar initials
  const initials = selectedRow.displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <section
      data-testid="selected-player-summary"
      className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 flex flex-col gap-4 relative overflow-hidden"
    >
      {/* Top Bar: Profile Switcher Dropdown */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <label
          htmlFor="profile-player-select"
          className="text-xs font-semibold text-slate-400 flex items-center gap-1.5"
        >
          <span>Player:</span>
        </label>
        <select
          id="profile-player-select"
          value={effectivePlayerId}
          onChange={(e) => onSelectPlayer(e.target.value)}
          className="bg-[#16202e] text-slate-200 text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500 max-w-[220px] truncate"
        >
          {allPlayers.map((r) => (
            <option key={r.playerId} value={r.playerId}>
              {r.displayName}
              {r.playerId === viewerLinkedPlayerId ? ' (You)' : ''}
              {r.isGuest ? ' [Guest]' : ''}
              {!r.isActive ? ' [Inactive]' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Player Header matching profile.jfif */}
      <div className="flex items-center gap-3.5 sm:gap-4">
        {/* Avatar Circle */}
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-emerald-500/40 flex items-center justify-center">
            <span className="text-xl sm:text-2xl font-black text-white tracking-wider">
              {initials || 'P'}
            </span>
          </div>
          {isLinkedViewer && (
            <span
              className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500 text-slate-950"
              title="Your Linked Profile"
            >
              You
            </span>
          )}
        </div>

        {/* Player Identity & Tier */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold text-white truncate tracking-tight">
            {selectedRow.displayName}
          </h2>

          {/* Tier & Rank Badge matching profile.jfif */}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full border ${tierInfo.bg} ${tierInfo.color} ${tierInfo.border}`}
            >
              <span>{tierInfo.tier}</span>
              <span className="opacity-50">•</span>
              <span>
                Rank #{selectedRow.rank}
                {selectedRow.isTiedRank ? ' (T)' : ''}
              </span>
            </span>

            {selectedRow.isGuest && <StatusBadge variant="guest" />}
            {selectedRow.isProvisional && <StatusBadge variant="provisional" />}
          </div>

          {/* Metadata: Joined date & stable ID */}
          <div className="mt-1.5 text-[11px] text-slate-400 truncate">
            Joined {formatMalaysiaDate(selectedPlayerRecord.created_at)} • ID:{' '}
            <code className="text-slate-400 font-mono">
              {selectedRow.playerId.slice(0, 8)}
            </code>
          </div>
        </div>
      </div>
    </section>
  );
};
