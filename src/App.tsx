import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from './components/StatusBadge.tsx';
import {
  getSupabaseBrowserClient,
  type SupabaseEnvironmentConfig,
} from './lib/supabase.ts';
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

export type BottomNavTab = 'home' | 'leaderboard' | 'sessions' | 'profile';
export type ThemePreference = 'system' | 'light' | 'dark';

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
    if (envConfig.status === 'configured' && defaultEnvAndClient.client) {
      return createSupabaseTrackerRepository(defaultEnvAndClient.client);
    }
    return createDemoTrackerRepository();
  }, [injectedRepo, envConfig.status, defaultEnvAndClient.client]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [gateState, setGateState] = useState<ViewerGateState | null>(null);
  const [activeTab, setActiveTab] = useState<BottomNavTab>('home');
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
  const [theme, setTheme] = useState<ThemePreference>('system');

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

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

  // 1. Fail closed on invalid or unsafe environment configuration (e.g. service_role key detected)
  if (envConfig.status === 'invalid_env') {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            Badminton Group Tracker
          </h1>
        </header>
        <main className="app-main">
          <section
            className="card"
            role="alert"
            data-testid="env-invalid-configuration"
          >
            <h2 style={{ marginTop: 0 }}>
              ⚠ Invalid or Unsafe Environment Configuration
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

  // 2. Loading state
  if (isLoading || !gateState || !repository) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            Badminton Group Tracker
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
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            Badminton Group Tracker
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="theme-select-gate" style={{ fontSize: '0.82rem' }}>
              Theme:
            </label>
            <select
              id="theme-select-gate"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemePreference)}
              style={{
                minHeight: '44px',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.4rem',
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </header>
        <main className="app-main">
          <AuthMembershipGateView
            gateState={gateState}
            isDemoMode={false}
            onSignInGoogle={() => repository.signInWithGoogle()}
            onSignInEmailPassword={(email, pwd) =>
              repository.signInWithEmailPassword(email, pwd)
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
          className="demo-mode-banner"
          role="region"
          aria-label="Demo mode notice"
          data-testid="demo-mode-banner"
        >
          <div>
            <span>
              ◈ DEMO MODE — DETERMINISTIC MOCK DATA (READ-ONLY). No Supabase
              backend is configured; sign-in, invitations, approvals, merges,
              and database writes are disabled.
            </span>
          </div>
          <button
            type="button"
            className="touch-target"
            style={{
              minHeight: '44px',
              padding: '0.3rem 0.75rem',
              fontSize: '0.8rem',
            }}
            onClick={() => setShowDemoSignInPreview((prev) => !prev)}
          >
            {showDemoSignInPreview
              ? 'Return to Demo Read Views'
              : 'Preview Sign-In Screen (Disabled in Demo)'}
          </button>
        </div>
      )}

      <header className="app-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
              {snapshot.group.name}
            </h1>
            {isDemoMode && <StatusBadge variant="demo_mode" />}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Role: <code>{snapshot.viewerMembership.role}</code> • Timezone:{' '}
            <code>{snapshot.group.timezone}</code>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {(snapshot.viewerMembership.role === 'admin' ||
            snapshot.viewerMembership.role === 'owner') && (
            <button
              type="button"
              className="touch-target"
              aria-expanded={showAdminContextualModal}
              onClick={() => setShowAdminContextualModal((prev) => !prev)}
            >
              ⚙ Admin Tools
            </button>
          )}

          <label htmlFor="theme-select" style={{ fontSize: '0.82rem' }}>
            Theme:
          </label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
            style={{
              minHeight: '44px',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.4rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>

          {!isDemoMode && (
            <button
              type="button"
              className="touch-target"
              onClick={() => {
                void repository.signOut().then(() => loadGateState());
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {showAdminContextualModal && (
          <section
            className="card"
            aria-labelledby="admin-contextual-heading"
            data-testid="admin-contextual-panel"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <h2 id="admin-contextual-heading" style={{ margin: 0, fontSize: '1.1rem' }}>
                Admin &amp; Membership Tools (Checkpoint 3B Scope)
              </h2>
              <button
                type="button"
                className="touch-target"
                onClick={() => setShowAdminContextualModal(false)}
              >
                Close ✕
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Invitation issuance/revocation, pending membership approvals,
              permanent/guest profile creation, and guest-to-player merge
              previews/executions are gated for <strong>Checkpoint 3B</strong>{' '}
              following owner review of Checkpoint 3A.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" className="touch-target" disabled>
                Issue Invitation (Checkpoint 3B)
              </button>
              <button type="button" className="touch-target" disabled>
                Review Pending Approvals (Checkpoint 3B)
              </button>
              <button type="button" className="touch-target" disabled>
                Preview &amp; Merge Guest (Checkpoint 3B)
              </button>
            </div>
          </section>
        )}

        {isDemoMode && showDemoSignInPreview ? (
          <AuthMembershipGateView
            gateState={{ status: 'unauthenticated' }}
            isDemoMode={true}
            onSignInGoogle={() => repository.signInWithGoogle()}
            onSignInEmailPassword={(email, pwd) =>
              repository.signInWithEmailPassword(email, pwd)
            }
            onSignOut={() => repository.signOut()}
            onRetryCheck={loadGateState}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                snapshot={snapshot}
                publication={publication}
                onRetryRecalculation={handleRetryRecalculation}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onSelectPlayer={(playerId) => setSelectedPlayerId(playerId)}
                onSelectSession={(sessionId) => setSelectedSessionId(sessionId)}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView
                snapshot={snapshot}
                publication={publication}
                onRetryRecalculation={handleRetryRecalculation}
                onSelectPlayer={(playerId) => {
                  setSelectedPlayerId(playerId);
                  setActiveTab('profile');
                }}
              />
            )}

            {activeTab === 'sessions' && (
              <SessionsView
                snapshot={snapshot}
                selectedSessionId={selectedSessionId}
                onSelectSession={(sessionId) => setSelectedSessionId(sessionId)}
                onSelectPlayer={(playerId) => {
                  setSelectedPlayerId(playerId);
                  setActiveTab('profile');
                }}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                snapshot={snapshot}
                publication={publication}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={(playerId) => setSelectedPlayerId(playerId)}
                onRetryRecalculation={handleRetryRecalculation}
              />
            )}
          </>
        )}
      </main>

      {/* Canonical Four Bottom Tabs (docs/01-product/ui-and-accessibility.md) */}
      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          type="button"
          className="bottom-nav-btn"
          aria-current={activeTab === 'home' ? 'page' : undefined}
          onClick={() => {
            setShowDemoSignInPreview(false);
            setActiveTab('home');
          }}
        >
          <span aria-hidden="true">⌂</span>
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
          <span aria-hidden="true">★</span>
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
          <span aria-hidden="true">◷</span>
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
          <span aria-hidden="true">☺</span>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
