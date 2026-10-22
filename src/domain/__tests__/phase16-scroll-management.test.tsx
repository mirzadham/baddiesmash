// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SessionsView } from '../../views/SessionsView.tsx';
import { PastSessionAccordionCard } from '../../components/sessions/PastSessionAccordionCard.tsx';
import { ProfileMatchHistorySection } from '../../components/profile/ProfileMatchHistorySection.tsx';
import { buildDeterministicDemoSnapshot } from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import type { DbSessionRow } from '../../types/database.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createMockMatch(id: string, seq: number, scoreA = 21, scoreB = 18): EnrichedMatchCard {
  return {
    match: {
      id,
      group_id: 'g-1',
      session_id: 's-1',
      sequence_number: seq,
      team_a_score: scoreA,
      team_b_score: scoreB,
      status: 'completed',
      is_disputed: false,
      recorded_by_user_id: 'u-1',
      client_submission_id: `sub-${id}`,
      completed_at: '2026-10-19T10:20:00Z',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-19T10:00:00Z',
      updated_at: '2026-10-19T10:20:00Z',
    },
    sessionStartedAt: '2026-10-19T10:00:00Z',
    sessionDateDisplay: '19 Oct 2026',
    teamA: [
      { teamSide: 'A', slotNumber: 1, playerId: 'p1', displayName: 'Alice', isGuest: false, beforeDisplay: 1000, afterDisplay: 1012, changeDisplay: '+12.0', changeNumber: 12.0 },
      { teamSide: 'A', slotNumber: 2, playerId: 'p2', displayName: 'Bob', isGuest: false, beforeDisplay: 1000, afterDisplay: 1012, changeDisplay: '+12.0', changeNumber: 12.0 },
    ],
    teamB: [
      { teamSide: 'B', slotNumber: 1, playerId: 'p3', displayName: 'Charlie', isGuest: false, beforeDisplay: 1000, afterDisplay: 988, changeDisplay: '-12.0', changeNumber: -12.0 },
      { teamSide: 'B', slotNumber: 2, playerId: 'p4', displayName: 'David', isGuest: false, beforeDisplay: 1000, afterDisplay: 988, changeDisplay: '-12.0', changeNumber: -12.0 },
    ],
    winnerSide: 'A',
  };
}

describe('Phase 16 — Long History Scroll Management & Progressive Disclosure', () => {
  describe('PastSessionAccordionCard match progressive disclosure', () => {
    it('shows only the first 4 matches by default and reveals remaining matches on toggle', () => {
      const mockSession: DbSessionRow = {
        id: 'session-many-matches',
        group_id: 'g-1',
        season_id: null,
        session_started_at: '2026-10-19T10:00:00Z',
        session_ended_at: '2026-10-19T12:00:00Z',
        status: 'completed',
        created_by_user_id: 'u-1',
        controller_user_id: 'u-1',
        controller_lease_version: 1,
        last_meaningful_activity_at: '2026-10-19T10:00:00Z',
        created_at: '2026-10-19T10:00:00Z',
        updated_at: '2026-10-19T12:00:00Z',
      };

      const matches = [
        createMockMatch('m1', 1),
        createMockMatch('m2', 2),
        createMockMatch('m3', 3),
        createMockMatch('m4', 4),
        createMockMatch('m5', 5),
        createMockMatch('m6', 6),
      ];

      render(
        <PastSessionAccordionCard
          session={mockSession}
          matches={matches}
          attendeeCount={8}
          isExpanded={true}
          onSelectSession={vi.fn()}
          onSelectPlayer={vi.fn()}
        />,
      );

      // Matches 1 to 4 should be visible
      expect(screen.getByText('Match #1')).toBeTruthy();
      expect(screen.getByText('Match #2')).toBeTruthy();
      expect(screen.getByText('Match #3')).toBeTruthy();
      expect(screen.getByText('Match #4')).toBeTruthy();

      // Matches 5 and 6 should not be in the DOM initially
      expect(screen.queryByText('Match #5')).toBeNull();
      expect(screen.queryByText('Match #6')).toBeNull();

      // Toggle button should be present
      const toggleBtn = screen.getByTestId('toggle-all-matches-session-many-matches');
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.textContent).toContain('Show all 6 matches (2 more)');

      // Click to expand all matches
      fireEvent.click(toggleBtn);

      expect(screen.getByText('Match #5')).toBeTruthy();
      expect(screen.getByText('Match #6')).toBeTruthy();
      expect(toggleBtn.textContent).toContain('Show fewer matches');

      // Click to collapse back
      fireEvent.click(toggleBtn);
      expect(screen.queryByText('Match #5')).toBeNull();
      expect(screen.queryByText('Match #6')).toBeNull();
    });
  });

  describe('ProfileMatchHistorySection match progressive disclosure', () => {
    it('shows only first 10 matches by default and reveals more on "Load More Matches (+10)"', () => {
      const matches: EnrichedMatchCard[] = Array.from({ length: 15 }, (_, i) =>
        createMockMatch(`prof-m-${i + 1}`, i + 1),
      );

      const mockSessions: DbSessionRow[] = [
        {
          id: 's-1',
          group_id: 'g-1',
          season_id: null,
          session_started_at: '2026-10-19T10:00:00Z',
          session_ended_at: '2026-10-19T12:00:00Z',
          status: 'completed',
          created_by_user_id: 'u-1',
          controller_user_id: 'u-1',
          controller_lease_version: 1,
          last_meaningful_activity_at: '2026-10-19T10:00:00Z',
          created_at: '2026-10-19T10:00:00Z',
          updated_at: '2026-10-19T12:00:00Z',
        },
      ];

      render(
        <ProfileMatchHistorySection
          filteredMatches={matches}
          effectivePlayerId="p1"
          sessionFilter="all"
          statusFilter="all"
          sessions={mockSessions}
          onSessionFilterChange={vi.fn()}
          onStatusFilterChange={vi.fn()}
          formatMalaysiaDate={(iso) => iso}
        />,
      );

      // Matches 1 to 10 should be visible
      expect(screen.getByText('Match #1')).toBeTruthy();
      expect(screen.getByText('Match #10')).toBeTruthy();
      expect(screen.queryByText('Match #11')).toBeNull();
      expect(screen.queryByText('Match #15')).toBeNull();

      // Load more button should be rendered
      const loadMoreBtn = screen.getByTestId('load-more-matches-btn');
      expect(loadMoreBtn).toBeTruthy();
      expect(loadMoreBtn.textContent).toContain('Load More Matches (+10)');
      expect(loadMoreBtn.textContent).toContain('Showing 10 of 15');

      // Click to load next batch
      fireEvent.click(loadMoreBtn);

      expect(screen.getByText('Match #11')).toBeTruthy();
      expect(screen.getByText('Match #15')).toBeTruthy();
      expect(screen.queryByTestId('load-more-matches-btn')).toBeNull();
    });
  });

  describe('SessionsView session history progressive disclosure and month filter', () => {
    it('limits past sessions to 5 by default, filters by month, and shows more on click', () => {
      const baseSnapshot = buildDeterministicDemoSnapshot();
      const repo = createDemoTrackerRepository();

      const baseSession = baseSnapshot.sessions[0]!;

      // Create 7 sessions: 4 in October 2026, 3 in September 2026
      const mockSessions: DbSessionRow[] = [
        {
          ...baseSession,
          id: 'sess-oct-1',
          session_started_at: '2026-10-26T10:00:00Z',
          status: 'completed',
        },
        {
          ...baseSession,
          id: 'sess-oct-2',
          session_started_at: '2026-10-19T10:00:00Z',
          status: 'completed',
        },
        {
          ...baseSession,
          id: 'sess-oct-3',
          session_started_at: '2026-10-12T10:00:00Z',
          status: 'completed',
        },
        {
          ...baseSession,
          id: 'sess-oct-4',
          session_started_at: '2026-10-05T10:00:00Z',
          status: 'completed',
        },
        {
          ...baseSession,
          id: 'sess-sep-1',
          session_started_at: '2026-09-28T10:00:00Z',
          status: 'completed',
        },
        {
          ...baseSession,
          id: 'sess-sep-2',
          session_started_at: '2026-09-21T10:00:00Z',
          status: 'completed',
        },
        {
          ...baseSession,
          id: 'sess-sep-3',
          session_started_at: '2026-09-14T10:00:00Z',
          status: 'completed',
        },
      ];

      const snapshotWith7Sessions = {
        ...baseSnapshot,
        sessions: mockSessions,
      };

      render(
        <SessionsView
          snapshot={snapshotWith7Sessions}
          repository={repo}
          selectedSessionId={null}
          onSelectSession={vi.fn()}
          onSelectPlayer={vi.fn()}
          onRefreshGroupState={vi.fn()}
        />,
      );

      // Check month filter exists with October 2026 and September 2026
      const monthFilter = screen.getByTestId('session-month-filter') as HTMLSelectElement;
      expect(monthFilter).toBeTruthy();
      expect(within(monthFilter).getByText(/All Months \(7\)/i)).toBeTruthy();
      expect(within(monthFilter).getByText(/October 2026 \(4\)/i)).toBeTruthy();
      expect(within(monthFilter).getByText(/September 2026 \(3\)/i)).toBeTruthy();

      // Only the first 5 sessions should be in the DOM initially
      expect(screen.getByTestId('session-card-sess-oct-1')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-oct-2')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-oct-3')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-oct-4')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-sep-1')).toBeTruthy();
      expect(screen.queryByTestId('session-card-sess-sep-2')).toBeNull();
      expect(screen.queryByTestId('session-card-sess-sep-3')).toBeNull();

      // Show more button should be present
      const showMoreBtn = screen.getByTestId('show-more-sessions-btn');
      expect(showMoreBtn).toBeTruthy();
      expect(showMoreBtn.textContent).toContain('Show More Sessions (+5)');

      // Click Show More Sessions
      fireEvent.click(showMoreBtn);
      expect(screen.getByTestId('session-card-sess-sep-2')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-sep-3')).toBeTruthy();
      expect(screen.queryByTestId('show-more-sessions-btn')).toBeNull();

      // Now filter by September 2026
      fireEvent.change(monthFilter, { target: { value: 'September 2026' } });

      // All 3 September sessions should be rendered, 0 October sessions
      expect(screen.queryByTestId('session-card-sess-oct-1')).toBeNull();
      expect(screen.queryByTestId('session-card-sess-oct-4')).toBeNull();
      expect(screen.getByTestId('session-card-sess-sep-1')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-sep-2')).toBeTruthy();
      expect(screen.getByTestId('session-card-sess-sep-3')).toBeTruthy();

      // Since only 3 sessions match September (<= 5), show more button is not rendered
      expect(screen.queryByTestId('show-more-sessions-btn')).toBeNull();
    });
  });
});
