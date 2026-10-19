import React from 'react';

export interface IconBaseProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 5-point royal tournament crown in rich 24K gold gradient.
 */
export function CrownGold({ size = 28, className = '', style }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crown-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF59D" />
          <stop offset="35%" stopColor="#F59E0B" />
          <stop offset="70%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>
        <filter id="crown-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#F59E0B" floodOpacity="0.4" />
        </filter>
      </defs>
      <g filter="url(#crown-glow)">
        {/* Crown base band */}
        <rect x="5" y="23" width="22" height="4" rx="2" fill="url(#crown-gold-grad)" />
        <circle cx="9" cy="25" r="1" fill="#FEF08A" />
        <circle cx="16" cy="25" r="1.2" fill="#FEF08A" />
        <circle cx="23" cy="25" r="1" fill="#FEF08A" />
        
        {/* Crown peaks */}
        <path
          d="M5 23 L4 11 L10 16 L16 8 L22 16 L28 11 L27 23 Z"
          fill="url(#crown-gold-grad)"
        />
        
        {/* Jewels on peaks */}
        <circle cx="4" cy="10" r="1.8" fill="#FFF59D" stroke="#D97706" strokeWidth="0.8" />
        <circle cx="16" cy="7" r="2.2" fill="#FFF59D" stroke="#D97706" strokeWidth="0.8" />
        <circle cx="28" cy="10" r="1.8" fill="#FFF59D" stroke="#D97706" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

export interface LaurelWreathShieldProps extends IconBaseProps {
  rank: number | string | null;
  isTied?: boolean;
  variant?: 'gold' | 'silver' | 'bronze' | 'slate';
}

/**
 * Designer Laurel Wreath Rank Shield with authentic leaf curvature,
 * multi-stop metallic gradients, and embossed rank text.
 */
export function LaurelWreathShield({
  rank,
  isTied = false,
  variant,
  size = 46,
  className = '',
  style,
}: LaurelWreathShieldProps) {
  // Determine variant from rank if not explicitly provided
  const rankNum = typeof rank === 'number' ? rank : parseInt(String(rank), 10);
  const activeVariant =
    variant ??
    (rankNum === 1
      ? 'gold'
      : rankNum === 2
        ? 'silver'
        : rankNum === 3
          ? 'bronze'
          : 'slate');

  const gradientId = `laurel-grad-${activeVariant}`;
  const strokeColor =
    activeVariant === 'gold'
      ? '#F59E0B'
      : activeVariant === 'silver'
        ? '#CBD5E1'
        : activeVariant === 'bronze'
          ? '#D97706'
          : '#475569';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <defs>
        {activeVariant === 'gold' && (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF9C4" />
            <stop offset="30%" stopColor="#F59E0B" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
        )}
        {activeVariant === 'silver' && (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#E2E8F0" />
            <stop offset="80%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        )}
        {activeVariant === 'bronze' && (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FED7AA" />
            <stop offset="35%" stopColor="#D97706" />
            <stop offset="75%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>
        )}
        {activeVariant === 'slate' && (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
        )}

        <radialGradient id={`glow-${activeVariant}`} cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor={
              activeVariant === 'gold'
                ? '#F59E0B'
                : activeVariant === 'silver'
                  ? '#CBD5E1'
                  : activeVariant === 'bronze'
                    ? '#D97706'
                    : '#64748B'
            }
            stopOpacity="0.25"
          />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle background aura */}
      <circle cx="28" cy="28" r="26" fill={`url(#glow-${activeVariant})`} />

      {/* Central shield/circle */}
      <circle
        cx="28"
        cy="28"
        r="17"
        fill="#12151C"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.8"
      />

      {/* Left Laurel Branch */}
      <g stroke={`url(#${gradientId})`} fill={`url(#${gradientId})`} strokeWidth="0.8">
        {/* Main stem */}
        <path
          d="M 28 47 C 15 45 10 33 12 18"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Leaves */}
        <path d="M 26 46 C 22 46 20 42 22 39 C 24 41 26 44 26 46 Z" />
        <path d="M 20 43 C 15 42 14 38 17 35 C 19 38 20 41 20 43 Z" />
        <path d="M 15 38 C 10 36 10 31 14 29 C 15 32 16 36 15 38 Z" />
        <path d="M 12 31 C 8 28 9 23 13 22 C 13 25 14 29 12 31 Z" />
        <path d="M 12 24 C 9 20 11 16 15 16 C 15 19 14 22 12 24 Z" />
        <path d="M 15 17 C 14 12 18 10 20 11 C 19 14 18 16 15 17 Z" />
      </g>

      {/* Right Laurel Branch */}
      <g stroke={`url(#${gradientId})`} fill={`url(#${gradientId})`} strokeWidth="0.8">
        {/* Main stem */}
        <path
          d="M 28 47 C 41 45 46 33 44 18"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Leaves */}
        <path d="M 30 46 C 34 46 36 42 34 39 C 32 41 30 44 30 46 Z" />
        <path d="M 36 43 C 41 42 42 38 39 35 C 37 38 36 41 36 43 Z" />
        <path d="M 41 38 C 46 36 46 31 42 29 C 41 32 40 36 41 38 Z" />
        <path d="M 44 31 C 48 28 47 23 43 22 C 43 25 42 29 44 31 Z" />
        <path d="M 44 24 C 47 20 45 16 41 16 C 41 19 42 22 44 24 Z" />
        <path d="M 41 17 C 42 12 38 10 36 11 C 37 14 38 16 41 17 Z" />
      </g>

      {/* Ribbon tie at bottom */}
      <path
        d="M 24 47 Q 28 49 32 47 Q 28 51 24 47 Z"
        fill={`url(#${gradientId})`}
      />

      {/* Crest star/crown at apex */}
      <path
        d="M 28 7 L 29.5 10 L 32.5 10.5 L 30.2 12.5 L 31 15.5 L 28 13.8 L 25 15.5 L 25.8 12.5 L 23.5 10.5 L 26.5 10 Z"
        fill={`url(#${gradientId})`}
      />

      {/* Rank text in center */}
      <text
        x="28"
        y="33"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={strokeColor}
        fontSize={typeof rank === 'string' && rank.length > 2 ? '13' : '15'}
        fontWeight="900"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        letterSpacing="-0.03em"
      >
        {rank}
      </text>
      {isTied && (
        <text
          x="28"
          y="41"
          textAnchor="middle"
          fill="#94A3B8"
          fontSize="8"
          fontWeight="700"
        >
          (T)
        </text>
      )}
    </svg>
  );
}

/**
 * Aerodynamic 3D Tournament Badminton Shuttlecock with realistic feather quills,
 * binding ribbons, and illuminated cork dome.
 */
export function DesignerShuttlecock({ size = 28, className = '', style }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shuttle-feather-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id="shuttle-cork-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="50%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="shuttle-band-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Outer Feather Skirt (Angle: ~45 deg flight path) */}
      <g transform="rotate(-30 18 18)">
        {/* Feather Fan Outline */}
        <path
          d="M 12 24 L 6 6 Q 18 3 30 6 L 24 24 Z"
          fill="url(#shuttle-feather-grad)"
          opacity="0.95"
        />

        {/* Individual Feather Veins / Quills */}
        <line x1="8" y1="7" x2="14" y2="24" stroke="#64748B" strokeWidth="0.8" opacity="0.6" />
        <line x1="12" y1="6" x2="16" y2="24" stroke="#64748B" strokeWidth="0.8" opacity="0.6" />
        <line x1="18" y1="5" x2="18" y2="24" stroke="#475569" strokeWidth="1" opacity="0.8" />
        <line x1="24" y1="6" x2="20" y2="24" stroke="#64748B" strokeWidth="0.8" opacity="0.6" />
        <line x1="28" y1="7" x2="22" y2="24" stroke="#64748B" strokeWidth="0.8" opacity="0.6" />

        {/* Horizontal Binding Threads */}
        <path
          d="M 8 11 Q 18 8 28 11"
          stroke="url(#shuttle-band-grad)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 10 16 Q 18 14 26 16"
          stroke="#EF4444"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />

        {/* Cork Dome Base */}
        <path
          d="M 13 24 Q 18 22 23 24 L 22 27 Q 18 31 14 27 Z"
          fill="url(#shuttle-cork-grad)"
          stroke="#B45309"
          strokeWidth="0.75"
        />
        {/* Cork highlight reflection */}
        <ellipse cx="17" cy="27" rx="3.5" ry="1.5" fill="#FFFFFF" opacity="0.5" />
      </g>
    </svg>
  );
}

/**
 * Crossed Tournament Badminton Rackets with woven string pattern and neon volt highlights.
 */
export function CrossedRackets({ size = 26, className = '', style }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="racket-frame-volt" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A3E635" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>

      {/* Racket 1 (diagonal left-to-right) */}
      <g transform="rotate(45 18 18)">
        {/* Oval Head */}
        <ellipse
          cx="18"
          cy="7"
          rx="6"
          ry="7"
          stroke="url(#racket-frame-volt)"
          strokeWidth="1.6"
          fill="#0F241C"
        />
        {/* Strings */}
        <line x1="15" y1="2" x2="15" y2="12" stroke="#A3E635" strokeWidth="0.5" opacity="0.5" />
        <line x1="18" y1="1" x2="18" y2="13" stroke="#A3E635" strokeWidth="0.5" opacity="0.5" />
        <line x1="21" y1="2" x2="21" y2="12" stroke="#A3E635" strokeWidth="0.5" opacity="0.5" />
        <line x1="13" y1="5" x2="23" y2="5" stroke="#A3E635" strokeWidth="0.5" opacity="0.5" />
        <line x1="12" y1="8" x2="24" y2="8" stroke="#A3E635" strokeWidth="0.5" opacity="0.5" />
        {/* Shaft */}
        <line x1="18" y1="14" x2="18" y2="26" stroke="#E2E8F0" strokeWidth="1.4" />
        {/* Grip Handle */}
        <line x1="18" y1="26" x2="18" y2="34" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      {/* Racket 2 (diagonal right-to-left) */}
      <g transform="rotate(-45 18 18)">
        {/* Oval Head */}
        <ellipse
          cx="18"
          cy="7"
          rx="6"
          ry="7"
          stroke="#E2E8F0"
          strokeWidth="1.6"
          fill="#161E2E"
        />
        {/* Strings */}
        <line x1="15" y1="2" x2="15" y2="12" stroke="#94A3B8" strokeWidth="0.5" opacity="0.5" />
        <line x1="18" y1="1" x2="18" y2="13" stroke="#94A3B8" strokeWidth="0.5" opacity="0.5" />
        <line x1="21" y1="2" x2="21" y2="12" stroke="#94A3B8" strokeWidth="0.5" opacity="0.5" />
        <line x1="13" y1="5" x2="23" y2="5" stroke="#94A3B8" strokeWidth="0.5" opacity="0.5" />
        <line x1="12" y1="8" x2="24" y2="8" stroke="#94A3B8" strokeWidth="0.5" opacity="0.5" />
        {/* Shaft */}
        <line x1="18" y1="14" x2="18" y2="26" stroke="#E2E8F0" strokeWidth="1.4" />
        {/* Grip Handle */}
        <line x1="18" y1="26" x2="18" y2="34" stroke="#0284C7" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      {/* Central Shuttlecock accent */}
      <circle cx="18" cy="18" r="2.5" fill="#A3E635" />
    </svg>
  );
}

export { Svg3DPodiumStage } from './Svg3DPodiumStage.tsx';
