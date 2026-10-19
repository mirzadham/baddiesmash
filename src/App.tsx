import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Home, Moon, Settings, Sun, Trophy, User } from 'lucide-react';
import { StatusBadge } from './components/StatusBadge.tsx';
import { ShuttlecockBrandMark } from './components/icons/BrandMark.tsx';
import {
  captureAndStripInviteTokenFromUrl,
  clearCapturedInviteToken,
} from './lib/inviteToken.ts';
import {
  getSupabaseBrowserClient,
  type SupabaseEnvironmentConfig,
} from './lib/supabase.ts';
import {
  applyThemeToDocument,
  getInitialThemePreference,
  persistThemePreference,
  type ThemePreference,
} from './lib/theme.ts';
import {
  createDemoTrackerRepository,
  createSupabaseTrackerRepository,
  resolveEffectivePublicationBannerState,
  type TrackerRepository,
  type ViewerGateState,
} from './services/trackerRepository.ts';
import { AdminGovernanceView } from './views/AdminGovernanceView.tsx';
import { AuthMembershipGateView } from './views/AuthMembershipGateView.tsx';
import { HomeView } from './views/HomeView.tsx';
import { LeaderboardView } from './views/LeaderboardView.tsx';
import { ProfileView } from './views/ProfileView.tsx';
import { SessionsView } from './views/SessionsView.tsx';

export type BottomNavTab = 'home' | 'leaderboard' | 'sessions' | 'profile';
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
    if (envConfig.status === 'configured' && defaultEnvAndClient.client) {
      return createSupabaseTrackerRepository(defaultEnvAndClient.client);
    }
    return createDemoTrackerRepository();
  }, [injectedRepo, envConfig.status, defaultEnvAndClient.client]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [gateState, setGateState] = useState<ViewerGateState | null>(null);
  const [capturedInviteToken, setCapturedInviteToken] = useState<string | null>(
    () => captureAndStripInviteTokenFromUrl(),
  );
  const [activeTab, setActiveTab] = useState<BottomNavTab>(() => {
    if (typeof window !== 'undefined') {
      const qTab = new URLSearchParams(window.location.search).get('tab');
      if (qTab === 'leaderboard' || qTab === 'sessions' || qTab === 'profile' || qTab === 'home') {
        return qTab;
      }
    }
    return 'home';
  });
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
  const [theme, setTheme] = useState<ThemePreference>(() =>
    getInitialThemePreference(),
  );

  useEffect(() => {
    applyThemeToDocument(theme);
    persistThemePreference(theme);
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

  // 2. Initial loading state (keep active views mounted during background state refreshes)
  if ((isLoading && !gateState) || !gateState || !repository) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ShuttlecockBrandMark size={28} />
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
              Badminton Tracker
            </h1>
          </div>
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
            capturedInviteToken={capturedInviteToken}
            onClearCapturedInviteToken={() => {
              clearCapturedInviteToken();
              setCapturedInviteToken(null);
            }}
            onSignInGoogle={() => repository.signInWithGoogle()}
            onSignInEmailPassword={(email, pwd) =>
              repository.signInWithEmailPassword(email, pwd)
            }
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
              ◈ DEMO MODE — DETERMINISTIC MOCK DATA (READ-ONLY). No Supabase
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

      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flexWrap: 'wrap' }}>
          <ShuttlecockBrandMark size={30} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Badminton Tracker
              </span>
              {isDemoMode && <StatusBadge variant="demo_mode" />}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {snapshot.group.name} • <code>{snapshot.viewerMembership.role}</code>
            </div>
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
              data-testid="toggle-admin-tools-btn"
            >
              <Settings size={15} />
              <span>Admin Tools</span>
            </button>
          )}

          {/* Quick Sun/Moon Theme Toggle Pill matching reference image */}
          <button
            type="button"
            onClick={() => {
              const next: ThemePreference = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
            }}
            style={{
              minHeight: '38px',
              padding: '0.25rem 0.65rem',
              borderRadius: '999px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface-subtle)',
              color: 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.78rem',
            }}
            aria-label={`Toggle theme (currently ${theme})`}
            title={`Toggle light/dark theme (currently ${theme})`}
          >
            {theme === 'dark' ? (
              <Moon size={14} style={{ color: '#a78bfa' }} />
            ) : (
              <Sun size={14} style={{ color: '#f59e0b' }} />
            )}
            <span style={{ textTransform: 'capitalize' }}>
              {theme === 'system' ? 'Auto' : theme}
            </span>
          </button>

          <label htmlFor="theme-select" style={{ fontSize: '0.82rem' }} className="hidden sm:inline">
            Theme:
          </label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
            className="hidden sm:inline-block"
            style={{
              minHeight: '38px',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.4rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              fontSize: '0.82rem',
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
        {showAdminContextualModal &&
          (snapshot.viewerMembership.role === 'admin' ||
            snapshot.viewerMembership.role === 'owner') && (
            <AdminGovernanceView
              snapshot={snapshot}
              repository={repository}
              onRefreshGroupState={loadGateState}
              onClose={() => setShowAdminContextualModal(false)}
            />
          )}

        {isDemoMode && showDemoSignInPreview ? (
          <AuthMembershipGateView
            gateState={{ status: 'unauthenticated' }}
            isDemoMode={true}
            capturedInviteToken={capturedInviteToken}
            onClearCapturedInviteToken={() => {
              clearCapturedInviteToken();
              setCapturedInviteToken(null);
            }}
            onSignInGoogle={() => repository.signInWithGoogle()}
            onSignInEmailPassword={(email, pwd) =>
              repository.signInWithEmailPassword(email, pwd)
            }
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
                publication={publication}
                repository={repository}
                selectedSessionId={selectedSessionId}
                onSelectSession={(sessionId) => setSelectedSessionId(sessionId)}
                onSelectPlayer={(playerId) => {
                  setSelectedPlayerId(playerId);
                  setActiveTab('profile');
                }}
                onRefreshGroupState={loadGateState}
                onRetryRecalculation={handleRetryRecalculation}
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
          <Home size={18} strokeWidth={activeTab === 'home' ? 2.5 : 2} aria-hidden="true" />
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
          <Trophy size={18} strokeWidth={activeTab === 'leaderboard' ? 2.5 : 2} aria-hidden="true" />
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
          <Calendar size={18} strokeWidth={activeTab === 'sessions' ? 2.5 : 2} aria-hidden="true" />
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
          <User size={18} strokeWidth={activeTab === 'profile' ? 2.5 : 2} aria-hidden="true" />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
