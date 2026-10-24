import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, UserCheck, X } from 'lucide-react';
import type { DbPlayerRow } from '../../types/database.ts';

export interface EditPlayerNameModalProps {
  player: DbPlayerRow;
  isOpen: boolean;
  onClose: () => void;
  onSaveName: (newName: string) => Promise<void>;
  isAdmin?: boolean;
}

export const EditPlayerNameModal: React.FC<EditPlayerNameModalProps> = ({
  player,
  isOpen,
  onClose,
  onSaveName,
  isAdmin = false,
}) => {
  const [name, setName] = useState<string>(player.display_name);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync state when modal opens or player changes
  useEffect(() => {
    if (isOpen) {
      setName(player.display_name);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, player.display_name]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const trimmed = name.trim();
  const isUnchanged = trimmed === player.display_name.trim();
  const isValidLength = trimmed.length >= 1 && trimmed.length <= 80;
  const canSubmit = isValidLength && !isUnchanged && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidLength) {
      setErrorMsg('Display name must be between 1 and 80 characters.');
      return;
    }
    if (isUnchanged) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await onSaveName(trimmed);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to update display name. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-name-title"
      data-testid="edit-player-name-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md bg-[#121c28] border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <UserCheck size={18} />
            </div>
            <div>
              <h2
                id="edit-name-title"
                className="text-base font-bold text-white tracking-tight"
              >
                Change Display Name
              </h2>
              {isAdmin && (
                <span className="text-[10px] text-amber-400 font-semibold">
                  Admin / Owner Edit
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            role="alert"
            data-testid="edit-name-error"
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in"
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 font-medium leading-relaxed">{errorMsg}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="player-display-name-input"
                className="text-xs font-semibold text-slate-300"
              >
                New Display Name
              </label>
              <span
                className={`text-[11px] font-mono ${
                  trimmed.length > 80
                    ? 'text-rose-400 font-bold'
                    : 'text-slate-500'
                }`}
              >
                {trimmed.length}/80
              </span>
            </div>

            <input
              id="player-display-name-input"
              data-testid="player-display-name-input"
              type="text"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              disabled={isSubmitting}
              placeholder="Enter your name"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
            />

            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
              Your match history, ratings, and stats are safely linked to your
              permanent account ID and will automatically show your updated name.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-display-name-btn"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  Save Name
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
