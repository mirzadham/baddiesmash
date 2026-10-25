import type { PairLeaderboardRow } from '../../domain/standings.ts';
import { PodiumCrownIcon, PodiumRibbonTails } from '../icons/MedalBadges.tsx';
import { StatusBadge } from '../StatusBadge.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export interface PairsPodiumProps {
  top1: PairLeaderboardRow | null;
  top2: PairLeaderboardRow | null;
  top3: PairLeaderboardRow | null;
  viewerLinkedPlayerId?: string | null;
  onSelectPlayer: (playerId: string) => void;
}

function formatPairPodiumStats(row: PairLeaderboardRow): string {
  return `${row.wins}W - ${row.losses}L • ${row.winRatePercentDisplay} Win Rate`;
}

function PairSilver3DCap() {
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
          <linearGradient
            id="pairs-silver-cap-surface"
            x1="18"
            y1="0"
            x2="120"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="45%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#94A3B8" />
          </linearGradient>
        </defs>
        <path d="M 0,24 L 18,0 L 120,0 L 120,24 Z" fill="url(#pairs-silver-cap-surface)" />
        <line x1="18" y1="0.5" x2="120" y2="0.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function PairEmerald3DCap() {
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
          <linearGradient
            id="pairs-emerald-cap-surface"
            x1="18"
            y1="0"
            x2="122"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#86EFAC" />
            <stop offset="30%" stopColor="#4ADE80" />
            <stop offset="70%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#16A34A" />
          </linearGradient>
          <filter
            id="pairs-emerald-glow"
            x="-10"
            y="-10"
            width="160"
            height="48"
            filterUnits="userSpaceOnUse"
          >
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#22C55E" floodOpacity="0.65" />
          </filter>
        </defs>
        <path
          d="M 0,28 L 18,0 L 122,0 L 140,28 Z"
          fill="url(#pairs-emerald-cap-surface)"
          filter="url(#pairs-emerald-glow)"
        />
        <line x1="18" y1="0.5" x2="122" y2="0.5" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function PairBronze3DCap() {
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
          <linearGradient
            id="pairs-bronze-cap-surface"
            x1="0"
            y1="0"
            x2="102"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        <path d="M 0,24 L 0,0 L 102,0 L 120,24 Z" fill="url(#pairs-bronze-cap-surface)" />
        <line x1="0" y1="0.5" x2="102" y2="0.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function OverlappingDuoAvatars({
  row,
  size,
  onSelectPlayer,
}: {
  row: PairLeaderboardRow;
  size: number;
  onSelectPlayer: (playerId: string) => void;
}) {
  return (
    <div className="relative z-10 inline-flex items-center justify-center leading-none">
      <button
        type="button"
        onClick={() => onSelectPlayer(row.player1.playerId)}
        aria-label={`View profile for ${row.player1.displayName}`}
        className="inline-flex items-center justify-center p-0 rounded-full leading-none transition-transform hover:scale-105 hover:z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
        style={{
          width: size,
          height: size,
          background: 'transparent',
          border: 'none',
        }}
      >
        <PlayerAvatar
          displayName={row.player1.displayName}
          avatarUrl={row.player1.avatarUrl}
          playerId={row.player1.playerId}
          size={size}
        />
      </button>
      <button
        type="button"
        onClick={() => onSelectPlayer(row.player2.playerId)}
        aria-label={`View profile for ${row.player2.displayName}`}
        className="-ml-3 inline-flex items-center justify-center p-0 rounded-full leading-none transition-transform hover:scale-105 hover:z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
        style={{
          width: size,
          height: size,
          background: 'transparent',
          border: 'none',
        }}
      >
        <PlayerAvatar
          displayName={row.player2.displayName}
          avatarUrl={row.player2.avatarUrl}
          playerId={row.player2.playerId}
          size={size}
        />
      </button>
    </div>
  );
}

/**
 * 3D Stepped Podium for Top 3 Doubles Partnerships:
 * - Left: 2nd Place (Silver)
 * - Center: 1st Place (Glowing Emerald + Golden Crown)
 * - Right: 3rd Place (Bronze)
 * - Renders overlapping dual partner avatars and stacked partner names so names
 *   never clip prematurely on mobile viewports.
 */
export function PairsPodium({
  top1,
  top2,
  top3,
  viewerLinkedPlayerId,
  onSelectPlayer,
}: PairsPodiumProps) {
  if (!top1 && !top2 && !top3) {
    return null;
  }

  const sharedFrontFaceBg = '#111827';

  const isViewerInPair = (row: PairLeaderboardRow): boolean =>
    Boolean(
      viewerLinkedPlayerId &&
        (viewerLinkedPlayerId === row.player1.playerId ||
          viewerLinkedPlayerId === row.player2.playerId),
    );

  return (
    <div
      className="relative w-full mx-auto pt-4 pb-2 select-none"
      data-testid="pairs-leaderboard-podium"
    >
      <div
        className="w-full grid grid-cols-3 items-end gap-0 relative"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* ================= 2ND PLACE STEP (LEFT) ================= */}
        <div className="w-full flex flex-col justify-end">
          {top2 ? (
            <div
              data-testid={`pair-leaderboard-row-${top2.pairKey}`}
              className="w-full flex flex-col justify-end"
            >
              <span className="sr-only">#{top2.rank}</span>

              <div className="flex flex-col items-center justify-end px-1 -mb-2.5 relative z-20">
                <div className="relative flex items-center justify-center">
                  <PodiumRibbonTails variant="silver" size={50} />
                  <OverlappingDuoAvatars
                    row={top2}
                    size={42}
                    onSelectPlayer={onSelectPlayer}
                  />
                </div>
              </div>

              <PairSilver3DCap />

              <div
                className="w-full px-1.5 pt-2.5 pb-3.5 flex flex-col items-center justify-between text-center rounded-bl-xl"
                style={{
                  minHeight: '154px',
                  background: sharedFrontFaceBg,
                  borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div
                  className="font-bold text-2xl tracking-tight"
                  style={{ color: '#cbd5e1' }}
                >
                  2nd
                </div>

                {/* Stacked Partner Names & Badges */}
                <div className="w-full my-1 min-w-0 px-0.5 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(top2.player1.playerId)}
                    className="font-semibold text-[11px] sm:text-xs text-white hover:text-emerald-400 transition-colors truncate max-w-full block text-center cursor-pointer min-h-[24px] px-1 py-0.5 leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    title={top2.player1.displayName}
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    {top2.player1.displayName}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(top2.player2.playerId)}
                    className="font-semibold text-[11px] sm:text-xs text-white hover:text-emerald-400 transition-colors truncate max-w-full block text-center cursor-pointer min-h-[24px] px-1 py-0.5 leading-tight -mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    title={top2.player2.displayName}
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    &amp; {top2.player2.displayName}
                  </button>

                  <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                    {isViewerInPair(top2) && (
                      <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] font-bold bg-emerald-600 text-white">
                        You
                      </span>
                    )}
                    {top2.isTiedRank && (
                      <span className="text-[9px] font-bold text-amber-500">(T)</span>
                    )}
                    {top2.includesGuest && (
                      <StatusBadge variant="guest" customLabel="Guest" />
                    )}
                    {top2.isProvisional && (
                      <StatusBadge variant="provisional" customLabel="Provisional" />
                    )}
                  </div>
                </div>

                <div className="w-full px-1">
                  <div className="font-semibold text-xs sm:text-sm text-slate-200">
                    <span className="rating-mono">{top2.ratingDisplay}</span> pts
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 font-normal leading-tight">
                    {formatPairPodiumStats(top2)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-36 bg-slate-800/20 border-t border-slate-700/30 rounded-tl-xl" />
          )}
        </div>

        {/* ================= 1ST PLACE STEP (CENTER) ================= */}
        <div className="w-full flex flex-col justify-end z-10">
          {top1 ? (
            <div
              data-testid={`pair-leaderboard-row-${top1.pairKey}`}
              className="w-full flex flex-col justify-end"
            >
              <span className="sr-only">#{top1.rank}</span>

              <div className="flex flex-col items-center justify-end px-1 -mb-2 relative z-20">
                <div className="relative flex flex-col items-center">
                  <div className="translate-y-2 z-30 pointer-events-none">
                    <PodiumCrownIcon size={44} />
                  </div>
                  <OverlappingDuoAvatars
                    row={top1}
                    size={50}
                    onSelectPlayer={onSelectPlayer}
                  />
                </div>
              </div>

              <PairEmerald3DCap />

              <div
                className="w-full px-1.5 pt-2.5 pb-4 flex flex-col items-center justify-between text-center"
                style={{
                  minHeight: '196px',
                  background: sharedFrontFaceBg,
                  borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
                }}
              >
                <div
                  className="font-bold text-3xl tracking-tight"
                  style={{
                    color: '#facc15',
                    textShadow: '0 2px 10px rgba(250, 204, 21, 0.4)',
                  }}
                >
                  1st
                </div>

                {/* Stacked Partner Names & Badges */}
                <div className="w-full my-1 min-w-0 px-0.5 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(top1.player1.playerId)}
                    className="font-bold text-xs sm:text-sm text-white hover:text-emerald-400 transition-colors truncate max-w-full block text-center cursor-pointer min-h-[24px] px-1 py-0.5 leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    title={top1.player1.displayName}
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    {top1.player1.displayName}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(top1.player2.playerId)}
                    className="font-bold text-xs sm:text-sm text-white hover:text-emerald-400 transition-colors truncate max-w-full block text-center cursor-pointer min-h-[24px] px-1 py-0.5 leading-tight -mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    title={top1.player2.displayName}
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    &amp; {top1.player2.displayName}
                  </button>

                  <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                    {isViewerInPair(top1) && (
                      <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] font-bold bg-emerald-600 text-white">
                        You
                      </span>
                    )}
                    {top1.isTiedRank && (
                      <span className="text-[9px] font-bold text-amber-500">(T)</span>
                    )}
                    {top1.includesGuest && (
                      <StatusBadge variant="guest" customLabel="Guest" />
                    )}
                    {top1.isProvisional && (
                      <StatusBadge variant="provisional" customLabel="Provisional" />
                    )}
                  </div>
                </div>

                <div className="w-full px-1">
                  <div className="font-semibold text-sm sm:text-base text-white">
                    <span className="rating-mono">{top1.ratingDisplay}</span> pts
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-300 mt-1 font-normal leading-tight">
                    {formatPairPodiumStats(top1)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-48 bg-slate-800/20 border-t-2 border-emerald-500/40" />
          )}
        </div>

        {/* ================= 3RD PLACE STEP (RIGHT) ================= */}
        <div className="w-full flex flex-col justify-end">
          {top3 ? (
            <div
              data-testid={`pair-leaderboard-row-${top3.pairKey}`}
              className="w-full flex flex-col justify-end"
            >
              <span className="sr-only">#{top3.rank}</span>

              <div className="flex flex-col items-center justify-end px-1 -mb-2.5 relative z-20">
                <div className="relative flex items-center justify-center">
                  <PodiumRibbonTails variant="bronze" size={46} />
                  <OverlappingDuoAvatars
                    row={top3}
                    size={38}
                    onSelectPlayer={onSelectPlayer}
                  />
                </div>
              </div>

              <PairBronze3DCap />

              <div
                className="w-full px-1.5 pt-2 pb-3.5 flex flex-col items-center justify-between text-center rounded-br-xl"
                style={{
                  minHeight: '136px',
                  background: sharedFrontFaceBg,
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div
                  className="font-bold text-xl sm:text-2xl tracking-tight"
                  style={{ color: '#d97706' }}
                >
                  3rd
                </div>

                {/* Stacked Partner Names & Badges */}
                <div className="w-full my-0.5 min-w-0 px-0.5 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(top3.player1.playerId)}
                    className="font-semibold text-[11px] sm:text-xs text-white hover:text-emerald-400 transition-colors truncate max-w-full block text-center cursor-pointer min-h-[24px] px-1 py-0.5 leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    title={top3.player1.displayName}
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    {top3.player1.displayName}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(top3.player2.playerId)}
                    className="font-semibold text-[11px] sm:text-xs text-white hover:text-emerald-400 transition-colors truncate max-w-full block text-center cursor-pointer min-h-[24px] px-1 py-0.5 leading-tight -mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                    title={top3.player2.displayName}
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    &amp; {top3.player2.displayName}
                  </button>

                  <div className="flex items-center gap-0.5 mt-0.5 justify-center flex-wrap">
                    {isViewerInPair(top3) && (
                      <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] font-bold bg-emerald-600 text-white">
                        You
                      </span>
                    )}
                    {top3.isTiedRank && (
                      <span className="text-[9px] font-bold text-amber-500">(T)</span>
                    )}
                    {top3.includesGuest && (
                      <StatusBadge variant="guest" customLabel="Guest" />
                    )}
                    {top3.isProvisional && (
                      <StatusBadge variant="provisional" customLabel="Provisional" />
                    )}
                  </div>
                </div>

                <div className="w-full px-1">
                  <div className="font-semibold text-xs sm:text-sm text-amber-100">
                    <span className="rating-mono">{top3.ratingDisplay}</span> pts
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 font-normal leading-tight">
                    {formatPairPodiumStats(top3)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-28 bg-slate-800/10 border-t border-amber-900/30 rounded-tr-xl" />
          )}
        </div>
      </div>
    </div>
  );
}
