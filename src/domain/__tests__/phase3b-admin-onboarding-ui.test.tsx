// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import {
  captureAndStripInviteTokenFromUrl,
  resetCapturedInviteTokenForTesting,
} from '../../lib/inviteToken.ts';
import {
  buildDeterministicDemoAdminGovernanceSnapshot,
  buildDeterministicDemoSnapshot,
  DEMO_GROUP_ID,
  DEMO_INVITATION_IDS,
  DEMO_MATCH_IDS,
  DEMO_MEMBERSHIP_IDS,
  DEMO_PLAYER_IDS,
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
    signOut: vi.fn().mockResolvedValue(undefined),
    bootstrapInitialGroup: vi.fn().mockResolvedValue({
      group_id: DEMO_GROUP_ID,
      membership_id: DEMO_MEMBERSHIP_IDS.ownerAaron,
      player_id: DEMO_PLAYER_IDS.aaron,
      idempotent_retry: false,
    }),
    redeemGroupInvitation: vi.fn().mockResolvedValue({
      membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
      group_id: DEMO_GROUP_ID,
      status: 'pending_approval',
    }),
    issueGroupInvitation: vi.fn().mockResolvedValue({
      invitation_id: '00000000-0000-4000-8000-000000000699',
      raw_token:
        'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      expires_at: '2026-10-25T12:00:00Z',
    }),
    revokeGroupInvitation: vi.fn().mockResolvedValue(undefined),
    decideMembershipRequest: vi.fn().mockResolvedValue({
      membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
      status: 'approved',
      linked_player_id: null,
    }),
    updateMembershipRoleOrStatus: vi.fn().mockResolvedValue(undefined),
    linkMemberPlayerProfile: vi.fn().mockResolvedValue(undefined),
    createPlayerProfile: vi
      .fn()
      .mockResolvedValue('00000000-0000-4000-8000-000000000299'),
    setPlayerActiveStatus: vi.fn().mockResolvedValue(undefined),
    previewGuestIntoPlayerMerge: vi.fn().mockResolvedValue({
      group_id: DEMO_GROUP_ID,
      source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
      source_guest_display_name: 'Ethan (Drop-in)',
      target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
      target_permanent_display_name: 'Gavin Yap',
      can_merge: true,
      conflicting_match_ids: [],
      affected_match_count: 3,
      affected_session_attendance_count: 2,
      overlapping_attendance_session_count: 1,
    }),
    mergeGuestIntoPlayer: vi.fn().mockResolvedValue({
      source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
      target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
      deduplicated_attendance_count: 1,
      reattributed_attendance_count: 1,
      reattributed_match_count: 3,
      published_rating_version_id: '00000000-0000-4000-8000-000000000955',
    }),
    transferGroupOwnership: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  resetCapturedInviteTokenForTesting();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('Phase 3 Checkpoint 3B — Invitation Redemption, Bootstrap & Admin/Owner Governance UI', () => {
  it('captures ?invite= token from URL into volatile memory, strips it from the visible URL, never persists it to storage, and transitions to pending_approval without exposing group data (AUTH-01, AUTH-02, Condition 2)', async () => {
    const rawSecret =
      'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';
    window.history.replaceState(
      null,
      '',
      `/?invite=${rawSecret}&utm_source=manual#onboarding`,
    );

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    let gateState: ViewerGateState = {
      status: 'no_membership',
      userId: '00000000-0000-4000-8000-000000000004',
      userEmail: 'hannah@example.com',
      emailVerified: true,
    };

    const redeemSpy = vi.fn(async () => {
      gateState = {
        status: 'pending_approval',
        userId: '00000000-0000-4000-8000-000000000004',
        userEmail: 'hannah@example.com',
        membership: {
          id: DEMO_MEMBERSHIP_IDS.pendingHannah,
          group_id: DEMO_GROUP_ID,
          user_id: '00000000-0000-4000-8000-000000000004',
          role: 'member',
          status: 'pending_approval',
          linked_player_id: null,
          requested_player_id: null,
          requested_new_player_name: 'Hannah Tan',
          profile_link_status: 'pending_link_approval',
          approved_by_user_id: null,
          approved_at: null,
          created_at: '2026-10-18T11:00:00Z',
          updated_at: '2026-10-18T11:00:00Z',
        },
      };
      return {
        membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
        group_id: DEMO_GROUP_ID,
        status: 'pending_approval' as const,
      };
    });

    const repo = createLiveMockRepository(gateState, {
      loadViewerGateState: vi.fn(async () => gateState),
      redeemGroupInvitation: redeemSpy,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-no-membership')).toBeTruthy();
    });

    // Verify URL was stripped of `invite` while preserving other query/hash parts
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '/?utm_source=manual#onboarding',
    );
    expect(window.location.search).toBe('?utm_source=manual');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    // Pre-filled notice is shown
    expect(screen.getByTestId('invite-url-prefilled-notice')).toBeTruthy();

    // Select "Request a new player profile" and enter "Hannah Tan"
    fireEvent.click(
      screen.getByLabelText(/Request a new player profile$/i),
    );
    fireEvent.change(
      screen.getByLabelText(/Requested New Player Display Name/i),
      {
        target: { value: 'Hannah Tan' },
      },
    );

    fireEvent.click(screen.getByTestId('redeem-invitation-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('gate-pending-approval')).toBeTruthy();
    });

    expect(redeemSpy).toHaveBeenCalledWith({
      rawToken: rawSecret,
      requestedPlayerId: null,
      requestedNewPlayerName: 'Hannah Tan',
    });

    // Ensure group data is still never exposed in pending_approval state
    expect(screen.queryByTestId('view-home')).toBeNull();
    expect(screen.queryByText('KL Badminton Regulars (Demo)')).toBeNull();
  });

  it('handles invalid, expired, revoked, already-used, and email-mismatch invitation redemption failures with sanitized non-sensitive messages (Condition 2)', async () => {
    const rawSecret =
      'b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f99';

    const gateState: ViewerGateState = {
      status: 'no_membership',
      userId: '00000000-0000-4000-8000-000000000004',
      userEmail: 'wrong@example.com',
      emailVerified: true,
    };

    const failureCases = [
      {
        serverError: `invalid invitation token: ${rawSecret}`,
        expectedPattern: /Invalid invitation token/i,
      },
      {
        serverError: 'invitation has been revoked',
        expectedPattern: /revoked by a group Admin or Owner/i,
      },
      {
        serverError: 'invitation has already been used',
        expectedPattern: /single-use invitation has already been redeemed/i,
      },
      {
        serverError: 'invitation has expired',
        expectedPattern: /invitation has expired/i,
      },
      {
        serverError:
          'authenticated account email does not match the invitation email',
        expectedPattern: /Email mismatch/i,
      },
    ];

    const redeemSpy = vi.fn();
    const repo = createLiveMockRepository(gateState, {
      redeemGroupInvitation: redeemSpy,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-no-membership')).toBeTruthy();
    });

    const tokenInput = screen.getByLabelText(/Single-Use Invitation Token/i);
    fireEvent.change(tokenInput, { target: { value: rawSecret } });

    for (const testCase of failureCases) {
      redeemSpy.mockRejectedValueOnce(new Error(testCase.serverError));
      fireEvent.click(screen.getByTestId('redeem-invitation-submit-btn'));

      await waitFor(() => {
        const alertEl = screen.getByTestId('redeem-invitation-error');
        expect(alertEl.textContent).toMatch(testCase.expectedPattern);
        // Must NEVER echo the raw secret token in the error message
        expect(alertEl.textContent).not.toContain(rawSecret);
      });

      // User remains on gate-no-membership
      expect(screen.getByTestId('gate-no-membership')).toBeTruthy();
    }
  });

  it('enforces first-run bootstrap error handling for repeated initialization and transitions to approved Owner on initial bootstrap success (DEC-012, Condition 2)', async () => {
    const baseSnap = buildDeterministicDemoSnapshot();
    let gateState: ViewerGateState = {
      status: 'no_membership',
      userId: baseSnap.viewerMembership.user_id,
      userEmail: 'owner@example.com',
      emailVerified: true,
    };

    const bootstrapSpy = vi
      .fn()
      // First attempt simulates repeated bootstrap rejection from PostgreSQL
      .mockRejectedValueOnce(
        new Error(
          'initial group bootstrap has already been completed and is now disabled',
        ),
      )
      // Second attempt simulates initial bootstrap success
      .mockImplementationOnce(async () => {
        gateState = {
          status: 'approved',
          userId: baseSnap.viewerMembership.user_id,
          userEmail: 'owner@example.com',
          membership: baseSnap.viewerMembership,
          snapshot: { ...baseSnap, isDemoMode: false },
        };
        return {
          group_id: DEMO_GROUP_ID,
          membership_id: DEMO_MEMBERSHIP_IDS.ownerAaron,
          player_id: DEMO_PLAYER_IDS.aaron,
          idempotent_retry: false,
        };
      });

    const repo = createLiveMockRepository(gateState, {
      loadViewerGateState: vi.fn(async () => gateState),
      bootstrapInitialGroup: bootstrapSpy,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('gate-no-membership')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-bootstrap-section-btn'));
    expect(screen.getByTestId('bootstrap-group-form')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Group Name/i), {
      target: { value: 'KL Badminton Regulars' },
    });
    fireEvent.change(screen.getByLabelText(/Group Slug/i), {
      target: { value: 'kl-badminton-regulars' },
    });
    fireEvent.change(
      screen.getByLabelText(/Owner Player Profile Display Name/i),
      {
        target: { value: 'Aaron Tan' },
      },
    );

    // 1. Rejected when group already bootstrapped
    fireEvent.click(screen.getByTestId('bootstrap-group-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('bootstrap-group-error').textContent).toMatch(
        /Initial group bootstrap has already been completed/i,
      );
    });
    expect(screen.queryByTestId('view-home')).toBeNull();

    // 2. Succeeds on initial run and transitions to approved Home view
    fireEvent.click(screen.getByTestId('bootstrap-group-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });
    expect(bootstrapSpy).toHaveBeenCalledWith({
      groupName: 'KL Badminton Regulars',
      groupSlug: 'kl-badminton-regulars',
      ownerDisplayName: 'Aaron Tan',
    });
  });

  it('presents one-time raw invitation token ONLY immediately after confirmed issuance, never stores or displays raw tokens in the metadata list, and handles revocation (AUTH-02, PRIV-01, Condition 3)', async () => {
    const baseSnap = buildDeterministicDemoSnapshot();
    const liveSnap: GroupReadSnapshot = { ...baseSnap, isDemoMode: false };
    const oneTimeToken =
      '99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa';

    const issueSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('invalid invited email address'))
      .mockResolvedValueOnce({
        invitation_id: '00000000-0000-4000-8000-000000000688',
        raw_token: oneTimeToken,
        expires_at: '2026-10-25T10:00:00Z',
      });

    const revokeSpy = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('only pending invitations can be revoked'),
      )
      .mockResolvedValueOnce(undefined);

    const repo = createLiveMockRepository(
      {
        status: 'approved',
        userId: liveSnap.viewerMembership.user_id,
        userEmail: 'aaron.owner@example.com',
        membership: liveSnap.viewerMembership,
        snapshot: liveSnap,
      },
      {
        issueGroupInvitation: issueSpy,
        revokeGroupInvitation: revokeSpy,
      },
    );

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Open Admin Governance panel
    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-governance-panel')).toBeTruthy();
    });

    // Verify metadata list is rendered and does NOT contain any 64-char hex token
    const invSection = screen.getByTestId('admin-section-invitations');
    expect(invSection.textContent).not.toMatch(/\b[0-9a-f]{64}\b/i);

    // 1. Failed issuance surfaces error and never shows one-time token box
    fireEvent.change(within(invSection).getByLabelText(/Invited Account Email/i), {
      target: { value: 'invitee@example.com' },
    });
    fireEvent.click(screen.getByTestId('issue-invitation-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-action-error').textContent).toMatch(
        /invalid invited email address/i,
      );
    });
    expect(screen.queryByTestId('one-time-invitation-secret-box')).toBeNull();

    // 2. Confirmed issuance displays one-time raw token and shareable link
    fireEvent.change(within(invSection).getByLabelText(/Invited Account Email/i), {
      target: { value: 'invitee@example.com' },
    });
    fireEvent.click(screen.getByTestId('issue-invitation-submit-btn'));

    await waitFor(() => {
      expect(
        screen.getByTestId('one-time-invitation-secret-box'),
      ).toBeTruthy();
    });
    expect(screen.getByTestId('one-time-raw-token').textContent).toBe(
      oneTimeToken,
    );
    expect(screen.getByTestId('one-time-invite-link').textContent).toContain(
      `/?invite=${oneTimeToken}`,
    );

    // Dismissing the one-time secret removes the raw token from the DOM permanently
    fireEvent.click(screen.getByTestId('dismiss-one-time-token-btn'));
    expect(screen.queryByTestId('one-time-invitation-secret-box')).toBeNull();
    expect(screen.getByTestId('admin-governance-panel').textContent).not.toContain(
      oneTimeToken,
    );

    // 3. Revocation requires reason >= 3 chars, surfaces failure, and succeeds on retry
    const pendingInvRow = screen.getByTestId(
      `invitation-row-${DEMO_INVITATION_IDS.pendingMember}`,
    );
    const reasonInput = within(pendingInvRow).getByLabelText(
      /Revocation reason for newplayer@example.com/i,
    );
    fireEvent.change(reasonInput, { target: { value: 'Sent to wrong email' } });

    // First click fails on server
    fireEvent.click(
      screen.getByTestId(
        `revoke-invitation-btn-${DEMO_INVITATION_IDS.pendingMember}`,
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId('admin-action-error').textContent).toMatch(
        /only pending invitations can be revoked/i,
      );
    });

    // Second click succeeds
    fireEvent.click(
      screen.getByTestId(
        `revoke-invitation-btn-${DEMO_INVITATION_IDS.pendingMember}`,
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId('admin-action-success').textContent).toMatch(
        /Invitation revoked/i,
      );
    });
    expect(revokeSpy).toHaveBeenCalledWith({
      invitationId: DEMO_INVITATION_IDS.pendingMember,
      reason: 'Sent to wrong email',
    });
  });

  it('requires an explicit choice among the 3 player-linking modes when approving a pending membership request and never auto-links by display name (AUTH-01, ID-01, ID-02, Condition 3)', async () => {
    const baseSnap = buildDeterministicDemoSnapshot();
    const liveSnap: GroupReadSnapshot = { ...baseSnap, isDemoMode: false };
    const decideSpy = vi.fn().mockResolvedValue({
      membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
      status: 'approved',
      linked_player_id: null,
    });

    const baseAdminSnap = buildDeterministicDemoAdminGovernanceSnapshot();
    const unselectedAdminSnap = {
      ...baseAdminSnap,
      memberships: baseAdminSnap.memberships.map((m) =>
        m.membership_id === DEMO_MEMBERSHIP_IDS.pendingHannah
          ? {
              ...m,
              requested_new_player_name: null,
              requested_player_id: null,
            }
          : m,
      ),
    };

    const repo = createLiveMockRepository(
      {
        status: 'approved',
        userId: liveSnap.viewerMembership.user_id,
        userEmail: 'aaron.owner@example.com',
        membership: liveSnap.viewerMembership,
        snapshot: liveSnap,
      },
      {
        loadAdminGovernanceSnapshot: vi.fn().mockResolvedValue(unselectedAdminSnap),
        decideMembershipRequest: decideSpy,
      },
    );

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

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

    const approveBtn = screen.getByTestId(
      `approve-membership-btn-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
    );

    // 1. Clicking Approve without selecting a radio option is blocked
    fireEvent.click(approveBtn);
    expect(screen.getByTestId('admin-action-error').textContent).toMatch(
      /explicitly select a player-linking choice/i,
    );
    expect(decideSpy).not.toHaveBeenCalled();

    // 2. Option A: Link to an existing unlinked player UUID (`farahProvisional`)
    fireEvent.click(
      screen.getByTestId(
        `radio-link-existing-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
      ),
    );
    fireEvent.change(
      screen.getByLabelText(/Select existing player UUID for hannah@example.com/i),
      { target: { value: DEMO_PLAYER_IDS.farahProvisional } },
    );
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith({
        membershipId: DEMO_MEMBERSHIP_IDS.pendingHannah,
        decision: 'approve',
        reason: 'Approved by group administrator',
        linkedPlayerId: DEMO_PLAYER_IDS.farahProvisional,
        createNewPlayer: false,
        newPlayerDisplayName: null,
      });
      expect((approveBtn as HTMLButtonElement).disabled).toBe(false);
    });

    // 3. Option B: Create & link a new permanent player profile
    fireEvent.click(
      screen.getByTestId(
        `radio-create-new-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
      ),
    );
    const newNameInput = screen.getByLabelText(
      /New player display name for hannah@example.com/i,
    );
    fireEvent.change(newNameInput, { target: { value: 'Hannah Tan (New)' } });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith({
        membershipId: DEMO_MEMBERSHIP_IDS.pendingHannah,
        decision: 'approve',
        reason: 'Approved by group administrator',
        linkedPlayerId: null,
        createNewPlayer: true,
        newPlayerDisplayName: 'Hannah Tan (New)',
      });
      expect((approveBtn as HTMLButtonElement).disabled).toBe(false);
    });

    // 4. Option C: Approve as Viewer without a linked player profile (ID-01)
    fireEvent.click(
      screen.getByTestId(
        `radio-viewer-unlinked-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
      ),
    );
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith({
        membershipId: DEMO_MEMBERSHIP_IDS.pendingHannah,
        decision: 'approve',
        reason: 'Approved by group administrator',
        linkedPlayerId: null,
        createNewPlayer: false,
        newPlayerDisplayName: null,
      });
      expect((approveBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('enforces server-side authorization failures for Admin role promotion and Owner-only ownership transfer, and warns on duplicate player display names without auto-merging (AUTH-03, ID-02, Condition 3)', async () => {
    const baseSnap = buildDeterministicDemoSnapshot();
    // Sign in as Admin (`brenda`) rather than Owner
    const adminSnap: GroupReadSnapshot = {
      ...baseSnap,
      isDemoMode: false,
      viewerMembership: {
        ...baseSnap.viewerMembership,
        id: DEMO_MEMBERSHIP_IDS.adminBrenda,
        role: 'admin',
        linked_player_id: DEMO_PLAYER_IDS.brenda,
      },
    };

    const updateRoleSpy = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('only the group owner may appoint, modify, or demote admins'),
      );
    const createPlayerSpy = vi
      .fn()
      .mockResolvedValue('00000000-0000-4000-8000-000000000288');

    const repo = createLiveMockRepository(
      {
        status: 'approved',
        userId: '00000000-0000-4000-8000-000000000002',
        userEmail: 'brenda.admin@example.com',
        membership: adminSnap.viewerMembership,
        snapshot: adminSnap,
      },
      {
        updateMembershipRoleOrStatus: updateRoleSpy,
        createPlayerProfile: createPlayerSpy,
      },
    );

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-governance-panel')).toBeTruthy();
    });

    // 1. Ownership transfer is disabled for Admin (`role: admin`) with owner-only explanation
    expect(
      screen.getByTestId('ownership-transfer-owner-only-note'),
    ).toBeTruthy();
    expect(
      (
        screen.getByTestId(
          'transfer-ownership-submit-btn',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    // 2. Non-owner Admin attempting to promote Chong to `admin` surfaces server authorization failure
    const chongRow = screen.getByTestId(
      `member-directory-row-${DEMO_MEMBERSHIP_IDS.recorderChong}`,
    );
    fireEvent.change(
      within(chongRow).getByLabelText(/Role for chong.recorder@example.com/i),
      { target: { value: 'admin' } },
    );
    fireEvent.change(
      within(chongRow).getByLabelText(
        /Role update reason for chong.recorder@example.com/i,
      ),
      { target: { value: 'Promote to admin' } },
    );
    fireEvent.click(
      screen.getByTestId(
        `update-member-btn-${DEMO_MEMBERSHIP_IDS.recorderChong}`,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-action-error').textContent).toMatch(
        /only the group owner may appoint, modify, or demote admins/i,
      );
    });

    // 3. Duplicate display name warning when creating a player with name "Aaron Tan"
    const playerSection = screen.getByTestId('admin-section-players');
    fireEvent.change(
      within(playerSection).getByLabelText(/New Player Display Name/i),
      { target: { value: 'Aaron Tan' } },
    );
    expect(screen.getByTestId('duplicate-player-name-warning')).toBeTruthy();

    fireEvent.click(screen.getByTestId('create-player-submit-btn'));
    await waitFor(() => {
      expect(createPlayerSpy).toHaveBeenCalledWith({
        groupId: DEMO_GROUP_ID,
        displayName: 'Aaron Tan',
        isGuest: false,
      });
    });
    expect(screen.getByTestId('admin-action-success').textContent).toMatch(
      /Created Permanent Player "Aaron Tan"/i,
    );
  });

  it('blocks guest merge on same-match conflict preview, detects stale previews when match_state_seq advances, and refreshes preview and group state on execution failure (ID-03, DEC-050, DEC-051, Condition 3)', async () => {
    const baseSnap = buildDeterministicDemoSnapshot();
    let currentSeq = 5;

    const getSnapshot = (): GroupReadSnapshot => ({
      ...baseSnap,
      isDemoMode: false,
      group: {
        ...baseSnap.group,
        required_match_state_seq: currentSeq,
      },
    });

    const previewSpy = vi
      .fn()
      // 1st call: Same-match conflict (`can_merge: false`)
      .mockResolvedValueOnce({
        group_id: DEMO_GROUP_ID,
        source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
        source_guest_display_name: 'Ethan (Drop-in)',
        target_permanent_player_id: DEMO_PLAYER_IDS.aaron,
        target_permanent_display_name: 'Aaron Tan',
        can_merge: false,
        conflicting_match_ids: [DEMO_MATCH_IDS.m3],
        affected_match_count: 3,
        affected_session_attendance_count: 2,
        overlapping_attendance_session_count: 2,
      })
      // 2nd call: Eligible merge (`can_merge: true`) into Gavin
      .mockResolvedValueOnce({
        group_id: DEMO_GROUP_ID,
        source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
        source_guest_display_name: 'Ethan (Drop-in)',
        target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
        target_permanent_display_name: 'Gavin Yap',
        can_merge: true,
        conflicting_match_ids: [],
        affected_match_count: 3,
        affected_session_attendance_count: 2,
        overlapping_attendance_session_count: 1,
      })
      // 3rd call: Automatic refresh after execution failure shows conflict
      .mockResolvedValueOnce({
        group_id: DEMO_GROUP_ID,
        source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
        source_guest_display_name: 'Ethan (Drop-in)',
        target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
        target_permanent_display_name: 'Gavin Yap',
        can_merge: false,
        conflicting_match_ids: [DEMO_MATCH_IDS.m4Disputed],
        affected_match_count: 4,
        affected_session_attendance_count: 2,
        overlapping_attendance_session_count: 1,
      })
      // 4th call: Fresh eligible preview for successful merge
      .mockResolvedValueOnce({
        group_id: DEMO_GROUP_ID,
        source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
        source_guest_display_name: 'Ethan (Drop-in)',
        target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
        target_permanent_display_name: 'Gavin Yap',
        can_merge: true,
        conflicting_match_ids: [],
        affected_match_count: 3,
        affected_session_attendance_count: 2,
        overlapping_attendance_session_count: 1,
      });

    const mergeSpy = vi
      .fn()
      // 1st execution fails because a concurrent match created a conflict after preview
      .mockImplementationOnce(async () => {
        currentSeq = 6;
        throw new Error(
          `guest_merge_conflict: cannot merge guest into player because both participated in match(es): {${DEMO_MATCH_IDS.m4Disputed}}`,
        );
      })
      // 2nd execution succeeds
      .mockImplementationOnce(async () => {
        currentSeq = 7;
        return {
          source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
          target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
          deduplicated_attendance_count: 1,
          reattributed_attendance_count: 1,
          reattributed_match_count: 3,
          published_rating_version_id: '00000000-0000-4000-8000-000000000977',
        };
      });

    const loadGateSpy = vi.fn(async () => ({
      status: 'approved' as const,
      userId: baseSnap.viewerMembership.user_id,
      userEmail: 'aaron.owner@example.com',
      membership: baseSnap.viewerMembership,
      snapshot: getSnapshot(),
    }));

    const repo = createLiveMockRepository(await loadGateSpy(), {
      loadViewerGateState: loadGateSpy,
      previewGuestIntoPlayerMerge: previewSpy,
      mergeGuestIntoPlayer: mergeSpy,
    });

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-section-guest-merge')).toBeTruthy();
    });

    const mergeSection = screen.getByTestId('admin-section-guest-merge');
    fireEvent.change(
      within(mergeSection).getByLabelText(/Source Temporary Guest/i),
      { target: { value: DEMO_PLAYER_IDS.ethanGuest } },
    );
    fireEvent.change(
      within(mergeSection).getByLabelText(/Target Permanent Player/i),
      { target: { value: DEMO_PLAYER_IDS.aaron } },
    );

    // 1. Preview with Aaron returns same-match conflict (`can_merge: false`)
    fireEvent.click(screen.getByTestId('preview-guest-merge-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('guest-merge-conflict-alert')).toBeTruthy();
    });
    expect(screen.queryByTestId('execute-guest-merge-btn')).toBeNull();

    // 2. Select Gavin Yap (`can_merge: true`) and generate preview
    fireEvent.change(
      within(mergeSection).getByLabelText(/Target Permanent Player/i),
      { target: { value: DEMO_PLAYER_IDS.gavinBench } },
    );
    fireEvent.click(screen.getByTestId('preview-guest-merge-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('execute-guest-merge-btn')).toBeTruthy();
    });
    expect(screen.getByTestId('preview-affected-matches').textContent).toBe('3');
    expect(
      screen.getByTestId('preview-overlapping-attendance').textContent,
    ).toBe('1');

    // 3. Execute merge -> fails on server due to concurrent conflict -> surfaces error, never reports success, and refreshes preview!
    fireEvent.change(
      within(mergeSection).getByLabelText(/Audit Reason for Guest Merge/i),
      { target: { value: 'Ethan is Gavin Yap' } },
    );
    fireEvent.click(screen.getByTestId('confirm-guest-merge-checkbox'));
    fireEvent.click(screen.getByTestId('execute-guest-merge-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-action-error').textContent).toMatch(
        /guest_merge_conflict/i,
      );
      expect(screen.getByTestId('guest-merge-conflict-alert')).toBeTruthy();
    });
    expect(screen.queryByTestId('admin-action-success')).toBeNull();

    // 4. Generate fresh preview (now eligible again) and execute successfully
    fireEvent.click(screen.getByTestId('preview-guest-merge-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('execute-guest-merge-btn')).toBeTruthy();
    });
    fireEvent.change(
      within(mergeSection).getByLabelText(/Audit Reason for Guest Merge/i),
      { target: { value: 'Confirmed Ethan is Gavin Yap after match correction' } },
    );
    fireEvent.click(screen.getByTestId('confirm-guest-merge-checkbox'));
    fireEvent.click(screen.getByTestId('execute-guest-merge-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-action-success').textContent).toMatch(
        /Guest profile merged atomically/i,
      );
    });
    expect(mergeSpy).toHaveBeenCalledTimes(2);
  });

  it('disables all onboarding and governance mutations in Demo Mode and prevents accidental double submission in live mode (Condition 2, Condition 3, Condition 4)', async () => {
    // Part A: Demo Mode disables all mutations in AdminGovernanceView
    const demoRepo = createDemoTrackerRepository();
    const { unmount } = render(<App repository={demoRepo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-demo-readonly-notice')).toBeTruthy();
    });

    expect(
      (
        screen.getByTestId(
          'issue-invitation-submit-btn',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByTestId(
          `revoke-invitation-btn-${DEMO_INVITATION_IDS.pendingMember}`,
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByTestId(
          `approve-membership-btn-${DEMO_MEMBERSHIP_IDS.pendingHannah}`,
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByTestId('create-player-submit-btn') as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByTestId('preview-guest-merge-btn') as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByTestId(
          'transfer-ownership-submit-btn',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    unmount();

    // Part B: Double-submission prevention on Owner ownership transfer in live mode
    const baseSnap = buildDeterministicDemoSnapshot();
    const liveSnap: GroupReadSnapshot = { ...baseSnap, isDemoMode: false };

    let resolveTransfer!: () => void;
    const transferPromise = new Promise<void>((resolve) => {
      resolveTransfer = resolve;
    });
    const transferSpy = vi.fn(() => transferPromise);

    const liveRepo = createLiveMockRepository(
      {
        status: 'approved',
        userId: liveSnap.viewerMembership.user_id,
        userEmail: 'aaron.owner@example.com',
        membership: liveSnap.viewerMembership,
        snapshot: liveSnap,
      },
      {
        transferGroupOwnership: transferSpy,
      },
    );

    render(<App repository={liveRepo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-section-ownership')).toBeTruthy();
    });

    const ownershipSection = screen.getByTestId('admin-section-ownership');
    fireEvent.change(
      within(ownershipSection).getByLabelText(
        /Recipient Approved Membership/i,
      ),
      { target: { value: DEMO_MEMBERSHIP_IDS.adminBrenda } },
    );
    fireEvent.change(
      within(ownershipSection).getByLabelText(
        /Reason for Ownership Transfer/i,
      ),
      { target: { value: 'Handing over leadership to Brenda' } },
    );
    fireEvent.click(screen.getByTestId('confirm-ownership-transfer-checkbox'));

    const submitBtn = screen.getByTestId(
      'transfer-ownership-submit-btn',
    ) as HTMLButtonElement;

    // Click twice rapidly while transferPromise is pending
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(transferSpy).toHaveBeenCalledTimes(1);
    expect(submitBtn.disabled).toBe(true);

    resolveTransfer();
    await waitFor(() => {
      expect(screen.getByTestId('admin-action-success').textContent).toMatch(
        /Group ownership transferred atomically/i,
      );
    });
    expect(transferSpy).toHaveBeenCalledWith({
      groupId: DEMO_GROUP_ID,
      newOwnerMembershipId: DEMO_MEMBERSHIP_IDS.adminBrenda,
      reason: 'Handing over leadership to Brenda',
    });
  });

  it('captureAndStripInviteTokenFromUrl safely handles URLs with and without ?invite= parameter', () => {
    resetCapturedInviteTokenForTesting();
    expect(
      captureAndStripInviteTokenFromUrl({
        search: '',
        pathname: '/',
        hash: '',
      }),
    ).toBeNull();

    const fakeHistory = {
      state: { page: 1 },
      replaceState: vi.fn(),
    };
    const token = captureAndStripInviteTokenFromUrl(
      {
        search: '?invite=abc123token&foo=bar',
        pathname: '/join',
        hash: '#top',
      },
      fakeHistory,
    );
    expect(token).toBe('abc123token');
    expect(fakeHistory.replaceState).toHaveBeenCalledWith(
      { page: 1 },
      '',
      '/join?foo=bar#top',
    );
  });

  it('allows clearing a pre-filled ?invite= URL token to enter a manual token, and syncs latest required_match_state_seq when refreshing a guest merge preview after a transient failure', async () => {
    // Part A: Clearing pre-filled URL token does not re-populate the old URL token
    const expiredUrlToken =
      '1111111111111111111111111111111111111111111111111111111111111111';
    const manualFreshToken =
      '2222222222222222222222222222222222222222222222222222222222222222';
    window.history.replaceState(null, '', `/?invite=${expiredUrlToken}`);

    const redeemSpy = vi.fn().mockResolvedValue({
      membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
      group_id: DEMO_GROUP_ID,
      status: 'pending_approval',
    });

    const onboardingRepo = createLiveMockRepository(
      {
        status: 'no_membership',
        userId: '00000000-0000-4000-8000-000000000004',
        userEmail: 'hannah@example.com',
        emailVerified: true,
      },
      {
        redeemGroupInvitation: redeemSpy,
      },
    );

    const { unmount } = render(
      <App repository={onboardingRepo} envConfig={CONFIGURED_ENV} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('gate-no-membership')).toBeTruthy();
    });

    const tokenInput = screen.getByLabelText(
      /Single-Use Invitation Token/i,
    ) as HTMLInputElement;
    expect(tokenInput.value).toBe(expiredUrlToken);

    // Clear the input completely — it must stay empty and not re-populate expiredUrlToken
    fireEvent.change(tokenInput, { target: { value: '' } });
    expect(tokenInput.value).toBe('');

    // Enter a fresh manual token and submit
    fireEvent.change(tokenInput, { target: { value: manualFreshToken } });
    fireEvent.click(screen.getByTestId('redeem-invitation-submit-btn'));

    await waitFor(() => {
      expect(redeemSpy).toHaveBeenCalledWith({
        rawToken: manualFreshToken,
        requestedPlayerId: null,
        requestedNewPlayerName: null,
      });
    });

    unmount();

    // Part B: Transient merge failure while required_match_state_seq advances syncs mergePreviewMatchSeq to the new sequence
    const baseSnap = buildDeterministicDemoSnapshot();
    let currentSeq = 5;

    const getSnapshot = (): GroupReadSnapshot => ({
      ...baseSnap,
      isDemoMode: false,
      group: {
        ...baseSnap.group,
        required_match_state_seq: currentSeq,
      },
    });

    const previewSpy = vi.fn().mockResolvedValue({
      group_id: DEMO_GROUP_ID,
      source_guest_player_id: DEMO_PLAYER_IDS.ethanGuest,
      source_guest_display_name: 'Ethan (Drop-in)',
      target_permanent_player_id: DEMO_PLAYER_IDS.gavinBench,
      target_permanent_display_name: 'Gavin Yap',
      can_merge: true,
      conflicting_match_ids: [],
      affected_match_count: 3,
      affected_session_attendance_count: 2,
      overlapping_attendance_session_count: 1,
    });

    const mergeSpy = vi.fn().mockImplementationOnce(async () => {
      // Simulate concurrent unrelated match advancing required_match_state_seq while merge fails transiently
      currentSeq = 6;
      throw new Error('transient lock timeout during guest merge');
    });

    const loadGateSpy = vi.fn(async () => ({
      status: 'approved' as const,
      userId: baseSnap.viewerMembership.user_id,
      userEmail: 'aaron.owner@example.com',
      membership: baseSnap.viewerMembership,
      snapshot: getSnapshot(),
    }));

    const adminRepo = createLiveMockRepository(await loadGateSpy(), {
      loadViewerGateState: loadGateSpy,
      previewGuestIntoPlayerMerge: previewSpy,
      mergeGuestIntoPlayer: mergeSpy,
    });

    render(<App repository={adminRepo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('toggle-admin-tools-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-section-guest-merge')).toBeTruthy();
    });

    const mergeSection = screen.getByTestId('admin-section-guest-merge');
    fireEvent.change(
      within(mergeSection).getByLabelText(/Source Temporary Guest/i),
      { target: { value: DEMO_PLAYER_IDS.ethanGuest } },
    );
    fireEvent.change(
      within(mergeSection).getByLabelText(/Target Permanent Player/i),
      { target: { value: DEMO_PLAYER_IDS.gavinBench } },
    );

    fireEvent.click(screen.getByTestId('preview-guest-merge-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('execute-guest-merge-btn')).toBeTruthy();
    });

    fireEvent.change(
      within(mergeSection).getByLabelText(/Audit Reason for Guest Merge/i),
      { target: { value: 'Merge Ethan into Gavin' } },
    );
    fireEvent.click(screen.getByTestId('confirm-guest-merge-checkbox'));
    fireEvent.click(screen.getByTestId('execute-guest-merge-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-action-error').textContent).toMatch(
        /transient lock timeout/i,
      );
    });

    // The automatically refreshed preview must be synced to currentSeq = 6 and NOT flagged as stale
    expect(screen.queryByTestId('guest-merge-stale-preview-alert')).toBeNull();
    expect(screen.getByTestId('execute-guest-merge-btn')).toBeTruthy();
  });
});

