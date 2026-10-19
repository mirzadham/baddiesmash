import { type FormEvent, useEffect, useState } from 'react';
import {
  clearCapturedInviteToken,
  sanitizeInvitationRpcError,
} from '../lib/inviteToken.ts';
import type {
  BootstrapInitialGroupInput,
  RedeemGroupInvitationInput,
  ViewerGateState,
} from '../services/trackerRepository.ts';
import type {
  BootstrapInitialGroupResponse,
  RedeemGroupInvitationResponse,
} from '../types/database.ts';

export interface AuthMembershipGateViewProps {
  gateState: Exclude<
    ViewerGateState,
    { status: 'approved' } | { status: 'demo_mode' }
  >;
  isDemoMode: boolean;
  capturedInviteToken?: string | null;
  onClearCapturedInviteToken?: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignInEmailPassword: (email: string, password: string) => Promise<void>;
  onRedeemInvitation?: (
    input: RedeemGroupInvitationInput,
  ) => Promise<RedeemGroupInvitationResponse>;
  onBootstrapGroup?: (
    input: BootstrapInitialGroupInput,
  ) => Promise<BootstrapInitialGroupResponse>;
  onSignOut: () => Promise<void>;
  onRetryCheck: () => Promise<void>;
}

type RedemptionPlayerPreference = 'none' | 'new_name' | 'existing_uuid';

/**
 * Enforces fail-closed authentication, invitation redemption, first-run bootstrap,
 * and membership-state gates (`AUTH-01`, `AUTH-02`, `DEC-012`, Condition 1B & Condition 2).
 * Never renders protected group data unless `membership.status === 'approved'` has been verified.
 */
export function AuthMembershipGateView({
  gateState,
  isDemoMode,
  capturedInviteToken = null,
  onClearCapturedInviteToken,
  onSignInGoogle,
  onSignInEmailPassword,
  onRedeemInvitation,
  onBootstrapGroup,
  onSignOut,
  onRetryCheck,
}: AuthMembershipGateViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Invitation redemption state (volatile memory only; never persisted to storage)
  const [rawTokenInput, setRawTokenInput] = useState<string>(
    capturedInviteToken ?? '',
  );
  const [showRawToken, setShowRawToken] = useState<boolean>(false);
  const [playerPref, setPlayerPref] =
    useState<RedemptionPlayerPreference>('none');
  const [requestedNewPlayerName, setRequestedNewPlayerName] =
    useState<string>('');
  const [requestedExistingPlayerId, setRequestedExistingPlayerId] =
    useState<string>('');
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // First-run bootstrap state (`DEC-012`)
  const [showBootstrapSection, setShowBootstrapSection] =
    useState<boolean>(false);
  const [bootstrapGroupName, setBootstrapGroupName] = useState<string>('');
  const [bootstrapGroupSlug, setBootstrapGroupSlug] = useState<string>('');
  const [bootstrapOwnerDisplayName, setBootstrapOwnerDisplayName] =
    useState<string>('');
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    if (capturedInviteToken) {
      setRawTokenInput((prev) => (prev ? prev : capturedInviteToken));
    }
  }, [capturedInviteToken]);

  const handleGoogleClick = async () => {
    if (isDemoMode || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await onSignInGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google OAuth sign-in failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isSubmitting) {
      return;
    }
    if (!email.trim() || !password) {
      setAuthError(
        'Please enter both your verified email address and password.',
      );
      return;
    }
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await onSignInEmailPassword(email.trim(), password);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Email/password sign-in failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeemSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isSubmitting || !onRedeemInvitation) {
      return;
    }

    const trimmedToken = rawTokenInput.trim();
    if (!trimmedToken) {
      setRedeemError('Please enter your single-use invitation token.');
      return;
    }

    if (playerPref === 'new_name' && !requestedNewPlayerName.trim()) {
      setRedeemError(
        'Please enter a display name for your requested new player profile, or select "Decide during Admin approval".',
      );
      return;
    }

    if (playerPref === 'existing_uuid' && !requestedExistingPlayerId.trim()) {
      setRedeemError(
        'Please enter the existing player profile UUID provided by your Admin, or select "Decide during Admin approval".',
      );
      return;
    }

    setIsSubmitting(true);
    setRedeemError(null);

    try {
      await onRedeemInvitation({
        rawToken: trimmedToken,
        requestedPlayerId:
          playerPref === 'existing_uuid'
            ? requestedExistingPlayerId.trim()
            : null,
        requestedNewPlayerName:
          playerPref === 'new_name' ? requestedNewPlayerName.trim() : null,
      });

      // Clear raw token from volatile memory after confirmed server redemption
      setRawTokenInput('');
      clearCapturedInviteToken();
      onClearCapturedInviteToken?.();
      await onRetryCheck();
    } catch (err) {
      setRedeemError(sanitizeInvitationRpcError(err, trimmedToken));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBootstrapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isSubmitting || !onBootstrapGroup) {
      return;
    }

    const trimmedName = bootstrapGroupName.trim();
    const trimmedSlug = bootstrapGroupSlug.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setBootstrapError('Group name must be at least 2 characters.');
      return;
    }
    if (trimmedSlug.length < 2) {
      setBootstrapError('Group slug must be at least 2 characters.');
      return;
    }

    setIsSubmitting(true);
    setBootstrapError(null);

    try {
      await onBootstrapGroup({
        groupName: trimmedName,
        groupSlug: trimmedSlug,
        ownerDisplayName: bootstrapOwnerDisplayName.trim() || null,
      });
      await onRetryCheck();
    } catch (err) {
      setBootstrapError(sanitizeInvitationRpcError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (gateState.status === 'membership_check_failed') {
    return (
      <section
        className="card"
        role="alert"
        aria-labelledby="gate-error-heading"
        data-testid="gate-membership-check-failed"
      >
        <h2 id="gate-error-heading" style={{ marginTop: 0 }}>
          ⚠ Unable to Verify Group Membership
        </h2>
        <p>
          Access to group data is blocked because your membership status could
          not be verified with the server. Protected group data is never shown
          while verification is unconfirmed.
        </p>
        <p
          style={{
            padding: '0.75rem',
            background: 'var(--status-stale-bg)',
            color: 'var(--status-stale-fg)',
            borderRadius: '0.5rem',
            fontWeight: 600,
          }}
        >
          Diagnostic detail: {gateState.errorMessage}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="touch-target touch-target-primary"
            onClick={() => void onRetryCheck()}
          >
            ↻ Retry Verification
          </button>
        </div>
      </section>
    );
  }

  if (gateState.status === 'unauthenticated') {
    return (
      <section
        className="card"
        aria-labelledby="auth-signin-heading"
        data-testid="gate-unauthenticated"
      >
        <h2 id="auth-signin-heading" style={{ marginTop: 0 }}>
          Sign In Required — Invitation-Only Group
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          This badminton tracker is private to approved group members. Signing
          in authenticates your account, after which your group membership and
          invitation status are verified server-side.
        </p>

        {capturedInviteToken && (
          <div
            role="status"
            data-testid="invite-url-captured-notice"
            style={{
              padding: '0.75rem',
              background: 'var(--status-ok-bg)',
              color: 'var(--status-ok-fg)',
              borderRadius: '0.5rem',
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            ✉ Invitation token detected in session memory and removed from the
            visible address bar. Sign in with the invited email address to
            redeem it.
          </div>
        )}

        {isDemoMode && (
          <p
            role="note"
            style={{
              padding: '0.75rem',
              background: 'var(--status-warn-bg)',
              color: 'var(--status-warn-fg)',
              borderRadius: '0.5rem',
              fontWeight: 600,
            }}
          >
            ◈ Demo Mode Notice: Live authentication, invitation redemption, and
            group bootstrap are disabled because VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY are not configured.
          </p>
        )}

        <div style={{ margin: '1rem 0' }}>
          <button
            type="button"
            className="touch-target touch-target-primary"
            style={{ width: '100%' }}
            disabled={isDemoMode || isSubmitting}
            onClick={() => void handleGoogleClick()}
          >
            {isSubmitting
              ? 'Connecting to Google...'
              : 'Continue with Google (Recommended for V1)'}
          </button>
          <p
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              marginTop: '0.4rem',
            }}
          >
            Google Sign-In provides a verified email claim immediately without
            consuming Supabase Free-Plan built-in SMTP quotas (2 emails/hour).
            Requires Google OAuth provider configuration in Supabase Auth.
          </p>
        </div>

        <hr
          style={{
            border: 'none',
            borderTop: '1px solid var(--border-color)',
            margin: '1.25rem 0',
          }}
        />

        <form onSubmit={(e) => void handleEmailSubmit(e)} noValidate>
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
            Or Sign In with Verified Email &amp; Password
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Note: Email verification and password-reset emails are limited to 2
            emails/hour on Supabase&apos;s built-in email provider unless custom
            SMTP is configured.
          </p>

          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="auth-email-input"
              style={{
                display: 'block',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Email Address
            </label>
            <input
              id="auth-email-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isDemoMode || isSubmitting}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="auth-password-input"
              style={{
                display: 'block',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Password
            </label>
            <input
              id="auth-password-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDemoMode || isSubmitting}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            />
          </div>

          {authError && (
            <p
              role="alert"
              style={{
                padding: '0.65rem',
                background: 'var(--status-stale-bg)',
                color: 'var(--status-stale-fg)',
                borderRadius: '0.5rem',
                fontWeight: 600,
              }}
            >
              ✕ {authError}
            </p>
          )}

          <button
            type="submit"
            className="touch-target"
            disabled={isDemoMode || isSubmitting}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In with Email'}
          </button>
        </form>
      </section>
    );
  }

  const renderInvitationRedemptionForm = (contextLabel: string) => (
    <form
      onSubmit={(e) => void handleRedeemSubmit(e)}
      noValidate
      data-testid="invitation-redemption-form"
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid var(--border-color)',
        borderRadius: '0.6rem',
        background: 'var(--bg-surface-alt)',
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: '1rem' }}>{contextLabel}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Invitation tokens are single-use, valid for up to 7 days, and verified
        server-side against your confirmed account email. Redeeming an
        invitation places your membership into <code>pending_approval</code>{' '}
        until a group Admin or Owner approves it.
      </p>

      {capturedInviteToken && (
        <p
          role="status"
          data-testid="invite-url-prefilled-notice"
          style={{
            padding: '0.6rem',
            background: 'var(--status-ok-bg)',
            color: 'var(--status-ok-fg)',
            borderRadius: '0.4rem',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          ✓ Invite token captured from URL parameter and stripped from the
          visible address bar.
        </p>
      )}

      {isDemoMode && (
        <p
          role="note"
          data-testid="redeem-demo-disabled-notice"
          style={{
            padding: '0.6rem',
            background: 'var(--status-warn-bg)',
            color: 'var(--status-warn-fg)',
            borderRadius: '0.4rem',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          ◈ Demo Mode is read-only. Invitation redemption and first-run
          bootstrap are disabled.
        </p>
      )}

      <div style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="invite-raw-token-input"
          style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
        >
          Single-Use Invitation Token
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            id="invite-raw-token-input"
            type={showRawToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={rawTokenInput}
            onChange={(e) => setRawTokenInput(e.target.value)}
            disabled={isDemoMode || isSubmitting}
            placeholder="Paste 64-character hex invitation token"
            style={{
              flex: 1,
              minHeight: '48px',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            className="touch-target"
            onClick={() => setShowRawToken((prev) => !prev)}
            disabled={isDemoMode || isSubmitting}
          >
            {showRawToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <fieldset
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          marginBottom: '0.75rem',
        }}
        disabled={isDemoMode || isSubmitting}
      >
        <legend style={{ fontWeight: 600, fontSize: '0.88rem' }}>
          Optional Player Profile Request (Confirmed by Admin on Approval)
        </legend>
        <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.88rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="radio"
              name="redeem-player-pref"
              checked={playerPref === 'none'}
              onChange={() => setPlayerPref('none')}
            />
            <span>
              Let Admin choose during approval (or use invitation&apos;s
              proposed player / Viewer-only)
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="radio"
              name="redeem-player-pref"
              checked={playerPref === 'new_name'}
              onChange={() => setPlayerPref('new_name')}
            />
            <span>Request a new player profile display name</span>
          </label>
          {playerPref === 'new_name' && (
            <div style={{ marginLeft: '1.5rem' }}>
              <label
                htmlFor="redeem-new-player-name"
                style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600 }}
              >
                Requested New Player Display Name
              </label>
              <input
                id="redeem-new-player-name"
                type="text"
                value={requestedNewPlayerName}
                onChange={(e) => setRequestedNewPlayerName(e.target.value)}
                placeholder="e.g. Hannah Tan"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
              />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="radio"
              name="redeem-player-pref"
              checked={playerPref === 'existing_uuid'}
              onChange={() => setPlayerPref('existing_uuid')}
            />
            <span>Request linking to an existing player UUID</span>
          </label>
          {playerPref === 'existing_uuid' && (
            <div style={{ marginLeft: '1.5rem' }}>
              <label
                htmlFor="redeem-existing-player-uuid"
                style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600 }}
              >
                Existing Player UUID (Never matched by display name alone)
              </label>
              <input
                id="redeem-existing-player-uuid"
                type="text"
                value={requestedExistingPlayerId}
                onChange={(e) => setRequestedExistingPlayerId(e.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}
        </div>
      </fieldset>

      {redeemError && (
        <p
          role="alert"
          data-testid="redeem-invitation-error"
          style={{
            padding: '0.65rem',
            background: 'var(--status-stale-bg)',
            color: 'var(--status-stale-fg)',
            borderRadius: '0.5rem',
            fontWeight: 600,
          }}
        >
          ✕ {redeemError}
        </p>
      )}

      <button
        type="submit"
        className="touch-target touch-target-primary"
        disabled={isDemoMode || isSubmitting || !onRedeemInvitation}
        data-testid="redeem-invitation-submit-btn"
      >
        {isSubmitting ? 'Redeeming Invitation...' : 'Redeem Invitation Token'}
      </button>
    </form>
  );

  if (gateState.status === 'no_membership') {
    return (
      <section
        className="card"
        aria-labelledby="gate-no-membership-heading"
        data-testid="gate-no-membership"
      >
        <h2 id="gate-no-membership-heading" style={{ marginTop: 0 }}>
          🔒 Invitation Required
        </h2>
        <p>
          Signed in as <strong>{gateState.userEmail ?? gateState.userId}</strong>{' '}
          ({gateState.emailVerified ? 'Verified Email' : 'Unverified Email'}).
        </p>
        <p>
          Your account does not yet have a membership record in this group.
          Authentication alone does not grant access to group data. Redeem a
          single-use invitation token issued for your email address below.
        </p>

        {!gateState.emailVerified && (
          <p
            role="alert"
            style={{
              padding: '0.65rem',
              background: 'var(--status-warn-bg)',
              color: 'var(--status-warn-fg)',
              borderRadius: '0.5rem',
              fontWeight: 600,
            }}
          >
            ⚠ Your account email is not yet marked verified. The database
            requires a verified email address before redeeming an invitation or
            bootstrapping a group.
          </p>
        )}

        {renderInvitationRedemptionForm('Redeem Single-Use Group Invitation')}

        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <button
            type="button"
            className="touch-target"
            aria-expanded={showBootstrapSection}
            onClick={() => setShowBootstrapSection((prev) => !prev)}
            data-testid="toggle-bootstrap-section-btn"
          >
            {showBootstrapSection
              ? '▾ Hide First-Run Initial Group Bootstrap'
              : '▸ First-Run Initial Group Bootstrap (Owner Only)'}
          </button>

          {showBootstrapSection && (
            <form
              onSubmit={(e) => void handleBootstrapSubmit(e)}
              noValidate
              data-testid="bootstrap-group-form"
              style={{
                marginTop: '0.75rem',
                padding: '1rem',
                border: '1px solid var(--border-color)',
                borderRadius: '0.6rem',
                background: 'var(--bg-surface-alt)',
              }}
            >
              <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
                One-Time Initial Group Bootstrap (DEC-012)
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                This action is enforced server-side via{' '}
                <code>public.bootstrap_initial_group</code> with an exclusive
                table lock on <code>public.groups</code>. Once the initial group
                exists, all subsequent bootstrap attempts are rejected by
                PostgreSQL regardless of UI state.
              </p>

              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  htmlFor="bootstrap-group-name"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Group Name
                </label>
                <input
                  id="bootstrap-group-name"
                  type="text"
                  value={bootstrapGroupName}
                  onChange={(e) => setBootstrapGroupName(e.target.value)}
                  disabled={isDemoMode || isSubmitting}
                  placeholder="e.g. KL Badminton Regulars"
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '0.4rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  htmlFor="bootstrap-group-slug"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Group Slug
                </label>
                <input
                  id="bootstrap-group-slug"
                  type="text"
                  value={bootstrapGroupSlug}
                  onChange={(e) => setBootstrapGroupSlug(e.target.value)}
                  disabled={isDemoMode || isSubmitting}
                  placeholder="e.g. kl-badminton-regulars"
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '0.4rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  htmlFor="bootstrap-owner-display-name"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}
                >
                  Owner Player Profile Display Name (Optional — Leave blank for
                  Viewer-only Owner)
                </label>
                <input
                  id="bootstrap-owner-display-name"
                  type="text"
                  value={bootstrapOwnerDisplayName}
                  onChange={(e) => setBootstrapOwnerDisplayName(e.target.value)}
                  disabled={isDemoMode || isSubmitting}
                  placeholder="e.g. Aaron Tan"
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '0.4rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                  }}
                />
              </div>

              {bootstrapError && (
                <p
                  role="alert"
                  data-testid="bootstrap-group-error"
                  style={{
                    padding: '0.65rem',
                    background: 'var(--status-stale-bg)',
                    color: 'var(--status-stale-fg)',
                    borderRadius: '0.5rem',
                    fontWeight: 600,
                  }}
                >
                  ✕ {bootstrapError}
                </p>
              )}

              <button
                type="submit"
                className="touch-target touch-target-primary"
                disabled={isDemoMode || isSubmitting || !onBootstrapGroup}
                data-testid="bootstrap-group-submit-btn"
              >
                {isSubmitting
                  ? 'Bootstrapping Initial Group...'
                  : 'Bootstrap Initial Group'}
              </button>
            </form>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginTop: '1.25rem',
          }}
        >
          <button
            type="button"
            className="touch-target"
            disabled={isSubmitting}
            onClick={() => void onRetryCheck()}
          >
            ↻ Re-check Membership Status
          </button>
          <button
            type="button"
            className="touch-target"
            disabled={isSubmitting}
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  if (gateState.status === 'pending_approval') {
    return (
      <section
        className="card"
        aria-labelledby="gate-pending-heading"
        data-testid="gate-pending-approval"
      >
        <h2 id="gate-pending-heading" style={{ marginTop: 0 }}>
          ⏳ Membership Pending Admin Approval
        </h2>
        <p>
          Signed in as <strong>{gateState.userEmail ?? gateState.userId}</strong>.
        </p>
        <p>
          Your invitation has been redeemed and your membership request is
          currently <strong>pending_approval</strong> (intended role:{' '}
          <code>{gateState.membership.role}</code>). Group leaderboards,
          sessions, and player profiles remain hidden until a group Admin or
          Owner approves your membership.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="touch-target touch-target-primary"
            onClick={() => void onRetryCheck()}
          >
            ↻ Check Approval Status
          </button>
          <button
            type="button"
            className="touch-target"
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  if (gateState.status === 'rejected') {
    return (
      <section
        className="card"
        aria-labelledby="gate-rejected-heading"
        data-testid="gate-rejected"
      >
        <h2 id="gate-rejected-heading" style={{ marginTop: 0 }}>
          ✕ Membership Request Declined
        </h2>
        <p>
          Your membership request for this group has status{' '}
          <strong>rejected</strong>. Group data is not accessible. If a group
          Admin or Owner has issued you a new single-use invitation, you may
          redeem it below.
        </p>
        {renderInvitationRedemptionForm('Redeem a New Group Invitation')}
        <div style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="touch-target"
            disabled={isSubmitting}
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  if (gateState.status === 'suspended') {
    return (
      <section
        className="card"
        aria-labelledby="gate-suspended-heading"
        data-testid="gate-suspended"
      >
        <h2 id="gate-suspended-heading" style={{ marginTop: 0 }}>
          ⛔ Membership Suspended
        </h2>
        <p>
          Your group membership status is currently <strong>suspended</strong>.
          Access to group leaderboards, sessions, and match records is disabled
          while your account is suspended. Please contact the group Owner or an
          Admin.
        </p>
        <button
          type="button"
          className="touch-target"
          onClick={() => void onSignOut()}
        >
          Sign Out
        </button>
      </section>
    );
  }

  // gateState.status === 'departed'
  return (
    <section
      className="card"
      aria-labelledby="gate-departed-heading"
      data-testid="gate-departed"
    >
      <h2 id="gate-departed-heading" style={{ marginTop: 0 }}>
        Former Group Member
      </h2>
      <p>
        Your membership status is recorded as <strong>departed</strong>.
        Historical match records for your player profile are preserved in group
        history, while active account access to group data is disabled unless a
        new invitation is issued and approved.
      </p>
      {renderInvitationRedemptionForm('Redeem a Re-Invitation Token')}
      <div style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="touch-target"
          disabled={isSubmitting}
          onClick={() => void onSignOut()}
        >
          Sign Out
        </button>
      </div>
    </section>
  );
}
