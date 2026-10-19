import { useState } from 'react';

export interface PlayerAvatarProps {
  displayName: string;
  avatarUrl?: string | null;
  playerId?: string;
  size?: number;
  rank?: number;
  isCurrentUser?: boolean;
  className?: string;
}

export function getPlayerInitials(name: string): string {
  // Strip non-alphanumeric characters from words to handle parenthesized tags cleanly
  const words = name
    .trim()
    .split(/[\s_\-]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

  const w0 = words[0];
  const w1 = words[1];
  if (w0 && w1 && w0[0] && w1[0]) {
    return (w0[0] + w1[0]).toUpperCase();
  }
  if (w0) {
    return w0.slice(0, 2).toUpperCase();
  }
  const fallback = name.replace(/[^a-zA-Z0-9]/g, '');
  return (fallback.slice(0, 2) || '??').toUpperCase();
}

/**
 * Deterministically generates an attractive, subtle gradient based on string hash.
 * Produces balanced, sports-appropriate shades that harmonize with the purple palette.
 */
function getDeterministicPalette(str: string): { bg: string; text: string; border: string } {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const palettes = [
    { bg: 'linear-gradient(135deg, #ede9fe 0%, #c4b5fd 100%)', text: '#5b21b6', border: '#a78bfa' },
    { bg: 'linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 100%)', text: '#3730a3', border: '#818cf8' },
    { bg: 'linear-gradient(135deg, #fae8ff 0%, #f0abfc 100%)', text: '#86198f', border: '#e879f9' },
    { bg: 'linear-gradient(135deg, #fce7f3 0%, #f472b6 100%)', text: '#9d174d', border: '#f472b6' },
    { bg: 'linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%)', text: '#1e40af', border: '#60a5fa' },
    { bg: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)', text: '#334155', border: '#94a3b8' },
  ];
  const index = Math.abs(hash) % palettes.length;
  return palettes[index]!;
}

export function PlayerAvatar({
  displayName,
  avatarUrl,
  playerId = displayName,
  size = 40,
  rank,
  isCurrentUser = false,
  className = '',
}: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const palette = getDeterministicPalette(playerId || displayName);
  const initials = getPlayerInitials(displayName);

  // Border treatment for top-3 or current user
  let ringStyle = 'border-transparent';
  if (rank === 1) {
    ringStyle = 'ring-2 ring-[#f59e0b] shadow-glow-gold';
  } else if (rank === 2) {
    ringStyle = 'ring-2 ring-[#94a3b8] shadow-glow-silver';
  } else if (rank === 3) {
    ringStyle = 'ring-2 ring-[#d97706] shadow-glow-bronze';
  } else if (isCurrentUser) {
    ringStyle = 'ring-2 ring-[#7045c6] shadow-glow-purple';
  }

  const hasImage = avatarUrl && !imgError;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full flex-shrink-0 transition-transform ${ringStyle} ${className}`}
      style={{
        width: size,
        height: size,
      }}
      aria-label={`Avatar for ${displayName}`}
    >
      {hasImage ? (
        <img
          src={avatarUrl}
          alt={displayName}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center select-none font-bold tracking-wider"
          style={{
            background: palette.bg,
            color: palette.text,
            fontSize: Math.max(11, Math.round(size * 0.38)),
            boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.4)',
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
