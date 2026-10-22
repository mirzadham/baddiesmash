import React from 'react';
import { Users, UserCheck, UserX, Link as LinkIcon } from 'lucide-react';
import type {
  AdminMembershipDirectoryEntry,
  MembershipRole,
  MembershipStatus,
  DbPlayerRow,
} from '../../types/database.ts';
import type { GroupReadSnapshot } from '../../services/demoData.ts';

export type ApprovalLinkingMode =
  | 'unselected'
  | 'link_existing'
  | 'create_new'
  | 'viewer_unlinked';

export interface PendingDecisionDraft {
  linkingMode: ApprovalLinkingMode;
  selectedPlayerId: string;
  newPlayerDisplayName: string;
  reason: string;
}

export interface MemberEditDraft {
  role: MembershipRole;
  status: MembershipStatus;
  reason: string;
  linkPlayerId: string;
  linkReason: string;
}

export interface AdminMembershipsSectionProps {
  pendingMemberships: readonly AdminMembershipDirectoryEntry[];
  existingMemberships: readonly AdminMembershipDirectoryEntry[];
  unlinkedPermanentPlayers: readonly DbPlayerRow[];
  snapshot: GroupReadSnapshot;
  isOwner: boolean;
  isDemoMode: boolean;
  isMutating: boolean;
  getPendingDraft: (entry: AdminMembershipDirectoryEntry) => PendingDecisionDraft;
  updatePendingDraft: (
    id: string,
    entry: AdminMembershipDirectoryEntry,
    patch: Partial<PendingDecisionDraft>,
  ) => void;
  handleApproveMembership: (entry: AdminMembershipDirectoryEntry) => Promise<void>;
  handleRejectMembership: (entry: AdminMembershipDirectoryEntry) => Promise<void>;
  getMemberEditDraft: (entry: AdminMembershipDirectoryEntry) => MemberEditDraft;
  updateMemberEditDraft: (
    id: string,
    entry: AdminMembershipDirectoryEntry,
    patch: Partial<MemberEditDraft>,
  ) => void;
  handleUpdateMemberRoleOrStatus: (
    entry: AdminMembershipDirectoryEntry,
  ) => Promise<void>;
  handleLinkMemberProfile: (
    entry: AdminMembershipDirectoryEntry,
  ) => Promise<void>;
}

export const AdminMembershipsSection: React.FC<AdminMembershipsSectionProps> = ({
  pendingMemberships,
  existingMemberships,
  unlinkedPermanentPlayers,
  snapshot,
  isOwner,
  isDemoMode,
  isMutating,
  getPendingDraft,
  updatePendingDraft,
  handleApproveMembership,
  handleRejectMembership,
  getMemberEditDraft,
  updateMemberEditDraft,
  handleUpdateMemberRoleOrStatus,
  handleLinkMemberProfile,
}) => {
  const getRoleBadgeClass = (role: MembershipRole) => {
    switch (role) {
      case 'owner':
        return 'bg-amber-500/15 text-amber-300 border border-amber-500/40';
      case 'admin':
        return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40';
      case 'recorder':
        return 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40';
      case 'member':
        return 'bg-slate-700/40 text-slate-300 border border-slate-600/50';
      default:
        return 'bg-slate-800 text-slate-400 border border-slate-700';
    }
  };

  return (
    <div
      className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 flex flex-col gap-5"
      data-testid="admin-section-memberships"
    >
      <div>
        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight m-0 flex items-center gap-2">
          <Users size={16} className="text-emerald-400" />
          <span>2. Membership Approvals &amp; Role Management</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1 m-0">
          Pending accounts have zero access to group data until approved. When approving, you must explicitly select whether to link an existing player profile, create a new player profile, or approve as a Viewer without a linked player profile. Display names are never auto-linked.
        </p>
      </div>

      {/* Pending Membership Requests */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-semibold text-white m-0 flex items-center gap-2">
            <span>Pending Membership Requests</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingMemberships.length}
            </span>
          </h4>
        </div>

        {pendingMemberships.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-[#16202e] border border-slate-800/80 text-xs text-slate-500">
            No pending membership requests.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingMemberships.map((entry) => {
              const draft = getPendingDraft(entry);
              return (
                <div
                  key={entry.membership_id}
                  data-testid={`pending-membership-card-${entry.membership_id}`}
                  className="p-4 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-white text-sm">
                      {entry.account_email}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${getRoleBadgeClass(
                        entry.role,
                      )}`}
                    >
                      Intended: {entry.role}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 flex flex-wrap gap-2">
                    <span>Membership ID: <code className="text-slate-300 font-mono">{entry.membership_id.slice(-6)}</code></span>
                    {entry.requested_player_id && (
                      <span>• Requested Profile: <code className="text-slate-300 font-mono">{entry.requested_player_id.slice(-6)}</code></span>
                    )}
                    {entry.requested_new_player_name && (
                      <span>• Requested Name: <strong className="text-emerald-300">{entry.requested_new_player_name}</strong></span>
                    )}
                  </div>

                  <fieldset
                    className="p-3.5 rounded-xl bg-[#0d131d] border border-slate-800 flex flex-col gap-2.5"
                    disabled={isDemoMode || isMutating}
                  >
                    <legend className="text-xs font-semibold text-slate-300 px-1">
                      Player Profile Linking Choice (Required)
                    </legend>

                    {/* Option A: Link Existing */}
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name={`linking-mode-${entry.membership_id}`}
                          checked={draft.linkingMode === 'link_existing'}
                          onChange={() =>
                            updatePendingDraft(entry.membership_id, entry, {
                              linkingMode: 'link_existing',
                            })
                          }
                          data-testid={`radio-link-existing-${entry.membership_id}`}
                          className="accent-emerald-500"
                        />
                        <span className="font-semibold">
                          Option A: Link to an existing unlinked player profile UUID
                        </span>
                      </label>
                      {draft.linkingMode === 'link_existing' && (
                        <div className="ml-5">
                          <select
                            aria-label={`Select existing player UUID for ${entry.account_email}`}
                            value={draft.selectedPlayerId}
                            onChange={(e) =>
                              updatePendingDraft(entry.membership_id, entry, {
                                selectedPlayerId: e.target.value,
                              })
                            }
                            className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[#16202e] border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">-- Select unlinked player profile UUID --</option>
                            {unlinkedPermanentPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.display_name} (UUID: {p.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Option B: Create New */}
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name={`linking-mode-${entry.membership_id}`}
                          checked={draft.linkingMode === 'create_new'}
                          onChange={() =>
                            updatePendingDraft(entry.membership_id, entry, {
                              linkingMode: 'create_new',
                            })
                          }
                          data-testid={`radio-create-new-${entry.membership_id}`}
                          className="accent-emerald-500"
                        />
                        <span className="font-semibold">
                          Option B: Create and link a new permanent player profile
                        </span>
                      </label>
                      {draft.linkingMode === 'create_new' && (
                        <div className="ml-5">
                          <input
                            type="text"
                            aria-label={`New player display name for ${entry.account_email}`}
                            value={draft.newPlayerDisplayName}
                            onChange={(e) =>
                              updatePendingDraft(entry.membership_id, entry, {
                                newPlayerDisplayName: e.target.value,
                              })
                            }
                            placeholder="New player display name"
                            className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[#16202e] border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* Option C: Viewer Unlinked */}
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name={`linking-mode-${entry.membership_id}`}
                          checked={draft.linkingMode === 'viewer_unlinked'}
                          onChange={() =>
                            updatePendingDraft(entry.membership_id, entry, {
                              linkingMode: 'viewer_unlinked',
                            })
                          }
                          data-testid={`radio-viewer-unlinked-${entry.membership_id}`}
                          className="accent-emerald-500"
                        />
                        <span className="font-semibold">
                          Option C: Approve as Viewer without a linked player profile
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label={`Decision reason for ${entry.account_email}`}
                      placeholder="Optional approval/rejection note"
                      value={draft.reason}
                      onChange={(e) =>
                        updatePendingDraft(entry.membership_id, entry, {
                          reason: e.target.value,
                        })
                      }
                      disabled={isDemoMode || isMutating}
                      className="flex-1 min-w-[180px] min-h-[40px] px-3 py-1.5 rounded-lg bg-[#0d131d] border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                    />

                    <button
                      type="button"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleApproveMembership(entry)}
                      data-testid={`approve-membership-btn-${entry.membership_id}`}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <UserCheck size={14} />
                      <span>Approve Request</span>
                    </button>

                    <button
                      type="button"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleRejectMembership(entry)}
                      data-testid={`reject-membership-btn-${entry.membership_id}`}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <UserX size={14} />
                      <span>Reject Request</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Authorized Group Members Directory */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800">
        <h4 className="text-xs sm:text-sm font-semibold text-white m-0">
          Authorized Group Members Directory ({existingMemberships.length})
        </h4>

        <div className="flex flex-col gap-2.5">
          {existingMemberships.map((entry) => {
            const editDraft = getMemberEditDraft(entry);
            const linkedPlayer = snapshot.players.find(
              (p) => p.id === entry.linked_player_id,
            );
            const isTargetOwner = entry.role === 'owner';

            return (
              <div
                key={entry.membership_id}
                data-testid={`member-directory-row-${entry.membership_id}`}
                className="p-3.5 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col gap-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-white text-xs sm:text-sm">
                    {entry.account_email}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getRoleBadgeClass(
                        entry.role,
                      )}`}
                    >
                      {entry.role}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-medium">
                      Status: {entry.status}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Profile:{' '}
                      {linkedPlayer ? (
                        <strong className="text-emerald-400">{linkedPlayer.display_name}</strong>
                      ) : (
                        <em className="text-slate-500">None (Viewer-only)</em>
                      )}
                    </span>
                  </div>
                </div>

                {!isTargetOwner && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/60 items-center">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">
                        Role
                      </label>
                      <select
                        aria-label={`Role for ${entry.account_email}`}
                        value={editDraft.role}
                        onChange={(e) =>
                          updateMemberEditDraft(entry.membership_id, entry, {
                            role: e.target.value as MembershipRole,
                          })
                        }
                        disabled={isDemoMode || isMutating}
                        className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs focus:outline-none focus:border-emerald-500"
                      >
                        <option value="member">member</option>
                        <option value="recorder">recorder</option>
                        <option value="admin">
                          admin {isOwner ? '' : '(Owner required)'}
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">
                        Status
                      </label>
                      <select
                        aria-label={`Status for ${entry.account_email}`}
                        value={editDraft.status}
                        onChange={(e) =>
                          updateMemberEditDraft(entry.membership_id, entry, {
                            status: e.target.value as MembershipStatus,
                          })
                        }
                        disabled={isDemoMode || isMutating}
                        className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs focus:outline-none focus:border-emerald-500"
                      >
                        <option value="approved">approved</option>
                        <option value="suspended">suspended</option>
                        <option value="departed">departed</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">
                        Reason
                      </label>
                      <input
                        type="text"
                        aria-label={`Role update reason for ${entry.account_email}`}
                        placeholder="Reason (min 3 chars)"
                        value={editDraft.reason}
                        onChange={(e) =>
                          updateMemberEditDraft(entry.membership_id, entry, {
                            reason: e.target.value,
                          })
                        }
                        disabled={isDemoMode || isMutating}
                        className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="sm:self-end">
                      <button
                        type="button"
                        disabled={isDemoMode || isMutating}
                        onClick={() => void handleUpdateMemberRoleOrStatus(entry)}
                        data-testid={`update-member-btn-${entry.membership_id}`}
                        className="w-full min-h-[38px] px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Update Role/Status
                      </button>
                    </div>
                  </div>
                )}

                {/* Profile Linking Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 items-center">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">
                      Link Player Profile
                    </label>
                    <select
                      aria-label={`Linked player UUID for ${entry.account_email}`}
                      value={editDraft.linkPlayerId}
                      onChange={(e) =>
                        updateMemberEditDraft(entry.membership_id, entry, {
                          linkPlayerId: e.target.value,
                        })
                      }
                      disabled={isDemoMode || isMutating}
                      className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Unlinked (Viewer-only)</option>
                      {unlinkedPermanentPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} ({p.id.slice(-6)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">
                      Link Reason
                    </label>
                    <input
                      type="text"
                      aria-label={`Profile link reason for ${entry.account_email}`}
                      placeholder="Link reason (min 3 chars)"
                      value={editDraft.linkReason}
                      onChange={(e) =>
                        updateMemberEditDraft(entry.membership_id, entry, {
                          linkReason: e.target.value,
                        })
                      }
                      disabled={isDemoMode || isMutating}
                      className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[#0d131d] border border-slate-700/80 text-white text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:self-end">
                    <button
                      type="button"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleLinkMemberProfile(entry)}
                      data-testid={`link-member-profile-btn-${entry.membership_id}`}
                      className="w-full min-h-[38px] px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <LinkIcon size={12} />
                      <span>Save Profile Link</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
