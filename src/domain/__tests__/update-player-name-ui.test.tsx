// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditPlayerNameModal } from '../../components/profile/EditPlayerNameModal.tsx';
import { ProfileView } from '../../views/ProfileView.tsx';
import { buildDeterministicDemoSnapshot } from '../../services/demoData.ts';
import type { DbPlayerRow } from '../../types/database.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Phase — Update Player Display Name UI Suite', () => {
  const mockPlayer: DbPlayerRow = {
    id: 'p1111111-1111-4111-8111-111111111101',
    group_id: 'g1111111-1111-4111-8111-111111111101',
    display_name: 'Tan Boon Heong',
    avatar_url: null,
    is_guest: false,
    is_active: true,
    merged_into_player_id: null,
    created_by_user_id: 'u1111111-1111-4111-8111-111111111101',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

  describe('EditPlayerNameModal', () => {
    it('renders current name and disables save if name is unchanged', () => {
      render(
        <EditPlayerNameModal
          player={mockPlayer}
          isOpen={true}
          onClose={vi.fn()}
          onSaveName={vi.fn()}
        />,
      );

      const input = screen.getByTestId('player-display-name-input') as HTMLInputElement;
      expect(input.value).toBe('Tan Boon Heong');

      const saveBtn = screen.getByTestId('save-display-name-btn') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('enables save button when a new valid name is typed', () => {
      render(
        <EditPlayerNameModal
          player={mockPlayer}
          isOpen={true}
          onClose={vi.fn()}
          onSaveName={vi.fn()}
        />,
      );

      const input = screen.getByTestId('player-display-name-input');
      fireEvent.change(input, { target: { value: 'Tan Boon Heong (Pro)' } });

      const saveBtn = screen.getByTestId('save-display-name-btn') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    it('disables save button when input is emptied or whitespace only', () => {
      render(
        <EditPlayerNameModal
          player={mockPlayer}
          isOpen={true}
          onClose={vi.fn()}
          onSaveName={vi.fn()}
        />,
      );

      const input = screen.getByTestId('player-display-name-input');
      fireEvent.change(input, { target: { value: '   ' } });

      const saveBtn = screen.getByTestId('save-display-name-btn') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('submits trimmed name and calls onSaveName and closes modal', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      const handleClose = vi.fn();

      render(
        <EditPlayerNameModal
          player={mockPlayer}
          isOpen={true}
          onClose={handleClose}
          onSaveName={handleSave}
        />,
      );

      const input = screen.getByTestId('player-display-name-input');
      fireEvent.change(input, { target: { value: '  Boon Heong  ' } });

      const saveBtn = screen.getByTestId('save-display-name-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(handleSave).toHaveBeenCalledWith('Boon Heong');
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('displays error message if onSaveName throws an error', async () => {
      const handleSave = vi.fn().mockRejectedValue(new Error('Name already taken or invalid'));

      render(
        <EditPlayerNameModal
          player={mockPlayer}
          isOpen={true}
          onClose={vi.fn()}
          onSaveName={handleSave}
        />,
      );

      const input = screen.getByTestId('player-display-name-input');
      fireEvent.change(input, { target: { value: 'Invalid Name' } });

      const saveBtn = screen.getByTestId('save-display-name-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('edit-name-error')).toHaveProperty(
          'textContent',
          'Name already taken or invalid',
        );
      });
    });

    it('closes modal on Escape key press', () => {
      const handleClose = vi.fn();
      render(
        <EditPlayerNameModal
          player={mockPlayer}
          isOpen={true}
          onClose={handleClose}
          onSaveName={vi.fn()}
        />,
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ProfileView Integration', () => {
    it('renders edit button when viewing own linked profile and opens modal', () => {
      const snapshot = buildDeterministicDemoSnapshot();
      // Ensure viewer is linked to player 1
      const linkedPlayerId = snapshot.players[0]!.id;
      snapshot.viewerMembership.linked_player_id = linkedPlayerId;

      render(
        <ProfileView
          snapshot={snapshot}
          selectedPlayerId={linkedPlayerId}
          onSelectPlayer={vi.fn()}
        />,
      );

      const editBtn = screen.getByTestId('edit-player-name-btn');
      expect(editBtn).toBeTruthy();

      fireEvent.click(editBtn);
      expect(screen.getByTestId('edit-player-name-modal')).toBeTruthy();
    });

    it('does NOT render edit button for regular member viewing someone else profile', () => {
      const snapshot = buildDeterministicDemoSnapshot();
      snapshot.viewerMembership.role = 'member';
      snapshot.viewerMembership.linked_player_id = snapshot.players[0]!.id;

      // Select player 2
      const otherPlayerId = snapshot.players[1]!.id;

      render(
        <ProfileView
          snapshot={snapshot}
          selectedPlayerId={otherPlayerId}
          onSelectPlayer={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('edit-player-name-btn')).toBeNull();
    });

    it('DOES render edit button for Admin/Owner viewing another player profile', () => {
      const snapshot = buildDeterministicDemoSnapshot();
      snapshot.viewerMembership.role = 'admin';
      snapshot.viewerMembership.linked_player_id = snapshot.players[0]!.id;

      // Select player 2
      const otherPlayerId = snapshot.players[1]!.id;

      render(
        <ProfileView
          snapshot={snapshot}
          selectedPlayerId={otherPlayerId}
          onSelectPlayer={vi.fn()}
        />,
      );

      expect(screen.getByTestId('edit-player-name-btn')).toBeTruthy();
    });
  });
});
