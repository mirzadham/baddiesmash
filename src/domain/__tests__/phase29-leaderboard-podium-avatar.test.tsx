// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { LeaderboardPodium } from '../../components/leaderboard/LeaderboardPodium.tsx';
import { App } from '../../App.tsx';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';
import { DEMO_GROUP_ID, DEMO_PLAYER_IDS } from '../../services/demoData.ts';
import type { AllTimeLeaderboardRow } from '../standings.ts';

afterEach(() => {
  cleanup();
});

function createMockLeaderboardRow(overrides: Partial<AllTimeLeaderboardRow>): AllTimeLeaderboardRow {
  return {
    rank: 1,
    isTiedRank: false,
    playerId: 'p1',
    displayName: 'Test Player',
    avatarUrl: null,
    isGuest: false,
    guestLabel: null,
    isActive: true,
    ratingScaled: 10000000n,
    ratingNumeric4: '1000.0000',
    ratingDisplay: 1000,
    matchesPlayed: 10,
    wins: 6,
    losses: 4,
    winRatePercentDisplay: '60.0% (6/10)',
    attendanceRatePercentDisplay: '100.0% (1/1)',
    sessionsAttendedCount: 1,
    sessionsHeldSinceCreationCount: 1,
    isProvisional: false,
    ...overrides,
  };
}

describe('Phase 29 — Leaderboard & In-App Player Avatar Integration', () => {
  it('renders uploaded avatar <img> on the 3D podium for top 1, 2, and 3 when avatarUrl is present', () => {
    const top1 = createMockLeaderboardRow({
      rank: 1,
      playerId: 'p-gold',
      displayName: 'Gold Champion',
      avatarUrl: 'https://example.com/gold-avatar.jpg',
    });
    const top2 = createMockLeaderboardRow({
      rank: 2,
      playerId: 'p-silver',
      displayName: 'Silver Runner',
      avatarUrl: 'https://example.com/silver-avatar.jpg',
    });
    const top3 = createMockLeaderboardRow({
      rank: 3,
      playerId: 'p-bronze',
      displayName: 'Bronze Master',
      avatarUrl: 'https://example.com/bronze-avatar.jpg',
    });

    render(
      <LeaderboardPodium
        top1={top1}
        top2={top2}
        top3={top3}
        onSelectPlayer={() => {}}
      />
    );

    const podium = screen.getByTestId('leaderboard-podium');

    // 1st place champion avatar
    const goldRow = within(podium).getByTestId('leaderboard-row-p-gold');
    const goldImg = within(goldRow).getByRole('img', { name: 'Gold Champion' });
    expect(goldImg.getAttribute('src')).toBe('https://example.com/gold-avatar.jpg');

    // 2nd place runner avatar
    const silverRow = within(podium).getByTestId('leaderboard-row-p-silver');
    const silverImg = within(silverRow).getByRole('img', { name: 'Silver Runner' });
    expect(silverImg.getAttribute('src')).toBe('https://example.com/silver-avatar.jpg');

    // 3rd place bronze avatar
    const bronzeRow = within(podium).getByTestId('leaderboard-row-p-bronze');
    const bronzeImg = within(bronzeRow).getByRole('img', { name: 'Bronze Master' });
    expect(bronzeImg.getAttribute('src')).toBe('https://example.com/bronze-avatar.jpg');
  });

  it('renders initials badge fallback on the podium when avatarUrl is null or fails to load', () => {
    const top1 = createMockLeaderboardRow({
      rank: 1,
      playerId: 'p-gold',
      displayName: 'Michan Tan',
      avatarUrl: 'https://example.com/broken-avatar.jpg',
    });

    render(
      <LeaderboardPodium
        top1={top1}
        top2={null}
        top3={null}
        onSelectPlayer={() => {}}
      />
    );

    const podium = screen.getByTestId('leaderboard-podium');
    const img = within(podium).getByRole('img', { name: 'Michan Tan' });
    expect(img).toBeTruthy();

    // Trigger image error event
    fireEvent.error(img);

    // After error, initials fallback 'MT' must be displayed
    expect(within(podium).getByText('MT')).toBeTruthy();
  });

  it('renders avatar in live app Leaderboard across both podium and rank 4+ list rows', async () => {
    const repo = createDemoTrackerRepository();
    // Set avatar for Aaron (#1) and Brenda (#5) in snapshot
    const AaronId = DEMO_PLAYER_IDS.aaron;
    const BrendaId = DEMO_PLAYER_IDS.brenda;

    await repo.updatePlayerAvatar({
      groupId: DEMO_GROUP_ID,
      playerId: AaronId,
      avatarUrl: 'https://example.com/aaron-avatar.png',
      adminOverride: true,
    });
    await repo.updatePlayerAvatar({
      groupId: DEMO_GROUP_ID,
      playerId: BrendaId,
      avatarUrl: 'https://example.com/brenda-avatar.png',
      adminOverride: true,
    });

    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-leaderboard')).toBeTruthy();
    });

    // Check Aaron on podium (#1)
    const podium = screen.getByTestId('leaderboard-podium');
    const aaronPodium = within(podium).getByTestId(`leaderboard-row-${AaronId}`);
    const aaronImg = within(aaronPodium).getByRole('img', { name: 'Aaron Tan' });
    expect(aaronImg.getAttribute('src')).toBe('https://example.com/aaron-avatar.png');

    // Check Brenda on list (#5)
    const brendaRow = screen.getByTestId(`leaderboard-row-${BrendaId}`);
    const brendaImg = within(brendaRow).getByRole('img', { name: 'Brenda Lim' });
    expect(brendaImg.getAttribute('src')).toBe('https://example.com/brenda-avatar.png');
  });

  it('renders avatar in Current Session Standings tab when avatarUrl is present', async () => {
    const repo = createDemoTrackerRepository();
    const AaronId = DEMO_PLAYER_IDS.aaron;

    await repo.updatePlayerAvatar({
      groupId: DEMO_GROUP_ID,
      playerId: AaronId,
      avatarUrl: 'https://example.com/aaron-session-avatar.png',
      adminOverride: true,
    });

    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-leaderboard')).toBeTruthy();
    });

    // Open filter dropdown and select 'Current / Session Standings'
    const filterBtn = screen.getByRole('button', { name: /Filter leaderboard/i });
    fireEvent.click(filterBtn);

    const sessionFilterOption = screen.getByRole('button', { name: /Current \/ Session Standings/i });
    fireEvent.click(sessionFilterOption);

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-session-panel')).toBeTruthy();
    });

    const aaronSessionRow = screen.getByTestId(`session-standing-row-${AaronId}`);
    const aaronImg = within(aaronSessionRow).getByRole('img', { name: 'Aaron Tan' });
    expect(aaronImg.getAttribute('src')).toBe('https://example.com/aaron-session-avatar.png');
  });
});
