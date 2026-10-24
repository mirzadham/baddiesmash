// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { SessionMatchHistorySection } from '../../components/sessions/SessionMatchHistorySection.tsx';
import { PastSessionAccordionCard } from '../../components/sessions/PastSessionAccordionCard.tsx';
import { ProfileMatchHistorySection } from '../../components/profile/ProfileMatchHistorySection.tsx';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import type { DbSessionRow } from '../../types/database.ts';

afterEach(() => {
  cleanup();
});

const mockMatch: EnrichedMatchCard = {
  match: {
    id: 'm-test-1',
    group_id: 'g-1',
    session_id: 's-1',
    sequence_number: 1,
    team_a_score: 21,
    team_b_score: 16,
    status: 'completed',
    is_disputed: false,
    recorded_by_user_id: 'u-1',
    client_submission_id: 'sub-1',
    completed_at: '2026-10-24T10:20:00Z',
    voided_at: null,
    void_reason: null,
    created_at: '2026-10-24T10:00:00Z',
    updated_at: '2026-10-24T10:20:00Z',
  },
  sessionStartedAt: '2026-10-24T10:00:00Z',
  sessionDateDisplay: '24 Oct 2026',
  teamA: [
    { teamSide: 'A', slotNumber: 1, playerId: 'p1', displayName: 'Alip_cutie', isGuest: false, beforeDisplay: 1000, afterDisplay: 1012, changeDisplay: '+12.0', changeNumber: 12.0 },
    { teamSide: 'A', slotNumber: 2, playerId: 'p2', displayName: 'Brenda', isGuest: false, beforeDisplay: 1000, afterDisplay: 1012, changeDisplay: '+12.0', changeNumber: 12.0 },
  ],
  teamB: [
    { teamSide: 'B', slotNumber: 1, playerId: 'p3', displayName: 'Mirza Yunan', isGuest: false, beforeDisplay: 1000, afterDisplay: 988, changeDisplay: '-12.0', changeNumber: -12.0 },
    { teamSide: 'B', slotNumber: 2, playerId: 'p4', displayName: 'David', isGuest: false, beforeDisplay: 1000, afterDisplay: 988, changeDisplay: '-12.0', changeNumber: -12.0 },
  ],
  winnerSide: 'A',
};

const mockSession: DbSessionRow = {
  id: 's-1',
  group_id: 'g-1',
  season_id: null,
  status: 'completed',
  controller_user_id: 'u-1',
  controller_lease_version: 1,
  created_by_user_id: 'u-1',
  created_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T12:00:00Z',
  session_started_at: '2026-10-24T10:00:00Z',
  session_ended_at: '2026-10-24T12:00:00Z',
  last_meaningful_activity_at: '2026-10-24T11:50:00Z',
};

describe('Mobile-First Stacked Partner Names in Doubles Match Cards', () => {
  it('renders stacked partner names with individual buttons in PastSessionAccordionCard', () => {
    const onSelectPlayer = vi.fn();
    render(
      <PastSessionAccordionCard
        session={mockSession}
        matches={[mockMatch]}
        attendeeCount={4}
        isExpanded={true}
        onSelectSession={() => {}}
        onSelectPlayer={onSelectPlayer}
      />
    );

    // Both partner names in Team A are rendered as distinct clickable buttons
    const pA1Btn = screen.getByRole('button', { name: 'Alip_cutie' });
    const pA2Btn = screen.getByRole('button', { name: 'Brenda' });
    expect(pA1Btn).toBeTruthy();
    expect(pA2Btn).toBeTruthy();

    // Verify clicking triggers onSelectPlayer
    fireEvent.click(pA1Btn);
    expect(onSelectPlayer).toHaveBeenCalledWith('p1');

    fireEvent.click(pA2Btn);
    expect(onSelectPlayer).toHaveBeenCalledWith('p2');

    // Both partner names in Team B are rendered as distinct clickable buttons
    const pB1Btn = screen.getByRole('button', { name: 'Mirza Yunan' });
    const pB2Btn = screen.getByRole('button', { name: 'David' });
    expect(pB1Btn).toBeTruthy();
    expect(pB2Btn).toBeTruthy();

    // No ampersand character joining them in the card
    expect(screen.queryByText('&')).toBeNull();

    // Winner tick remains present for winning side
    expect(screen.getByTestId('winner-tick')).toBeTruthy();
  });

  it('renders stacked partner names with individual buttons in SessionMatchHistorySection', () => {
    const onSelectPlayer = vi.fn();
    render(
      <SessionMatchHistorySection
        matches={[mockMatch]}
        isAdminOrOwner={false}
        canViewerMutateSession={false}
        onSelectPlayer={onSelectPlayer}
      />
    );

    const pA1Btn = screen.getByRole('button', { name: 'Alip_cutie' });
    const pA2Btn = screen.getByRole('button', { name: 'Brenda' });
    expect(pA1Btn).toBeTruthy();
    expect(pA2Btn).toBeTruthy();

    fireEvent.click(pA1Btn);
    expect(onSelectPlayer).toHaveBeenCalledWith('p1');

    const pB1Btn = screen.getByRole('button', { name: 'Mirza Yunan' });
    const pB2Btn = screen.getByRole('button', { name: 'David' });
    expect(pB1Btn).toBeTruthy();
    expect(pB2Btn).toBeTruthy();

    expect(screen.queryByText('&')).toBeNull();
  });

  it('renders stacked partner names on separate lines in ProfileMatchHistorySection', () => {
    render(
      <ProfileMatchHistorySection
        filteredMatches={[mockMatch]}
        effectivePlayerId="p1"
        sessionFilter="all"
        statusFilter="all"
        sessions={[mockSession]}
        onSessionFilterChange={() => {}}
        onStatusFilterChange={() => {}}
        formatMalaysiaDate={(iso) => iso}
      />
    );

    expect(screen.getByText('Alip_cutie')).toBeTruthy();
    expect(screen.getByText('Brenda')).toBeTruthy();
    expect(screen.getByText('Mirza Yunan')).toBeTruthy();
    expect(screen.getByText('David')).toBeTruthy();

    expect(screen.queryByText('&')).toBeNull();
  });
});
