// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getAvatarCooldownStatus } from '../../services/readViewModels.ts';
import { AvatarUploadModal } from '../../components/profile/AvatarUploadModal.tsx';
import { ProfileHeroCard } from '../../components/profile/ProfileHeroCard.tsx';
import {
  buildDeterministicDemoSnapshot,
  DEMO_PLAYER_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';
import type { DbPlayerRow } from '../../types/database.ts';
import type { LeaderboardRow } from '../../components/profile/ProfileHeroCard.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockPlayer: DbPlayerRow = {
  id: 'player-test-1',
  group_id: 'group-test-1',
  display_name: 'Lee Zii Jia',
  avatar_url: null,
  avatar_updated_at: null,
  is_guest: false,
  is_active: true,
  merged_into_player_id: null,
  created_by_user_id: 'user-test-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockLeaderboardRow: LeaderboardRow = {
  rank: 1,
  isTiedRank: false,
  playerId: 'player-test-1',
  displayName: 'Lee Zii Jia',
  avatarUrl: null,
  isGuest: false,
  guestLabel: null,
  isActive: true,
  ratingScaled: 12000000n,
  ratingNumeric4: '1200.0000',
  ratingDisplay: 1200,
  matchesPlayed: 10,
  wins: 8,
  losses: 2,
  winRatePercentDisplay: '80.0% (8/10)',
  attendanceRatePercentDisplay: '100.0%',
  sessionsAttendedCount: 5,
  sessionsHeldSinceCreationCount: 5,
  isProvisional: false,
};

describe('Phase 21 — Player Display Picture Upload & 1-Year Cooldown', () => {
  describe('1. Cooldown Calculation Logic (getAvatarCooldownStatus)', () => {
    it('allows upload when avatar_updated_at is null or undefined', () => {
      const res = getAvatarCooldownStatus(null);
      expect(res.canUpdate).toBe(true);
      expect(res.daysRemaining).toBe(0);
      expect(res.nextAvailableDate).toBeNull();
    });

    it('enforces 365-day cooldown when updated recently', () => {
      // 100 days ago
      const nowMs = new Date('2026-10-22T12:00:00Z').getTime();
      const updatedDate = new Date(nowMs - 100 * 24 * 60 * 60 * 1000).toISOString();
      const res = getAvatarCooldownStatus(updatedDate, nowMs);

      expect(res.canUpdate).toBe(false);
      expect(res.daysRemaining).toBe(265);
      expect(res.nextAvailableDate).toBeTruthy();
    });

    it('allows update once 365 days have passed', () => {
      const nowMs = new Date('2026-10-22T12:00:00Z').getTime();
      // 366 days ago
      const updatedDate = new Date(nowMs - 366 * 24 * 60 * 60 * 1000).toISOString();
      const res = getAvatarCooldownStatus(updatedDate, nowMs);

      expect(res.canUpdate).toBe(true);
      expect(res.daysRemaining).toBe(0);
    });
  });

  describe('2. Advisory Message in Modal', () => {
    it('displays the exact advisory warning text: "pilih betul-betul au gambar, sebab setahun sekali je boleh update profile picture. jangan menyesal :p"', () => {
      render(
        <AvatarUploadModal
          player={mockPlayer}
          isOpen={true}
          onClose={() => {}}
          onSaveAvatar={async () => {}}
        />,
      );

      const advisory = screen.getByTestId('avatar-advisory-message');
      expect(advisory).toBeTruthy();
      expect(advisory.textContent).toContain(
        'pilih betul-betul au gambar, sebab setahun sekali je boleh update profile picture. jangan menyesal :p',
      );
    });
  });

  describe('3. Confirmation Reminder Dialog on Update Click', () => {
    it('intercepts update click and displays the exact reminder text: "betul ni? confirm ni? dah pikir masak-mask belom"', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      // Mock URL.createObjectURL
      const origCreateObjectUrl = URL.createObjectURL;
      URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-photo.jpg');

      render(
        <AvatarUploadModal
          player={mockPlayer}
          isOpen={true}
          onClose={() => {}}
          onSaveAvatar={handleSave}
        />,
      );

      // Select a valid file
      const file = new File(['fake-image-bytes'], 'profile.png', { type: 'image/png' });
      const fileInput = screen.getByTestId('avatar-file-input') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      // Save button should now be enabled
      const saveBtn = screen.getByTestId('save-avatar-btn');
      expect(saveBtn).toBeTruthy();

      // Click save — must NOT save immediately, but open confirmation step
      fireEvent.click(saveBtn);
      expect(handleSave).not.toHaveBeenCalled();

      // Verify the reminder confirmation dialog appears with exact text
      const confirmModal = screen.getByTestId('avatar-confirm-modal');
      expect(confirmModal).toBeTruthy();

      const confirmMsg = screen.getByTestId('avatar-confirm-message');
      expect(confirmMsg.textContent).toContain(
        'betul ni? confirm ni? dah pikir masak-mask belom',
      );

      // Cancelling returns to previous state without saving
      const cancelBtn = screen.getByTestId('cancel-confirm-avatar-btn');
      expect(cancelBtn.textContent).toBe('Cancel');
      fireEvent.click(cancelBtn);
      expect(screen.queryByTestId('avatar-confirm-modal')).toBeNull();
      expect(handleSave).not.toHaveBeenCalled();

      // Click save again and confirm
      fireEvent.click(screen.getByTestId('save-avatar-btn'));
      const finalConfirmBtn = screen.getByTestId('final-confirm-avatar-btn');
      expect(finalConfirmBtn.textContent).toContain('yessir');
      fireEvent.click(finalConfirmBtn);

      await waitFor(() => {
        expect(handleSave).toHaveBeenCalledTimes(1);
        expect(handleSave).toHaveBeenCalledWith(file);
      });

      URL.createObjectURL = origCreateObjectUrl;
    });
  });

  describe('4. Active Cooldown Lock', () => {
    it('renders locked banner and disables file input / save button during active cooldown', () => {
      const nowMs = Date.now();
      const lockedPlayer: DbPlayerRow = {
        ...mockPlayer,
        avatar_url: 'https://example.com/avatar.jpg',
        avatar_updated_at: new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      };

      render(
        <AvatarUploadModal
          player={lockedPlayer}
          isOpen={true}
          onClose={() => {}}
          onSaveAvatar={async () => {}}
          isAdmin={false}
        />,
      );

      // Lock banner should be visible
      const lockBanner = screen.getByTestId('avatar-cooldown-locked-banner');
      expect(lockBanner).toBeTruthy();
      expect(lockBanner.textContent).toContain('Display Picture Locked');
      expect(lockBanner.textContent).toContain('days remaining');

      // File input and save button should not be accessible
      expect(screen.queryByTestId('avatar-file-input')).toBeNull();
      expect(screen.queryByTestId('save-avatar-btn')).toBeNull();
    });

    it('allows admin override during active cooldown', () => {
      const nowMs = Date.now();
      const lockedPlayer: DbPlayerRow = {
        ...mockPlayer,
        avatar_url: 'https://example.com/avatar.jpg',
        avatar_updated_at: new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      render(
        <AvatarUploadModal
          player={lockedPlayer}
          isOpen={true}
          onClose={() => {}}
          onSaveAvatar={async () => {}}
          isAdmin={true}
        />,
      );

      // Admin override notice should be displayed
      expect(screen.getByText(/Admin Override/i)).toBeTruthy();
      // File input should be available
      expect(screen.getByTestId('avatar-file-input')).toBeTruthy();
    });
  });

  describe('5. ProfileHeroCard Trigger & Rendering', () => {
    it('renders edit-avatar-btn and calls onOpenAvatarUpload when clicked by linked viewer', () => {
      const handleOpen = vi.fn();
      render(
        <ProfileHeroCard
          selectedRow={mockLeaderboardRow}
          selectedPlayerRecord={mockPlayer}
          viewerLinkedPlayerId="player-test-1"
          allPlayers={[mockLeaderboardRow]}
          effectivePlayerId="player-test-1"
          onSelectPlayer={() => {}}
          formatMalaysiaDate={() => '01 Jan 2026'}
          onOpenAvatarUpload={handleOpen}
        />,
      );

      const editBtn = screen.getByTestId('edit-avatar-btn');
      expect(editBtn).toBeTruthy();
      fireEvent.click(editBtn);
      expect(handleOpen).toHaveBeenCalledTimes(1);
    });

    it('renders avatar image if present in selectedPlayerRecord', () => {
      const playerWithAvatar: DbPlayerRow = {
        ...mockPlayer,
        avatar_url: 'https://example.com/my-photo.jpg',
      };

      render(
        <ProfileHeroCard
          selectedRow={mockLeaderboardRow}
          selectedPlayerRecord={playerWithAvatar}
          viewerLinkedPlayerId="player-test-1"
          allPlayers={[mockLeaderboardRow]}
          effectivePlayerId="player-test-1"
          onSelectPlayer={() => {}}
          formatMalaysiaDate={() => '01 Jan 2026'}
        />,
      );

      const img = screen.getByAltText('Lee Zii Jia') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe('https://example.com/my-photo.jpg');
    });
  });

  describe('6. Repository 1-Year Cooldown Enforcement', () => {
    it('throws error when updating avatar within 365 days in repository without admin override', async () => {
      const snap = buildDeterministicDemoSnapshot();
      // Set Aaron's avatar_updated_at to 10 days ago
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const aaron = snap.players.find((p) => p.id === DEMO_PLAYER_IDS.aaron)!;
      aaron.avatar_updated_at = tenDaysAgo;

      const customRepo = createDemoTrackerRepository(snap);

      await expect(
        customRepo.updatePlayerAvatar({
          groupId: snap.group.id,
          playerId: DEMO_PLAYER_IDS.aaron,
          avatarUrl: 'https://example.com/new.jpg',
          adminOverride: false,
        }),
      ).rejects.toThrow(/once a year/i);

      // With admin override, it should succeed
      const updated = await customRepo.updatePlayerAvatar({
        groupId: snap.group.id,
        playerId: DEMO_PLAYER_IDS.aaron,
        avatarUrl: 'https://example.com/new.jpg',
        adminOverride: true,
      });

      expect(updated.avatarUrl).toBe('https://example.com/new.jpg');
      expect(aaron.avatar_url).toBe('https://example.com/new.jpg');
    });
  });
});
