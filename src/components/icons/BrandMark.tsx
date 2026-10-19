export interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Distinctive, premium shuttlecock brand mark as seen in the reference header.
 * Stylized aerodynamic angled feathers with signature purple gradient fill and cork base.
 */
export function ShuttlecockBrandMark({ size = 28, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shuttleFeatherGrad" x1="8" y1="4" x2="26" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9d6bf7" />
          <stop offset="100%" stopColor="#7045c6" />
        </linearGradient>
        <linearGradient id="shuttleCorkGrad" x1="14" y1="18" x2="24" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2d9f7" />
        </linearGradient>
        <filter id="shuttleGlow" x="0" y="0" width="32" height="32" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#7045c6" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter="url(#shuttleGlow)">
        {/* Fan Feathers */}
        <path
          d="M7.5 7.2C8.8 5.8 11.2 5 13.5 5.8L21.5 13.8C22.3 16.1 21.5 18.5 20.1 19.8L16.2 16L18 13.5L14 9.5L11.5 11.3L7.5 7.2Z"
          fill="url(#shuttleFeatherGrad)"
        />
        {/* Feather vanes lines */}
        <path
          d="M10 8.5L16.5 15M12.5 6.5L18.5 12.5M8.5 11L14.5 17"
          stroke="#ffffff"
          strokeWidth="1"
          strokeLinecap="round"
          strokeOpacity="0.4"
        />
        {/* Shuttle binding thread */}
        <path
          d="M14.5 14.5L17.5 17.5"
          stroke="#5b21b6"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Rounded Cork Base */}
        <circle
          cx="21"
          cy="21"
          r="4.5"
          fill="url(#shuttleCorkGrad)"
          stroke="#7045c6"
          strokeWidth="1.2"
        />
      </g>
    </svg>
  );
}

/**
 * Gold crown for 1st place podium champion
 */
export function PodiumCrown({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="podiumCrownGold" x1="3" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <path
        d="M3 17.5L4.5 7.5L8.5 11.5L12 5L15.5 11.5L19.5 7.5L21 17.5H3Z"
        fill="url(#podiumCrownGold)"
        stroke="#b45309"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="4.5" cy="7" r="1.2" fill="#fff" />
      <circle cx="12" cy="4.5" r="1.4" fill="#fff" />
      <circle cx="19.5" cy="7" r="1.2" fill="#fff" />
      <path d="M4 18.5H20" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
