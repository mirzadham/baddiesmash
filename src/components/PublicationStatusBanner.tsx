import { useState } from 'react';
import type { EffectivePublicationBannerState } from '../services/trackerRepository.ts';
import type { MembershipRole } from '../types/database.ts';
import { StatusBadge } from './StatusBadge.tsx';

export interface PublicationStatusBannerProps {
  publication: EffectivePublicationBannerState;
  viewerRole: MembershipRole;
  isDemoMode: boolean;
  onRetryRecalculation?: () => Promise<void>;
}

/**
 * Displays the authoritative rating publication state (`Current`, `Recalculating`,
 * `Stale/Failed`, or `Status Unverified`) so users never mistake stale ratings for
 * current ratings (`DEC-016`, `RATE-04`, Condition 1B).
 */
export function PublicationStatusBanner({
  publication,
  viewerRole,
  isDemoMode,
  onRetryRecalculation,
}: PublicationStatusBannerProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrySuccessMessage, setRetrySuccessMessage] = useState<string | null>(
    null,
  );

  const isAdminOrOwner = viewerRole === 'admin' || viewerRole === 'owner';

  const handleRetryClick = async () => {
    if (!onRetryRecalculation || isRetrying || isDemoMode) {
      return;
    }
    setIsRetrying(true);
    setRetryError(null);
    setRetrySuccessMessage(null);
    try {
      await onRetryRecalculation();
      setRetrySuccessMessage(
        'Rating recalculation succeeded and published version is now current.',
      );
    } catch (err) {
      setRetryError(
        err instanceof Error
          ? err.message
          : 'Failed to retry rating recalculation.',
      );
    } finally {
      setIsRetrying(false);
    }
  };

  const bannerClass =
    publication.health === 'current'
      ? 'publication-banner publication-banner-current'
      : publication.health === 'recalculating'
        ? 'publication-banner publication-banner-recalculating'
        : 'publication-banner publication-banner-stale';

  const badgeVariant = !publication.isVerified
    ? 'unverified'
    : publication.health;

  return (
    <section
      aria-label="Rating publication status"
      className={`${bannerClass} max-w-full overflow-hidden`}
      data-testid="publication-status-banner"
    >
      <div style={{ flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.25rem',
          }}
        >
          <StatusBadge variant={badgeVariant} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, wordBreak: 'break-word' }}>
            Match State #{publication.publishedSeq ?? 'none'} / Required #
            {publication.requiredSeq} • Rules: {publication.rulesVersion} (K=
            {publication.kFactor} pilot default)
          </span>
        </div>

        {publication.isCurrent ? (
          <p style={{ margin: 0, fontSize: '0.88rem' }}>
            Published ratings are verified against the latest authoritative
            match history.
          </p>
        ) : (
          <div>
            <p
              style={{
                margin: '0 0 0.25rem 0',
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            >
              {publication.bannerTitle ??
                'Ratings out of date — recalculation required'}
            </p>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              {publication.bannerMessage}
            </p>
          </div>
        )}

        {retryError && (
          <p
            role="alert"
            style={{
              margin: '0.5rem 0 0 0',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            ✕ Retry failed: {retryError}
          </p>
        )}

        {retrySuccessMessage && (
          <p
            role="status"
            style={{
              margin: '0.5rem 0 0 0',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            ✓ {retrySuccessMessage}
          </p>
        )}
      </div>

      {publication.health === 'stale_or_failed' && isAdminOrOwner && (
        <div>
          <button
            type="button"
            className="touch-target touch-target-primary"
            disabled={isDemoMode || isRetrying || !onRetryRecalculation}
            onClick={() => void handleRetryClick()}
            title={
              isDemoMode
                ? 'Disabled in Demo Mode — no Supabase backend connected'
                : 'Retry server-side rating recalculation'
            }
          >
            {isRetrying
              ? '↻ Retrying Recalculation...'
              : isDemoMode
                ? 'Retry Recalculation (Disabled in Demo Mode)'
                : '↻ Retry Recalculation'}
          </button>
        </div>
      )}
    </section>
  );
}
