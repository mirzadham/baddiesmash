// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import {
  buildDeterministicDemoSnapshot,
  DEMO_GROUP_ID,
  DEMO_PLAYER_IDS,
  DEMO_SESSION_IDS,
  DEMO_VIEWER_USER_ID,
  type GroupReadSnapshot,
} from '../../services/demoData.ts';
import {
  createDemoTrackerRepository,
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

function createPhase6MockRepository(
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

describe('Phase 6 — Release Readiness, Data Privacy UX & Incomplete Draft Resilience', () => {
  it('renders the Data Privacy & Account Lifecycle section in ProfileView fulfilling PRIV-02', async () => {
    const { repo } = createPhase6MockRepository();

    render(<App repository={repo} envConfig={CONFIGURED_ENV} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', {
      name: /Primary navigation/i,
    });
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Profile/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });

    // Assert that the PRIV-02 Privacy & Account Lifecycle card is rendered
    await waitFor(() => {
      expect(screen.getByTestId('privacy-lifecycle-card')).toBeTruthy();
    });

    const privacyCard = screen.getByTestId('privacy-lifecycle-card');
    expect(privacyCard.textContent).toContain('Data Privacy & Account Lifecycle (PRIV-02)');
    expect(privacyCard.textContent).toContain('Rating Ledger & Match History Immutability');
    expect(privacyCard.textContent).toContain('Account Deletion & Player Profile Unlinking');
    expect(privacyCard.textContent).toContain('Confidentiality of Contact Details & Invitations');
    expect(privacyCard.textContent).toContain('linked_player_id = NULL');
    expect(privacyCard.textContent).toContain('departed');
  });

  it('handles draft void failure resilience when resuming and completing a draft (SES-03)', async () => {
    // Construct initial snapshot with an incomplete draft in Session 2
    const baseSnap = buildDeterministicDemoSnapshot();
    const draftMatchId = '00000000-0000-4000-8000-000000000499';

    const snapWithDraft: GroupReadSnapshot = {
      ...baseSnap,
      isDemoMode: false,
      matches: [
        ...baseSnap.matches,
        {
          id: draftMatchId,
          group_id: DEMO_GROUP_ID,
          session_id: DEMO_SESSION_IDS.session2,
          sequence_number: null,
          client_submission_id: 'sub-draft-phase6',
          status: 'incomplete',
          team_a_score: null,
          team_b_score: null,
          is_disputed: false,
          recorded_by_user_id: DEMO_VIEWER_USER_ID,
          created_at: '2026-10-15T13:20:00Z',
          updated_at: '2026-10-15T13:20:00Z',
          voided_at: null,
          completed_at: null,
          void_reason: null,
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

    let voidCallCount = 0;
    const correctOrVoidSpy = vi.fn().mockImplementation(async (params) => {
      voidCallCount++;
      if (params.matchId === draftMatchId && voidCallCount === 1) {
        // First attempt to void draft fails (e.g. transient timeout/network error)
        throw new Error('Database connection timeout while voiding draft');
      }
      return {
        match_id: params.matchId,
        sequence_number: 7,
        status: 'voided',
        recalculation: {
          recalculation_succeeded: true,
          recalculation_status: 'current',
          published_rating_version_id: '00000000-0000-4000-8000-000000000999',
          required_match_state_seq: 7,
          recalculation_run_id: '00000000-0000-4000-8000-000000000998',
          matches_replayed: 1,
          k_factor: 24,
          rules_version: '2026-v1-pilot',
          execution_duration_ms: 10,
        },
      };
    });

    const recordCompletedMatchSpy = vi.fn().mockResolvedValue({
      match_id: '00000000-0000-4000-8000-000000000450',
      session_id: DEMO_SESSION_IDS.session2,
      sequence_number: 7,
      status: 'completed',
      idempotent_retry: false,
      recalculation: {
        recalculation_succeeded: true,
        recalculation_status: 'current',
        published_rating_version_id: '00000000-0000-4000-8000-000000000999',
        required_match_state_seq: 7,
        recalculation_run_id: '00000000-0000-4000-8000-000000000998',
        matches_replayed: 1,
        k_factor: 24,
        rules_version: '2026-v1-pilot',
        execution_duration_ms: 10,
      },
    });

    const { repo } = createPhase6MockRepository(snapWithDraft, {
      recordCompletedMatch: recordCompletedMatchSpy,
      correctOrVoidMatch: correctOrVoidSpy,
    });

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

    // Verify unresolved draft is listed
    await waitFor(() => {
      expect(
        screen.getByTestId(`resume-draft-btn-${draftMatchId}`),
      ).toBeTruthy();
    });

    // 1. Resume draft into form
    fireEvent.click(screen.getByTestId(`resume-draft-btn-${draftMatchId}`));

    await waitFor(() => {
      expect(screen.getByTestId('resuming-draft-banner')).toBeTruthy();
    });

    // Enter valid winning scores: 21 - 19
    fireEvent.change(screen.getByTestId('match-score-a-input'), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByTestId('match-score-b-input'), {
      target: { value: '19' },
    });

    // Submit completed match
    fireEvent.click(screen.getByTestId('record-match-submit-btn'));

    // Assert that the recordCompletedMatch succeeded, but voiding draft failed:
    // Should display the action error explaining that voiding failed
    await waitFor(() => {
      expect(screen.getByTestId('sessions-action-error')).toBeTruthy();
    });
    expect(screen.getByTestId('sessions-action-error').textContent).toContain(
      'Database connection timeout while voiding draft',
    );
    expect(screen.getByTestId('sessions-action-error').textContent).toContain(
      'Retry Voiding Draft',
    );

    // Verify that "Resume Draft in Form" is replaced with "Retry Voiding Draft" for that draft
    expect(
      screen.getByTestId(`failed-void-notice-${draftMatchId}`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`retry-void-draft-btn-${draftMatchId}`),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(`resume-draft-btn-${draftMatchId}`),
    ).toBeNull();

    // 2. Click "Retry Voiding Draft"
    fireEvent.click(screen.getByTestId(`retry-void-draft-btn-${draftMatchId}`));

    // Assert that retry succeeded (voidCallCount === 2)
    await waitFor(() => {
      expect(voidCallCount).toBe(2);
    });
  });

  it('verifies that supabase/seed.sql contains zero synthetic test players or matches (OPS-01)', () => {
    const seedFilePath = path.resolve(__dirname, '../../../supabase/seed.sql');
    expect(fs.existsSync(seedFilePath)).toBe(true);

    const seedContent = fs.readFileSync(seedFilePath, 'utf-8');

    // Confirm seed contains no INSERT statements into players or matches
    expect(seedContent).not.toMatch(/INSERT\s+INTO\s+.*players/i);
    expect(seedContent).not.toMatch(/INSERT\s+INTO\s+.*matches/i);
    expect(seedContent).not.toMatch(/INSERT\s+INTO\s+.*groups/i);
    expect(seedContent).not.toMatch(/INSERT\s+INTO\s+.*group_memberships/i);
  });
});
