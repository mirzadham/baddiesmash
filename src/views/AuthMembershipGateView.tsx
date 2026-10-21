import { type FormEvent, useEffect, useState } from 'react';
import {
  Lock,
  Mail,
  Key,
  Clock,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  UserX,
  AlertOctagon,
} from 'lucide-react';
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

  // Shared Invitation Redemption Form Component
  const renderInvitationRedemptionForm = (contextLabel: string) => (
    <form
      onSubmit={(e) => void handleRedeemSubmit(e)}
      noValidate
      data-testid="invitation-redemption-form"
      className="mt-4 p-4 sm:p-5 rounded-2xl bg-[#0b121b] border border-slate-800 text-left space-y-4"
    >
      <div>
        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight m-0">
          {contextLabel}
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Invitation tokens are single-use, valid for up to 7 days, and verified server-side against your account email.
        </p>
      </div>

      {capturedInviteToken && (
        <div
          role="status"
          data-testid="invite-url-prefilled-notice"
          className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2"
        >
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          <span>Invite token captured from URL and ready to redeem.</span>
        </div>
      )}

      {isDemoMode && (
        <div
          role="note"
          data-testid="redeem-demo-disabled-notice"
          className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold"
        >
          ◈ Demo Mode is read-only. Invitation redemption is disabled.
        </div>
      )}

      {/* Raw token input */}
      <div>
        <label
          htmlFor="invite-raw-token-input"
          className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
        >
          Single-Use Invitation Token
        </label>
        <div className="flex gap-2">
          <input
            id="invite-raw-token-input"
            type={showRawToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={rawTokenInput}
            onChange={(e) => setRawTokenInput(e.target.value)}
            disabled={isDemoMode || isSubmitting}
            placeholder="Paste your invitation token"
            className="flex-1 h-11 px-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowRawToken((prev) => !prev)}
            disabled={isDemoMode || isSubmitting}
            className="h-11 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            {showRawToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Profile preference fieldset */}
      <fieldset
        className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 text-xs"
        disabled={isDemoMode || isSubmitting}
      >
        <legend className="text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
          Player Profile Request (Optional)
        </legend>
        <label className="flex items-start gap-2.5 cursor-pointer text-slate-300 hover:text-white select-none">
          <input
            type="radio"
            name="redeem-player-pref"
            checked={playerPref === 'none'}
            onChange={() => setPlayerPref('none')}
            className="mt-0.5 text-cyan-500"
          />
          <span>Let Admin choose during approval (or use invitation&apos;s proposed player / Viewer-only)</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer text-slate-300 hover:text-white select-none">
          <input
            type="radio"
            name="redeem-player-pref"
            checked={playerPref === 'new_name'}
            onChange={() => setPlayerPref('new_name')}
            className="mt-0.5 text-cyan-500"
          />
          <span>Request a new player profile display name</span>
        </label>

        {playerPref === 'new_name' && (
          <div className="pl-6 pt-1">
            <label
              htmlFor="invite-new-player-name-input"
              className="block text-[11px] font-medium text-slate-400 mb-1"
            >
              Requested New Player Display Name
            </label>
            <input
              id="invite-new-player-name-input"
              type="text"
              value={requestedNewPlayerName}
              onChange={(e) => setRequestedNewPlayerName(e.target.value)}
              disabled={isDemoMode || isSubmitting}
              placeholder="e.g. Hannah Tan"
              className="w-full h-10 px-3 bg-[#0b121b] border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer text-slate-300 hover:text-white select-none">
          <input
            type="radio"
            name="redeem-player-pref"
            checked={playerPref === 'existing_uuid'}
            onChange={() => setPlayerPref('existing_uuid')}
            className="mt-0.5 text-cyan-500"
          />
          <span>Link an existing player profile UUID provided by Admin</span>
        </label>

        {playerPref === 'existing_uuid' && (
          <div className="pl-6 pt-1">
            <label
              htmlFor="invite-existing-player-uuid-input"
              className="block text-[11px] font-medium text-slate-400 mb-1"
            >
              Existing Player Profile UUID
            </label>
            <input
              id="invite-existing-player-uuid-input"
              type="text"
              value={requestedExistingPlayerId}
              onChange={(e) => setRequestedExistingPlayerId(e.target.value)}
              disabled={isDemoMode || isSubmitting}
              placeholder="e.g. 00000000-0000-4000-8000-000000000201"
              className="w-full h-10 px-3 bg-[#0b121b] border border-slate-700 rounded-lg text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}
      </fieldset>

      {redeemError && (
        <div
          role="alert"
          data-testid="redeem-invitation-error"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold leading-relaxed"
        >
          ✕ {redeemError}
        </div>
      )}

      <button
        type="submit"
        disabled={isDemoMode || isSubmitting}
        data-testid="redeem-invitation-submit-btn"
        className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-[0.98] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        {isSubmitting ? 'Redeeming Invitation...' : 'Redeem Invitation & Request Membership'}
      </button>
    </form>
  );

  // 1. Membership check failed state
  if (gateState.status === 'membership_check_failed') {
    return (
      <section
        className="max-w-md mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
        role="alert"
        aria-labelledby="gate-error-heading"
        data-testid="gate-membership-check-failed"
      >
        <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4 shadow-lg shadow-rose-500/10">
          <ShieldAlert size={26} />
        </div>
        <h2 id="gate-error-heading" className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Verification Unsuccessful
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-4 leading-relaxed">
          Access to group data is blocked because your membership status could not be verified with the server.
        </p>
        <div className="p-3.5 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold text-left">
          Diagnostic detail: {gateState.errorMessage}
        </div>
        <button
          type="button"
          className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          onClick={() => void onRetryCheck()}
        >
          <RefreshCw size={14} />
          Retry Verification
        </button>
      </section>
    );
  }

  // 2. Unauthenticated state (Sign-in form)
  if (gateState.status === 'unauthenticated') {
    return (
      <section
        className="max-w-md mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
        aria-labelledby="auth-signin-heading"
        data-testid="gate-unauthenticated"
      >
        {/* Subtle decorative background glows */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Hero Lock Badge */}
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-4 shadow-lg shadow-emerald-500/10">
          <Lock size={26} />
        </div>

        <h2
          id="auth-signin-heading"
          className="text-xl sm:text-2xl font-black text-white tracking-tight"
        >
          Member Access
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-6 leading-relaxed max-w-xs mx-auto">
          Private club tracker for approved members. Sign in to access live sessions, rankings, and stats.
        </p>

        {capturedInviteToken && (
          <div
            role="status"
            data-testid="invite-url-captured-notice"
            className="p-3.5 mb-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2.5 text-left leading-relaxed"
          >
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>
              Invitation token detected. Sign in with your invited email address to activate your membership.
            </span>
          </div>
        )}

        {isDemoMode && (
          <div
            role="note"
            className="p-3.5 mb-5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-start gap-2.5 text-left leading-relaxed"
          >
            <span className="text-base shrink-0">◈</span>
            <span>
              Demo Mode Notice: Live authentication and membership mutations are disabled because no Supabase backend is configured.
            </span>
          </div>
        )}

        {/* Primary Action: Google OAuth Button */}
        <div className="mb-6">
          <button
            type="button"
            disabled={isDemoMode || isSubmitting}
            onClick={() => void handleGoogleClick()}
            className="w-full h-12 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isSubmitting ? 'Connecting...' : 'Continue with Google'}</span>
          </button>
          <p className="text-[11px] text-slate-400 mt-2">
            Fast 1-tap sign in with your verified Google account
          </p>
        </div>

        {/* Clean Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider">
            <span className="bg-[#121c28] px-3 text-slate-500">
              Or Sign In with Email
            </span>
          </div>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={(e) => void handleEmailSubmit(e)} noValidate className="text-left space-y-4">
          <div>
            <label
              htmlFor="auth-email-input"
              className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                id="auth-email-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isDemoMode || isSubmitting}
                placeholder="you@example.com"
                className="w-full h-12 pl-10 pr-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password-input"
              className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                id="auth-password-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isDemoMode || isSubmitting}
                placeholder="••••••••"
                className="w-full h-12 pl-10 pr-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2.5 leading-relaxed"
            >
              <span className="text-base shrink-0">✕</span>
              <span>{authError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isDemoMode || isSubmitting}
            className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-bold text-xs uppercase tracking-wider border border-slate-700 shadow-md disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={14} className="animate-spin text-emerald-400" />
                Signing In...
              </>
            ) : (
              'Sign In with Email'
            )}
          </button>
        </form>

        {/* Demo Mode Link */}
        {!isDemoMode && (
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col items-center gap-2">
            <span className="text-xs text-slate-400">
              Want to explore the app first?
            </span>
            <a
              href="?demo=true"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 font-semibold text-xs border border-slate-700/80 transition-all cursor-pointer"
            >
              <Sparkles size={13} />
              Try Interactive Demo Mode →
            </a>
          </div>
        )}
      </section>
    );
  }

  // 3. Authenticated but not a group member state
  if (gateState.status === 'no_membership') {
    return (
      <section
        className="max-w-lg mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
        aria-labelledby="gate-nomember-heading"
        data-testid="gate-no-membership"
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-lg shadow-amber-500/10">
          <Key size={26} />
        </div>
        <h2 id="gate-nomember-heading" className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Invitation Required
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-2 leading-relaxed">
          Signed in as <strong className="text-slate-200">{gateState.userEmail ?? gateState.userId}</strong>.
        </p>
        <p className="text-xs sm:text-sm text-slate-400 mb-5 leading-relaxed">
          Your account does not yet have a membership record in this club. Redeem a single-use invitation token below to request access.
        </p>

        {!gateState.emailVerified && (
          <div
            role="alert"
            className="p-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold text-left"
          >
            ⚠ Your account email is not yet verified. Please verify your email before redeeming an invitation.
          </div>
        )}

        {renderInvitationRedemptionForm('Redeem Single-Use Group Invitation')}

        {/* First-Run Initial Group Bootstrap (Owner only) */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-left">
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            aria-expanded={showBootstrapSection}
            onClick={() => setShowBootstrapSection((prev) => !prev)}
            data-testid="toggle-bootstrap-section-btn"
          >
            {showBootstrapSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showBootstrapSection
              ? 'Hide Initial Group Setup (Owner Only)'
              : 'First-Run Initial Group Setup (Owner Only)'}
          </button>

          {showBootstrapSection && (
            <form
              onSubmit={(e) => void handleBootstrapSubmit(e)}
              noValidate
              data-testid="bootstrap-group-form"
              className="mt-3 p-4 rounded-xl bg-[#0b121b] border border-slate-800 space-y-3 animate-in fade-in"
            >
              <h3 className="text-sm font-bold text-white m-0">
                One-Time Initial Group Setup
              </h3>
              <p className="text-xs text-slate-400 m-0">
                Initialize the first club group. Once established, all future members join via invitations.
              </p>

              <div>
                <label
                  htmlFor="bootstrap-group-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
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
                  className="w-full h-10 px-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label
                  htmlFor="bootstrap-group-slug"
                  className="block text-xs font-medium text-slate-300 mb-1"
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
                  className="w-full h-10 px-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label
                  htmlFor="bootstrap-owner-display-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Owner Player Profile Display Name
                </label>
                <input
                  id="bootstrap-owner-display-name"
                  type="text"
                  value={bootstrapOwnerDisplayName}
                  onChange={(e) => setBootstrapOwnerDisplayName(e.target.value)}
                  disabled={isDemoMode || isSubmitting}
                  placeholder="e.g. Aaron Tan"
                  className="w-full h-10 px-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {bootstrapError && (
                <div
                  role="alert"
                  data-testid="bootstrap-group-error"
                  className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold"
                >
                  ✕ {bootstrapError}
                </div>
              )}

              <button
                type="submit"
                disabled={isDemoMode || isSubmitting || !onBootstrapGroup}
                data-testid="bootstrap-group-submit-btn"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? 'Setting Up Initial Group...' : 'Bootstrap Initial Group'}
              </button>
            </form>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-center gap-3 mt-6 pt-5 border-t border-slate-800">
          <button
            type="button"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-colors cursor-pointer"
            disabled={isSubmitting}
            onClick={() => void onRetryCheck()}
          >
            ↻ Re-check Status
          </button>
          <button
            type="button"
            className="px-4 py-2.5 rounded-xl bg-slate-800/60 hover:bg-rose-500/20 text-rose-300 font-bold text-xs uppercase tracking-wider border border-slate-700/80 hover:border-rose-500/40 transition-colors cursor-pointer"
            disabled={isSubmitting}
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  // 4. Pending approval state (Waiting room)
  if (gateState.status === 'pending_approval') {
    return (
      <section
        className="max-w-md mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
        aria-labelledby="gate-pending-heading"
        data-testid="gate-pending-approval"
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-lg shadow-amber-500/10">
          <Clock size={26} className="animate-pulse" />
        </div>
        <h2 id="gate-pending-heading" className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Membership Pending Approval
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-2 leading-relaxed">
          Signed in as <strong className="text-slate-200">{gateState.userEmail ?? gateState.userId}</strong>.
        </p>
        <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
          Your invitation has been redeemed and your membership request is currently awaiting organizer approval (intended role: <code className="text-amber-300 font-bold">{gateState.membership.role}</code>). Group leaderboards and sessions will unlock once approved.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer"
            onClick={() => void onRetryCheck()}
          >
            ↻ Check Approval Status
          </button>
          <button
            type="button"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-colors cursor-pointer"
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  // 5. Rejected membership state
  if (gateState.status === 'rejected') {
    return (
      <section
        className="max-w-md mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
        aria-labelledby="gate-rejected-heading"
        data-testid="gate-rejected"
      >
        <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4 shadow-lg shadow-rose-500/10">
          <UserX size={26} />
        </div>
        <h2 id="gate-rejected-heading" className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Membership Request Declined
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-4 leading-relaxed">
          Your membership request for this group was declined by club organizers. If you received a new invitation token, you can redeem it below.
        </p>
        {renderInvitationRedemptionForm('Redeem a New Group Invitation')}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <button
            type="button"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-colors cursor-pointer"
            disabled={isSubmitting}
            onClick={() => void onSignOut()}
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  // 6. Suspended membership state
  if (gateState.status === 'suspended') {
    return (
      <section
        className="max-w-md mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
        aria-labelledby="gate-suspended-heading"
        data-testid="gate-suspended"
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-lg shadow-amber-500/10">
          <AlertOctagon size={26} />
        </div>
        <h2 id="gate-suspended-heading" className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Membership Suspended
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-6 leading-relaxed">
          Your membership is currently suspended. Access to match history and sessions is restricted. Please contact the group Owner or an Admin.
        </p>
        <button
          type="button"
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-colors cursor-pointer"
          onClick={() => void onSignOut()}
        >
          Sign Out
        </button>
      </section>
    );
  }

  // 7. Departed membership state
  return (
    <section
      className="max-w-md mx-auto my-6 p-6 sm:p-8 rounded-3xl bg-[#121c28] border border-slate-800/90 shadow-2xl relative overflow-hidden text-center"
      aria-labelledby="gate-departed-heading"
      data-testid="gate-departed"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto mb-4 shadow-lg">
        <UserX size={26} />
      </div>
      <h2 id="gate-departed-heading" className="text-xl sm:text-2xl font-black text-white tracking-tight">
        Former Group Member
      </h2>
      <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-4 leading-relaxed">
        Your membership is recorded as departed. Historical match records are preserved in club archives. If re-invited, you can redeem your token below.
      </p>
      {renderInvitationRedemptionForm('Redeem a Re-Invitation Token')}
      <div className="mt-6 pt-4 border-t border-slate-800">
        <button
          type="button"
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-colors cursor-pointer"
          disabled={isSubmitting}
          onClick={() => void onSignOut()}
        >
          Sign Out
        </button>
      </div>
    </section>
  );
}
