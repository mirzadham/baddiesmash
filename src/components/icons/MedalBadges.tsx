export interface MedalBadgeProps {
  rank: 1 | 2 | 3 | number;
  size?: number;
  className?: string;
}

export function MedalBadge({ rank, size = 44, className = '' }: MedalBadgeProps) {
  if (rank === 1) {
    // 1st Place — Rich Gold with Ribbon Tails
    return (
      <svg
        width={size}
        height={Math.round(size * 1.25)}
        viewBox="0 0 48 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="1st Place Gold Medal"
      >
        <defs>
          <linearGradient id="gold-medal-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="35%" stopColor="#EAB308" />
            <stop offset="70%" stopColor="#CA8A04" />
            <stop offset="100%" stopColor="#A16207" />
          </linearGradient>
          <linearGradient id="gold-ribbon-left" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#854D0E" />
          </linearGradient>
          <linearGradient id="gold-ribbon-right" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#CA8A04" />
            <stop offset="100%" stopColor="#713F12" />
          </linearGradient>
          <filter id="medal-shadow" x="-4" y="-2" width="56" height="66" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.35" />
          </filter>
        </defs>

        <g filter="url(#medal-shadow)">
          {/* Left Ribbon Tail */}
          <path
            d="M17 32L10 54L18 49L23 54L22 34Z"
            fill="url(#gold-ribbon-left)"
          />
          {/* Right Ribbon Tail */}
          <path
            d="M31 32L26 34L25 54L30 49L38 54Z"
            fill="url(#gold-ribbon-right)"
          />

          {/* Medal Outer Rim */}
          <circle cx="24" cy="22" r="19" fill="#854D0E" />
          {/* Medal Gradient Core */}
          <circle cx="24" cy="22" r="17.5" fill="url(#gold-medal-grad)" stroke="#FEF08A" strokeWidth="1.5" />
          {/* Inner Accent Ring */}
          <circle cx="24" cy="22" r="14" fill="none" stroke="#CA8A04" strokeWidth="1" strokeDasharray="2 2" />

          {/* Text "1st" */}
          <text
            x="24"
            y="27"
            textAnchor="middle"
            fill="#78350F"
            fontSize="14"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            style={{ textShadow: '0 1px 0 rgba(254, 240, 138, 0.7)' }}
          >
            1st
          </text>
        </g>
      </svg>
    );
  }

  if (rank === 2) {
    // 2nd Place — Polished Silver with Ribbon Tails
    return (
      <svg
        width={size}
        height={Math.round(size * 1.25)}
        viewBox="0 0 48 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="2nd Place Silver Medal"
      >
        <defs>
          <linearGradient id="silver-medal-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F1F5F9" />
            <stop offset="35%" stopColor="#CBD5E1" />
            <stop offset="70%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
          <linearGradient id="silver-ribbon-left" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="silver-ribbon-right" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        </defs>

        {/* Left Ribbon Tail */}
        <path
          d="M17 32L10 54L18 49L23 54L22 34Z"
          fill="url(#silver-ribbon-left)"
        />
        {/* Right Ribbon Tail */}
        <path
          d="M31 32L26 34L25 54L30 49L38 54Z"
          fill="url(#silver-ribbon-right)"
        />

        {/* Medal Outer Rim */}
        <circle cx="24" cy="22" r="19" fill="#475569" />
        {/* Medal Gradient Core */}
        <circle cx="24" cy="22" r="17.5" fill="url(#silver-medal-grad)" stroke="#FFFFFF" strokeWidth="1.5" />
        {/* Inner Accent Ring */}
        <circle cx="24" cy="22" r="14" fill="none" stroke="#64748B" strokeWidth="1" strokeDasharray="2 2" />

        {/* Text "2nd" */}
        <text
          x="24"
          y="27"
          textAnchor="middle"
          fill="#1E293B"
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          style={{ textShadow: '0 1px 0 rgba(255, 255, 255, 0.7)' }}
        >
          2nd
        </text>
      </svg>
    );
  }

  // 3rd Place — Warm Bronze with Ribbon Tails
  return (
    <svg
      width={size}
      height={Math.round(size * 1.25)}
      viewBox="0 0 48 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="3rd Place Bronze Medal"
    >
      <defs>
        <linearGradient id="bronze-medal-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDBA74" />
          <stop offset="35%" stopColor="#FB923C" />
          <stop offset="70%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#9A3412" />
        </linearGradient>
        <linearGradient id="bronze-ribbon-left" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#7C2D12" />
        </linearGradient>
        <linearGradient id="bronze-ribbon-right" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B45309" />
          <stop offset="100%" stopColor="#431407" />
        </linearGradient>
      </defs>

      {/* Left Ribbon Tail */}
      <path
        d="M17 32L10 54L18 49L23 54L22 34Z"
        fill="url(#bronze-ribbon-left)"
      />
      {/* Right Ribbon Tail */}
      <path
        d="M31 32L26 34L25 54L30 49L38 54Z"
        fill="url(#bronze-ribbon-right)"
      />

      {/* Medal Outer Rim */}
      <circle cx="24" cy="22" r="19" fill="#7C2D12" />
      {/* Medal Gradient Core */}
      <circle cx="24" cy="22" r="17.5" fill="url(#bronze-medal-grad)" stroke="#FED7AA" strokeWidth="1.5" />
      {/* Inner Accent Ring */}
      <circle cx="24" cy="22" r="14" fill="none" stroke="#9A3412" strokeWidth="1" strokeDasharray="2 2" />

      {/* Text "3rd" */}
      <text
        x="24"
        y="27"
        textAnchor="middle"
        fill="#431407"
        fontSize="13"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        style={{ textShadow: '0 1px 0 rgba(254, 215, 170, 0.7)' }}
      >
        3rd
      </text>
    </svg>
  );
}

/**
 * 5-Point Regal Curved Golden Crown for 1st Place Podium Champion
 * Matches reference mockup in new ui design/leaderboard.jfif
 */
export function PodiumCrownIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.72)}
      viewBox="0 0 52 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="podiumCrownGoldV3" x1="4" y1="2" x2="48" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="25%" stopColor="#FACC15" />
          <stop offset="65%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#CA8A04" />
        </linearGradient>
        <filter id="crownGlowFilter" x="-4" y="-2" width="60" height="44" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter="url(#crownGlowFilter)">
        {/* Crown 5-point peaks with gentle base curvature to cup avatar */}
        <path
          d="M5 30 C18 34.5 34 34.5 47 30 L44 14 L35 21 L26 4 L17 21 L8 14 Z"
          fill="url(#podiumCrownGoldV3)"
          stroke="#854D0E"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Pearls on peaks */}
        <circle cx="26" cy="4" r="2.4" fill="#FEF08A" stroke="#854D0E" strokeWidth="0.8" />
        <circle cx="8" cy="14" r="2" fill="#FEF08A" stroke="#854D0E" strokeWidth="0.8" />
        <circle cx="44" cy="14" r="2" fill="#FEF08A" stroke="#854D0E" strokeWidth="0.8" />
        <circle cx="17" cy="21" r="1.6" fill="#FEF08A" stroke="#854D0E" strokeWidth="0.6" />
        <circle cx="35" cy="21" r="1.6" fill="#FEF08A" stroke="#854D0E" strokeWidth="0.6" />
        {/* Curved bottom accent band */}
        <path
          d="M8 28.5 C19 32 33 32 44 28.5"
          stroke="#A16207"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * Hanging Ribbon Tails for 2nd (Silver) and 3rd (Bronze) Medallion Frames
 */
export function PodiumRibbonTails({
  variant,
  size = 56,
}: {
  variant: 'silver' | 'bronze';
  size?: number;
}) {
  const isSilver = variant === 'silver';
  const leftId = isSilver ? 'podium-ribbon-s-left' : 'podium-ribbon-b-left';
  const rightId = isSilver ? 'podium-ribbon-s-right' : 'podium-ribbon-b-right';
  const strokeColor = isSilver ? '#475569' : '#78350f';

  return (
    <svg
      width={Math.round(size * 1.35)}
      height={Math.round(size * 0.55)}
      viewBox="0 0 76 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 pointer-events-none z-0"
      aria-hidden="true"
    >
      <defs>
        {isSilver ? (
          <>
            <linearGradient id={leftId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E2E8F0" />
              <stop offset="50%" stopColor="#94A3B8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
            <linearGradient id={rightId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#CBD5E1" />
              <stop offset="50%" stopColor="#64748B" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </>
        ) : (
          <>
            <linearGradient id={leftId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FED7AA" />
              <stop offset="50%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#9A3412" />
            </linearGradient>
            <linearGradient id={rightId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FDBA74" />
              <stop offset="50%" stopColor="#B45309" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>
          </>
        )}
      </defs>
      {/* Left ribbon tail */}
      <path
        d="M28 2 L12 28 L22 23 L29 28 L32 4 Z"
        fill={`url(#${leftId})`}
        stroke={strokeColor}
        strokeWidth="0.8"
      />
      {/* Right ribbon tail */}
      <path
        d="M48 2 L44 4 L47 28 L54 23 L64 28 Z"
        fill={`url(#${rightId})`}
        stroke={strokeColor}
        strokeWidth="0.8"
      />
    </svg>
  );
}
