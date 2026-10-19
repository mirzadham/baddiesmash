// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import {
  buildDeterministicDemoSnapshot,
  DEMO_GROUP_ID,
  DEMO_MATCH_IDS,
  DEMO_PLAYER_IDS,
  DEMO_SESSION_IDS,
  DEMO_VIEWER_USER_ID,
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
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig',
  diagnosticMessage: null,
};

function createPhase4MockRepository(
  initialSnapshot?: GroupReadSnapshot,
  overrides: Partial<TrackerRepository> = {},
): {
  repo: TrackerRepository;
  getSnapshot: () => GroupReadSnapshot;
  setSnapshot: (next: GroupReadSnapshot) => void;
} {
  const base = initialSnapshot ?? {
    ...buildDeterministicDemoSnapshot(),
    isDemoMode: false,
  };
  let currentSnapshot = base;

  const baseDemoRepo = createDemoTrackerRepository(currentSnapshot);

  const repo: TrackerRepository = {
    ...baseDemoRepo,
    isDemoMode: false,
    loadViewerGateState: vi.fn(
      async (): Promise<ViewerGateState> => ({
        status: 'approved',
        userId: currentSnapshot.viewerMembership.user_id,
        userEmail: 'aaron.owner@example.com',
        membership: currentSnapshot.viewerMembership,
        snapshot: currentSnapshot,
      }),
    ),
    getSessionInactivityStatus: vi.fn(async (sessionId: string) => {
      const target =
        currentSnapshot.sessions.find((s) => s.id === sessionId) ??
        currentSnapshot.sessions[0]!;
      return {
        session_id: target.id,
        status: target.status,
        last_meaningful_activity_at: target.last_meaningful_activity_at,
        inactive_seconds: 1200,
        is_stale_12h_warning: false,
      };
    }),
    ...overrides,
  };

  return {
    repo,
    getSnapshot: () => currentSnapshot,
    setSnapshot: (next: GroupReadSnapshot) => {
      currentSnapshot = next;
    },
  };
}

async function openSessionsTab(repo: TrackerRepository) {
  render(<App repository={repo} envConfig={CONFIGURED_ENV} />);
  await waitFor(() => {
    expect(screen.getByTestId('view-home')).toBeTruthy();
  });
  const primaryNav = screen.getByRole('navigation', {
    name: /Primary navigation/i,
  });
  fireEvent.click(
    within(primaryNav).getByRole('button', { name: /Sessions/i }),
  );
  await waitFor(() => {
    expect(screen.getByTestId('view-sessions')).toBeTruthy();
  });
}

describe('Phase 4 — Live Session Control, Attendance Check-In, Match Entry, 10s Undo & Corrections UI', () => {
  it('supports starting a session, warns and enforces Policy 3A on backdated sessions before rated matches, and edits session start time with Policy 3B reason & audit (SES-01, Policy 3A, Policy 3B)', async () => {
    const startGroupSessionSpy = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Backdated session creation denied: only Admin or Owner may create a session dated before an existing session containing rated matches (Policy 3A)',
        ),
      )
      .mockResolvedValueOnce({
        session_id: '00000000-0000-4000-8000-000000000399',
        group_id: DEMO_GROUP_ID,
        controller_user_id: DEMO_VIEWER_USER_ID,
        controller_lease_version: 1,
        is_backdated_before_rated: true,
      });

    const updateSessionStartTimeSpy = vi.fn().mockResolvedValue({
      session_id: DEMO_SESSION_IDS.session2,
      session_started_at: '2026-10-15T11:30:00Z',
      recalculation: {
        recalculation_succeeded: true,
        recalculation_status: 'idle',
        published_rating_version_id: '00000000-0000-4000-8000-000000000903',
        required_match_state_seq: 7,
      },
    });

    const { repo } = createPhase4MockRepository(undefined, {
      startGroupSession: startGroupSessionSpy,
      updateSessionStartTime: updateSessionStartTimeSpy,
    });

    await openSessionsTab(repo);

    // Open Start New Session form
    fireEvent.click(screen.getByTestId('toggle-start-session-btn'));
    expect(screen.getByTestId('start-session-panel')).toBeTruthy();
    expect(screen.getByTestId('existing-active-session-warning')).toBeTruthy();

    // Enter a timestamp earlier than Session 1 (2026-10-08T12:00:00Z which has rated matches)
    fireEvent.change(screen.getByTestId('start-session-datetime-input'), {
      target: { value: '2026-10-01T12:00:00Z' },
    });

    // Policy 3A warning box must appear automatically
    expect(screen.getByTestId('backdated-session-warning')).toBeTruthy();

    // Select Aaron & Brenda as initial attendees
    fireEvent.click(
      screen.getByTestId(`initial-attendee-checkbox-${DEMO_PLAYER_IDS.aaron}`),
    );
    fireEvent.click(
      screen.getByTestId(`initial-attendee-checkbox-${DEMO_PLAYER_IDS.brenda}`),
    );

    // 1st attempt: simulated server rejection (e.g. non-admin or unacknowledged)
    fireEvent.click(screen.getByTestId('start-session-submit-btn'));
    await waitFor(() => {
      expect(
        screen.getByTestId('start-session-error-alert').textContent,
      ).toMatch(/Policy 3A/i);
    });

    // Check Policy 3A acknowledgment checkbox and submit again -> succeeds
    fireEvent.click(
      screen.getByTestId('acknowledge-backdated-session-checkbox'),
    );
    fireEvent.click(screen.getByTestId('start-session-submit-btn'));

    await waitFor(() => {
      expect(startGroupSessionSpy).toHaveBeenLastCalledWith({
        groupId: DEMO_GROUP_ID,
        sessionStartedAt: '2026-10-01T12:00:00Z',
        initialAttendeePlayerIds: [
          DEMO_PLAYER_IDS.aaron,
          DEMO_PLAYER_IDS.brenda,
        ],
        acknowledgeBackdatedRecalcWarning: true,
      });
    });

    // Test Session Start-Time Editor (Policy 3B) on the existing active Session 2
    // (the mocked start response's new session is not present in the static mock snapshot)
    fireEvent.click(
      screen.getByTestId(`session-card-${DEMO_SESSION_IDS.session2}`),
    );
    await waitFor(() => {
      expect(screen.getByTestId('toggle-edit-start-time-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('toggle-edit-start-time-btn'));
    expect(screen.getByTestId('edit-session-start-time-panel')).toBeTruthy();

    fireEvent.change(screen.getByTestId('edit-start-time-input'), {
      target: { value: '2026-10-15T11:30:00Z' },
    });
    fireEvent.change(screen.getByTestId('edit-start-time-reason-input'), {
      target: { value: 'Court booking started 30 minutes earlier' },
    });
    fireEvent.click(screen.getByTestId('edit-start-time-ack-checkbox'));
    fireEvent.click(screen.getByTestId('save-start-time-btn'));

    await waitFor(() => {
      expect(updateSessionStartTimeSpy).toHaveBeenCalledWith({
        sessionId: DEMO_SESSION_IDS.session2,
        newStartedAt: '2026-10-15T11:30:00Z',
        reason: 'Court booking started 30 minutes earlier',
        expectedLeaseVersion: 1,
        acknowledgeRecalcWarning: true,
      });
    });
  });

  it('manages session attendance check-in, blocks removal of non-voided match participants, and creates drop-in temporary guests with duplicate-name warning (ATT-01, ID-02)', async () => {
    const updateSessionAttendanceSpy = vi
      .fn()
      // 1st call: removing Gavin (bench attendee with 0 matches played) -> succeeds
      .mockResolvedValueOnce(undefined)
      // 2nd call: attempting to remove Aaron (played in Match m3) -> server rejects
      .mockRejectedValueOnce(
        new Error(
          'Cannot remove attendee from session: player has already participated in a non-voided match in this session',
        ),
      )
      // 3rd call: checking in newly created guest -> succeeds
      .mockResolvedValueOnce(undefined);

    const createPlayerProfileSpy = vi
      .fn()
      .mockResolvedValue('00000000-0000-4000-8000-000000000299');

    const { repo } = createPhase4MockRepository(undefined, {
      updateSessionAttendance: updateSessionAttendanceSpy,
      createPlayerProfile: createPlayerProfileSpy,
    });

    await openSessionsTab(repo);

    // 1. Remove Gavin Yap (bench attendee, 0 matches played)
    fireEvent.click(
      screen.getByTestId(`attendance-toggle-${DEMO_PLAYER_IDS.gavinBench}`),
    );
    await waitFor(() => {
      expect(updateSessionAttendanceSpy).toHaveBeenCalledWith({
        sessionId: DEMO_SESSION_IDS.session2,
        playerId: DEMO_PLAYER_IDS.gavinBench,
        present: false,
        expectedLeaseVersion: 1,
      });
    });

    // 2. Attempt to remove Aaron Tan (already played in non-voided match m3) -> surfaces server error alert
    fireEvent.click(
      screen.getByTestId(`attendance-toggle-${DEMO_PLAYER_IDS.aaron}`),
    );
    await waitFor(() => {
      expect(screen.getByTestId('sessions-action-error').textContent).toMatch(
        /already participated in a non-voided match/i,
      );
    });

    // 3. Enter duplicate name "Aaron Tan" in Temporary Guest input -> shows ID-02 warning without auto-merging
    const guestInput = screen.getByTestId('session-guest-name-input');
    fireEvent.change(guestInput, { target: { value: 'Aaron Tan' } });
    expect(screen.getByTestId('guest-duplicate-name-warning')).toBeTruthy();

    // Create guest and immediately check in to session attendance
    fireEvent.click(screen.getByTestId('session-create-guest-btn'));
    await waitFor(() => {
      expect(createPlayerProfileSpy).toHaveBeenCalledWith({
        groupId: DEMO_GROUP_ID,
        displayName: 'Aaron Tan',
        isGuest: true,
      });
      expect(updateSessionAttendanceSpy).toHaveBeenLastCalledWith({
        sessionId: DEMO_SESSION_IDS.session2,
        playerId: '00000000-0000-4000-8000-000000000299',
        present: true,
        expectedLeaseVersion: 1,
      });
    });
  });

  it('supports voluntary controller handover, unresponsive controller takeover, stale lease fencing, and 12-hour stale session warning banner without auto-closing (SES-02, SES-04, PRIV-01)', async () => {
    const transferSpy = vi
      .fn()
      .mockResolvedValueOnce({
        session_id: DEMO_SESSION_IDS.session2,
        controller_user_id: '00000000-0000-4000-8000-000000000002',
        controller_lease_version: 2,
        action_type: 'session_controller_handed_over',
      })
      .mockResolvedValueOnce({
        session_id: DEMO_SESSION_IDS.session2,
        controller_user_id: DEMO_VIEWER_USER_ID,
        controller_lease_version: 3,
        action_type: 'session_controller_taken_over',
      });

    const baseSnap = {
      ...buildDeterministicDemoSnapshot(),
      isDemoMode: false,
    };

    const { repo, setSnapshot } = createPhase4MockRepository(baseSnap, {
      transferOrTakeoverSessionController: transferSpy,
      getSessionInactivityStatus: vi.fn().mockResolvedValue({
        session_id: DEMO_SESSION_IDS.session2,
        status: 'active',
        last_meaningful_activity_at: '2026-10-14T20:00:00Z',
        inactive_seconds: 54000, // 15 hours inactive (>= 12h)
        is_stale_12h_warning: true,
      }),
    });

    await openSessionsTab(repo);

    // 1. Verify 12-hour stale session warning banner (SES-04) renders and states sessions are never auto-closed
    await waitFor(() => {
      expect(screen.getByTestId('stale-session-warning-banner')).toBeTruthy();
    });
    expect(
      screen.getByTestId('stale-session-warning-banner').textContent,
    ).toMatch(/never automatically closed/i);

    // 2. Verify current controller display shows player name + role, never private emails (PRIV-01)
    expect(
      screen.getByTestId('current-controller-display').textContent,
    ).toMatch(/Aaron Tan \(owner\) — You/i);
    expect(screen.getByTestId('view-sessions').textContent).not.toMatch(
      /aaron\.owner@example\.com|brenda\.admin@example\.com/i,
    );

    // 3. Voluntary handover from Aaron to Brenda (admin)
    fireEvent.change(screen.getByTestId('handover-recipient-select'), {
      target: { value: '00000000-0000-4000-8000-000000000002' },
    });
    fireEvent.change(screen.getByTestId('handover-reason-input'), {
      target: { value: 'Stepping onto court for match 3' },
    });
    // Update snapshot so after handover Brenda is controller with lease v2
    setSnapshot({
      ...baseSnap,
      sessions: baseSnap.sessions.map((s) =>
        s.id === DEMO_SESSION_IDS.session2
          ? {
              ...s,
              controller_user_id: '00000000-0000-4000-8000-000000000002',
              controller_lease_version: 2,
            }
          : s,
      ),
    });

    fireEvent.click(screen.getByTestId('confirm-handover-btn'));

    await waitFor(() => {
      expect(transferSpy).toHaveBeenCalledWith({
        sessionId: DEMO_SESSION_IDS.session2,
        newControllerUserId: '00000000-0000-4000-8000-000000000002',
        reason: 'Stepping onto court for match 3',
        expectedLeaseVersion: 1,
      });
      expect(screen.getByTestId('controller-takeover-section')).toBeTruthy();
    });

    // 4. Takeover / Claim control back when Brenda is controller
    fireEvent.change(screen.getByTestId('takeover-reason-input'), {
      target: { value: 'Brenda phone battery low' },
    });
    fireEvent.click(screen.getByTestId('claim-controller-btn'));

    await waitFor(() => {
      expect(transferSpy).toHaveBeenLastCalledWith({
        sessionId: DEMO_SESSION_IDS.session2,
        newControllerUserId: DEMO_VIEWER_USER_ID,
        reason: 'Brenda phone battery low',
        expectedLeaseVersion: 2,
      });
    });
  });

  it('creates incomplete match drafts, blocks session finalization while incomplete drafts exist, resolves drafts, finalizes, and allows Admin/Owner to reopen a completed session (SES-03, Policy 3C)', async () => {
    const baseSnap = {
      ...buildDeterministicDemoSnapshot(),
      isDemoMode: false,
    };
    const draftMatchId = '00000000-0000-4000-8000-000000000499';

    // Snapshot with 1 unresolved incomplete match draft in Session 2
    const snapWithDraft: GroupReadSnapshot = {
      ...baseSnap,
      matches: [
        ...baseSnap.matches,
        {
          id: draftMatchId,
          group_id: DEMO_GROUP_ID,
          session_id: DEMO_SESSION_IDS.session2,
          sequence_number: null,
          status: 'incomplete',
          team_a_score: null,
          team_b_score: null,
          is_disputed: false,
          client_submission_id: '10000000-0000-4000-8000-000000000099',
          recorded_by_user_id: DEMO_VIEWER_USER_ID,
          completed_at: null,
          voided_at: null,
          void_reason: null,
          created_at: '2026-10-15T13:20:00Z',
          updated_at: '2026-10-15T13:20:00Z',
        },
      ],
      matchParticipants: [
        ...baseSnap.matchParticipants,
        {
          match_id: draftMatchId,
          group_id: DEMO_GROUP_ID,
          team_side: 'A',
          slot_number: 1,
          player_id: DEMO_PLAYER_IDS.aaron,
        },
        {
          match_id: draftMatchId,
          group_id: DEMO_GROUP_ID,
          team_side: 'A',
          slot_number: 2,
          player_id: DEMO_PLAYER_IDS.brenda,
        },
        {
          match_id: draftMatchId,
          group_id: DEMO_GROUP_ID,
          team_side: 'B',
          slot_number: 1,
          player_id: DEMO_PLAYER_IDS.chong,
        },
        {
          match_id: draftMatchId,
          group_id: DEMO_GROUP_ID,
          team_side: 'B',
          slot_number: 2,
          player_id: DEMO_PLAYER_IDS.diana,
        },
      ],
    };

    const finalizeSpy = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Cannot finalize session: 1 incomplete match(es) exist; complete or void each incomplete match first (SES-03)',
        ),
      )
      .mockResolvedValueOnce({
        session_id: DEMO_SESSION_IDS.session2,
        status: 'completed',
        session_ended_at: '2026-10-15T14:00:00Z',
      });

    const correctOrVoidSpy = vi.fn().mockResolvedValue({
      match_id: draftMatchId,
      sequence_number: null,
      status: 'voided',
      recalculation: {
        recalculation_succeeded: true,
        recalculation_status: 'idle',
        published_rating_version_id: '00000000-0000-4000-8000-000000000901',
        required_match_state_seq: 5,
      },
    });

    const reopenSpy = vi.fn().mockResolvedValue({
      session_id: DEMO_SESSION_IDS.session1,
      status: 'reopened',
      controller_user_id: DEMO_VIEWER_USER_ID,
      controller_lease_version: 2,
    });

    const { repo, setSnapshot } = createPhase4MockRepository(snapWithDraft, {
      finalizeGroupSession: finalizeSpy,
      correctOrVoidMatch: correctOrVoidSpy,
      reopenCompletedSession: reopenSpy,
    });

    await openSessionsTab(repo);

    // 1. Finalization blocker warning is visible when an incomplete draft exists
    expect(
      screen.getByTestId('finalize-blocked-incomplete-warning'),
    ).toBeTruthy();
    expect(screen.getByTestId(`incomplete-draft-${draftMatchId}`)).toBeTruthy();

    // Clicking Finalize Session while draft exists surfaces server error
    fireEvent.click(screen.getByTestId('finalize-session-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('sessions-action-error').textContent).toMatch(
        /1 incomplete match\(es\) exist/i,
      );
    });

    // 2. Void the incomplete draft -> unblocks finalization
    setSnapshot(baseSnap);
    fireEvent.click(screen.getByTestId(`void-draft-btn-${draftMatchId}`));
    await waitFor(() => {
      expect(correctOrVoidSpy).toHaveBeenCalledWith({
        matchId: draftMatchId,
        action: 'void',
        reason: 'Incomplete match draft voided before session finalization',
        expectedLeaseVersion: 1,
      });
    });

    // Now Finalize Session succeeds
    fireEvent.click(screen.getByTestId('finalize-session-btn'));
    await waitFor(() => {
      expect(finalizeSpy).toHaveBeenCalledTimes(2);
    });

    // 3. Switch to Completed Session 1 and reopen it with a reason (Policy 3C)
    fireEvent.click(
      screen.getByTestId(`session-card-${DEMO_SESSION_IDS.session1}`),
    );
    await waitFor(() => {
      expect(screen.getByTestId('reopen-session-form')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('reopen-session-reason-input'), {
      target: { value: 'Forgot to record final tiebreak game' },
    });
    fireEvent.click(screen.getByTestId('reopen-session-btn'));

    await waitFor(() => {
      expect(reopenSpy).toHaveBeenCalledWith({
        sessionId: DEMO_SESSION_IDS.session1,
        reason: 'Forgot to record final tiebreak game',
      });
    });
  });

  it('enforces mobile-first doubles match entry rules: empty initial slots, one-tap swaps, score validation, retained form values on failure, and idempotent retry with the exact same client_submission_id (MATCH-01..MATCH-04)', async () => {
    const recordMatchSpy = vi
      .fn()
      // 1st attempt: network failure
      .mockRejectedValueOnce(new Error('Network timeout while saving match'))
      // 2nd attempt (retry): succeeds idempotently
      .mockResolvedValueOnce({
        match_id: '00000000-0000-4000-8000-000000000450',
        session_id: DEMO_SESSION_IDS.session2,
        sequence_number: 4,
        status: 'completed',
        idempotent_retry: false,
        recalculation: {
          recalculation_succeeded: true,
          recalculation_status: 'idle',
          published_rating_version_id: '00000000-0000-4000-8000-000000000905',
          required_match_state_seq: 6,
        },
      });

    const { repo } = createPhase4MockRepository(undefined, {
      recordCompletedMatch: recordMatchSpy,
    });

    await openSessionsTab(repo);

    const slotA1 = screen.getByTestId('match-slot-a1') as HTMLSelectElement;
    const slotA2 = screen.getByTestId('match-slot-a2') as HTMLSelectElement;
    const slotB1 = screen.getByTestId('match-slot-b1') as HTMLSelectElement;
    const slotB2 = screen.getByTestId('match-slot-b2') as HTMLSelectElement;
    const scoreA = screen.getByTestId(
      'match-score-a-input',
    ) as HTMLInputElement;
    const scoreB = screen.getByTestId(
      'match-score-b-input',
    ) as HTMLInputElement;

    // 1. Every new match starts with 4 empty slots and empty scores (MATCH-01)
    expect(slotA1.value).toBe('');
    expect(slotA2.value).toBe('');
    expect(slotB1.value).toBe('');
    expect(slotB2.value).toBe('');
    expect(scoreA.value).toBe('');
    expect(scoreB.value).toBe('');

    const initialSubmissionIdText =
      screen.getByTestId('match-submission-id').textContent ?? '';

    // 2. Duplicate player detection (MATCH-01)
    fireEvent.change(slotA1, { target: { value: DEMO_PLAYER_IDS.aaron } });
    fireEvent.change(slotA2, { target: { value: DEMO_PLAYER_IDS.aaron } });
    expect(screen.getByTestId('match-duplicate-player-error')).toBeTruthy();

    // Select 4 distinct present attendees
    fireEvent.change(slotA2, { target: { value: DEMO_PLAYER_IDS.brenda } });
    fireEvent.change(slotB1, { target: { value: DEMO_PLAYER_IDS.chong } });
    fireEvent.change(slotB2, { target: { value: DEMO_PLAYER_IDS.diana } });
    expect(screen.queryByTestId('match-duplicate-player-error')).toBeNull();

    // 3. One-tap Swap Partners (A2 <-> B1) & Swap Teams (A <-> B)
    fireEvent.click(screen.getByTestId('swap-partners-btn'));
    expect(slotA2.value).toBe(DEMO_PLAYER_IDS.chong);
    expect(slotB1.value).toBe(DEMO_PLAYER_IDS.brenda);

    fireEvent.click(screen.getByTestId('swap-teams-btn'));
    expect(slotA1.value).toBe(DEMO_PLAYER_IDS.brenda);
    expect(slotA2.value).toBe(DEMO_PLAYER_IDS.diana);
    expect(slotB1.value).toBe(DEMO_PLAYER_IDS.aaron);
    expect(slotB2.value).toBe(DEMO_PLAYER_IDS.chong);

    // 4. Score validation (MATCH-02): invalid 21-20 and 30-30 rejected; valid 21-19 accepted
    fireEvent.change(scoreA, { target: { value: '21' } });
    fireEvent.change(scoreB, { target: { value: '20' } });
    expect(screen.getByTestId('match-score-validation-error')).toBeTruthy();

    fireEvent.change(scoreA, { target: { value: '30' } });
    fireEvent.change(scoreB, { target: { value: '30' } });
    expect(screen.getByTestId('match-score-validation-error')).toBeTruthy();

    fireEvent.change(scoreA, { target: { value: '21' } });
    fireEvent.change(scoreB, { target: { value: '19' } });
    expect(screen.queryByTestId('match-score-validation-error')).toBeNull();
    expect(screen.getByTestId('match-score-validation-valid')).toBeTruthy();

    // 5. Submit match -> 1st attempt fails -> form values AND client_submission_id MUST be retained (MATCH-03, MATCH-04)
    fireEvent.click(screen.getByTestId('record-match-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('match-save-failed-alert')).toBeTruthy();
    });
    expect(slotA1.value).toBe(DEMO_PLAYER_IDS.brenda);
    expect(slotA2.value).toBe(DEMO_PLAYER_IDS.diana);
    expect(slotB1.value).toBe(DEMO_PLAYER_IDS.aaron);
    expect(slotB2.value).toBe(DEMO_PLAYER_IDS.chong);
    expect(scoreA.value).toBe('21');
    expect(scoreB.value).toBe('19');
    expect(screen.getByTestId('match-submission-id').textContent).toBe(
      initialSubmissionIdText,
    );

    const firstCallSubId = recordMatchSpy.mock.calls[0]![0].clientSubmissionId;

    // 6. Click Retry Save Match -> re-uses the exact same clientSubmissionId and succeeds
    fireEvent.click(screen.getByTestId('retry-match-save-btn'));

    await waitFor(() => {
      expect(recordMatchSpy).toHaveBeenCalledTimes(2);
    });
    const secondCallSubId = recordMatchSpy.mock.calls[1]![0].clientSubmissionId;
    expect(secondCallSubId).toBe(firstCallSubId);

    // After confirmed save, slots are cleared and clientSubmissionId rotates to a fresh UUID
    await waitFor(() => {
      expect(slotA1.value).toBe('');
      expect(scoreA.value).toBe('');
    });
    expect(screen.getByTestId('match-submission-id').textContent).not.toBe(
      initialSubmissionIdText,
    );
  });

  it('handles 10-second immediate undo, expired undo window rejection, post-window reasoned correction/void preserving sequence_number, and surfaces Stale/Failed recalculation outcomes (MATCH-05, MATCH-06, RATE-03, RATE-04)', async () => {
    const recordMatchSpy = vi.fn().mockResolvedValue({
      match_id: '00000000-0000-4000-8000-000000000460',
      session_id: DEMO_SESSION_IDS.session2,
      sequence_number: 4,
      status: 'completed',
      idempotent_retry: false,
      recalculation: {
        recalculation_succeeded: true,
        recalculation_status: 'idle',
        published_rating_version_id: '00000000-0000-4000-8000-000000000906',
        required_match_state_seq: 6,
      },
    });

    const undoSpy = vi
      .fn()
      // 1st click: simulate undo_window_expired from server
      .mockRejectedValueOnce(
        new Error(
          'undo_window_expired: 10-second immediate undo window has expired; use reasoned correction or void instead',
        ),
      );

    // Post-window correction succeeds on match row, but Elo recalculation fails -> UI must surface Stale/Failed alert (RATE-04)
    const correctOrVoidSpy = vi.fn().mockResolvedValue({
      match_id: DEMO_MATCH_IDS.m3,
      sequence_number: 1,
      status: 'completed',
      recalculation: {
        recalculation_succeeded: false,
        recalculation_status: 'failed',
        published_rating_version_id: '00000000-0000-4000-8000-000000000901',
        required_match_state_seq: 7,
        error_message: 'Simulated replay failure during post-window correction',
      },
    });

    const { repo } = createPhase4MockRepository(undefined, {
      recordCompletedMatch: recordMatchSpy,
      undoMatchWithinWindow: undoSpy,
      correctOrVoidMatch: correctOrVoidSpy,
    });

    await openSessionsTab(repo);

    // Record a match to trigger the 10-second immediate undo banner
    fireEvent.change(screen.getByTestId('match-slot-a1'), {
      target: { value: DEMO_PLAYER_IDS.aaron },
    });
    fireEvent.change(screen.getByTestId('match-slot-a2'), {
      target: { value: DEMO_PLAYER_IDS.brenda },
    });
    fireEvent.change(screen.getByTestId('match-slot-b1'), {
      target: { value: DEMO_PLAYER_IDS.chong },
    });
    fireEvent.change(screen.getByTestId('match-slot-b2'), {
      target: { value: DEMO_PLAYER_IDS.diana },
    });
    fireEvent.change(screen.getByTestId('match-score-a-input'), {
      target: { value: '22' },
    });
    fireEvent.change(screen.getByTestId('match-score-b-input'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByTestId('record-match-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('immediate-undo-banner')).toBeTruthy();
    });

    // Click Undo -> server returns undo_window_expired -> shows undo-expired-alert and keeps match confirmed
    fireEvent.click(screen.getByTestId('immediate-undo-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('undo-expired-alert')).toBeTruthy();
    });
    expect(screen.getByTestId('undo-expired-alert').textContent).toMatch(
      /remains confirmed in official results/i,
    );

    // Open Post-Window Correction Form on Match m3 (Sequence #1)
    fireEvent.click(
      screen.getByTestId(`open-correction-btn-${DEMO_MATCH_IDS.m3}`),
    );
    expect(
      screen.getByTestId(`correction-form-${DEMO_MATCH_IDS.m3}`),
    ).toBeTruthy();

    // Update score to 21-17 and provide a reason
    fireEvent.change(screen.getByTestId(`corr-score-a-${DEMO_MATCH_IDS.m3}`), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByTestId(`corr-score-b-${DEMO_MATCH_IDS.m3}`), {
      target: { value: '17' },
    });
    fireEvent.change(
      screen.getByTestId(`correction-reason-input-${DEMO_MATCH_IDS.m3}`),
      {
        target: { value: 'Scoreboard had 17 for Team B instead of 15' },
      },
    );
    fireEvent.click(
      screen.getByTestId(`submit-correction-btn-${DEMO_MATCH_IDS.m3}`),
    );

    await waitFor(() => {
      expect(correctOrVoidSpy).toHaveBeenCalledWith({
        matchId: DEMO_MATCH_IDS.m3,
        action: 'correct',
        reason: 'Scoreboard had 17 for Team B instead of 15',
        teamAScore: 21,
        teamBScore: 17,
        teamAPlayer1: DEMO_PLAYER_IDS.aaron,
        teamAPlayer2: DEMO_PLAYER_IDS.ethanGuest,
        teamBPlayer1: DEMO_PLAYER_IDS.brenda,
        teamBPlayer2: DEMO_PLAYER_IDS.diana,
        expectedLeaseVersion: 1,
      });
    });

    // Because recalculation_succeeded was false, mutation-recalc-failure-alert MUST be rendered immediately (RATE-04)
    await waitFor(() => {
      expect(screen.getByTestId('mutation-recalc-failure-alert')).toBeTruthy();
    });
    expect(
      screen.getByTestId('mutation-recalc-failure-alert').textContent,
    ).toMatch(/Simulated replay failure during post-window correction/i);
  });

  it('wires all 11 Phase 4 RPCs in createSupabaseTrackerRepository with exact SQL parameter names and blocks Phase 4 writes in Demo Mode', async () => {
    const demoRepo = createDemoTrackerRepository();
    await expect(
      demoRepo.startGroupSession({ groupId: DEMO_GROUP_ID }),
    ).rejects.toThrow(/Demo Mode/i);
    await expect(
      demoRepo.updateSessionAttendance({
        sessionId: DEMO_SESSION_IDS.session2,
        playerId: DEMO_PLAYER_IDS.aaron,
        present: true,
      }),
    ).rejects.toThrow(/Demo Mode/i);
    await expect(
      demoRepo.recordCompletedMatch({
        sessionId: DEMO_SESSION_IDS.session2,
        clientSubmissionId: '10000000-0000-4000-8000-000000000077',
        teamAPlayer1: DEMO_PLAYER_IDS.aaron,
        teamAPlayer2: DEMO_PLAYER_IDS.brenda,
        teamBPlayer1: DEMO_PLAYER_IDS.chong,
        teamBPlayer2: DEMO_PLAYER_IDS.diana,
        teamAScore: 21,
        teamBScore: 18,
      }),
    ).rejects.toThrow(/Demo Mode/i);

    const rpcMock = vi.fn(async (fnName: string) => {
      switch (fnName) {
        case 'start_group_session':
          return {
            data: {
              session_id: 's-new',
              group_id: DEMO_GROUP_ID,
              controller_user_id: DEMO_VIEWER_USER_ID,
              controller_lease_version: 1,
              is_backdated_before_rated: false,
            },
            error: null,
          };
        case 'update_session_attendance':
          return { data: null, error: null };
        case 'transfer_or_takeover_session_controller':
          return {
            data: {
              session_id: 's-new',
              controller_user_id: 'u-2',
              controller_lease_version: 2,
              action_type: 'session_controller_handed_over',
            },
            error: null,
          };
        case 'update_session_start_time':
          return {
            data: {
              session_id: 's-new',
              session_started_at: '2026-10-19T11:45:00Z',
              recalculation: null,
            },
            error: null,
          };
        case 'finalize_group_session':
          return {
            data: {
              session_id: 's-new',
              status: 'completed',
              session_ended_at: '2026-10-19T14:00:00Z',
            },
            error: null,
          };
        case 'reopen_completed_session':
          return {
            data: {
              session_id: 's-new',
              status: 'reopened',
              controller_user_id: DEMO_VIEWER_USER_ID,
              controller_lease_version: 4,
            },
            error: null,
          };
        case 'get_session_inactivity_status':
          return {
            data: {
              session_id: 's-new',
              status: 'reopened',
              last_meaningful_activity_at: '2026-10-19T14:00:00Z',
              inactive_seconds: 60,
              is_stale_12h_warning: false,
            },
            error: null,
          };
        case 'record_completed_match':
          return {
            data: {
              match_id: 'm-new',
              session_id: 's-new',
              sequence_number: 1,
              status: 'completed',
              idempotent_retry: false,
              recalculation: null,
            },
            error: null,
          };
        case 'create_incomplete_match_draft':
          return {
            data: {
              match_id: 'm-draft',
              status: 'incomplete',
            },
            error: null,
          };
        case 'undo_match_within_window':
          return {
            data: {
              match_id: 'm-new',
              sequence_number: 1,
              status: 'voided',
              recalculation: null,
            },
            error: null,
          };
        case 'correct_or_void_match':
          return {
            data: {
              match_id: 'm-new',
              sequence_number: 1,
              status: 'completed',
              recalculation: null,
            },
            error: null,
          };
        default:
          return { data: null, error: null };
      }
    });

    const fakeClient = { rpc: rpcMock } as unknown as SupabaseClient;
    const liveRepo = createSupabaseTrackerRepository(fakeClient);

    await liveRepo.startGroupSession({
      groupId: DEMO_GROUP_ID,
      sessionStartedAt: '2026-10-19T12:00:00Z',
      initialAttendeePlayerIds: [DEMO_PLAYER_IDS.aaron],
      acknowledgeBackdatedRecalcWarning: false,
    });
    expect(rpcMock).toHaveBeenCalledWith('start_group_session', {
      p_group_id: DEMO_GROUP_ID,
      p_session_started_at: '2026-10-19T12:00:00Z',
      p_initial_attendee_player_ids: [DEMO_PLAYER_IDS.aaron],
      p_acknowledge_backdated_recalc_warning: false,
    });

    await liveRepo.updateSessionAttendance({
      sessionId: 's-new',
      playerId: DEMO_PLAYER_IDS.brenda,
      present: true,
      expectedLeaseVersion: 1,
    });
    expect(rpcMock).toHaveBeenCalledWith('update_session_attendance', {
      p_session_id: 's-new',
      p_player_id: DEMO_PLAYER_IDS.brenda,
      p_present: true,
      p_expected_lease_version: 1,
    });

    await liveRepo.transferOrTakeoverSessionController({
      sessionId: 's-new',
      newControllerUserId: 'u-2',
      reason: 'Handover',
      expectedLeaseVersion: 1,
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'transfer_or_takeover_session_controller',
      {
        p_session_id: 's-new',
        p_new_controller_user_id: 'u-2',
        p_reason: 'Handover',
        p_expected_lease_version: 1,
      },
    );

    await liveRepo.updateSessionStartTime({
      sessionId: 's-new',
      newStartedAt: '2026-10-19T11:45:00Z',
      reason: 'Earlier start',
      expectedLeaseVersion: 2,
      acknowledgeRecalcWarning: true,
    });
    expect(rpcMock).toHaveBeenCalledWith('update_session_start_time', {
      p_session_id: 's-new',
      p_new_started_at: '2026-10-19T11:45:00Z',
      p_reason: 'Earlier start',
      p_expected_lease_version: 2,
      p_acknowledge_recalc_warning: true,
    });

    await liveRepo.finalizeGroupSession({
      sessionId: 's-new',
      expectedLeaseVersion: 2,
    });
    expect(rpcMock).toHaveBeenCalledWith('finalize_group_session', {
      p_session_id: 's-new',
      p_expected_lease_version: 2,
    });

    await liveRepo.reopenCompletedSession({
      sessionId: 's-new',
      reason: 'Forgotten match',
    });
    expect(rpcMock).toHaveBeenCalledWith('reopen_completed_session', {
      p_session_id: 's-new',
      p_reason: 'Forgotten match',
    });

    await liveRepo.getSessionInactivityStatus('s-new');
    expect(rpcMock).toHaveBeenCalledWith('get_session_inactivity_status', {
      p_session_id: 's-new',
    });

    await liveRepo.recordCompletedMatch({
      sessionId: 's-new',
      clientSubmissionId: 'sub-1',
      teamAPlayer1: DEMO_PLAYER_IDS.aaron,
      teamAPlayer2: DEMO_PLAYER_IDS.brenda,
      teamBPlayer1: DEMO_PLAYER_IDS.chong,
      teamBPlayer2: DEMO_PLAYER_IDS.diana,
      teamAScore: 21,
      teamBScore: 19,
      expectedLeaseVersion: 4,
    });
    expect(rpcMock).toHaveBeenCalledWith('record_completed_match', {
      p_session_id: 's-new',
      p_client_submission_id: 'sub-1',
      p_team_a_player_1: DEMO_PLAYER_IDS.aaron,
      p_team_a_player_2: DEMO_PLAYER_IDS.brenda,
      p_team_b_player_1: DEMO_PLAYER_IDS.chong,
      p_team_b_player_2: DEMO_PLAYER_IDS.diana,
      p_team_a_score: 21,
      p_team_b_score: 19,
      p_expected_lease_version: 4,
    });

    await liveRepo.createIncompleteMatchDraft({
      sessionId: 's-new',
      clientSubmissionId: 'sub-draft-1',
      teamAPlayer1: DEMO_PLAYER_IDS.aaron,
      teamAPlayer2: DEMO_PLAYER_IDS.brenda,
      teamBPlayer1: DEMO_PLAYER_IDS.chong,
      teamBPlayer2: DEMO_PLAYER_IDS.diana,
      expectedLeaseVersion: 4,
    });
    expect(rpcMock).toHaveBeenCalledWith('create_incomplete_match_draft', {
      p_session_id: 's-new',
      p_client_submission_id: 'sub-draft-1',
      p_team_a_player_1: DEMO_PLAYER_IDS.aaron,
      p_team_a_player_2: DEMO_PLAYER_IDS.brenda,
      p_team_b_player_1: DEMO_PLAYER_IDS.chong,
      p_team_b_player_2: DEMO_PLAYER_IDS.diana,
      p_expected_lease_version: 4,
    });

    await liveRepo.undoMatchWithinWindow({
      matchId: 'm-new',
      expectedLeaseVersion: 4,
    });
    expect(rpcMock).toHaveBeenCalledWith('undo_match_within_window', {
      p_match_id: 'm-new',
      p_expected_lease_version: 4,
    });

    await liveRepo.correctOrVoidMatch({
      matchId: 'm-new',
      action: 'correct',
      reason: 'Fix score',
      teamAScore: 22,
      teamBScore: 20,
      teamAPlayer1: DEMO_PLAYER_IDS.aaron,
      teamAPlayer2: DEMO_PLAYER_IDS.brenda,
      teamBPlayer1: DEMO_PLAYER_IDS.chong,
      teamBPlayer2: DEMO_PLAYER_IDS.diana,
      expectedLeaseVersion: 4,
    });
    expect(rpcMock).toHaveBeenCalledWith('correct_or_void_match', {
      p_match_id: 'm-new',
      p_action: 'correct',
      p_reason: 'Fix score',
      p_team_a_score: 22,
      p_team_b_score: 20,
      p_team_a_player_1: DEMO_PLAYER_IDS.aaron,
      p_team_a_player_2: DEMO_PLAYER_IDS.brenda,
      p_team_b_player_1: DEMO_PLAYER_IDS.chong,
      p_team_b_player_2: DEMO_PLAYER_IDS.diana,
      p_expected_lease_version: 4,
    });
  });
});
