import React, { useState } from 'react';
import { Mail, Send, Copy, Check, Trash2, Key } from 'lucide-react';
import type { MembershipRole, DbPlayerRow } from '../../types/database.ts';
import type { InvitationMetadataRow } from '../../services/demoData.ts';

export interface AdminInvitationsSectionProps {
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: Exclude<MembershipRole, 'owner'>;
  setInviteRole: (role: Exclude<MembershipRole, 'owner'>) => void;
  inviteProposedPlayerId: string;
  setInviteProposedPlayerId: (id: string) => void;
  inviteExpiresDays: number;
  setInviteExpiresDays: (days: number) => void;
  unlinkedPermanentPlayers: readonly DbPlayerRow[];
  isOwner: boolean;
  isDemoMode: boolean;
  isMutating: boolean;
  handleIssueInvitation: (e: React.FormEvent) => void;
  oneTimeIssuedSecret: {
    invitationId: string;
    invitedEmail: string;
    rawToken: string;
    expiresAt: string;
  } | null;
  setOneTimeIssuedSecret: (secret: null) => void;
  invitations: readonly InvitationMetadataRow[];
  revokeReasons: Record<string, string>;
  setRevokeReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleRevokeInvitation: (id: string) => void;
}

export const AdminInvitationsSection: React.FC<AdminInvitationsSectionProps> = ({
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviteProposedPlayerId,
  setInviteProposedPlayerId,
  inviteExpiresDays,
  setInviteExpiresDays,
  unlinkedPermanentPlayers,
  isOwner,
  isDemoMode,
  isMutating,
  handleIssueInvitation,
  oneTimeIssuedSecret,
  setOneTimeIssuedSecret,
  invitations,
  revokeReasons,
  setRevokeReasons,
  handleRevokeInvitation,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleCopy = (text: string, isLink: boolean) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      if (isLink) {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    }
  };

  const inviteUrl = oneTimeIssuedSecret
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://tracker.local'}/?invite=${oneTimeIssuedSecret.rawToken}`
    : '';

  return (
    <div
      className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 shadow-xl flex flex-col gap-4"
      data-testid="admin-section-invitations"
    >
      <div>
        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight m-0 flex items-center gap-2">
          <Mail size={16} className="text-emerald-400" />
          <span>1. Single-Use Invitation Management</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1 m-0">
          Invitations are bound to a normalized email address, expire in up to 7 days, and are securely hashed in the database.
          The token is returned only once upon issuance so you can copy and share the link manually.
        </p>
      </div>

      <form onSubmit={(e) => void handleIssueInvitation(e)} noValidate className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="admin-invite-email"
              className="block text-xs font-semibold text-slate-300 mb-1"
            >
              Invited Account Email (Required)
            </label>
            <input
              id="admin-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={isDemoMode || isMutating}
              placeholder="member@example.com"
              className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="admin-invite-role"
              className="block text-xs font-semibold text-slate-300 mb-1"
            >
              Intended Role
            </label>
            <select
              id="admin-invite-role"
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as Exclude<MembershipRole, 'owner'>)
              }
              disabled={isDemoMode || isMutating}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="member">member (General Member)</option>
              <option value="recorder">recorder (Match Score Keeper)</option>
              <option value="admin" disabled={!isOwner}>
                admin {isOwner ? '(Club Organizer)' : '(Owner only)'}
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="admin-invite-proposed-player"
              className="block text-xs font-semibold text-slate-300 mb-1"
            >
              Pre-link Existing Player Profile (Optional)
            </label>
            <select
              id="admin-invite-proposed-player"
              value={inviteProposedPlayerId}
              onChange={(e) => setInviteProposedPlayerId(e.target.value)}
              disabled={isDemoMode || isMutating}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="">None (Decide on approval)</option>
              {unlinkedPermanentPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.id.slice(-6)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="admin-invite-expiry"
              className="block text-xs font-semibold text-slate-300 mb-1"
            >
              Expiry (1–7 Days)
            </label>
            <input
              id="admin-invite-expiry"
              type="number"
              min={1}
              max={7}
              value={inviteExpiresDays}
              onChange={(e) =>
                setInviteExpiresDays(Number(e.target.value) || 7)
              }
              disabled={isDemoMode || isMutating}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={isDemoMode || isMutating}
            data-testid="issue-invitation-submit-btn"
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Send size={15} />
            <span>{isMutating ? 'Issuing...' : 'Issue Single-Use Invitation'}</span>
          </button>
        </div>
      </form>

      {/* One-time raw token & invite link box */}
      {oneTimeIssuedSecret && (
        <div
          role="region"
          aria-label="One-time invitation token"
          data-testid="one-time-invitation-secret-box"
          className="p-4 rounded-xl bg-emerald-950/40 border-2 border-emerald-500/60 text-emerald-200 flex flex-col gap-2.5 shadow-lg shadow-emerald-500/10"
        >
          <div className="flex items-center gap-2 font-bold text-white text-sm">
            <Key size={16} className="text-emerald-400" />
            <span>One-Time Invitation Secret for {oneTimeIssuedSecret.invitedEmail}</span>
          </div>

          <p className="text-xs text-emerald-300/90 m-0">
            Copy and share this link or token now. It is stored securely — once dismissed, this token can never be viewed again.
          </p>

          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[#0b1118]/80 border border-emerald-500/30 text-xs">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-slate-300">Manual Share Link:</strong>
              <button
                type="button"
                onClick={() => handleCopy(inviteUrl, true)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
              >
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
            <code
              data-testid="one-time-invite-link"
              className="text-[11px] text-emerald-300 bg-emerald-950/60 p-1.5 rounded break-all select-all font-mono"
            >
              {inviteUrl}
            </code>
          </div>

          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[#0b1118]/80 border border-emerald-500/30 text-xs">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-slate-300">Invitation Token:</strong>
              <button
                type="button"
                onClick={() => handleCopy(oneTimeIssuedSecret.rawToken, false)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
              >
                {copiedToken ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedToken ? 'Copied!' : 'Copy Token'}</span>
              </button>
            </div>
            <code
              data-testid="one-time-raw-token"
              className="text-[11px] text-emerald-300 bg-emerald-950/60 p-1.5 rounded break-all select-all font-mono"
            >
              {oneTimeIssuedSecret.rawToken}
            </code>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setOneTimeIssuedSecret(null)}
              data-testid="dismiss-one-time-token-btn"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              Dismiss One-Time Secret
            </button>
          </div>
        </div>
      )}

      {/* Issued Invitations List */}
      <div className="pt-2 border-t border-slate-800">
        <h4 className="text-xs sm:text-sm font-semibold text-slate-200 m-0 mb-2.5">
          Issued Invitations ({invitations.length})
        </h4>

        {invitations.length === 0 ? (
          <p className="text-xs text-slate-500 m-0 py-2">
            No invitations recorded for this group.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                data-testid={`invitation-row-${inv.id}`}
                className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs"
              >
                <div className="flex flex-col gap-1 min-w-[200px]">
                  <div className="font-semibold text-white text-xs sm:text-sm">
                    {inv.invited_email_normalized}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                      Role: {inv.intended_role}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        inv.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : inv.status === 'redeemed'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {inv.status}
                    </span>
                    <span>Expires: {inv.expires_at.slice(0, 10)}</span>
                  </div>
                  {inv.revoke_reason && (
                    <span className="text-[11px] text-rose-300">
                      Reason: {inv.revoke_reason}
                    </span>
                  )}
                </div>

                {inv.status === 'pending' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="text"
                      aria-label={`Revocation reason for ${inv.invited_email_normalized}`}
                      placeholder="Revoke reason (min 3 chars)"
                      value={revokeReasons[inv.id] ?? ''}
                      onChange={(e) =>
                        setRevokeReasons((prev) => ({
                          ...prev,
                          [inv.id]: e.target.value,
                        }))
                      }
                      disabled={isDemoMode || isMutating}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleRevokeInvitation(inv.id)}
                      data-testid={`revoke-invitation-btn-${inv.id}`}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Revoke</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
