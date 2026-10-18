/**
 * Utilities for handling single-use invitation tokens safely in the browser (`AUTH-02`, `PRIV-01`).
 *
 * Security invariants:
 * - Raw invitation tokens are held only in volatile in-memory state during redemption or one-time issuance display.
 * - Raw invitation tokens are never written to `localStorage`, `sessionStorage`, cookies, or console logs.
 * - When an `?invite=` query parameter is present in the URL, it is captured into memory once and stripped from
 *   the visible address bar via `history.replaceState` where supported. (Note: `history.replaceState` cleans the
 *   current address bar and prevents accidental copy/paste of the URL with the token, though it does not
 *   retroactively erase prior browser history entries or HTTP Referer headers sent before page load.)
 */

export interface LocationLike {
  readonly search: string;
  readonly pathname: string;
  readonly hash: string;
}

export interface HistoryLike {
  readonly state: unknown;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

let volatileCapturedUrlInviteToken: string | null = null;

/**
 * Extracts `?invite=` from the current URL once, stores it in volatile module memory,
 * and removes the `invite` parameter from the visible address bar using `history.replaceState`.
 */
export function captureAndStripInviteTokenFromUrl(
  loc: LocationLike | undefined = typeof window !== 'undefined'
    ? window.location
    : undefined,
  hist: HistoryLike | undefined = typeof window !== 'undefined'
    ? window.history
    : undefined,
): string | null {
  if (!loc || !loc.search) {
    return volatileCapturedUrlInviteToken;
  }

  const params = new URLSearchParams(loc.search);
  const rawInvite = params.get('invite');
  if (!rawInvite) {
    return volatileCapturedUrlInviteToken;
  }

  const trimmed = rawInvite.trim();
  if (trimmed.length > 0) {
    volatileCapturedUrlInviteToken = trimmed;
  }

  // Strip `invite` from the visible URL query string where feasible
  params.delete('invite');
  const remainingQuery = params.toString();
  const cleanUrl = `${loc.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${loc.hash || ''}`;

  if (hist && typeof hist.replaceState === 'function') {
    try {
      hist.replaceState(hist.state ?? null, '', cleanUrl);
    } catch {
      // Ignore if environment restricts replaceState
    }
  }

  return volatileCapturedUrlInviteToken;
}

/**
 * Clears the volatile in-memory invitation token (e.g., after successful redemption or manual clear).
 */
export function clearCapturedInviteToken(): void {
  volatileCapturedUrlInviteToken = null;
}

/**
 * Used in tests to reset volatile module state between test cases.
 */
export function resetCapturedInviteTokenForTesting(): void {
  volatileCapturedUrlInviteToken = null;
}

/**
 * Sanitizes RPC error messages so that raw invitation tokens or 64-character hex secrets
 * are never echoed in UI alerts, and maps server rejection codes/messages to clear,
 * non-sensitive user-facing messages (`Condition 2`).
 */
export function sanitizeInvitationRpcError(
  error: unknown,
  sensitiveRawToken?: string | null,
): string {
  const rawMsg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Operation failed on the server.';

  let redacted = rawMsg;
  if (sensitiveRawToken && sensitiveRawToken.trim().length >= 4) {
    redacted = redacted.split(sensitiveRawToken.trim()).join('[REDACTED_TOKEN]');
  }
  // Redact any 64-character hex token that might appear in an error string
  redacted = redacted.replace(/\b[0-9a-fA-F]{64}\b/g, '[REDACTED_TOKEN]');

  const lower = redacted.toLowerCase();

  if (lower.includes('invalid invitation token')) {
    return 'Invalid invitation token. Check that you pasted the complete single-use token or ask a group Admin for a new invitation.';
  }
  if (lower.includes('invitation has been revoked')) {
    return 'This invitation has been revoked by a group Admin or Owner and can no longer be redeemed.';
  }
  if (lower.includes('invitation has already been used')) {
    return 'This single-use invitation has already been redeemed and cannot be used again.';
  }
  if (lower.includes('invitation has expired')) {
    return 'This invitation has expired (invitations are valid for up to 7 days). Ask a group Admin or Owner for a new invitation.';
  }
  if (
    lower.includes(
      'authenticated account email does not match the invitation email',
    )
  ) {
    return 'Email mismatch: your signed-in account email does not match the email address this invitation was issued for.';
  }
  if (
    lower.includes(
      'a verified account email is required to redeem an invitation',
    )
  ) {
    return 'A verified account email address is required before redeeming an invitation.';
  }
  if (
    lower.includes(
      'account already has an active or pending membership in this group',
    )
  ) {
    return 'Your account already has an active, pending, or suspended membership in this group.';
  }
  if (
    lower.includes(
      'initial group bootstrap has already been completed and is now disabled',
    )
  ) {
    return 'Initial group bootstrap has already been completed for this tracker and is permanently disabled. Please redeem an invitation instead.';
  }

  return redacted;
}
