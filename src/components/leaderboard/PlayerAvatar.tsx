import { useState } from 'react';

export interface PlayerAvatarProps {
  displayName: string;
  avatarUrl?: string | null | undefined;
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
    { bg: '#064e3b', text: '#6ee7b7', border: '#059669' },
    { bg: '#0c4a6e', text: '#7dd3fc', border: '#0284c7' },
    { bg: '#1e293b', text: '#f8fafc', border: '#334155' },
    { bg: '#134e4a', text: '#5eead4', border: '#0d9488' },
    { bg: '#451a03', text: '#fde68a', border: '#d97706' },
    { bg: '#1c1917', text: '#e7e5e4', border: '#44403c' },
  ];
  const index = Math.abs(hash) % palettes.length;
  return palettes[index]!;
}

export function PlayerAvatar({
  displayName,
  avatarUrl,
  playerId = displayName,
  size = 40,
  rank: _rank,
  isCurrentUser: _isCurrentUser = false,
  className = '',
}: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [prevUrl, setPrevUrl] = useState(avatarUrl);

  if (prevUrl !== avatarUrl) {
    setPrevUrl(avatarUrl);
    setImgError(false);
  }

  const palette = getDeterministicPalette(playerId || displayName);
  const initials = getPlayerInitials(displayName);
  const hasImage = avatarUrl && !imgError;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden border border-slate-700/60 transition-transform ${className}`}
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
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center select-none font-bold tracking-wider"
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
