import type { AllTimeLeaderboardRow } from '../../domain/standings.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';
import { PodiumCrown } from '../icons/BrandMark.tsx';
import { StatusBadge } from '../StatusBadge.tsx';

export interface LeaderboardPodiumProps {
  top1: AllTimeLeaderboardRow | null;
  top2: AllTimeLeaderboardRow | null;
  top3: AllTimeLeaderboardRow | null;
  currentUserId?: string | null;
  viewerLinkedPlayerId?: string | null;
  onSelectPlayer: (playerId: string) => void;
}

/**
 * Custom Sculptural 3D Podium Component matching the reference design.
 * Features:
 * - Fluid sweeping aerodynamic ribbon base in signature royal purple (#7045C6)
 * - 3 distinct stepped heights: 1st center (tallest gold), 2nd left (silver), 3rd right (bronze)
 * - Metallic specular highlights, gold crown for champion, circular metallic rank badges
 * - Purple rating pills and secondary win statistics
 * - Highlight for the current authenticated user if on the podium
 * - Supports graceful rendering when fewer than 3 players are available
 */
export function LeaderboardPodium({
  top1,
  top2,
  top3,
  viewerLinkedPlayerId,
  onSelectPlayer,
}: LeaderboardPodiumProps) {
  // If no players at all, don't render podium
  if (!top1 && !top2 && !top3) {
    return null;
  }

  return (
    <div className="relative w-full max-w-xl mx-auto px-2 pt-3 pb-2 select-none overflow-hidden" data-testid="leaderboard-podium">
      {/* Background Subtle Stadium Spotlight Glow behind podium */}
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 w-[320px] sm:w-[440px] h-[220px] pointer-events-none opacity-30 dark:opacity-25 blur-3xl -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(112, 69, 198, 0.35) 0%, rgba(245, 158, 11, 0.12) 45%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Contestants Row (Stepped heights aligned over SVG pedestals) */}
      <div className="grid grid-cols-3 items-end gap-0.5 sm:gap-3 relative z-10 mb-[-12px] sm:mb-[-18px] w-full max-w-full">
        {/* 2nd Place Contestant (Left - Silver Tier) */}
        <div className="flex flex-col items-center text-center translate-y-3 sm:translate-y-4 min-w-0 px-0.5">
          {top2 ? (
            <div
              data-testid={`leaderboard-row-${top2.playerId}`}
              className="flex flex-col items-center w-full max-w-[100px] xs:max-w-[115px] sm:max-w-[130px] group min-w-0"
            >
              {/* Semantic hidden rank for automated tests */}
              <span className="sr-only">#{top2.rank}</span>

              {/* Avatar with Silver Ring and Medal Badge */}
              <div className="relative mb-1 cursor-pointer" onClick={() => onSelectPlayer(top2.playerId)}>
                <PlayerAvatar
                  displayName={top2.displayName}
                  playerId={top2.playerId}
                  size={46}
                  rank={2}
                  isCurrentUser={viewerLinkedPlayerId === top2.playerId}
                  className="transition-transform group-hover:scale-105"
                />
                {/* Silver Medallion "2" overlapping bottom edge of avatar */}
                <div
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center font-black text-[10px] sm:text-[11px] shadow-sm text-slate-800"
                  style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #94a3b8 100%)',
                    border: '1.5px solid #ffffff',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                  }}
                  aria-label="Rank 2"
                >
                  2
                </div>
              </div>

              {/* Player Name and You pill */}
              <div className="flex items-center justify-center gap-1 mt-0.5 max-w-full px-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(top2.playerId)}
                  style={{ background: 'transparent', border: 'none', padding: 0 }}
                  className="font-bold text-[11px] sm:text-sm text-[var(--text-primary)] hover:text-[#7045c6] transition-colors truncate block text-center cursor-pointer min-w-0"
                  title={top2.displayName}
                >
                  {top2.displayName}
                </button>
                {viewerLinkedPlayerId === top2.playerId && (
                  <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] sm:text-[9px] font-bold bg-[#7045c6] text-white">
                    You
                  </span>
                )}
              </div>

              {/* Guest / Provisional / Tied Badges */}
              <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                {top2.isTiedRank && (
                  <span className="text-[9px] sm:text-[10px] font-bold text-amber-500">(T)</span>
                )}
                {top2.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
                {top2.isProvisional && <StatusBadge variant="provisional" customLabel="Provisional" />}
              </div>

              {/* Elo Rating Pill */}
              <div
                className="mt-1 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-black tracking-wide text-white"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7045c6 100%)',
                  boxShadow: '0 2px 8px rgba(112, 69, 198, 0.35)',
                }}
              >
                <span className="rating-mono">{top2.ratingDisplay}</span>
              </div>

              {/* Secondary Stat: Wins */}
              <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] mt-0.5 font-medium">
                {top2.wins} {top2.wins === 1 ? 'Win' : 'Wins'}
              </span>
            </div>
          ) : (
            <div className="h-28" />
          )}
        </div>

        {/* 1st Place Champion (Center - Gold Towering Tier) */}
        <div className="flex flex-col items-center text-center min-w-0 px-0.5">
          {top1 ? (
            <div
              data-testid={`leaderboard-row-${top1.playerId}`}
              className="flex flex-col items-center w-full max-w-[115px] xs:max-w-[130px] sm:max-w-[145px] group z-20 min-w-0"
            >
              <span className="sr-only">#{top1.rank}</span>

              {/* Floating Gold Crown */}
              <div className="mb-0.5 filter drop-shadow-[0_4px_8px_rgba(245,158,11,0.5)] animate-bounce-subtle">
                <PodiumCrown size={26} />
              </div>

              {/* Avatar with Gold Ring and Medal Badge */}
              <div className="relative mb-1 cursor-pointer" onClick={() => onSelectPlayer(top1.playerId)}>
                <PlayerAvatar
                  displayName={top1.displayName}
                  playerId={top1.playerId}
                  size={58}
                  rank={1}
                  isCurrentUser={viewerLinkedPlayerId === top1.playerId}
                  className="transition-transform group-hover:scale-105"
                />
              </div>

              {/* Champion Player Name and You pill */}
              <div className="flex items-center justify-center gap-1 mt-0.5 max-w-full px-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(top1.playerId)}
                  style={{ background: 'transparent', border: 'none', padding: 0 }}
                  className="font-extrabold text-xs sm:text-base text-[var(--text-primary)] hover:text-[#7045c6] transition-colors truncate block text-center cursor-pointer min-w-0"
                  title={top1.displayName}
                >
                  {top1.displayName}
                </button>
                {viewerLinkedPlayerId === top1.playerId && (
                  <span className="flex-shrink-0 px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] font-bold bg-[#7045c6] text-white">
                    You
                  </span>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                {top1.isTiedRank && (
                  <span className="text-[9px] sm:text-[10px] font-bold text-amber-500">(T)</span>
                )}
                {top1.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
                {top1.isProvisional && <StatusBadge variant="provisional" customLabel="Provisional" />}
              </div>

              {/* Elo Rating Pill (Slightly larger for champion) */}
              <div
                className="mt-1 px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-black tracking-wide text-white"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7045c6 100%)',
                  boxShadow: '0 3px 12px rgba(112, 69, 198, 0.45)',
                }}
              >
                <span className="rating-mono">{top1.ratingDisplay}</span>
              </div>

              {/* Secondary Stat: Wins & Win Rate */}
              <span className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                {top1.wins} {top1.wins === 1 ? 'Win' : 'Wins'} ({top1.winRatePercentDisplay.split(' ')[0]})
              </span>
            </div>
          ) : (
            <div className="h-36" />
          )}
        </div>

        {/* 3rd Place Contestant (Right - Bronze Tier) */}
        <div className="flex flex-col items-center text-center translate-y-5 sm:translate-y-6 min-w-0 px-0.5">
          {top3 ? (
            <div
              data-testid={`leaderboard-row-${top3.playerId}`}
              className="flex flex-col items-center w-full max-w-[100px] xs:max-w-[115px] sm:max-w-[130px] group min-w-0"
            >
              <span className="sr-only">#{top3.rank}</span>

              {/* Avatar with Bronze Ring and Medal Badge */}
              <div className="relative mb-1 cursor-pointer" onClick={() => onSelectPlayer(top3.playerId)}>
                <PlayerAvatar
                  displayName={top3.displayName}
                  playerId={top3.playerId}
                  size={46}
                  rank={3}
                  isCurrentUser={viewerLinkedPlayerId === top3.playerId}
                  className="transition-transform group-hover:scale-105"
                />
                {/* Bronze Medallion "3" overlapping bottom edge of avatar */}
                <div
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center font-black text-[10px] sm:text-[11px] shadow-sm text-amber-950"
                  style={{
                    background: 'linear-gradient(135deg, #fed7aa 0%, #d97706 50%, #9a3412 100%)',
                    border: '1.5px solid #ffedd5',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                  }}
                  aria-label="Rank 3"
                >
                  3
                </div>
              </div>

              {/* 3rd Place Player Name and You pill */}
              <div className="flex items-center justify-center gap-1 mt-0.5 max-w-full px-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(top3.playerId)}
                  style={{ background: 'transparent', border: 'none', padding: 0 }}
                  className="font-bold text-[11px] sm:text-sm text-[var(--text-primary)] hover:text-[#7045c6] transition-colors truncate block text-center cursor-pointer min-w-0"
                  title={top3.displayName}
                >
                  {top3.displayName}
                </button>
                {viewerLinkedPlayerId === top3.playerId && (
                  <span className="flex-shrink-0 px-1 py-0.2 rounded-full text-[8px] sm:text-[9px] font-bold bg-[#7045c6] text-white">
                    You
                  </span>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                {top3.isTiedRank && (
                  <span className="text-[9px] sm:text-[10px] font-bold text-amber-500">(T)</span>
                )}
                {top3.isGuest && <StatusBadge variant="guest" customLabel="Guest" />}
                {top3.isProvisional && <StatusBadge variant="provisional" customLabel="Provisional" />}
              </div>

              {/* Elo Rating Pill */}
              <div
                className="mt-1 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-black tracking-wide text-white"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7045c6 100%)',
                  boxShadow: '0 2px 8px rgba(112, 69, 198, 0.35)',
                }}
              >
                <span className="rating-mono">{top3.ratingDisplay}</span>
              </div>

              {/* Secondary Stat: Wins */}
              <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] mt-0.5 font-medium">
                {top3.wins} {top3.wins === 1 ? 'Win' : 'Wins'}
              </span>
            </div>
          ) : (
            <div className="h-24" />
          )}
        </div>
      </div>

      {/* Sculptural 3D Vector Podium Base matching reference image */}
      <div className="relative w-full max-w-[480px] mx-auto z-0 filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)] overflow-hidden">
        <svg
          viewBox="0 0 480 160"
          width="100%"
          style={{ maxWidth: '100%' }}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto block select-none"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            {/* Ground Shadow */}
            <radialGradient id="podiumFloorShadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#000000" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>

            {/* Center Gold Pedestal Top */}
            <radialGradient id="goldTopBevel" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fffbeb" />
              <stop offset="35%" stopColor="#fef08a" />
              <stop offset="70%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </radialGradient>

            {/* Center Gold Pedestal Front Body */}
            <linearGradient id="goldFrontBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#78350f" />
              <stop offset="20%" stopColor="#d97706" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="80%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#78350f" />
            </linearGradient>

            {/* Left Silver Pedestal Top */}
            <radialGradient id="silverTopBevel" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#e2e8f0" />
              <stop offset="80%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </radialGradient>

            {/* Left Silver Front Body */}
            <linearGradient id="silverFrontBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="25%" stopColor="#64748b" />
              <stop offset="50%" stopColor="#cbd5e1" />
              <stop offset="75%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            {/* Right Bronze Pedestal Top */}
            <radialGradient id="bronzeTopBevel" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffedd5" />
              <stop offset="45%" stopColor="#fed7aa" />
              <stop offset="80%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#7c2d12" />
            </radialGradient>

            {/* Right Bronze Front Body */}
            <linearGradient id="bronzeFrontBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#431407" />
              <stop offset="25%" stopColor="#9a3412" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="75%" stopColor="#9a3412" />
              <stop offset="100%" stopColor="#431407" />
            </linearGradient>

          </defs>

          {/* Ground Contact Shadow */}
          <ellipse cx="240" cy="142" rx="215" ry="10" fill="url(#podiumFloorShadow)" />

          {/* ================= 2ND PLACE LEFT PLATFORM (SILVER) ================= */}
          {top2 && (
            <g id="silverPodiumTier">
              {/* Silver riser body */}
              <path
                d="M65 68 L65 125 C65 135 95 142 130 142 C165 142 195 135 195 125 L195 68 Z"
                fill="url(#silverFrontBody)"
              />
              {/* Silver top landing pad */}
              <ellipse cx="130" cy="68" rx="65" ry="16" fill="url(#silverTopBevel)" stroke="#ffffff" strokeWidth="1" />
              {/* Embossed "2" on Silver Riser */}
              <text
                x="130"
                y="110"
                textAnchor="middle"
                fill="#ffffff"
                fillOpacity="0.85"
                fontSize="28"
                fontWeight="900"
                fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
              >
                2
              </text>
            </g>
          )}

          {/* ================= 3RD PLACE RIGHT PLATFORM (BRONZE) ================= */}
          {top3 && (
            <g id="bronzePodiumTier">
              {/* Bronze riser body */}
              <path
                d="M290 78 L290 128 C290 137 315 144 350 144 C385 144 410 137 410 128 L410 78 Z"
                fill="url(#bronzeFrontBody)"
              />
              {/* Bronze top landing pad */}
              <ellipse cx="350" cy="78" rx="60" ry="15" fill="url(#bronzeTopBevel)" stroke="#fed7aa" strokeWidth="1" />
              {/* Embossed "3" on Bronze Riser */}
              <text
                x="350"
                y="116"
                textAnchor="middle"
                fill="#ffffff"
                fillOpacity="0.85"
                fontSize="26"
                fontWeight="900"
                fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
              >
                3
              </text>
            </g>
          )}

          {/* ================= 1ST PLACE CENTER PLATFORM (GOLD) ================= */}
          {top1 && (
            <g id="goldPodiumTier">
              {/* Gold cylindrical front riser */}
              <path
                d="M168 40 L168 136 C168 147 200 154 240 154 C280 154 312 147 312 136 L312 40 Z"
                fill="url(#goldFrontBody)"
              />

              {/* Gold circular beveled top surface */}
              <ellipse cx="240" cy="40" rx="72" ry="18" fill="url(#goldTopBevel)" stroke="#fef08a" strokeWidth="1.5" />

              {/* Embossed Crown & Shuttlecock Crest on Gold Riser */}
              <g transform="translate(240, 88) scale(0.95)" className="select-none">
                {/* Crown above "1" */}
                <path
                  d="M-10 -16 L-14 -24 L-5 -21 L0 -27 L5 -21 L14 -24 L10 -16 Z"
                  fill="#fff"
                  fillOpacity="0.9"
                />
                {/* Roman Numeral "1" */}
                <text
                  x="0"
                  y="12"
                  textAnchor="middle"
                  fill="#ffffff"
                  fillOpacity="0.95"
                  fontSize="30"
                  fontWeight="900"
                  fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                  style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))' }}
                >
                  1
                </text>
                {/* Shuttlecock engraving emblem beneath numeral */}
                <path
                  d="M-7 20 L7 20 L4 27 C4 29 1 30 0 30 C-1 30 -4 29 -4 27 Z"
                  fill="#ffffff"
                  fillOpacity="0.8"
                />
                <path
                  d="M-5 20 L-2 26 M0 20 L0 27 M5 20 L2 26"
                  stroke="#78350f"
                  strokeWidth="0.8"
                />
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
