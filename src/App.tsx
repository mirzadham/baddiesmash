import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Home, Trophy, User } from 'lucide-react';
import { StatusBadge } from './components/StatusBadge.tsx';
import {
  captureAndStripInviteContextFromUrl,
  clearCapturedInviteToken,
} from './lib/inviteToken.ts';
import {
  getSupabaseBrowserClient,
  type SupabaseEnvironmentConfig,
} from './lib/supabase.ts';
import {
  applyThemeToDocument,
  type ThemePreference,
} from './lib/theme.ts';
import { scrollToTop } from './lib/scroll.ts';
import {
  createDemoTrackerRepository,
  createSupabaseTrackerRepository,
  resolveEffectivePublicationBannerState,
  type TrackerRepository,
  type ViewerGateState,
} from './services/trackerRepository.ts';
import { AuthMembershipGateView } from './views/AuthMembershipGateView.tsx';
import { HomeView } from './views/HomeView.tsx';
import { LeaderboardView } from './views/LeaderboardView.tsx';
import { ProfileView } from './views/ProfileView.tsx';
import { SessionsView } from './views/SessionsView.tsx';

// Code-split heavy Admin Governance machinery into separate chunk (Phase 33, DEC-076)
const AdminGovernanceView = lazy(() =>
  import('./views/AdminGovernanceView.tsx').then((module) => ({
    default: module.AdminGovernanceView,
  })),
);

export type BottomNavTab = 'home' | 'leaderboard' | 'sessions' | 'profile';
const TAB_INDEX_MAP: Record<BottomNavTab, number> = {
  home: 0,
  leaderboard: 1,
  sessions: 2,
  profile: 3,
};
export type { ThemePreference };

export interface AppProps {
  repository?: TrackerRepository;
  envConfig?: SupabaseEnvironmentConfig;
}

export function App({ repository: injectedRepo, envConfig: injectedEnv }: AppProps = {}) {
  const defaultEnvAndClient = useMemo(() => {
    if (injectedRepo && injectedEnv) {
      return { config: injectedEnv, client: null };
    }
    return getSupabaseBrowserClient();
  }, [injectedRepo, injectedEnv]);

  const envConfig = injectedEnv ?? defaultEnvAndClient.config;

  const repository = useMemo<TrackerRepository | null>(() => {
    if (injectedRepo) {
      return injectedRepo;
    }
    if (envConfig.status === 'invalid_env') {
      return null;
    }
    if (typeof window !== 'undefined') {
      const qDemo = new URLSearchParams(window.location.search).get('demo');
      if (qDemo === 'true') {
        return createDemoTrackerRepository();
      }
    }
    if (envConfig.status === 'configured' && defaultEnvAndClient.client) {
      return createSupabaseTrackerRepository(defaultEnvAndClient.client);
    }
    return createDemoTrackerRepository();
  }, [injectedRepo, envConfig.status, defaultEnvAndClient.client]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [gateState, setGateState] = useState<ViewerGateState | null>(null);
  const [capturedInviteContext, setCapturedInviteContext] = useState(() =>
    captureAndStripInviteContextFromUrl(),
  );
  const capturedInviteToken = capturedInviteContext.token;
  const capturedInviteEmail = capturedInviteContext.email;
  const [activeTab, setActiveTab] = useState<BottomNavTab>(() => {
    if (typeof window !== 'undefined') {
      const qTab = new URLSearchParams(window.location.search).get('tab');
      if (qTab === 'leaderboard' || qTab === 'sessions' || qTab === 'profile' || qTab === 'home') {
        return qTab;
      }
    }
    return 'home';
  });
  const activeTabIndex = TAB_INDEX_MAP[activeTab] ?? 0;
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [showDemoSignInPreview, setShowDemoSignInPreview] =
    useState<boolean>(false);
  const [showAdminContextualModal, setShowAdminContextualModal] =
    useState<boolean>(false);

  const handleOpenAdminTools = useCallback(() => {
    setShowAdminContextualModal(true);
    scrollToTop();
  }, []);

  const handleToggleAdminTools = useCallback(() => {
    setShowAdminContextualModal((prev) => {
      const next = !prev;
      if (next) {
        scrollToTop();
      }
      return next;
    });
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    scrollToTop();
  }, []);

  useEffect(() => {
    applyThemeToDocument();
  }, []);

  const loadGateState = useCallback(async () => {
    if (!repository) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const nextState = await repository.loadViewerGateState();
      setGateState(nextState);
    } catch (err) {
      setGateState({
        status: 'membership_check_failed',
        errorMessage:
          err instanceof Error
            ? err.message
            : 'Unexpected error while verifying membership state.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadGateState();
  }, [loadGateState]);

  useEffect(() => {
    if (!defaultEnvAndClient.client) {
      return;
    }
    const {
      data: { subscription },
    } = defaultEnvAndClient.client.auth.onAuthStateChange((event) => {
      if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        event === 'TOKEN_REFRESHED'
      ) {
        void loadGateState();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [defaultEnvAndClient.client, loadGateState]);

  // 1. Fail closed on invalid or unsafe environment configuration (e.g. service_role key detected)
  if (envConfig.status === 'invalid_env') {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            BADDIESMASH
          </h1>
        </header>
        <main className="app-main">
          <section
            className="card"
            role="alert"
            data-testid="env-invalid-configuration"
          >
            <h2 style={{ marginTop: 0 }}>
              Invalid or Unsafe Environment Configuration
            </h2>
            <p>{envConfig.diagnosticMessage}</p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Check your <code>.env.local</code> file against{' '}
              <code>.env.example</code>. Provide only{' '}
              <code>VITE_SUPABASE_URL</code> and the public{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>. Never place a{' '}
              <code>service_role</code> or secret key in browser environment
              variables.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // 2. Initial loading state (keep active views mounted during background state refreshes)
  if ((isLoading && !gateState) || !gateState || !repository) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            BADDIESMASH
          </h1>
        </header>
        <main className="app-main">
          <section
            className="card"
            role="status"
            aria-live="polite"
            data-testid="app-loading-state"
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              ↻ Loading application &amp; verifying group membership...
            </p>
          </section>
        </main>
      </div>
    );
  }

  const isDemoMode = gateState.status === 'demo_mode';

  // 3. Non-approved / unauthenticated live states (Fail-closed security gate — Condition 1B)
  if (gateState.status !== 'approved' && gateState.status !== 'demo_mode') {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '1.25rem',
                fontWeight: 700,
                fontStyle: 'italic',
                letterSpacing: '0.04em',
                color: '#ffffff',
              }}
            >
              <span>BADDIE</span><span style={{ color: '#22c55e' }}>SMASH</span>
            </span>
            <span className="sr-only">BADDIESMASH</span>
          </div>
        </header>
        <main className="app-main">
          <AuthMembershipGateView
            gateState={gateState}
            isDemoMode={false}
            capturedInviteToken={capturedInviteToken}
            capturedInviteEmail={capturedInviteEmail}
            onClearCapturedInviteToken={() => {
              clearCapturedInviteToken();
              setCapturedInviteContext({ token: null, email: null });
            }}
            onSignInGoogle={() => repository.signInWithGoogle()}
            onSignInEmailPassword={async (email, pwd) => {
              await repository.signInWithEmailPassword(email, pwd);
              await loadGateState();
            }}
            onSignUpEmailPassword={async (email, pwd) => {
              await repository.signUpWithEmailPassword(email, pwd);
              await loadGateState();
            }}
            onRedeemInvitation={(input) =>
              repository.redeemGroupInvitation(input)
            }
            onBootstrapGroup={(input) =>
              repository.bootstrapInitialGroup(input)
            }
            onSignOut={async () => {
              await repository.signOut();
              await loadGateState();
            }}
            onRetryCheck={loadGateState}
          />
        </main>
      </div>
    );
  }

  // 4. Approved Member OR Explicitly Labelled Read-Only Demo Mode
  const snapshot = gateState.snapshot;
  const publication = resolveEffectivePublicationBannerState(snapshot);

  const viewerPlayer =
    snapshot.players.find(
      (p) => p.id === snapshot.viewerMembership.linked_player_id,
    ) ?? null;

  const viewerInitials = viewerPlayer
    ? viewerPlayer.display_name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const handleRetryRecalculation = async () => {
    await repository.retryRatingRecalculation(
      snapshot.group.id,
      'Admin retry triggered from publication banner',
    );
    await loadGateState();
  };

  return (
    <div className="app-shell">
      {isDemoMode && (
        <div
          className="demo-mode-banner max-w-full overflow-hidden"
          role="region"
          aria-label="Demo mode notice"
          data-testid="demo-mode-banner"
        >
          <div style={{ flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word' }}>
            <span>
              DEMO MODE: DETERMINISTIC MOCK DATA (READ-ONLY). No Supabase
              backend is configured; sign-in, invitations, approvals, merges,
              and database writes are disabled.
            </span>
          </div>
          <button
            type="button"
            className="touch-target"
            style={{
              minHeight: '40px',
              padding: '0.3rem 0.75rem',
              fontSize: '0.78rem',
              maxWidth: '100%',
              textAlign: 'center',
            }}
            onClick={() => setShowDemoSignInPreview((prev) => !prev)}
          >
            {showDemoSignInPreview
              ? 'Return to Demo Read Views'
              : 'Preview Sign-In Screen (Disabled in Demo)'}
          </button>
        </div>
      )}

      {/* BADDIESMASH Header */}
      <header className="app-header">
        {/* Brand Logo: BADDIESMASH */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '1.25rem',
                fontWeight: 700,
                fontStyle: 'italic',
                letterSpacing: '0.04em',
                color: '#ffffff',
              }}
            >
              <span>BADDIE</span><span style={{ color: '#22c55e' }}>SMASH</span>
            </span>
            <span className="sr-only">BADDIESMASH</span>
          </div>
          {isDemoMode && (
            <span className="hidden sm:inline-flex">
              <StatusBadge variant="demo_mode" />
            </span>
          )}
        </div>

        {/* User Profile Avatar & Accessible Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Accessible buttons for test suites & keyboard shortcuts */}
          {(snapshot.viewerMembership.role === 'admin' ||
            snapshot.viewerMembership.role === 'owner') && (
            <button
              type="button"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-slate-900 focus:text-white focus:border focus:border-emerald-500 focus:rounded-lg focus:text-xs focus:font-bold"
              aria-expanded={showAdminContextualModal}
              onClick={handleToggleAdminTools}
              data-testid="toggle-admin-tools-btn"
            >
              Admin Tools
            </button>
          )}


          {/* User Profile Avatar (1-Tap to Profile Tab) */}
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              border: '2px solid var(--border-color)',
              background: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              padding: 0,
              overflow: 'hidden',
              transition: 'transform 0.15s ease',
            }}
            aria-label="View user profile"
            title="View User Profile"
          >
            {viewerPlayer?.avatar_url ? (
              <img
                src={viewerPlayer.avatar_url}
                alt={viewerPlayer.display_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span>{viewerInitials}</span>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">
        {showAdminContextualModal &&
          (snapshot.viewerMembership.role === 'admin' ||
            snapshot.viewerMembership.role === 'owner') && (
            <Suspense
              fallback={
                <section
                  className="card"
                  role="status"
                  aria-live="polite"
                  data-testid="admin-loading-state"
                >
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    ↻ Loading Admin Tools &amp; Governance...
                  </p>
                </section>
              }
            >
              <AdminGovernanceView
                snapshot={snapshot}
                repository={repository}
                publication={publication}
                onRetryRecalculation={handleRetryRecalculation}
                onRefreshGroupState={loadGateState}
                onClose={() => setShowAdminContextualModal(false)}
              />
            </Suspense>
          )}

        {isDemoMode && showDemoSignInPreview ? (
          <AuthMembershipGateView
            gateState={{ status: 'unauthenticated' }}
            isDemoMode={true}
            capturedInviteToken={capturedInviteToken}
            capturedInviteEmail={capturedInviteEmail}
            onClearCapturedInviteToken={() => {
              clearCapturedInviteToken();
              setCapturedInviteContext({ token: null, email: null });
            }}
            onSignInGoogle={() => repository.signInWithGoogle()}
            onSignInEmailPassword={async (email, pwd) => {
              await repository.signInWithEmailPassword(email, pwd);
              await loadGateState();
            }}
            onSignUpEmailPassword={async (email, pwd) => {
              await repository.signUpWithEmailPassword(email, pwd);
              await loadGateState();
            }}
            onRedeemInvitation={(input) =>
              repository.redeemGroupInvitation(input)
            }
            onBootstrapGroup={(input) =>
              repository.bootstrapInitialGroup(input)
            }
            onSignOut={() => repository.signOut()}
            onRetryCheck={loadGateState}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                snapshot={snapshot}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onSelectPlayer={(playerId) => setSelectedPlayerId(playerId)}
                onSelectSession={handleSelectSession}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView
                snapshot={snapshot}
                onSelectPlayer={(playerId) => {
                  setSelectedPlayerId(playerId);
                  setActiveTab('profile');
                }}
              />
            )}

            {activeTab === 'sessions' && (
              <SessionsView
                snapshot={snapshot}
                repository={repository}
                selectedSessionId={selectedSessionId}
                onSelectSession={handleSelectSession}
                onSelectPlayer={(playerId) => {
                  setSelectedPlayerId(playerId);
                  setActiveTab('profile');
                }}
                onRefreshGroupState={loadGateState}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                snapshot={snapshot}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={(playerId) => setSelectedPlayerId(playerId)}
                onOpenAdminTools={handleOpenAdminTools}
                onUpdateAvatar={async (file: File) => {
                  if (!snapshot.viewerMembership.linked_player_id) {
                    throw new Error('Viewer account is not linked to any player profile.');
                  }
                  const avatarUrl = await repository.uploadAvatarImage({
                    groupId: snapshot.group.id,
                    playerId: snapshot.viewerMembership.linked_player_id,
                    file,
                  });
                  await repository.updatePlayerAvatar({
                    groupId: snapshot.group.id,
                    playerId: snapshot.viewerMembership.linked_player_id,
                    avatarUrl,
                  });
                  await loadGateState();
                }}
                onUpdateDisplayName={async (playerId: string, newName: string) => {
                  const isAdmin =
                    snapshot.viewerMembership.role === 'admin' ||
                    snapshot.viewerMembership.role === 'owner';
                  await repository.updatePlayerDisplayName({
                    groupId: snapshot.group.id,
                    playerId,
                    displayName: newName,
                    adminOverride: isAdmin,
                  });
                  await loadGateState();
                }}
                onSignOut={async () => {
                  await repository.signOut();
                  await loadGateState();
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Canonical Four Bottom Tabs (docs/01-product/ui-and-accessibility.md) */}
      <nav className="bottom-nav" aria-label="Primary navigation">
        {/* Animated Sliding Pill Highlight */}
        <div
          className="bottom-nav-sliding-pill"
          style={{
            transform: `translateX(${activeTabIndex * 100}%)`,
          }}
          aria-hidden="true"
        />

        <button
          type="button"
          className="bottom-nav-btn"
          aria-current={activeTab === 'home' ? 'page' : undefined}
          onClick={() => {
            setShowDemoSignInPreview(false);
            setActiveTab('home');
          }}
        >
          {activeTab === 'home' && <span className="bottom-nav-indicator sr-only" />}
          <Home size={19} strokeWidth={activeTab === 'home' ? 2.25 : 1.75} aria-hidden="true" />
          <span>Home</span>
        </button>

        <button
          type="button"
          className="bottom-nav-btn"
          aria-current={activeTab === 'leaderboard' ? 'page' : undefined}
          onClick={() => {
            setShowDemoSignInPreview(false);
            setActiveTab('leaderboard');
          }}
        >
          {activeTab === 'leaderboard' && <span className="bottom-nav-indicator sr-only" />}
          <Trophy size={19} strokeWidth={activeTab === 'leaderboard' ? 2.25 : 1.75} aria-hidden="true" />
          <span>Leaderboard</span>
        </button>

        <button
          type="button"
          className="bottom-nav-btn"
          aria-current={activeTab === 'sessions' ? 'page' : undefined}
          onClick={() => {
            setShowDemoSignInPreview(false);
            setActiveTab('sessions');
          }}
        >
          {activeTab === 'sessions' && <span className="bottom-nav-indicator sr-only" />}
          <Calendar size={19} strokeWidth={activeTab === 'sessions' ? 2.25 : 1.75} aria-hidden="true" />
          <span>Sessions</span>
        </button>

        <button
          type="button"
          className="bottom-nav-btn"
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          onClick={() => {
            setShowDemoSignInPreview(false);
            setActiveTab('profile');
          }}
        >
          {activeTab === 'profile' && <span className="bottom-nav-indicator sr-only" />}
          <User size={19} strokeWidth={activeTab === 'profile' ? 2.25 : 1.75} aria-hidden="true" />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
