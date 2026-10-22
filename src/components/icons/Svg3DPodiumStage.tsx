/**
 * Authentic 3D Stepped Tournament Award Podium Stage (Vector SVG).
 *
 * Handcrafted with true isometric perspective, metallic specular lighting,
 * volumetric chamfered facets, elliptical landing platforms, embossed Olympic Roman
 * medallions (1, 2, 3), laurel leaf accents, and ambient stage ground reflections.
 */
export function Svg3DPodiumStage({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 460 195"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`svg-3d-podium-stage ${className}`}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Soft Ambient Ground Drop Shadow */}
        <radialGradient id="stageGroundShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#000000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* ================= GOLD (1ST PLACE - CENTER) ================= */}
        <radialGradient id="goldTopPad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3d2a09" />
          <stop offset="70%" stopColor="#221704" />
          <stop offset="100%" stopColor="#120c02" />
        </radialGradient>

        <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="25%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="75%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>

        <linearGradient id="goldFront" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1a1103" />
          <stop offset="18%" stopColor="#382508" />
          <stop offset="50%" stopColor="#251805" />
          <stop offset="82%" stopColor="#382508" />
          <stop offset="100%" stopColor="#130c02" />
        </linearGradient>

        <linearGradient id="goldMedalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="35%" stopColor="#fbbf24" />
          <stop offset="70%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>

        {/* ================= SILVER (2ND PLACE - LEFT) ================= */}
        <radialGradient id="silverTopPad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#2c3647" />
          <stop offset="70%" stopColor="#1a2230" />
          <stop offset="100%" stopColor="#10151f" />
        </radialGradient>

        <linearGradient id="silverRim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="25%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#cbd5e1" />
          <stop offset="75%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>

        <linearGradient id="silverFront" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#141a24" />
          <stop offset="20%" stopColor="#2b3749" />
          <stop offset="50%" stopColor="#1e2736" />
          <stop offset="80%" stopColor="#2b3749" />
          <stop offset="100%" stopColor="#10141d" />
        </linearGradient>

        <linearGradient id="silverMedalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#cbd5e1" />
          <stop offset="85%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>

        {/* ================= BRONZE (3RD PLACE - RIGHT) ================= */}
        <radialGradient id="bronzeTopPad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#361f14" />
          <stop offset="70%" stopColor="#21120a" />
          <stop offset="100%" stopColor="#130904" />
        </radialGradient>

        <linearGradient id="bronzeRim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c2d12" />
          <stop offset="25%" stopColor="#fed7aa" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="75%" stopColor="#ffedd5" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>

        <linearGradient id="bronzeFront" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1c0f07" />
          <stop offset="20%" stopColor="#331c10" />
          <stop offset="50%" stopColor="#24130a" />
          <stop offset="80%" stopColor="#331c10" />
          <stop offset="100%" stopColor="#120803" />
        </linearGradient>

        <linearGradient id="bronzeMedalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="40%" stopColor="#f97316" />
          <stop offset="80%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>

        {/* Electric Volt / Court Green Ground Accent Glow */}
        <linearGradient id="courtFloorGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="20%" stopColor="#10b981" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#a3e635" stopOpacity="0.8" />
          <stop offset="80%" stopColor="#10b981" stopOpacity="0.4" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>

        {/* Ambient Stage Glow Behind #1 */}
        <filter id="glowMedal1" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. STAGE GROUND DROP SHADOW */}
      <ellipse cx="230" cy="182" rx="222" ry="12" fill="url(#stageGroundShadow)" />

      {/* =========================================================================
          TIER 2 (SILVER - 2ND PLACE - LEFT)
          ========================================================================= */}
      <g id="podium-tier-2">
        {/* Front Wall */}
        <path
          d="M 21,68 L 21,175 Q 85,183 152,175 L 152,68 Q 85,82 21,68 Z"
          fill="url(#silverFront)"
        />
        {/* Vertical Edge Bevel (Left) */}
        <line x1="22" y1="70" x2="22" y2="174" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1" />
        {/* Subtle Horizontal Perspective Rings */}
        <path
          d="M 21,110 Q 85,124 152,110"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M 21,145 Q 85,158 152,145"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth="1"
          fill="none"
        />

        {/* 3D Top Landing Platform Ellipse */}
        <ellipse
          cx="86"
          cy="68"
          rx="65"
          ry="14"
          fill="url(#silverTopPad)"
          stroke="url(#silverRim)"
          strokeWidth="2.5"
        />
        {/* Inner Carbon Step Ring */}
        <ellipse
          cx="86"
          cy="68"
          rx="52"
          ry="10"
          fill="none"
          stroke="rgba(203, 213, 225, 0.3)"
          strokeDasharray="4 3"
          strokeWidth="1"
        />

        {/* 2nd Place Embossed Medallion */}
        <g transform="translate(86, 122)">
          {/* Shadow Behind Medallion */}
          <circle cx="0" cy="2" r="23" fill="#090d14" opacity="0.6" />
          {/* Outer Metallic Ring */}
          <circle cx="0" cy="0" r="21" fill="#141a24" stroke="url(#silverMedalGrad)" strokeWidth="2.5" />
          {/* Inner Recessed Bevel */}
          <circle cx="0" cy="0" r="16" fill="#1e2736" stroke="#475569" strokeWidth="1" />

          {/* Left Laurel Sprig */}
          <path
            d="M -11,8 C -14,3 -14,-4 -11,-9 C -11,-9 -14,-7 -12,-3 C -10,-8 -6,-11 -5,-13 C -6,-10 -9,-8 -8,-4"
            fill="#cbd5e1"
            opacity="0.8"
          />
          {/* Right Laurel Sprig */}
          <path
            d="M 11,8 C 14,3 14,-4 11,-9 C 11,-9 14,-7 12,-3 C 10,-8 6,-11 5,-13 C 6,-10 9,-8 8,-4"
            fill="#cbd5e1"
            opacity="0.8"
          />

          {/* Embossed Numeral 2 */}
          <text
            x="0"
            y="6"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="18"
            fill="url(#silverMedalGrad)"
          >
            2
          </text>
        </g>

        {/* Rank Label Banner */}
        <g transform="translate(86, 158)">
          <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
          <text
            x="0"
            y="3.5"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="9"
            letterSpacing="1"
            fill="#e2e8f0"
          >
            2ND
          </text>
        </g>
      </g>

      {/* =========================================================================
          TIER 3 (BRONZE - 3RD PLACE - RIGHT)
          ========================================================================= */}
      <g id="podium-tier-3">
        {/* Front Wall */}
        <path
          d="M 308,88 L 308,175 Q 374,183 439,175 L 439,88 Q 374,102 308,88 Z"
          fill="url(#bronzeFront)"
        />
        {/* Vertical Edge Bevel (Right) */}
        <line x1="438" y1="90" x2="438" y2="174" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
        {/* Subtle Horizontal Perspective Rings */}
        <path
          d="M 308,124 Q 374,138 439,124"
          stroke="rgba(255, 255, 255, 0.03)"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M 308,152 Q 374,164 439,152"
          stroke="rgba(255, 255, 255, 0.03)"
          strokeWidth="1"
          fill="none"
        />

        {/* 3D Top Landing Platform Ellipse */}
        <ellipse
          cx="374"
          cy="88"
          rx="65"
          ry="14"
          fill="url(#bronzeTopPad)"
          stroke="url(#bronzeRim)"
          strokeWidth="2.5"
        />
        {/* Inner Carbon Step Ring */}
        <ellipse
          cx="374"
          cy="88"
          rx="52"
          ry="10"
          fill="none"
          stroke="rgba(251, 146, 60, 0.3)"
          strokeDasharray="4 3"
          strokeWidth="1"
        />

        {/* 3rd Place Embossed Medallion */}
        <g transform="translate(374, 134)">
          {/* Shadow Behind Medallion */}
          <circle cx="0" cy="2" r="21" fill="#090502" opacity="0.6" />
          {/* Outer Metallic Ring */}
          <circle cx="0" cy="0" r="19" fill="#201108" stroke="url(#bronzeMedalGrad)" strokeWidth="2.5" />
          {/* Inner Recessed Bevel */}
          <circle cx="0" cy="0" r="14.5" fill="#2c170c" stroke="#9a3412" strokeWidth="1" />

          {/* Left Laurel Sprig */}
          <path
            d="M -10,7 C -12,2 -12,-3 -9,-8 C -9,-8 -12,-6 -10,-2 C -8,-6 -5,-9 -4,-11 C -5,-8 -7,-6 -6,-3"
            fill="#fdba74"
            opacity="0.8"
          />
          {/* Right Laurel Sprig */}
          <path
            d="M 10,7 C 12,2 12,-3 9,-8 C 9,-8 12,-6 10,-2 C 8,-6 5,-9 4,-11 C 5,-8 7,-6 6,-3"
            fill="#fdba74"
            opacity="0.8"
          />

          {/* Embossed Numeral 3 */}
          <text
            x="0"
            y="5.5"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="16"
            fill="url(#bronzeMedalGrad)"
          >
            3
          </text>
        </g>

        {/* Rank Label Banner */}
        <g transform="translate(374, 164)">
          <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#27140a" stroke="#7c2d12" strokeWidth="1" />
          <text
            x="0"
            y="3.5"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="9"
            letterSpacing="1"
            fill="#fed7aa"
          >
            3RD
          </text>
        </g>
      </g>

      {/* =========================================================================
          INTER-TIER PERSPECTIVE DROP SHADOWS
          Center block projects forward, casting soft shadows on left & right blocks.
          ========================================================================= */}
      <path d="M 152,68 L 152,175 L 142,174 L 142,72 Z" fill="#000000" opacity="0.55" />
      <path d="M 308,88 L 308,175 L 318,174 L 318,92 Z" fill="#000000" opacity="0.55" />

      {/* =========================================================================
          TIER 1 (GOLD - 1ST PLACE - CENTER TOWER)
          ========================================================================= */}
      <g id="podium-tier-1">
        {/* Front Wall */}
        <path
          d="M 152,25 L 150,178 Q 230,188 310,178 L 308,25 Q 230,41 152,25 Z"
          fill="url(#goldFront)"
        />

        {/* Left & Right Vertical Metallic Highlight Ribs */}
        <line x1="153" y1="35" x2="151" y2="177" stroke="#92400e" strokeWidth="2" />
        <line x1="155" y1="36" x2="153" y2="177" stroke="#fef08a" strokeWidth="1" strokeOpacity="0.4" />
        <line x1="307" y1="35" x2="309" y2="177" stroke="#92400e" strokeWidth="2" />
        <line x1="305" y1="36" x2="307" y2="177" stroke="#fef08a" strokeWidth="1" strokeOpacity="0.4" />

        {/* Subtle Horizontal Curved Perspective Grooves */}
        <path
          d="M 151,75 Q 230,92 309,75"
          stroke="rgba(245, 158, 11, 0.08)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M 150,140 Q 230,154 310,140"
          stroke="rgba(245, 158, 11, 0.08)"
          strokeWidth="1.5"
          fill="none"
        />

        {/* Ground Base Accent Glow Trim (Electric Volt / Green) */}
        <path
          d="M 150,178 Q 230,188 310,178"
          stroke="url(#courtFloorGlow)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* 3D Top Landing Platform Ellipse */}
        <ellipse
          cx="230"
          cy="25"
          rx="78"
          ry="16"
          fill="url(#goldTopPad)"
          stroke="url(#goldRim)"
          strokeWidth="3.5"
        />
        {/* Inner Carbon Step Ring */}
        <ellipse
          cx="230"
          cy="25"
          rx="63"
          ry="11.5"
          fill="none"
          stroke="rgba(245, 158, 11, 0.45)"
          strokeDasharray="5 3.5"
          strokeWidth="1.2"
        />

        {/* 1st Place Embossed Medallion (Center Champion) */}
        <g transform="translate(230, 98)">
          {/* Gold Ambient Glow */}
          <circle cx="0" cy="0" r="28" fill="#f59e0b" opacity="0.18" filter="url(#glowMedal1)" />

          {/* Deep Drop Shadow */}
          <circle cx="0" cy="3" r="27" fill="#080501" opacity="0.8" />

          {/* Outer Polished Beveled Gold Ring */}
          <circle cx="0" cy="0" r="25" fill="#1b1203" stroke="url(#goldMedalGrad)" strokeWidth="3" />
          {/* Inner Recessed Bevel */}
          <circle cx="0" cy="0" r="19.5" fill="#2d1c05" stroke="#78350f" strokeWidth="1.2" />

          {/* Ornate Left Laurel Wreath */}
          <path
            d="M -14,11 C -18,4 -18,-5 -14,-12 C -14,-12 -18,-9 -16,-3 C -13,-10 -8,-14 -6,-16 C -8,-12 -12,-9 -10,-4"
            fill="url(#goldMedalGrad)"
          />
          {/* Ornate Right Laurel Wreath */}
          <path
            d="M 14,11 C 18,4 18,-5 14,-12 C 14,-12 18,-9 16,-3 C 13,-10 8,-14 6,-16 C 8,-12 12,-9 10,-4"
            fill="url(#goldMedalGrad)"
          />

          {/* Embossed Numeral 1 */}
          <text
            x="0"
            y="8"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="24"
            fill="url(#goldMedalGrad)"
          >
            1
          </text>
        </g>

        {/* Champion Gold Ribbon Banner */}
        <g transform="translate(230, 142)">
          {/* Ribbon Shadow */}
          <rect x="-38" y="-7" width="76" height="18" rx="4" fill="#000000" opacity="0.3" />
          {/* Ribbon Body */}
          <rect
            x="-36"
            y="-9"
            width="72"
            height="18"
            rx="4"
            fill="#451a03"
            stroke="url(#goldRim)"
            strokeWidth="1.2"
          />
          <text
            x="0"
            y="4"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="10"
            letterSpacing="1.5"
            fill="#fef08a"
          >
            CHAMPION
          </text>
        </g>
      </g>
    </svg>
  );
}
