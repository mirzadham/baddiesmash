// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  DEMO_PLAYER_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 12 — SMASHTRACK Profile Interface Redesign', () => {
  it('renders Profile view with Hero card, 2x2 Performance Grid, H2H section, and Match History without Data Privacy card', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Navigate to Profile tab
    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Profile/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });

    // 1. Hero Card
    const heroCard = screen.getByTestId('selected-player-summary');
    expect(heroCard).toBeTruthy();
    // Default selected player should be Aaron Tan (or top ranked)
    expect(within(heroCard).getByRole('heading', { name: /Aaron Tan/i })).toBeTruthy();
    expect(within(heroCard).getByText(/Rank #/i)).toBeTruthy();

    // 2. 2x2 Performance Metrics Grid (Total Points is Card 1, Recent Form is Card 4)
    const totalPointsLabel = screen.getByText(/Total Points:/i);
    const winRateLabel = screen.getByText(/Win Rate:/i);
    const winStreakLabel = screen.getByText(/Win Streak:/i);
    const recentFormLabel = screen.getByText(/Recent Form/i);
    expect(totalPointsLabel).toBeTruthy();
    expect(winRateLabel).toBeTruthy();
    expect(winStreakLabel).toBeTruthy();
    expect(recentFormLabel).toBeTruthy();
    expect(screen.getByText(/Attendance Rate:/i)).toBeTruthy();

    // Verify DOM order: Total Points appears before Recent Form
    expect(
      totalPointsLabel.compareDocumentPosition(recentFormLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // 3. H2H Rivalry & Partnerships Section
    const h2hSection = screen.getByTestId('profile-h2h-section');
    expect(h2hSection).toBeTruthy();
    expect(within(h2hSection).getByText(/H2H Rivalry & Partnerships/i)).toBeTruthy();
    expect(within(h2hSection).getByText(/Rivalry \(vs\)/i)).toBeTruthy();
    expect(within(h2hSection).getByText(/Partnership \(with\)/i)).toBeTruthy();

    // 4. Match History with Filters
    expect(screen.getByRole('heading', { level: 3, name: /Match History/i })).toBeTruthy();
    expect(screen.getByLabelText(/Session:/i)).toBeTruthy();
    expect(screen.getByLabelText(/Status:/i)).toBeTruthy();

    // 5. Data Privacy Card removed per user directive
    expect(screen.queryByTestId('privacy-lifecycle-card')).toBeNull();
  });

  it('switches player profiles and updates Hero, metrics, and H2H data', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Profile/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });

    // Switch to Chong Wei
    fireEvent.change(screen.getByLabelText(/Player:/i), {
      target: { value: DEMO_PLAYER_IDS.chong },
    });

    const heroCard = screen.getByTestId('selected-player-summary');
    expect(within(heroCard).getByRole('heading', { name: /Chong Wei/i })).toBeTruthy();

    // Switch to Ethan (Guest)
    fireEvent.change(screen.getByLabelText(/Player:/i), {
      target: { value: DEMO_PLAYER_IDS.ethanGuest },
    });

    expect(within(heroCard).getByRole('heading', { name: /Ethan \(Drop-in\)/i })).toBeTruthy();
  });

  it('filters match history by status correctly', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Profile/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });

    // Select Ethan (Guest)
    fireEvent.change(screen.getByLabelText(/Player:/i), {
      target: { value: DEMO_PLAYER_IDS.ethanGuest },
    });

    // Filter by Disputed
    fireEvent.change(screen.getByLabelText(/Status:/i), {
      target: { value: 'disputed' },
    });

    expect(screen.getByText(/Match History \(1\)/i)).toBeTruthy();

    // Filter by Voided
    fireEvent.change(screen.getByLabelText(/Status:/i), {
      target: { value: 'voided' },
    });

    expect(screen.getByText(/Match History \(0\)/i)).toBeTruthy();
  });
});
