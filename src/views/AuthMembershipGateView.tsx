import { type FormEvent, useState } from 'react';
import type { ViewerGateState } from '../services/trackerRepository.ts';

export interface AuthMembershipGateViewProps {
  gateState: Exclude<ViewerGateState, { status: 'approved' } | { status: 'demo_mode' }>;
  isDemoMode: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignInEmailPassword: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onRetryCheck: () => Promise<void>;
}

/**
 * Enforces fail-closed authentication and membership-state gates (`AUTH-01`, `AUTH-02`, Condition 1B).
 * Never renders protected group data unless `membership.status === 'approved'` has been verified.
 */
export function AuthMembershipGateView({
  gateState,
  isDemoMode,
  onSignInGoogle,
  onSignInEmailPassword,
  onSignOut,
  onRetryCheck,
}: AuthMembershipGateViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
      setAuthError('Please enter both your verified email address and password.');
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
            ◈ Demo Mode Notice: Live authentication is disabled because
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.
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
            Or Sign In with Verified Email & Password
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Note: Email verification and password-reset emails are limited to 2
            emails/hour on Supabase&apos;s built-in email provider unless custom
            SMTP is configured.
          </p>

          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="auth-email-input"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
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
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
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
          Authentication alone does not grant access to group data. Ask a group
          Admin or Owner for a single-use invitation link bound to your email
          address.
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Invitation token redemption UI is scheduled for Checkpoint 3B.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="touch-target touch-target-primary"
            onClick={() => void onRetryCheck()}
          >
            ↻ Re-check Membership Status
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
          <strong>rejected</strong>. Group data is not accessible. If this was a
          mistake, a group Admin or Owner may issue a new single-use invitation.
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
        Former Member — Access Closed
      </h2>
      <p>
        Your membership status is <strong>departed</strong>. In accordance with
        group data integrity rules, historical match outcomes and ratings from
        sessions you participated in are preserved, while member access to the
        group is closed.
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
