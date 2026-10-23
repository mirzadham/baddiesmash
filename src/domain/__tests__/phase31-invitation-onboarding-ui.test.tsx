// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import {
  captureAndStripInviteContextFromUrl,
  resetCapturedInviteTokenForTesting,
} from '../../lib/inviteToken.ts';
import {
  buildDeterministicDemoAdminGovernanceSnapshot,
  buildDeterministicDemoSnapshot,
  DEMO_GROUP_ID,
  DEMO_MEMBERSHIP_IDS,
  type GroupReadSnapshot,
} from '../../services/demoData.ts';
import {
  createDemoTrackerRepository,
  type TrackerRepository,
  type ViewerGateState,
} from '../../services/trackerRepository.ts';

const CONFIGURED_ENV = {
  status: 'configured' as const,
  supabaseUrl: 'https://example-project.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig',
  diagnosticMessage: null,
};

function createLiveMockRepository(
  initialGateState: ViewerGateState,
  overrides: Partial<TrackerRepository> = {},
): TrackerRepository {
  const baseDemo = createDemoTrackerRepository();
  const defaultAdminSnap = buildDeterministicDemoAdminGovernanceSnapshot();

  return {
    ...baseDemo,
    isDemoMode: false,
    loadViewerGateState: vi.fn().mockResolvedValue(initialGateState),
    loadAdminGovernanceSnapshot: vi.fn().mockResolvedValue(defaultAdminSnap),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithEmailPassword: vi.fn().mockResolvedValue(undefined),
    signUpWithEmailPassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    bootstrapInitialGroup: vi.fn().mockResolvedValue({
      group_id: DEMO_GROUP_ID,
      membership_id: DEMO_MEMBERSHIP_IDS.ownerAaron,
      player_id: '00000000-0000-4000-8000-000000000101',
      idempotent_retry: false,
    }),
    redeemGroupInvitation: vi.fn().mockResolvedValue({
      membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
      group_id: DEMO_GROUP_ID,
      status: 'pending_approval',
    }),
    ...overrides,
  };
}

describe('Phase 31 — Single-Use Invitation Link Onboarding & Direct Password Setup', () => {
  beforeEach(() => {
    resetCapturedInviteTokenForTesting();
  });

  afterEach(() => {
    cleanup();
    resetCapturedInviteTokenForTesting();
    vi.restoreAllMocks();
  });

  it('captures both invite token and email from URL and strips them from the visible address bar (DEC-074)', () => {
    const replaceStateSpy = vi.fn();
    const fakeHistory = { state: null, replaceState: replaceStateSpy };
    const fakeLocation = {
      search: '?invite=testrawtoken1234567890abcdef&email=newplayer%40court.org&utm=test',
      pathname: '/onboarding',
      hash: '',
    };

    const result = captureAndStripInviteContextFromUrl(fakeLocation, fakeHistory);

    expect(result.token).toBe('testrawtoken1234567890abcdef');
    expect(result.email).toBe('newplayer@court.org');
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/onboarding?utm=test');
  });

  it('renders the dedicated "Accept Invitation" card with pre-filled email when invite token is detected', async () => {
    const rawSecret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const invitedEmail = 'invitedmember@example.com';

    // Simulate arriving with invite and email query params
    window.history.replaceState(
      null,
      '',
      `/?invite=${rawSecret}&email=${encodeURIComponent(invitedEmail)}`,
    );

    const unauthGateState: ViewerGateState = { status: 'unauthenticated' };
    const repo = createLiveMockRepository(unauthGateState);

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-invitation-setup')).toBeTruthy();
    });

    expect(screen.getByText(/Accept Invitation/i)).toBeTruthy();
    expect(screen.getByTestId('invite-url-captured-notice')).toBeTruthy();

    // Email should be pre-filled with the invited email
    const emailInput = screen.getByLabelText(/Invited Email Address/i) as HTMLInputElement;
    expect(emailInput.value).toBe(invitedEmail);

    // Form inputs for creating password and confirming password should be present
    expect(screen.getByLabelText(/^Create Password/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Confirm Password/i)).toBeTruthy();
    expect(screen.getByTestId('create-account-and-join-btn')).toBeTruthy();
  });

  it('enforces password confirmation and minimum length validation before calling repository', async () => {
    const rawSecret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    window.history.replaceState(
      null,
      '',
      `/?invite=${rawSecret}&email=player@example.com`,
    );

    const unauthGateState: ViewerGateState = { status: 'unauthenticated' };
    const signUpSpy = vi.fn();
    const repo = createLiveMockRepository(unauthGateState, {
      signUpWithEmailPassword: signUpSpy,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-invitation-setup')).toBeTruthy();
    });

    // 1. Password too short (< 6 chars)
    fireEvent.change(screen.getByLabelText(/^Create Password/i), {
      target: { value: '123' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByTestId('create-account-and-join-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-action-error').textContent).toMatch(
        /at least 6 characters/i,
      );
    });
    expect(signUpSpy).not.toHaveBeenCalled();

    // 2. Passwords do not match
    fireEvent.change(screen.getByLabelText(/^Create Password/i), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
      target: { value: 'secret456' },
    });
    fireEvent.click(screen.getByTestId('create-account-and-join-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-action-error').textContent).toMatch(
        /passwords do not match/i,
      );
    });
    expect(signUpSpy).not.toHaveBeenCalled();
  });

  it('successfully creates account, automatically redeems invitation, and lands on pending approval (DEC-074)', async () => {
    const rawSecret = 'c1c2c3c4c5c60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    window.history.replaceState(
      null,
      '',
      `/?invite=${rawSecret}&email=sarah%40court.org`,
    );

    let currentGateState: ViewerGateState = { status: 'unauthenticated' };
    const signUpSpy = vi.fn().mockImplementation(async () => {
      // Upon signup, user is registered in Supabase
    });
    const redeemSpy = vi.fn().mockImplementation(async () => {
      // Upon redemption, status becomes pending approval
      currentGateState = {
        status: 'pending_approval',
        userId: '00000000-0000-4000-8000-000000000009',
        userEmail: 'sarah@court.org',
        membership: {
          id: DEMO_MEMBERSHIP_IDS.pendingHannah,
          group_id: DEMO_GROUP_ID,
          user_id: '00000000-0000-4000-8000-000000000009',
          role: 'member',
          status: 'pending_approval',
          linked_player_id: null,
          requested_player_id: null,
          requested_new_player_name: 'Sarah Lee',
          profile_link_status: 'pending_link_approval',
          approved_by_user_id: null,
          approved_at: null,
          created_at: '2026-10-23T14:00:00Z',
          updated_at: '2026-10-23T14:00:00Z',
        },
      };
      return {
        membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
        group_id: DEMO_GROUP_ID,
        status: 'pending_approval' as const,
      };
    });

    const repo = createLiveMockRepository(currentGateState, {
      loadViewerGateState: vi.fn(async () => currentGateState),
      signUpWithEmailPassword: signUpSpy,
      redeemGroupInvitation: redeemSpy,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-invitation-setup')).toBeTruthy();
    });

    // Enter matching valid password
    fireEvent.change(screen.getByLabelText(/^Create Password/i), {
      target: { value: 'badminton2026' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
      target: { value: 'badminton2026' },
    });

    // Request new player profile
    fireEvent.click(
      screen.getByLabelText(/Request a new player profile$/i),
    );
    fireEvent.change(
      screen.getByLabelText(/Requested New Player Display Name/i),
      {
        target: { value: 'Sarah Lee' },
      },
    );

    // Submit form
    fireEvent.click(screen.getByTestId('create-account-and-join-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('gate-pending-approval')).toBeTruthy();
    });

    // Verify signUp was called with email and password
    expect(signUpSpy).toHaveBeenCalledWith('sarah@court.org', 'badminton2026');

    // Verify invitation redemption was called with the captured token and requested player name
    expect(redeemSpy).toHaveBeenCalledWith({
      rawToken: rawSecret,
      requestedPlayerId: null,
      requestedNewPlayerName: 'Sarah Lee',
    });

    // Verify user is in pending approval screen awaiting admin action
    expect(screen.getByText(/Membership Pending Approval/i)).toBeTruthy();
  });

  it('allows toggling between "Accept Invitation & Set Password" and "Sign in with existing password"', async () => {
    const rawSecret = 'd1d2c3c4c5c60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    window.history.replaceState(
      null,
      '',
      `/?invite=${rawSecret}&email=existing%40court.org`,
    );

    const unauthGateState: ViewerGateState = { status: 'unauthenticated' };
    const repo = createLiveMockRepository(unauthGateState);

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-invitation-setup')).toBeTruthy();
    });

    // Click "Already have an account? Sign in with existing password"
    fireEvent.click(screen.getByTestId('toggle-to-signin-btn'));

    // Should now render standard sign-in form
    await waitFor(() => {
      expect(screen.getByTestId('gate-unauthenticated')).toBeTruthy();
      expect(screen.getByText(/Member Access/i)).toBeTruthy();
      expect(
        screen.getByRole('button', { name: /Sign In with Email/i }),
      ).toBeTruthy();
    });

    // Can toggle back to setup
    fireEvent.click(screen.getByTestId('toggle-to-setup-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('gate-invitation-setup')).toBeTruthy();
    });
  });

  it('displays updated choice copy and submit button text, and automatically pre-selects requested new player profile in Admin Governance', async () => {
    // 1. Check invitation setup copy
    const rawSecret = 'e1e2c3c4c5c60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    window.history.replaceState(
      null,
      '',
      `/?invite=${rawSecret}&email=newuser%40court.org`,
    );

    const unauthRepo = createLiveMockRepository({ status: 'unauthenticated' });
    const { unmount } = render(<App repository={unauthRepo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-invitation-setup')).toBeTruthy();
    });

    expect(screen.getByText('Let Admin choose during approval')).toBeTruthy();
    expect(screen.getByText('Request a new player profile')).toBeTruthy();
    expect(
      screen.getByText('Link an existing player profile ID provided by Admin'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Set Password & Request Access/i }),
    ).toBeTruthy();

    unmount();

    // 2. Check Admin Governance pre-selection when pending membership has requested_new_player_name
    const baseSnap = buildDeterministicDemoSnapshot();
    const liveSnap: GroupReadSnapshot = { ...baseSnap, isDemoMode: false };
    const decideSpy = vi.fn().mockResolvedValue({
      membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
      status: 'approved',
      linked_player_id: null,
    });

    const baseAdminSnap = buildDeterministicDemoAdminGovernanceSnapshot();
    // In baseAdminSnap, pendingHannah has requested_new_player_name: 'Hannah Tan'
    const adminRepo = createLiveMockRepository(
      {
        status: 'approved',
        userId: liveSnap.viewerMembership.user_id,
        userEmail: 'aaron.owner@example.com',
        membership: liveSnap.viewerMembership,
        snapshot: liveSnap,
      },
      {
        loadAdminGovernanceSnapshot: vi.fn().mockResolvedValue(baseAdminSnap),
        decideMembershipRequest: decideSpy,
      },
    );

    render(<App repository={adminRepo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(
        screen.getByTestId(
          `pending-membership-card-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
        ),
      ).toBeTruthy();
    });

    // Check that Option B (Create new player profile) is automatically checked
    const radioCreateNew = screen.getByTestId(
      `radio-create-new-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
    ) as HTMLInputElement;
    expect(radioCreateNew.checked).toBe(true);

    // Check that new player name input has 'Hannah Tan'
    const nameInput = screen.getByLabelText(
      /New player display name for hannah@example.com/i,
    ) as HTMLInputElement;
    expect(nameInput.value).toBe('Hannah Tan');

    // Admin can click Approve directly without manually re-selecting Option B
    const approveBtn = screen.getByTestId(
      `approve-membership-btn-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
    );
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith({
        membershipId: DEMO_MEMBERSHIP_IDS.pendingHannah,
        decision: 'approve',
        reason: 'Approved by group administrator',
        linkedPlayerId: null,
        createNewPlayer: true,
        newPlayerDisplayName: 'Hannah Tan',
      });
    });
  });
});
