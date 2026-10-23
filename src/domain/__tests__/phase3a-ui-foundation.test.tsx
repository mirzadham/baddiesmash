// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import {
  evaluateSupabaseEnvironment,
  isForbiddenPrivilegedKey,
} from '../../lib/supabase.ts';
import {
  buildDeterministicDemoSnapshot,
  DEMO_MATCH_IDS,
  DEMO_PLAYER_IDS,
  type GroupReadSnapshot,
} from '../../services/demoData.ts';
import {
  createDemoTrackerRepository,
  createSupabaseTrackerRepository,
  type TrackerRepository,
  type ViewerGateState,
} from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

const CONFIGURED_ENV = {
  status: 'configured' as const,
  supabaseUrl: 'https://example-project.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig',
  diagnosticMessage: null,
};

function createMockRepository(
  initialGateState: ViewerGateState,
  overrides: Partial<TrackerRepository> = {},
): TrackerRepository {
  const baseDemoRepo = createDemoTrackerRepository();
  return {
    ...baseDemoRepo,
    isDemoMode: initialGateState.status === 'demo_mode',
    loadViewerGateState: vi.fn().mockResolvedValue(initialGateState),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithEmailPassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    retryRatingRecalculation: vi.fn().mockResolvedValue({
      recalculation_succeeded: true,
      recalculation_status: 'idle',
      published_rating_version_id: '00000000-0000-4000-8000-000000000999',
      required_match_state_seq: 5,
      recalculation_run_id: '00000000-0000-4000-8000-000000000888',
    }),
    ...overrides,
  };
}

describe('Phase 3 Checkpoint 3A — Frontend Foundation, Auth/Membership Gates & Read Views', () => {
  it('detects and blocks service_role keys or malformed env variables and fails closed (Condition 1B & 3)', () => {
    // 1. Forged JWT containing "role":"service_role"
    const serviceRoleJwtPayload = Buffer.from(
      JSON.stringify({ role: 'service_role', iss: 'supabase' }),
    ).toString('base64url');
    const fakeServiceRoleJwt = `eyJhbGciOiJIUzI1NiJ9.${serviceRoleJwtPayload}.sig`;

    expect(isForbiddenPrivilegedKey(fakeServiceRoleJwt)).toBe(true);
    expect(isForbiddenPrivilegedKey('sb_secret_123456789')).toBe(true);

    const envEval = evaluateSupabaseEnvironment({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: fakeServiceRoleJwt,
    });
    expect(envEval.status).toBe('invalid_env');
    expect(envEval.diagnosticMessage).toMatch(/service_role/i);

    render(<App envConfig={envEval} />);
    expect(screen.getByTestId('env-invalid-configuration')).toBeTruthy();
    expect(screen.queryByTestId('view-home')).toBeNull();
  });

  it('enforces fail-closed membership gates for unauthenticated, pending, rejected, suspended, departed, and failed checks without exposing group data (AUTH-01, Condition 1B)', async () => {
    const baseDemo = buildDeterministicDemoSnapshot();

    // 1. Membership check failed -> shows error + retry, never shows group name or players
    let currentGate: ViewerGateState = {
      status: 'membership_check_failed',
      errorMessage: 'PostgREST connection timeout',
    };
    const loadSpy = vi.fn(async () => currentGate);
    const repo = createMockRepository(currentGate, {
      loadViewerGateState: loadSpy,
    });

    const { unmount } = render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-membership-check-failed')).toBeTruthy();
    });
    expect(screen.queryByText('KL Badminton Regulars (Demo)')).toBeNull();
    expect(screen.queryByText('Aaron Tan')).toBeNull();

    // Transition to pending_approval on retry
    currentGate = {
      status: 'pending_approval',
      userId: 'u-pending',
      userEmail: 'pending@example.com',
      membership: {
        ...baseDemo.viewerMembership,
        status: 'pending_approval',
        role: 'member',
      },
    };
    fireEvent.click(screen.getByRole('button', { name: /Retry Verification/i }));

    await waitFor(() => {
      expect(screen.getByTestId('gate-pending-approval')).toBeTruthy();
    });
    expect(screen.queryByText('Aaron Tan')).toBeNull();

    // Transition to approved on next check -> now group data renders
    currentGate = {
      status: 'approved',
      userId: baseDemo.viewerMembership.user_id,
      userEmail: 'owner@example.com',
      membership: baseDemo.viewerMembership,
      snapshot: { ...baseDemo, isDemoMode: false },
    };
    fireEvent.click(
      screen.getByRole('button', { name: /Check Approval Status/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });
    expect(screen.getByText('Aaron Tan')).toBeTruthy();
    unmount();

    // Verify rejected, suspended, departed, and no_membership gates also hide group data
    for (const nonApprovedStatus of [
      'rejected',
      'suspended',
      'departed',
    ] as const) {
      const gate: ViewerGateState = {
        status: nonApprovedStatus,
        userId: 'u-1',
        userEmail: 'user@example.com',
        membership: {
          ...baseDemo.viewerMembership,
          status: nonApprovedStatus,
        },
      };
      const r = createMockRepository(gate);
      const view = render(<App repository={r} envConfig={CONFIGURED_ENV} />);
      await waitFor(() => {
        expect(screen.getByTestId(`gate-${nonApprovedStatus}`)).toBeTruthy();
      });
      expect(screen.queryByText('Aaron Tan')).toBeNull();
      view.unmount();
    }
  });

  it('surfaces authentication failures visibly on the sign-in gate without claiming success', async () => {
    const repo = createMockRepository(
      { status: 'unauthenticated' },
      {
        signInWithEmailPassword: vi
          .fn()
          .mockRejectedValue(new Error('Invalid login credentials')),
      },
    );

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-unauthenticated')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'member@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In with Email/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(
        /Invalid login credentials/i,
      );
    });
  });

  it('renders BADDIESMASH brand hero icon on unauthenticated gate instead of generic lock', async () => {
    const repo = createMockRepository({ status: 'unauthenticated' });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-unauthenticated')).toBeTruthy();
    });

    const heroIcon = screen.getByTestId('baddiesmash-hero-icon') as HTMLImageElement;
    expect(heroIcon).toBeTruthy();
    expect(heroIcon.getAttribute('src')).toBe('/icon-192.png');
    expect(heroIcon.getAttribute('alt')).toBe('BADDIESMASH');
  });

  it('displays a friendly in-app notice when Continue with Google is clicked in Stage 1 and clears on dismiss or credential input', async () => {
    const repo = createMockRepository({ status: 'unauthenticated' });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-unauthenticated')).toBeTruthy();
    });

    const googleBtn = screen.getByRole('button', {
      name: /Continue with Google/i,
    });
    expect((googleBtn as HTMLButtonElement).disabled).toBe(false);

    // Initial state: no notice
    expect(screen.queryByTestId('google-oauth-stage1-notice')).toBeNull();

    // Click Continue with Google
    fireEvent.click(googleBtn);

    // Notice appears
    const notice = screen.getByTestId('google-oauth-stage1-notice');
    expect(notice.textContent).toMatch(
      /Google sign-in is not yet enabled for Stage 1/i,
    );

    // Dismiss notice
    const dismissBtn = screen.getByRole('button', { name: /Dismiss notice/i });
    fireEvent.click(dismissBtn);
    expect(screen.queryByTestId('google-oauth-stage1-notice')).toBeNull();

    // Click again -> notice appears
    fireEvent.click(googleBtn);
    expect(screen.getByTestId('google-oauth-stage1-notice')).toBeTruthy();

    // Typing email clears notice
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'user@example.com' },
    });
    expect(screen.queryByTestId('google-oauth-stage1-notice')).toBeNull();
  });

  it('automatically reloads gate state and transitions to approved view upon successful email sign-in without requiring page refresh', async () => {
    const baseDemo = buildDeterministicDemoSnapshot();
    let currentGateState: ViewerGateState = { status: 'unauthenticated' };

    const loadViewerGateState = vi.fn().mockImplementation(async () => currentGateState);
    const signInWithEmailPassword = vi.fn().mockImplementation(async () => {
      // Simulate Supabase authentication completing and returning session
      currentGateState = {
        status: 'approved',
        userId: baseDemo.viewerMembership.user_id,
        userEmail: 'member@example.com',
        membership: baseDemo.viewerMembership,
        snapshot: { ...baseDemo, isDemoMode: false },
      };
    });

    const repo = createMockRepository({ status: 'unauthenticated' }, {
      loadViewerGateState,
      signInWithEmailPassword,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-unauthenticated')).toBeTruthy();
    });

    // Enter email and password credentials
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'member@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'ValidPassword123' },
    });

    // Click Sign In with Email
    const signInBtn = screen.getByRole('button', {
      name: /Sign In with Email/i,
    });
    fireEvent.click(signInBtn);

    // Verify signInWithEmailPassword was called with exact credentials
    await waitFor(() => {
      expect(signInWithEmailPassword).toHaveBeenCalledWith('member@example.com', 'ValidPassword123');
    });

    // Verify UI immediately transitions to approved home view without refreshing the page
    await waitFor(() => {
      expect(screen.queryByTestId('gate-unauthenticated')).toBeNull();
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });
  });

  it('explicitly labels Demo Mode and disables sign-in and server mutations in Demo Mode (Condition 1A)', async () => {
    const staleDemoSnapshot: GroupReadSnapshot = {
      ...buildDeterministicDemoSnapshot(),
      isDemoMode: true,
      publicationState: {
        group_id: '00000000-0000-4000-8000-000000000101',
        publication_health: 'stale_or_failed',
        is_current: false,
        recalculation_status: 'failed',
        required_match_state_seq: 6,
        published_rating_version_id: '00000000-0000-4000-8000-000000000901',
        published_match_state_seq: 5,
        last_recalculation_error: 'Simulated demo failure',
      },
    };
    const demoRepo = createDemoTrackerRepository(staleDemoSnapshot);

    render(<App repository={demoRepo} />);

    await waitFor(() => {
      expect(screen.getByTestId('demo-mode-banner')).toBeTruthy();
    });
    expect(screen.getByTestId('status-badge-demo_mode')).toBeTruthy();

    // Open Admin Tools to access rating recalculation
    await waitFor(() => {
      expect(screen.getByTestId('toggle-admin-tools-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));

    // Retry button on stale banner must be disabled in Demo Mode
    const retryBtn = screen.getByRole('button', {
      name: /Retry Recalculation \(Disabled in Demo Mode\)/i,
    });
    expect((retryBtn as HTMLButtonElement).disabled).toBe(true);

    // Close Admin Tools modal
    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));

    // Preview Sign-In screen in Demo Mode: sign-in buttons must be disabled
    fireEvent.click(
      screen.getByRole('button', {
        name: /Preview Sign-In Screen \(Disabled in Demo\)/i,
      }),
    );

    const googleBtn = screen.getByRole('button', {
      name: /Continue with Google/i,
    });
    const emailSubmitBtn = screen.getByRole('button', {
      name: /Sign In with Email/i,
    });
    expect((googleBtn as HTMLButtonElement).disabled).toBe(true);
    expect((emailSubmitBtn as HTMLButtonElement).disabled).toBe(true);

    // Direct calls to demo repository mutation/auth methods must reject
    await expect(demoRepo.signInWithGoogle()).rejects.toThrow(/Demo Mode/i);
    const liveRepo = createSupabaseTrackerRepository({} as any);
    await expect(liveRepo.signInWithGoogle()).rejects.toThrow(
      /Google sign-in is not yet enabled for Stage 1/i,
    );
    await expect(
      demoRepo.retryRatingRecalculation('group-1'),
    ).rejects.toThrow(/Demo Mode/i);
  });

  it('never labels the leaderboard Current when publication status cannot be verified, and handles live admin retry failure and recovery (Condition 1B, RATE-04)', async () => {
    const base = buildDeterministicDemoSnapshot();

    // Case A: publicationState is null (backend RPC failed/unverified) -> shows Status Unverified, never Current
    const unverifiedSnapshot: GroupReadSnapshot = {
      ...base,
      isDemoMode: false,
      publicationState: null,
    };

    const unverifiedRepo = createMockRepository({
      status: 'approved',
      userId: base.viewerMembership.user_id,
      userEmail: 'owner@example.com',
      membership: base.viewerMembership,
      snapshot: unverifiedSnapshot,
    });

    const { unmount } = render(
      <App repository={unverifiedRepo} envConfig={CONFIGURED_ENV} />,
    );

    // Open Admin Tools to access rating status
    await waitFor(() => {
      expect(screen.getByTestId('toggle-admin-tools-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-unverified')).toBeTruthy();
    });
    expect(screen.queryByTestId('status-badge-current')).toBeNull();
    expect(
      screen.getByText(/Rating publication status could not be verified/i),
    ).toBeTruthy();
    unmount();

    // Case B: Stale/Failed state in Live Mode -> Admin retries -> first attempt fails visibly -> second attempt recovers to Current
    let currentSnap: GroupReadSnapshot = {
      ...base,
      isDemoMode: false,
      publicationState: {
        group_id: base.group.id,
        publication_health: 'stale_or_failed',
        is_current: false,
        recalculation_status: 'failed',
        required_match_state_seq: 6,
        published_rating_version_id: base.group.published_rating_version_id,
        published_match_state_seq: 5,
        last_recalculation_error: 'Statement timeout during replay',
      },
    };

    let attempt = 0;
    const retryMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('Database lock timeout during retry');
      }
      currentSnap = {
        ...base,
        isDemoMode: false,
        publicationState: {
          group_id: base.group.id,
          publication_health: 'current',
          is_current: true,
          recalculation_status: 'idle',
          required_match_state_seq: 6,
          published_rating_version_id: '00000000-0000-4000-8000-000000000999',
          published_match_state_seq: 6,
          last_recalculation_error: null,
        },
      };
      return {
        recalculation_succeeded: true,
        recalculation_status: 'idle' as const,
        published_rating_version_id: '00000000-0000-4000-8000-000000000999',
        required_match_state_seq: 6,
        recalculation_run_id: 'run-2',
      };
    });

    const liveRepo = createMockRepository(
      {
        status: 'approved',
        userId: base.viewerMembership.user_id,
        userEmail: 'owner@example.com',
        membership: base.viewerMembership,
        snapshot: currentSnap,
      },
      {
        loadViewerGateState: vi.fn(async () => ({
          status: 'approved' as const,
          userId: base.viewerMembership.user_id,
          userEmail: 'owner@example.com',
          membership: base.viewerMembership,
          snapshot: currentSnap,
        })),
        retryRatingRecalculation: retryMock,
      },
    );

    render(<App repository={liveRepo} envConfig={CONFIGURED_ENV} />);

    // Open Admin Tools to access rating recalculation
    await waitFor(() => {
      expect(screen.getByTestId('toggle-admin-tools-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-stale_or_failed')).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', {
      name: /Retry Recalculation/i,
    });

    // 1st click: fails visibly
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(
        /Database lock timeout during retry/i,
      );
    });
    expect(screen.getByTestId('status-badge-stale_or_failed')).toBeTruthy();

    // 2nd click: succeeds and updates banner to Current
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(screen.getByTestId('status-badge-current')).toBeTruthy();
    });
  });

  it('computes competition ranks from full NUMERIC(10,4) precision, displays Guest and Provisional badges, separates bench attendance from session standings, and always defaults Leaderboard tab to All-Time (RATE-06, ATT-01, DEC-009, DEC-010)', async () => {
    const base = buildDeterministicDemoSnapshot();
    // Customize two players to have identical rounded display ratings (1012) but distinct NUMERIC(10,4) ratings (1012.3400 vs 1012.1100)
    // and two players with an exact internal rating tie (1000.0000 and 1000.0000)
    const customSnapshots = base.ratingSnapshots.map((s) => {
      if (s.player_id === DEMO_PLAYER_IDS.aaron) {
        return { ...s, rating: '1012.3400', matches_played: 4, wins: 4, losses: 0, is_provisional: false };
      }
      if (s.player_id === DEMO_PLAYER_IDS.chong) {
        return { ...s, rating: '1012.1100', matches_played: 3, wins: 2, losses: 1, is_provisional: false };
      }
      if (s.player_id === DEMO_PLAYER_IDS.brenda) {
        return { ...s, rating: '1000.0000', matches_played: 3, wins: 1, losses: 2, is_provisional: false };
      }
      if (s.player_id === DEMO_PLAYER_IDS.diana) {
        return { ...s, rating: '1000.0000', matches_played: 3, wins: 1, losses: 2, is_provisional: false };
      }
      return s;
    });

    const repo = createDemoTrackerRepository({
      ...base,
      ratingSnapshots: customSnapshots,
    });

    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Navigate to Leaderboard tab via Primary navigation
    const primaryNav = screen.getByRole('navigation', {
      name: /Primary navigation/i,
    });
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Leaderboard/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-all-time-panel')).toBeTruthy();
    });

    // Verify Aaron (1012.3400 -> 1012) is #1 and Chong (1012.1100 -> 1012) is #2 (NOT tied despite identical rounded display!)
    const aaronRow = screen.getByTestId(
      `leaderboard-row-${DEMO_PLAYER_IDS.aaron}`,
    );
    const chongRow = screen.getByTestId(
      `leaderboard-row-${DEMO_PLAYER_IDS.chong}`,
    );
    expect(within(aaronRow).getByText('#1')).toBeTruthy();
    expect(within(aaronRow).getByText('1012')).toBeTruthy();
    expect(within(chongRow).getByText('#2')).toBeTruthy();
    expect(within(chongRow).getByText('1012')).toBeTruthy();

    // Verify Brenda and Diana (both 1000.0000) share exact tied rank
    const brendaRow = screen.getByTestId(
      `leaderboard-row-${DEMO_PLAYER_IDS.brenda}`,
    );
    const dianaRow = screen.getByTestId(
      `leaderboard-row-${DEMO_PLAYER_IDS.diana}`,
    );
    expect(within(brendaRow).getByText(/\(T\)/)).toBeTruthy();
    expect(within(dianaRow).getByText(/\(T\)/)).toBeTruthy();

    // Verify Guest badge on Ethan and Provisional badge on Farah (<3 matches)
    const ethanRow = screen.getByTestId(
      `leaderboard-row-${DEMO_PLAYER_IDS.ethanGuest}`,
    );
    const farahRow = screen.getByTestId(
      `leaderboard-row-${DEMO_PLAYER_IDS.farahProvisional}`,
    );
    expect(within(ethanRow).getByTestId('status-badge-guest')).toBeTruthy();
    expect(
      within(farahRow).getByTestId('status-badge-provisional'),
    ).toBeTruthy();

    // Switch to Current / Session Standings filter
    fireEvent.click(
      screen.getByRole('button', { name: /Current \/ Session Standings/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-session-panel')).toBeTruthy();
    });

    // Gavin Yap attended Session 2 with 0 matches played -> must appear in bench attendance, NOT in played standings rows
    expect(
      screen.queryByTestId(`session-standing-row-${DEMO_PLAYER_IDS.gavinBench}`),
    ).toBeNull();
    const benchSection = screen.getByTestId('session-bench-attendance');
    expect(within(benchSection).getByText(/Gavin Yap/i)).toBeTruthy();

    // Navigate to Sessions tab, then back to Leaderboard -> must reset to All-Time default
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Sessions/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Leaderboard/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-all-time-panel')).toBeTruthy();
    });
  });

  it('supports Session Detail match history, Profile match filtering, and Viewer-without-player-profile notice (ID-01, DIS-01, DEC-036, DEC-052)', async () => {
    const base = buildDeterministicDemoSnapshot();
    // Simulate an approved Viewer account with linked_player_id = null (ID-01)
    const viewerOnlySnapshot: GroupReadSnapshot = {
      ...base,
      isDemoMode: false,
      viewerMembership: {
        ...base.viewerMembership,
        role: 'member',
        linked_player_id: null,
        profile_link_status: 'unlinked',
      },
    };

    const repo = createMockRepository({
      status: 'approved',
      userId: base.viewerMembership.user_id,
      userEmail: 'viewer@example.com',
      membership: viewerOnlySnapshot.viewerMembership,
      snapshot: viewerOnlySnapshot,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', {
      name: /Primary navigation/i,
    });

    // Open Sessions tab and expand rating breakdown on Match m3
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Sessions/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });

    const m3Card = screen.getByTestId(`match-card-${DEMO_MATCH_IDS.m3}`);
    expect(
      within(m3Card).queryByRole('button', {
        name: /Show Rating Breakdown/i,
      }),
    ).toBeNull();

    // Verify disputed match badge on m4Disputed and voided badge on m5Voided
    const m4Card = screen.getByTestId(
      `match-card-${DEMO_MATCH_IDS.m4Disputed}`,
    );
    expect(within(m4Card).getByTestId('status-badge-disputed')).toBeTruthy();
    const m5Card = screen.getByTestId(`match-card-${DEMO_MATCH_IDS.m5Voided}`);
    expect(within(m5Card).getByTestId('status-badge-voided')).toBeTruthy();

    // Open Profile tab -> verify Viewer-without-linked-profile notice (ID-01)
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Profile/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });
    expect(
      screen.getByTestId('viewer-unlinked-profile-notice'),
    ).toBeTruthy();

    // Select Ethan (Guest) and filter match history by Disputed Only
    fireEvent.change(screen.getByLabelText(/Player:/i), {
      target: { value: DEMO_PLAYER_IDS.ethanGuest },
    });
    expect(screen.getByTestId('selected-player-summary').textContent).toMatch(
      /Ethan \(Drop-in\)/i,
    );

    fireEvent.change(screen.getByLabelText(/Status:/i), {
      target: { value: 'disputed' },
    });
    expect(screen.getByText(/Match History \(1\)/i)).toBeTruthy();
  });
});
