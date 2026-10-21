import type { AllTimeLeaderboardRow } from '../../domain/standings.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { PodiumCrownIcon, PodiumRibbonTails } from '../icons/MedalBadges.tsx';
import { StatusBadge } from '../StatusBadge.tsx';

export interface LeaderboardPodiumProps {
  top1: AllTimeLeaderboardRow | null;
  top2: AllTimeLeaderboardRow | null;
  top3: AllTimeLeaderboardRow | null;
  currentUserId?: string | null;
  viewerLinkedPlayerId?: string | null;
  onSelectPlayer: (playerId: string) => void;
}

function formatPodiumStats(wins: number, losses: number): string {
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
  return `${wins}W - ${losses}L • ${winRate}% Win Rate`;
}

/**
 * 3D Platform Cap for 2nd Place (Silver)
 * - Front edge is completely horizontal, spanning full column width
 * - Outer left side angles inward to the middle towards the back
 * - Sits directly on top of the dark slate front face (no front lip)
 */
function Silver3DPlatformCap() {
  return (
    <div className="w-full relative overflow-visible">
      <svg
        viewBox="0 0 120 24"
        width="100%"
        height="24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full block"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="silver-cap-surface" x1="18" y1="0" x2="120" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="45%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#94A3B8" />
          </linearGradient>
        </defs>
        {/* Angled silver top cap: left side angles inward to middle from (0,24) to (18,0) */}
        <path d="M 0,24 L 18,0 L 120,0 L 120,24 Z" fill="url(#silver-cap-surface)" />
        {/* Top edge highlight line */}
        <line x1="18" y1="0.5" x2="120" y2="0.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/**
 * 3D Platform Cap for 1st Place (Glowing Emerald)
 * - Front edge is completely horizontal, spanning full column width
 * - Both left and right sides angle symmetrically to the middle towards the back
 * - Glowing vibrant emerald gradient
 * - Sits directly on top of the dark slate front face (no front lip)
 */
function Emerald3DPlatformCap() {
  return (
    <div className="w-full relative overflow-visible">
      <svg
        viewBox="0 0 140 28"
        width="100%"
        height="28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full block"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="emerald-cap-surface" x1="18" y1="0" x2="122" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#86EFAC" />
            <stop offset="30%" stopColor="#4ADE80" />
            <stop offset="70%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#16A34A" />
          </linearGradient>
          <filter id="emerald-glow" x="-10" y="-10" width="160" height="48" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#22C55E" floodOpacity="0.65" />
          </filter>
        </defs>
        {/* Angled emerald top cap: both sides angle inward to middle */}
        <path
          d="M 0,28 L 18,0 L 122,0 L 140,28 Z"
          fill="url(#emerald-cap-surface)"
          filter="url(#emerald-glow)"
        />
        {/* Top edge highlight line */}
        <line x1="18" y1="0.5" x2="122" y2="0.5" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/**
 * 3D Platform Cap for 3rd Place (Bronze / Copper)
 * - Front edge is completely horizontal, spanning full column width
 * - Outer right side angles inward to the middle towards the back
 * - Sits directly on top of the dark slate front face (no front lip)
 */
function Bronze3DPlatformCap() {
  return (
    <div className="w-full relative overflow-visible">
      <svg
        viewBox="0 0 120 24"
        width="100%"
        height="24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full block"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="bronze-cap-surface" x1="0" y1="0" x2="102" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        {/* Angled bronze top cap: right side angles inward to middle from (120,24) to (102,0) */}
        <path d="M 0,24 L 0,0 L 102,0 L 120,24 Z" fill="url(#bronze-cap-surface)" />
        {/* Top edge highlight line */}
        <line x1="0" y1="0.5" x2="102" y2="0.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/**
 * Unified 3D Stepped Podium Platform matching new ui design/leaderboard.jfif:
 * - Wide monolithic stepped structure spanning full container width (zero gap)
 * - Deep 3D platform caps with sides angling towards the middle:
 *     - Left: Metallic Silver cap with left side angling inwards to center
 *     - Center: Glowing Emerald cap with both sides angling inwards to center
 *     - Right: Metallic Bronze cap with right side angling inwards to center
 * - UNIFIED dark slate front faces: The front faces have straight horizontal top edges
 *   (not slanted) and share the exact same dark slate background (#182232 -> #0f1622).
 *   Only the top platform caps are colored.
 */
export function LeaderboardPodium({
  top1,
  top2,
  top3,
  viewerLinkedPlayerId,
  onSelectPlayer,
}: LeaderboardPodiumProps) {
  // If no players at all, don't render podium (empty state handled by parent)
  if (!top1 && !top2 && !top3) {
    return null;
  }

  // Unified dark slate body background for all three front faces
  const sharedFrontFaceBg = 'linear-gradient(180deg, #182232 0%, #0e1520 100%)';

  return (
    <div
      className="relative w-full mx-auto pt-4 pb-2 select-none"
      data-testid="leaderboard-podium"
    >
      {/* Background Stadium Glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-44 pointer-events-none opacity-20 blur-3xl -z-10"
        style={{
          background: 'radial-gradient(circle, #22c55e 0%, #3b82f6 50%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Contiguous Monolithic Stepped Podium Platform (Zero Gap, Full Width) */}
      <div
        className="w-full grid grid-cols-3 items-end gap-0 shadow-2xl relative"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* ================= 2ND PLACE STEP (LEFT) ================= */}
        <div className="w-full flex flex-col justify-end">
          {top2 ? (
            <div
              data-testid={`leaderboard-row-${top2.playerId}`}
              className="w-full flex flex-col justify-end cursor-pointer group"
              onClick={() => onSelectPlayer(top2.playerId)}
            >
              {/* Semantic hidden rank for tests */}
              <span className="sr-only">#{top2.rank}</span>

              {/* 2nd Place Avatar & Silver Ribbons (Rests directly on top of Silver cap) */}
              <div className="flex flex-col items-center justify-end px-1 -mb-2.5 relative z-20 pointer-events-auto">
                <div
                  className="relative flex items-center justify-center cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPlayer(top2.playerId);
                  }}
                >
                  <PodiumRibbonTails variant="silver" size={54} />
                  <div
                    className="relative z-10 rounded-full p-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 50%, #64748b 100%)',
                      boxShadow: '0 0 14px rgba(203, 213, 225, 0.45)',
                    }}
                  >
                    <PlayerAvatar
                      displayName={top2.displayName}
                      playerId={top2.playerId}
                      size={52}
                      rank={2}
                      isCurrentUser={viewerLinkedPlayerId === top2.playerId}
                      className="transition-transform group-hover:scale-105"
                    />
                  </div>
                </div>
              </div>

              {/* 3D Platform Cap: Side angles to middle, front edge is horizontal */}
              <Silver3DPlatformCap />

              {/* Front Face Content (Straight Horizontal Top Edge, Unified Dark Slate Body) */}
              <div
                className="w-full px-2 pt-2.5 pb-3.5 flex flex-col items-center justify-between text-center rounded-bl-xl"
                style={{
                  minHeight: '136px',
                  background: sharedFrontFaceBg,
                  borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Silver Rank */}
                <div
                  className="font-bold text-2xl tracking-tight"
                  style={{ color: '#cbd5e1' }}
                >
                  2nd
                </div>

                {/* Player Name & Badges */}
                <div className="w-full my-1 min-w-0 px-0.5">
                  <div className="flex items-center justify-center gap-1 max-w-full">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlayer(top2.playerId);
                      }}
                      className="font-semibold text-xs sm:text-sm text-white hover:text-emerald-400 transition-colors truncate block text-center cursor-pointer min-w-0"
                      title={top2.displayName}
                      style={{ background: 'transparent', border: 'none', padding: 0 }}
                    >
                      {top2.displayName}
                    </button>
                    {viewerLinkedPlayerId === top2.playerId && (
                      <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] font-bold bg-emerald-600 text-white">
                        You
                      </span>
                    )}
                  </div>

                  {/* Micro Badges */}
                  <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                    {top2.isTiedRank && (
                      <span className="text-[9px] font-bold text-amber-500">(T)</span>
                    )}
                    {top2.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
                    {top2.isProvisional && (
                      <StatusBadge variant="provisional" customLabel="Provisional" />
                    )}
                  </div>
                </div>

                {/* Points & Stats */}
                <div className="w-full px-1">
                  <div className="font-semibold text-xs sm:text-sm text-slate-200">
                    <span className="rating-mono">{top2.ratingDisplay}</span> pts
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 font-normal leading-tight">
                    {formatPodiumStats(top2.wins, top2.losses)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-32 bg-slate-800/20 border-t border-slate-700/30 rounded-tl-xl" />
          )}
        </div>

        {/* ================= 1ST PLACE STEP (CENTER) ================= */}
        <div className="w-full flex flex-col justify-end z-10">
          {top1 ? (
            <div
              data-testid={`leaderboard-row-${top1.playerId}`}
              className="w-full flex flex-col justify-end cursor-pointer group"
              onClick={() => onSelectPlayer(top1.playerId)}
            >
              {/* Semantic hidden rank for tests */}
              <span className="sr-only">#{top1.rank}</span>

              {/* 1st Place Avatar & Crown (Rests directly on top of Emerald cap) */}
              <div className="flex flex-col items-center justify-end px-1 -mb-2 relative z-20 pointer-events-auto">
                <div
                  className="relative flex flex-col items-center cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPlayer(top1.playerId);
                  }}
                >
                  <div className="translate-y-2 z-20 transition-transform group-hover:scale-110">
                    <PodiumCrownIcon size={46} />
                  </div>
                  <div
                    className="relative z-10 rounded-full p-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #fef08a 0%, #eab308 50%, #ca8a04 100%)',
                      boxShadow: '0 0 20px rgba(234, 179, 8, 0.55)',
                    }}
                  >
                    <PlayerAvatar
                      displayName={top1.displayName}
                      playerId={top1.playerId}
                      size={64}
                      rank={1}
                      isCurrentUser={viewerLinkedPlayerId === top1.playerId}
                      className="transition-transform group-hover:scale-105"
                    />
                  </div>
                </div>
              </div>

              {/* 3D Platform Cap: Both sides angle to middle, front edge is horizontal */}
              <Emerald3DPlatformCap />

              {/* Front Face Content (Straight Horizontal Top Edge, Unified Dark Slate Body) */}
              <div
                className="w-full px-2 pt-2.5 pb-4 flex flex-col items-center justify-between text-center"
                style={{
                  minHeight: '180px',
                  background: sharedFrontFaceBg,
                  borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
                }}
              >
                {/* Gold Rank */}
                <div
                  className="font-bold text-3xl tracking-tight"
                  style={{
                    color: '#facc15',
                    textShadow: '0 2px 10px rgba(250, 204, 21, 0.4)',
                  }}
                >
                  1st
                </div>

                {/* Player Name & Badges */}
                <div className="w-full my-1 min-w-0 px-0.5">
                  <div className="flex items-center justify-center gap-1 max-w-full">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlayer(top1.playerId);
                      }}
                      className="font-bold text-sm sm:text-base text-white hover:text-emerald-400 transition-colors truncate block text-center cursor-pointer min-w-0"
                      title={top1.displayName}
                      style={{ background: 'transparent', border: 'none', padding: 0 }}
                    >
                      {top1.displayName}
                    </button>
                    {viewerLinkedPlayerId === top1.playerId && (
                      <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] font-bold bg-emerald-600 text-white">
                        You
                      </span>
                    )}
                  </div>

                  {/* Micro Badges */}
                  <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                    {top1.isTiedRank && (
                      <span className="text-[9px] font-bold text-amber-500">(T)</span>
                    )}
                    {top1.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
                    {top1.isProvisional && (
                      <StatusBadge variant="provisional" customLabel="Provisional" />
                    )}
                  </div>
                </div>

                {/* Points & Stats */}
                <div className="w-full px-1">
                  <div className="font-semibold text-sm sm:text-base text-white">
                    <span className="rating-mono">{top1.ratingDisplay}</span> pts
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-300 mt-1 font-normal leading-tight">
                    {formatPodiumStats(top1.wins, top1.losses)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-44 bg-slate-800/20 border-t-2 border-emerald-500/40" />
          )}
        </div>

        {/* ================= 3RD PLACE STEP (RIGHT) ================= */}
        <div className="w-full flex flex-col justify-end">
          {top3 ? (
            <div
              data-testid={`leaderboard-row-${top3.playerId}`}
              className="w-full flex flex-col justify-end cursor-pointer group"
              onClick={() => onSelectPlayer(top3.playerId)}
            >
              {/* Semantic hidden rank for tests */}
              <span className="sr-only">#{top3.rank}</span>

              {/* 3rd Place Avatar & Bronze Ribbons (Rests directly on top of Bronze cap) */}
              <div className="flex flex-col items-center justify-end px-1 -mb-2.5 relative z-20 pointer-events-auto">
                <div
                  className="relative flex items-center justify-center cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPlayer(top3.playerId);
                  }}
                >
                  <PodiumRibbonTails variant="bronze" size={50} />
                  <div
                    className="relative z-10 rounded-full p-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #fed7aa 0%, #d97706 50%, #78350f 100%)',
                      boxShadow: '0 0 14px rgba(217, 119, 6, 0.45)',
                    }}
                  >
                    <PlayerAvatar
                      displayName={top3.displayName}
                      playerId={top3.playerId}
                      size={48}
                      rank={3}
                      isCurrentUser={viewerLinkedPlayerId === top3.playerId}
                      className="transition-transform group-hover:scale-105"
                    />
                  </div>
                </div>
              </div>

              {/* 3D Platform Cap: Side angles to middle, front edge is horizontal */}
              <Bronze3DPlatformCap />

              {/* Front Face Content (Straight Horizontal Top Edge, Unified Dark Slate Body) */}
              <div
                className="w-full px-2 pt-2 pb-3.5 flex flex-col items-center justify-between text-center rounded-br-xl"
                style={{
                  minHeight: '116px',
                  background: sharedFrontFaceBg,
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Bronze Rank */}
                <div
                  className="font-bold text-xl sm:text-2xl tracking-tight"
                  style={{ color: '#d97706' }}
                >
                  3rd
                </div>

                {/* Player Name & Badges */}
                <div className="w-full my-0.5 min-w-0 px-0.5">
                  <div className="flex items-center justify-center gap-1 max-w-full">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlayer(top3.playerId);
                      }}
                      className="font-semibold text-xs text-white hover:text-emerald-400 transition-colors truncate block text-center cursor-pointer min-w-0"
                      title={top3.displayName}
                      style={{ background: 'transparent', border: 'none', padding: 0 }}
                    >
                      {top3.displayName}
                    </button>
                    {viewerLinkedPlayerId === top3.playerId && (
                      <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] font-bold bg-emerald-600 text-white">
                        You
                      </span>
                    )}
                  </div>

                  {/* Micro Badges */}
                  <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                    {top3.isTiedRank && (
                      <span className="text-[9px] font-bold text-amber-500">(T)</span>
                    )}
                    {top3.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
                    {top3.isProvisional && (
                      <StatusBadge variant="provisional" customLabel="Provisional" />
                    )}
                  </div>
                </div>

                {/* Points & Stats */}
                <div className="w-full px-1">
                  <div className="font-semibold text-xs sm:text-sm text-amber-100">
                    <span className="rating-mono">{top3.ratingDisplay}</span> pts
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 font-normal leading-tight">
                    {formatPodiumStats(top3.wins, top3.losses)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-24 bg-slate-800/10 border-t border-amber-900/30 rounded-tr-xl" />
          )}
        </div>
      </div>
    </div>
  );
}
