// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App.tsx';
import { DEMO_MATCH_IDS } from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';
import { SessionMatchHistorySection } from '../../components/sessions/SessionMatchHistorySection.tsx';
import { PastSessionAccordionCard } from '../../components/sessions/PastSessionAccordionCard.tsx';
import { ProfileMatchHistorySection } from '../../components/profile/ProfileMatchHistorySection.tsx';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import type { DbSessionRow } from '../../types/database.ts';

afterEach(() => {
  cleanup();
});

const mockTeamAMatch: EnrichedMatchCard = {
  match: {
    id: 'm-team-a-win',
    group_id: 'g-1',
    session_id: 's-1',
    sequence_number: 1,
    team_a_score: 21,
    team_b_score: 18,
    status: 'completed',
    is_disputed: false,
    recorded_by_user_id: 'u-1',
    client_submission_id: 'sub-1',
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

const mockTeamBMatch: EnrichedMatchCard = {
  match: {
    id: 'm-team-b-win',
    group_id: 'g-1',
    session_id: 's-1',
    sequence_number: 2,
    team_a_score: 19,
    team_b_score: 21,
    status: 'completed',
    is_disputed: false,
    recorded_by_user_id: 'u-1',
    client_submission_id: 'sub-2',
    completed_at: '2026-10-19T10:50:00Z',
    voided_at: null,
    void_reason: null,
    created_at: '2026-10-19T10:30:00Z',
    updated_at: '2026-10-19T10:50:00Z',
  },
  sessionStartedAt: '2026-10-19T10:00:00Z',
  sessionDateDisplay: '19 Oct 2026',
  teamA: [
    { teamSide: 'A', slotNumber: 1, playerId: 'p1', displayName: 'Alice', isGuest: false, beforeDisplay: 1012, afterDisplay: 1001, changeDisplay: '-11.0', changeNumber: -11.0 },
    { teamSide: 'A', slotNumber: 2, playerId: 'p2', displayName: 'Bob', isGuest: false, beforeDisplay: 1012, afterDisplay: 1001, changeDisplay: '-11.0', changeNumber: -11.0 },
  ],
  teamB: [
    { teamSide: 'B', slotNumber: 1, playerId: 'p3', displayName: 'Charlie', isGuest: false, beforeDisplay: 988, afterDisplay: 999, changeDisplay: '+11.0', changeNumber: 11.0 },
    { teamSide: 'B', slotNumber: 2, playerId: 'p4', displayName: 'David', isGuest: false, beforeDisplay: 988, afterDisplay: 999, changeDisplay: '+11.0', changeNumber: 11.0 },
  ],
  winnerSide: 'B',
};

const mockVoidedMatch: EnrichedMatchCard = {
  match: {
    id: 'm-voided',
    group_id: 'g-1',
    session_id: 's-1',
    sequence_number: 3,
    team_a_score: 21,
    team_b_score: 15,
    status: 'voided',
    is_disputed: false,
    recorded_by_user_id: 'u-1',
    client_submission_id: 'sub-3',
    completed_at: null,
    voided_at: '2026-10-19T11:15:00Z',
    void_reason: 'Player injured',
    created_at: '2026-10-19T11:00:00Z',
    updated_at: '2026-10-19T11:15:00Z',
  },
  sessionStartedAt: '2026-10-19T10:00:00Z',
  sessionDateDisplay: '19 Oct 2026',
  teamA: [
    { teamSide: 'A', slotNumber: 1, playerId: 'p1', displayName: 'Alice', isGuest: false, beforeDisplay: 1001, afterDisplay: 1001, changeDisplay: '0.0', changeNumber: 0 },
    { teamSide: 'A', slotNumber: 2, playerId: 'p2', displayName: 'Bob', isGuest: false, beforeDisplay: 1001, afterDisplay: 1001, changeDisplay: '0.0', changeNumber: 0 },
  ],
  teamB: [
    { teamSide: 'B', slotNumber: 1, playerId: 'p3', displayName: 'Charlie', isGuest: false, beforeDisplay: 999, afterDisplay: 999, changeDisplay: '0.0', changeNumber: 0 },
    { teamSide: 'B', slotNumber: 2, playerId: 'p4', displayName: 'David', isGuest: false, beforeDisplay: 999, afterDisplay: 999, changeDisplay: '0.0', changeNumber: 0 },
  ],
  winnerSide: null,
};

const mockSession: DbSessionRow = {
  id: 's-1',
  group_id: 'g-1',
  season_id: null,
  status: 'completed',
  controller_user_id: 'u-1',
  controller_lease_version: 1,
  created_by_user_id: 'u-1',
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T12:00:00Z',
  session_started_at: '2026-10-19T10:00:00Z',
  session_ended_at: '2026-10-19T12:00:00Z',
  last_meaningful_activity_at: '2026-10-19T11:50:00Z',
};

describe('Phase 15 — Winner Pair Green Circular Checkmark', () => {
  it('renders green tick in circle beside winning Team A and winning Team B in SessionMatchHistorySection', () => {
    const { rerender } = render(
      <SessionMatchHistorySection
        matches={[mockTeamAMatch]}
        isAdminOrOwner={false}
        canViewerMutateSession={false}
        onSelectPlayer={() => {}}
      />
    );

    // For Team A win: winner tick exists, has green text styling, and is inside Team A's container
    const ticksTeamA = screen.getAllByTestId('winner-tick');
    expect(ticksTeamA).toHaveLength(1);
    expect(ticksTeamA[0]?.classList.contains('text-emerald-400')).toBe(true);
    expect(ticksTeamA[0]?.getAttribute('aria-label')).toBe('Winner');

    // Rerender with Team B winning
    rerender(
      <SessionMatchHistorySection
        matches={[mockTeamBMatch]}
        isAdminOrOwner={false}
        canViewerMutateSession={false}
        onSelectPlayer={() => {}}
      />
    );

    const ticksTeamB = screen.getAllByTestId('winner-tick');
    expect(ticksTeamB).toHaveLength(1);
    expect(ticksTeamB[0]?.classList.contains('text-emerald-400')).toBe(true);

    // Rerender with voided match (no winner)
    rerender(
      <SessionMatchHistorySection
        matches={[mockVoidedMatch]}
        isAdminOrOwner={false}
        canViewerMutateSession={false}
        onSelectPlayer={() => {}}
      />
    );

    expect(screen.queryByTestId('winner-tick')).toBeNull();
  });

  it('renders green tick in circle beside winning pair in PastSessionAccordionCard', () => {
    render(
      <PastSessionAccordionCard
        session={mockSession}
        matches={[mockTeamAMatch, mockTeamBMatch]}
        attendeeCount={4}
        isExpanded={true}
        onSelectSession={() => {}}
        onSelectPlayer={() => {}}
      />
    );

    const ticks = screen.getAllByTestId('winner-tick');
    expect(ticks).toHaveLength(2);
    ticks.forEach((t) => {
      expect(t.classList.contains('text-emerald-400')).toBe(true);
      expect(t.getAttribute('aria-label')).toBe('Winner');
    });
  });

  it('renders green tick in circle beside winning pair in ProfileMatchHistorySection', () => {
    render(
      <ProfileMatchHistorySection
        filteredMatches={[mockTeamAMatch, mockTeamBMatch, mockVoidedMatch]}
        effectivePlayerId="p1"
        sessionFilter="all"
        statusFilter="all"
        sessions={[mockSession]}
        onSessionFilterChange={() => {}}
        onStatusFilterChange={() => {}}
        formatMalaysiaDate={(iso) => iso}
      />
    );

    const ticks = screen.getAllByTestId('winner-tick');
    // Only 2 completed matches have winners; 1 voided match has no winner
    expect(ticks).toHaveLength(2);
    ticks.forEach((t) => {
      expect(t.classList.contains('text-emerald-400')).toBe(true);
      expect(t.getAttribute('aria-label')).toBe('Winner');
    });
  });

  it('renders green tick in live app Sessions tab on existing demo completed matches', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Sessions/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });

    // In demo session 2 (active), there are completed matches (m3, etc.)
    const m3Card = screen.getByTestId(`match-card-${DEMO_MATCH_IDS.m3}`);
    expect(m3Card).toBeTruthy();
    const m3Tick = within(m3Card).getByTestId('winner-tick');
    expect(m3Tick).toBeTruthy();
    expect(m3Tick.classList.contains('text-emerald-400')).toBe(true);
  });
});
