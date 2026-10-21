import React from 'react';
import { Crown, ShieldAlert, KeyRound, AlertOctagon } from 'lucide-react';

export interface OwnershipRecipientItem {
  membership_id: string;
  account_email: string;
  role: string;
}

interface AdminOwnershipSectionProps {
  isOwner: boolean;
  viewerRole: string;
  eligibleOwnershipRecipients: OwnershipRecipientItem[];
  newOwnerMembershipId: string;
  setNewOwnerMembershipId: (val: string) => void;
  ownershipTransferReason: string;
  setOwnershipTransferReason: (val: string) => void;
  ownershipTransferConfirmed: boolean;
  setOwnershipTransferConfirmed: (val: boolean) => void;
  handleTransferOwnership: (e: React.FormEvent) => Promise<void>;
  isDemoMode: boolean;
  isMutating: boolean;
}

export function AdminOwnershipSection({
  isOwner,
  viewerRole,
  eligibleOwnershipRecipients,
  newOwnerMembershipId,
  setNewOwnerMembershipId,
  ownershipTransferReason,
  setOwnershipTransferReason,
  ownershipTransferConfirmed,
  setOwnershipTransferConfirmed,
  handleTransferOwnership,
  isDemoMode,
  isMutating,
}: AdminOwnershipSectionProps) {
  const isFormValid =
    isOwner &&
    Boolean(newOwnerMembershipId) &&
    ownershipTransferReason.trim().length >= 3 &&
    ownershipTransferConfirmed;

  return (
    <div
      data-testid="admin-section-ownership"
      className="bg-[#121c28] border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden"
    >
      {/* Decorative accent glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Crown size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 bg-purple-950/60 border border-purple-800/50 px-2 py-0.5 rounded-full">
                Governance Hierarchy
              </span>
              <span className="text-xs text-slate-500">Section 5</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
              Ownership Transfer
            </h3>
          </div>
        </div>

        <div className="self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs font-semibold text-purple-300">
            <KeyRound size={13} className="text-purple-400" />
            Group Owner Exclusive
          </span>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-400 mt-3 mb-5 leading-relaxed">
        Only the current Group Owner may transfer group ownership to another approved group member.
        Upon transfer, the current Owner will become an Admin and the selected recipient will become the new Owner.
        This action is immediate and audited.
      </p>

      {/* Non-owner restricted warning */}
      {!isOwner && (
        <div
          role="note"
          data-testid="ownership-transfer-owner-only-note"
          className="mb-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3 leading-relaxed"
        >
          <ShieldAlert size={18} className="shrink-0 mt-0.5 text-amber-400" />
          <div>
            <strong className="block text-sm font-bold text-amber-200 mb-0.5">
              Access Restricted to Group Owner
            </strong>
            Ownership Transfer is strictly restricted to the current Group Owner.
            Your current effective group role is{' '}
            <code className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-800/60 rounded text-amber-200 font-bold">
              {viewerRole}
            </code>
            . You can view this section for transparency, but transfers can only be initiated by the active Owner.
          </div>
        </div>
      )}

      {/* Transfer Form Box */}
      <div className="bg-[#0b121b] border border-slate-800 rounded-xl p-4 sm:p-5">
        <form onSubmit={(e) => void handleTransferOwnership(e)} noValidate>
          {/* Recipient select */}
          <div className="mb-4">
            <label
              htmlFor="admin-transfer-owner-target"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Recipient Approved Membership (Explicit Membership UUID)
            </label>
            <div className="relative">
              <select
                id="admin-transfer-owner-target"
                value={newOwnerMembershipId}
                onChange={(e) => setNewOwnerMembershipId(e.target.value)}
                disabled={isDemoMode || isMutating || !isOwner}
                className="w-full h-11 px-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
              >
                <option value="">-- Select eligible approved membership UUID --</option>
                {eligibleOwnershipRecipients.map((m) => (
                  <option key={m.membership_id} value={m.membership_id}>
                    {m.account_email} (Role: {m.role} • Membership UUID: {m.membership_id})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Eligible candidates: {eligibleOwnershipRecipients.length} approved members
            </p>
          </div>

          {/* Reason input */}
          <div className="mb-4">
            <label
              htmlFor="admin-transfer-owner-reason"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Reason for Ownership Transfer (Required, min 3 chars)
            </label>
            <input
              id="admin-transfer-owner-reason"
              type="text"
              value={ownershipTransferReason}
              onChange={(e) => setOwnershipTransferReason(e.target.value)}
              disabled={isDemoMode || isMutating || !isOwner}
              placeholder="e.g. Handing over club leadership for 2026"
              className="w-full h-11 px-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Confirmation Checkbox */}
          <div className="mb-5 p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl">
            <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-300 hover:text-white select-none">
              <input
                type="checkbox"
                checked={ownershipTransferConfirmed}
                onChange={(e) => setOwnershipTransferConfirmed(e.target.checked)}
                disabled={isDemoMode || isMutating || !isOwner}
                data-testid="confirm-ownership-transfer-checkbox"
                className="w-4 h-4 mt-0.5 rounded border-slate-700 bg-slate-900 text-purple-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
              />
              <span className="leading-relaxed">
                I confirm transferring Group Ownership and demoting my membership to{' '}
                <code className="text-purple-300 font-mono font-bold">admin</code>.
                I understand this action takes effect immediately upon submission.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isDemoMode || isMutating || !isFormValid}
            data-testid="transfer-ownership-submit-btn"
            className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-500/20 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
          >
            {isMutating ? (
              'Transferring Ownership...'
            ) : (
              <>
                <AlertOctagon size={15} />
                Transfer Group Ownership
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
