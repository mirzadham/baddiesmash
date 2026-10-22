import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import {
  getAvatarCooldownStatus,
  type AvatarCooldownStatus,
} from '../../services/readViewModels.ts';
import type { DbPlayerRow } from '../../types/database.ts';

export interface AvatarUploadModalProps {
  player: DbPlayerRow;
  isOpen: boolean;
  onClose: () => void;
  onSaveAvatar: (file: File) => Promise<void>;
  isAdmin?: boolean;
}

export const AvatarUploadModal: React.FC<AvatarUploadModalProps> = ({
  player,
  isOpen,
  onClose,
  onSaveAvatar,
  isAdmin = false,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirmStep, setShowConfirmStep] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cooldown: AvatarCooldownStatus = getAvatarCooldownStatus(
    player.avatar_updated_at,
  );
  const isLocked = !cooldown.canUpdate && !isAdmin;

  // Cleanup object URL on change / unmount
  useEffect(() => {
    return () => {
      if (
        previewUrl &&
        previewUrl.startsWith('blob:') &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset state when modal is opened or closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setErrorMsg(null);
      setShowConfirmStep(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate mime type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Unsupported image format. Please select a JPG, PNG, or WebP file.');
      return;
    }

    // Validate size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setErrorMsg('Image size is too large. Maximum size is 5MB.');
      return;
    }

    if (
      previewUrl &&
      previewUrl.startsWith('blob:') &&
      typeof URL.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleInitialSaveClick = () => {
    if (!selectedFile) {
      setErrorMsg('Please select an image file first.');
      return;
    }
    setErrorMsg(null);
    setShowConfirmStep(true);
  };

  const handleFinalConfirmSave = async () => {
    if (!selectedFile) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSaveAvatar(selectedFile);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile picture.';
      setErrorMsg(msg);
      setShowConfirmStep(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-modal-title"
      data-testid="avatar-upload-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-[#121a24] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-emerald-400" />
            <h3
              id="avatar-modal-title"
              className="text-base sm:text-lg font-bold text-white tracking-tight"
            >
              Update Display Picture
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Advisory Banner with Exact User Requested Copy */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold flex items-start gap-2.5">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p data-testid="avatar-advisory-message" className="leading-snug">
            pilih betul-betul au gambar, sebab setahun sekali je boleh update profile picture. jangan menyesal :p
          </p>
        </div>

        {/* Cooldown Locked Banner */}
        {isLocked && (
          <div
            data-testid="avatar-cooldown-locked-banner"
            className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-1.5"
          >
            <strong className="flex items-center gap-1.5 font-bold text-rose-200">
              <Lock size={15} /> Display Picture Locked
            </strong>
            <p className="leading-relaxed">
              You can only update your profile picture once a year. Next update available on{' '}
              <strong className="text-white">{cooldown.nextAvailableDate}</strong>{' '}
              ({cooldown.daysRemaining} days remaining).
            </p>
          </div>
        )}

        {/* Admin Override Indicator */}
        {isAdmin && !cooldown.canUpdate && (
          <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px]">
            <strong>Admin Override:</strong> You have admin privileges to update this photo during active cooldown.
          </div>
        )}

        {/* Image Preview & Selection Area */}
        <div className="flex flex-col items-center justify-center py-2 gap-3">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-800/80 border-2 border-emerald-500/40 flex items-center justify-center overflow-hidden relative shadow-inner">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="New image preview"
                className="w-full h-full object-cover"
              />
            ) : player.avatar_url ? (
              <img
                src={player.avatar_url}
                alt={player.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-3xl font-black text-slate-400">
                {player.display_name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {!isLocked && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                data-testid="avatar-file-input"
                className="sr-only"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                data-testid="avatar-select-btn"
                className="px-4 py-2 rounded-xl bg-[#16202e] hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Upload size={14} className="text-emerald-400" />
                <span>{selectedFile ? 'Choose Another Image' : 'Choose Image File (Max 5MB)'}</span>
              </button>
            </>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div
            data-testid="avatar-error-banner"
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium"
          >
            {errorMsg}
          </div>
        )}

        {/* 2. Confirmation Reminder Dialog with Exact User Requested Copy */}
        {showConfirmStep ? (
          <div
            data-testid="avatar-confirm-modal"
            className="p-4 rounded-xl bg-slate-900 border border-amber-500/50 flex flex-col gap-3 shadow-xl"
          >
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <AlertTriangle size={18} />
              <span>Upload Confirmation</span>
            </div>

            <p
              data-testid="avatar-confirm-message"
              className="text-sm font-bold text-white leading-relaxed"
            >
              betul ni? confirm ni? dah pikir masak-mask belom
            </p>

            <p className="text-[11px] text-slate-400">
              Once saved, this picture cannot be changed again for 1 year (365 days).
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfirmStep(false)}
                disabled={isSubmitting}
                data-testid="cancel-confirm-avatar-btn"
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleFinalConfirmSave}
                disabled={isSubmitting}
                data-testid="final-confirm-avatar-btn"
                className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 hover:text-white border border-slate-600 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check size={14} />
                    <span>yessir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>

            {!isLocked && (
              <button
                type="button"
                onClick={handleInitialSaveClick}
                disabled={!selectedFile || isSubmitting}
                data-testid="save-avatar-btn"
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span>Update Display Picture</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
