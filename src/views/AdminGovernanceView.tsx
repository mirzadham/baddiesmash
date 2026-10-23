import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check, RefreshCw, ShieldAlert, X } from 'lucide-react';
import {
  type AdminCategoryTab,
  AdminHeader,
} from '../components/admin/AdminHeader.tsx';
import { AdminInvitationsSection } from '../components/admin/AdminInvitationsSection.tsx';
import { AdminMembershipsSection } from '../components/admin/AdminMembershipsSection.tsx';
import { AdminPlayersSection } from '../components/admin/AdminPlayersSection.tsx';
import { AdminGuestMergeSection } from '../components/admin/AdminGuestMergeSection.tsx';
import { AdminOwnershipSection } from '../components/admin/AdminOwnershipSection.tsx';
import { AdminRatingHealthSection } from '../components/admin/AdminRatingHealthSection.tsx';
import { sanitizeInvitationRpcError } from '../lib/inviteToken.ts';
import { scrollToTop } from '../lib/scroll.ts';
import type {
  AdminGovernanceSnapshot,
  GroupReadSnapshot,
} from '../services/demoData.ts';
import type {
  EffectivePublicationBannerState,
  TrackerRepository,
} from '../services/trackerRepository.ts';
import type {
  AdminMembershipDirectoryEntry,
  GuestMergeExecutionResponse,
  GuestMergePreviewResponse,
  IssueGroupInvitationResponse,
  MembershipRole,
  MembershipStatus,
} from '../types/database.ts';

export interface AdminGovernanceViewProps {
  snapshot: GroupReadSnapshot;
  repository: TrackerRepository;
  publication?: EffectivePublicationBannerState;
  onRetryRecalculation?: () => Promise<void>;
  onRefreshGroupState: () => Promise<void>;
  onClose: () => void;
}

type ApprovalLinkingMode =
  | 'unselected'
  | 'link_existing'
  | 'create_new'
  | 'viewer_unlinked';

interface PendingDecisionDraft {
  linkingMode: ApprovalLinkingMode;
  selectedPlayerId: string;
  newPlayerDisplayName: string;
  reason: string;
}

interface MemberEditDraft {
  role: MembershipRole;
  status: MembershipStatus;
  reason: string;
  linkPlayerId: string;
  linkReason: string;
}

/**
 * Administrative & Owner Governance Panel (`Checkpoint 3B`).
 *
 * Security & Integrity Invariants:
 * - Rendered only for approved `admin` or `owner` members; all mutations are enforced server-side in PostgreSQL RPCs.
 * - Never auto-links accounts to player profiles or merges guests by display name alone (`ID-01`, `ID-02`, `ID-03`).
 * - Displays raw invitation tokens ONLY once immediately after a confirmed `issue_group_invitation` response.
 * - Requires a fresh server-side `preview_guest_into_player_merge` before `merge_guest_into_player`, and refreshes both preview and group state on failure.
 * - Disables all mutations in Demo Mode with an explicit read-only banner.
 */
export function AdminGovernanceView({
  snapshot,
  repository,
  publication,
  onRetryRecalculation,
  onRefreshGroupState,
  onClose,
}: AdminGovernanceViewProps) {
  const isDemoMode = snapshot.isDemoMode || repository.isDemoMode;
  const viewerRole = snapshot.viewerMembership.role;
  const isOwner = viewerRole === 'owner';
  const groupId = snapshot.group.id;

  // Keep a live reference to the latest required_match_state_seq so async failure-recovery
  // handlers never read a stale closure value after awaiting onRefreshGroupState().
  const latestRequiredMatchSeqRef = useRef<number>(
    snapshot.group.required_match_state_seq,
  );
  latestRequiredMatchSeqRef.current = snapshot.group.required_match_state_seq;

  const [adminSnapshot, setAdminSnapshot] =
    useState<AdminGovernanceSnapshot | null>(null);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState<boolean>(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  // Global in-flight guard to prevent accidental double submissions across governance actions
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<
    string | null
  >(null);

  // 1. Invitation issuance & revocation state
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] =
    useState<Exclude<MembershipRole, 'owner'>>('member');
  const [inviteProposedPlayerId, setInviteProposedPlayerId] =
    useState<string>('');
  const [inviteExpiresDays, setInviteExpiresDays] = useState<number>(7);
  // One-time secret state: held only in volatile React state immediately after issuance
  const [oneTimeIssuedSecret, setOneTimeIssuedSecret] = useState<{
    invitationId: string;
    invitedEmail: string;
    rawToken: string;
    expiresAt: string;
  } | null>(null);
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>(
    {},
  );

  // 2. Pending membership request decision drafts
  const [pendingDrafts, setPendingDrafts] = useState<
    Record<string, PendingDecisionDraft>
  >({});

  // 3. Existing member role/status & profile link drafts
  const [memberEdits, setMemberEdits] = useState<
    Record<string, MemberEditDraft>
  >({});

  // 4. Player profile creation & active status state
  const [newPlayerDisplayName, setNewPlayerDisplayName] = useState<string>('');
  const [newPlayerIsGuest, setNewPlayerIsGuest] = useState<boolean>(false);
  const [playerStatusReasons, setPlayerStatusReasons] = useState<
    Record<string, string>
  >({});

  // 5. Guest merge preview & execution state
  const [mergeSourceGuestId, setMergeSourceGuestId] = useState<string>('');
  const [mergeTargetPermanentId, setMergeTargetPermanentId] =
    useState<string>('');
  const [mergePreview, setMergePreview] =
    useState<GuestMergePreviewResponse | null>(null);
  const [mergePreviewMatchSeq, setMergePreviewMatchSeq] = useState<
    number | null
  >(null);
  const [mergeReason, setMergeReason] = useState<string>('');
  const [mergeConfirmedCheckbox, setMergeConfirmedCheckbox] =
    useState<boolean>(false);
  const [lastMergeOutcome, setLastMergeOutcome] =
    useState<GuestMergeExecutionResponse | null>(null);

  // 6. Ownership transfer state
  const [newOwnerMembershipId, setNewOwnerMembershipId] = useState<string>('');
  const [ownershipTransferReason, setOwnershipTransferReason] =
    useState<string>('');
  const [ownershipTransferConfirmed, setOwnershipTransferConfirmed] =
    useState<boolean>(false);

  // Active category navigation tab for admin control room
  const [activeCategory, setActiveCategory] = useState<AdminCategoryTab>('all');

  const loadAdminData = useCallback(async () => {
    setIsLoadingDirectory(true);
    setDirectoryError(null);
    try {
      const data = await repository.loadAdminGovernanceSnapshot(groupId);
      setAdminSnapshot(data);
    } catch (err) {
      setDirectoryError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to load administrative governance directory.',
      );
    } finally {
      setIsLoadingDirectory(false);
    }
  }, [repository, groupId]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  // Ensure viewport scrolls to the top so Admin Tools panel is immediately visible
  useEffect(() => {
    scrollToTop();
  }, []);

  // Clear one-time raw invitation token on unmount
  useEffect(() => {
    return () => {
      setOneTimeIssuedSecret(null);
    };
  }, []);

  const unmergedPlayers = snapshot.players.filter(
    (p) => p.merged_into_player_id === null,
  );
  const unmergedPermanentPlayers = unmergedPlayers.filter((p) => !p.is_guest);
  const unmergedGuestPlayers = unmergedPlayers.filter((p) => p.is_guest);

  const linkedPlayerIds = new Set(
    (adminSnapshot?.memberships ?? [])
      .filter(
        (m) =>
          m.linked_player_id !== null &&
          (m.status === 'approved' ||
            m.status === 'pending_approval' ||
            m.status === 'suspended'),
      )
      .map((m) => m.linked_player_id as string),
  );

  const unlinkedPermanentPlayers = unmergedPermanentPlayers.filter(
    (p) => !linkedPlayerIds.has(p.id),
  );

  const getPendingDraft = (
    entry: AdminMembershipDirectoryEntry,
  ): PendingDecisionDraft => {
    const existing = pendingDrafts[entry.membership_id];
    if (existing) {
      return existing;
    }

    let defaultLinkingMode: ApprovalLinkingMode = 'unselected';
    if (
      entry.requested_new_player_name &&
      entry.requested_new_player_name.trim().length > 0
    ) {
      defaultLinkingMode = 'create_new';
    } else if (entry.requested_player_id) {
      defaultLinkingMode = 'link_existing';
    }

    return {
      linkingMode: defaultLinkingMode,
      selectedPlayerId: entry.requested_player_id ?? '',
      newPlayerDisplayName: entry.requested_new_player_name ?? '',
      reason: '',
    };
  };

  const updatePendingDraft = (
    membershipId: string,
    entry: AdminMembershipDirectoryEntry,
    patch: Partial<PendingDecisionDraft>,
  ) => {
    const current = getPendingDraft(entry);
    setPendingDrafts((prev) => ({
      ...prev,
      [membershipId]: { ...current, ...patch },
    }));
  };

  const getMemberEditDraft = (
    entry: AdminMembershipDirectoryEntry,
  ): MemberEditDraft => {
    return (
      memberEdits[entry.membership_id] ?? {
        role: entry.role,
        status: entry.status,
        reason: '',
        linkPlayerId: entry.linked_player_id ?? '',
        linkReason: '',
      }
    );
  };

  const updateMemberEditDraft = (
    membershipId: string,
    entry: AdminMembershipDirectoryEntry,
    patch: Partial<MemberEditDraft>,
  ) => {
    const current = getMemberEditDraft(entry);
    setMemberEdits((prev) => ({
      ...prev,
      [membershipId]: { ...current, ...patch },
    }));
  };

  // --- Handlers ---

  const handleIssueInvitation = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isMutating) {
      return;
    }

    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setActionError('Please enter a valid email address for the invitation.');
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);
    // Clear any previous one-time secret before issuing a new one
    setOneTimeIssuedSecret(null);

    try {
      const response: IssueGroupInvitationResponse =
        await repository.issueGroupInvitation({
          groupId,
          invitedEmail: trimmedEmail,
          intendedRole: inviteRole,
          proposedPlayerId: inviteProposedPlayerId || null,
          expiresInDays: inviteExpiresDays,
        });

      setOneTimeIssuedSecret({
        invitationId: response.invitation_id,
        invitedEmail: trimmedEmail,
        rawToken: response.raw_token,
        expiresAt: response.expires_at,
      });
      setInviteEmail('');
      setInviteProposedPlayerId('');
      await loadAdminData();
      setActionSuccessMessage(
        `Invitation issued for ${trimmedEmail}. Copy the one-time token or link below immediately: it will never be shown again.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to issue invitation.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (isDemoMode || isMutating) {
      return;
    }
    const reason = (revokeReasons[invitationId] ?? '').trim();
    if (reason.length < 3) {
      setActionError(
        'A revocation reason of at least 3 characters is required.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.revokeGroupInvitation({
        invitationId,
        reason,
      });
      if (oneTimeIssuedSecret?.invitationId === invitationId) {
        setOneTimeIssuedSecret(null);
      }
      await loadAdminData();
      setActionSuccessMessage('Invitation revoked and audited on the server.');
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to revoke invitation.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleApproveMembership = async (
    entry: AdminMembershipDirectoryEntry,
  ) => {
    if (isDemoMode || isMutating) {
      return;
    }
    const draft = getPendingDraft(entry);

    if (draft.linkingMode === 'unselected') {
      setActionError(
        'Please explicitly select a player-linking choice (Link Existing Player UUID, Create New Player Profile, or Approve as Viewer without a player profile). Accounts are never linked automatically by display name.',
      );
      setActionSuccessMessage(null);
      return;
    }

    if (draft.linkingMode === 'link_existing' && !draft.selectedPlayerId) {
      setActionError(
        'Please select the existing unlinked player UUID to link to this account.',
      );
      setActionSuccessMessage(null);
      return;
    }

    if (
      draft.linkingMode === 'create_new' &&
      !draft.newPlayerDisplayName.trim()
    ) {
      setActionError(
        'Please enter a display name for the new permanent player profile.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.decideMembershipRequest({
        membershipId: entry.membership_id,
        decision: 'approve',
        reason: draft.reason.trim() || 'Approved by group administrator',
        linkedPlayerId:
          draft.linkingMode === 'link_existing' ? draft.selectedPlayerId : null,
        createNewPlayer: draft.linkingMode === 'create_new',
        newPlayerDisplayName:
          draft.linkingMode === 'create_new'
            ? draft.newPlayerDisplayName.trim()
            : null,
      });

      await Promise.all([loadAdminData(), onRefreshGroupState()]);
      setActionSuccessMessage(
        `Approved membership for ${entry.account_email}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to approve membership request.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleRejectMembership = async (
    entry: AdminMembershipDirectoryEntry,
  ) => {
    if (isDemoMode || isMutating) {
      return;
    }
    const draft = getPendingDraft(entry);

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.decideMembershipRequest({
        membershipId: entry.membership_id,
        decision: 'reject',
        reason: draft.reason.trim() || 'Declined by group administrator',
        linkedPlayerId: null,
        createNewPlayer: false,
        newPlayerDisplayName: null,
      });

      await loadAdminData();
      setActionSuccessMessage(
        `Rejected membership request for ${entry.account_email}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to reject membership request.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateMemberRoleOrStatus = async (
    entry: AdminMembershipDirectoryEntry,
  ) => {
    if (isDemoMode || isMutating) {
      return;
    }
    const draft = getMemberEditDraft(entry);
    if (draft.reason.trim().length < 3) {
      setActionError(
        'A reason of at least 3 characters is required to update a member role or status.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.updateMembershipRoleOrStatus({
        membershipId: entry.membership_id,
        newRole: draft.role,
        newStatus: draft.status,
        reason: draft.reason.trim(),
      });
      await Promise.all([loadAdminData(), onRefreshGroupState()]);
      setActionSuccessMessage(
        `Updated membership role/status for ${entry.account_email}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to update member role or status.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleLinkMemberProfile = async (
    entry: AdminMembershipDirectoryEntry,
  ) => {
    if (isDemoMode || isMutating) {
      return;
    }
    const draft = getMemberEditDraft(entry);
    if (draft.linkReason.trim().length < 3) {
      setActionError(
        'A reason of at least 3 characters is required to link or unlink a player profile.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.linkMemberPlayerProfile({
        membershipId: entry.membership_id,
        playerId: draft.linkPlayerId || null,
        reason: draft.linkReason.trim(),
      });
      await Promise.all([loadAdminData(), onRefreshGroupState()]);
      setActionSuccessMessage(
        `Updated linked player profile for ${entry.account_email}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to link member player profile.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreatePlayerProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isMutating) {
      return;
    }

    const trimmedName = newPlayerDisplayName.trim();
    if (!trimmedName) {
      setActionError('Player display name is required.');
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      const createdId = await repository.createPlayerProfile({
        groupId,
        displayName: trimmedName,
        isGuest: newPlayerIsGuest,
      });
      setNewPlayerDisplayName('');
      await onRefreshGroupState();
      setActionSuccessMessage(
        `Created ${newPlayerIsGuest ? 'Temporary Guest' : 'Permanent Player'} "${trimmedName}" (UUID: ${createdId}).`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to create player profile.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleTogglePlayerActiveStatus = async (
    playerId: string,
    targetIsActive: boolean,
  ) => {
    if (isDemoMode || isMutating) {
      return;
    }
    const reason = (playerStatusReasons[playerId] ?? '').trim();
    if (reason.length < 3) {
      setActionError(
        'A reason of at least 3 characters is required to change a player active/inactive status.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.setPlayerActiveStatus({
        playerId,
        isActive: targetIsActive,
        reason,
      });
      await onRefreshGroupState();
      setActionSuccessMessage(
        `Updated player status to ${targetIsActive ? 'Active' : 'Inactive'}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to change player active status.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const isPreviewStale =
    mergePreview !== null &&
    (mergePreview.source_guest_player_id !== mergeSourceGuestId ||
      mergePreview.target_permanent_player_id !== mergeTargetPermanentId ||
      (mergePreviewMatchSeq !== null &&
        mergePreviewMatchSeq !== snapshot.group.required_match_state_seq));

  const handlePreviewGuestMerge = async () => {
    if (isDemoMode || isMutating) {
      return;
    }
    if (!mergeSourceGuestId || !mergeTargetPermanentId) {
      setActionError(
        'Please select both a source temporary guest UUID and a target permanent player UUID before generating a preview.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);
    setLastMergeOutcome(null);

    try {
      const preview = await repository.previewGuestIntoPlayerMerge({
        groupId,
        sourceGuestPlayerId: mergeSourceGuestId,
        targetPermanentPlayerId: mergeTargetPermanentId,
      });
      setMergePreview(preview);
      setMergePreviewMatchSeq(latestRequiredMatchSeqRef.current);
      setMergeConfirmedCheckbox(false);
    } catch (err) {
      setMergePreview(null);
      setMergePreviewMatchSeq(null);
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to generate guest merge preview.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleExecuteGuestMerge = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isMutating) {
      return;
    }
    if (!mergePreview || isPreviewStale) {
      setActionError(
        'Guest merge preview is missing or stale. Please refresh the server impact preview before executing.',
      );
      setActionSuccessMessage(null);
      return;
    }
    if (!mergePreview.can_merge) {
      setActionError(
        'Guest merge is blocked by same-match participation conflicts.',
      );
      setActionSuccessMessage(null);
      return;
    }
    if (!mergeConfirmedCheckbox) {
      setActionError(
        'Please check the confirmation box before executing the irreversible guest merge.',
      );
      setActionSuccessMessage(null);
      return;
    }
    if (mergeReason.trim().length < 3) {
      setActionError(
        'A merge reason of at least 3 characters is required for the audit log.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      const outcome = await repository.mergeGuestIntoPlayer({
        groupId,
        sourceGuestPlayerId: mergePreview.source_guest_player_id,
        targetPermanentPlayerId: mergePreview.target_permanent_player_id,
        reason: mergeReason.trim(),
      });
      setLastMergeOutcome(outcome);
      setMergePreview(null);
      setMergePreviewMatchSeq(null);
      setMergeSourceGuestId('');
      setMergeTargetPermanentId('');
      setMergeReason('');
      setMergeConfirmedCheckbox(false);
      await Promise.all([onRefreshGroupState(), loadAdminData()]);
      setActionSuccessMessage(
        `Guest profile merged atomically (${outcome.reattributed_match_count} match(es) re-attributed, ${outcome.deduplicated_attendance_count} overlapping attendance(s) deduplicated, rating version ${outcome.published_rating_version_id} published).`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Guest merge execution failed on the server.',
      );
      // Condition 3: If execution fails, do not report success; refresh preview and current group/publication state
      try {
        await onRefreshGroupState();
        if (mergeSourceGuestId && mergeTargetPermanentId) {
          const refreshedPreview = await repository.previewGuestIntoPlayerMerge(
            {
              groupId,
              sourceGuestPlayerId: mergeSourceGuestId,
              targetPermanentPlayerId: mergeTargetPermanentId,
            },
          );
          setMergePreview(refreshedPreview);
          setMergePreviewMatchSeq(latestRequiredMatchSeqRef.current);
        }
      } catch {
        setMergePreview(null);
        setMergePreviewMatchSeq(null);
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleTransferOwnership = async (e: FormEvent) => {
    e.preventDefault();
    if (isDemoMode || isMutating) {
      return;
    }
    if (!newOwnerMembershipId) {
      setActionError(
        'Please select an eligible approved group member by membership UUID.',
      );
      setActionSuccessMessage(null);
      return;
    }
    if (!ownershipTransferConfirmed) {
      setActionError(
        'Please confirm that you understand transferring ownership will demote your account to Admin.',
      );
      setActionSuccessMessage(null);
      return;
    }
    if (ownershipTransferReason.trim().length < 3) {
      setActionError(
        'An ownership transfer reason of at least 3 characters is required.',
      );
      setActionSuccessMessage(null);
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      await repository.transferGroupOwnership({
        groupId,
        newOwnerMembershipId,
        reason: ownershipTransferReason.trim(),
      });
      setNewOwnerMembershipId('');
      setOwnershipTransferReason('');
      setOwnershipTransferConfirmed(false);
      await Promise.all([onRefreshGroupState(), loadAdminData()]);
      setActionSuccessMessage(
        'Group ownership transferred atomically and audited.',
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? sanitizeInvitationRpcError(err.message)
          : 'Failed to transfer group ownership.',
      );
    } finally {
      setIsMutating(false);
    }
  };

  const duplicateNameWarning =
    newPlayerDisplayName.trim().length > 0 &&
    unmergedPlayers.some(
      (p) =>
        p.display_name.toLowerCase() ===
        newPlayerDisplayName.trim().toLowerCase(),
    );

  const pendingMemberships = (adminSnapshot?.memberships ?? []).filter(
    (m) => m.status === 'pending_approval',
  );
  const existingMemberships = (adminSnapshot?.memberships ?? []).filter(
    (m) => m.status !== 'pending_approval',
  );
  const eligibleOwnershipRecipients = (adminSnapshot?.memberships ?? []).filter(
    (m) =>
      m.status === 'approved' &&
      m.membership_id !== snapshot.viewerMembership.id,
  );

  const showMembers = activeCategory === 'all' || activeCategory === 'members';
  const showPlayers = activeCategory === 'all' || activeCategory === 'players';
  const showSystem = activeCategory === 'all' || activeCategory === 'system';

  return (
    <section
      data-testid="admin-governance-panel"
      aria-labelledby="admin-governance-heading"
      className="pb-28 max-w-4xl mx-auto px-3 sm:px-4 pt-2 sm:pt-4"
    >
      {/* Sticky Header with Category Tabs and Close Button */}
      <AdminHeader
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        pendingCount={pendingMemberships.length}
        onClose={onClose}
      />

      {/* Global Status Alerts */}
      {isDemoMode && (
        <div
          role="note"
          data-testid="admin-demo-readonly-notice"
          className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold flex items-center gap-3 leading-relaxed"
        >
          <ShieldAlert size={16} className="text-amber-400 shrink-0" />
          <span>
            Demo Mode Read-Only Governance View: You can inspect the invitation,
            approval, player creation, guest merge, and ownership transfer
            controls below, but all server mutations are disabled because no
            Supabase backend is configured.
          </span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          data-testid="admin-action-error"
          className="mb-4 p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <X size={14} className="shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-white text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccessMessage && (
        <div
          role="status"
          data-testid="admin-action-success"
          className="mb-4 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Check size={14} className="shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-400 hover:text-white text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoadingDirectory && (
        <p
          role="status"
          data-testid="admin-directory-loading"
          className="text-xs text-slate-400 flex items-center gap-2 mb-4 p-3 bg-slate-900/60 border border-slate-800 rounded-xl"
        >
          <RefreshCw size={14} className="animate-spin text-emerald-400" />
          Loading invitation metadata and member directory...
        </p>
      )}

      {directoryError && (
        <div
          role="alert"
          data-testid="admin-directory-error"
          className="mb-4 p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm"
        >
          <p className="font-semibold mb-2 flex items-center gap-1.5">
            <X size={14} className="shrink-0" />
            <span>{directoryError}</span>
          </p>
          <button
            type="button"
            onClick={() => void loadAdminData()}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw size={12} className="shrink-0" />
            <span>Retry Loading Directory</span>
          </button>
        </div>
      )}

      {/* Main Sections Stack */}
      <div className="space-y-6">
        {/* MEMBERS & INVITATIONS CATEGORY */}
        {showMembers && (
          <>
            <AdminInvitationsSection
              invitations={adminSnapshot?.invitations ?? []}
              unlinkedPermanentPlayers={unlinkedPermanentPlayers}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              inviteProposedPlayerId={inviteProposedPlayerId}
              setInviteProposedPlayerId={setInviteProposedPlayerId}
              inviteExpiresDays={inviteExpiresDays}
              setInviteExpiresDays={setInviteExpiresDays}
              handleIssueInvitation={handleIssueInvitation}
              oneTimeIssuedSecret={oneTimeIssuedSecret}
              setOneTimeIssuedSecret={setOneTimeIssuedSecret}
              revokeReasons={revokeReasons}
              setRevokeReasons={setRevokeReasons}
              handleRevokeInvitation={handleRevokeInvitation}
              isOwner={isOwner}
              isDemoMode={isDemoMode}
              isMutating={isMutating}
            />

            <AdminMembershipsSection
              pendingMemberships={pendingMemberships}
              existingMemberships={existingMemberships}
              unlinkedPermanentPlayers={unlinkedPermanentPlayers}
              snapshot={snapshot}
              getPendingDraft={getPendingDraft}
              updatePendingDraft={updatePendingDraft}
              handleApproveMembership={handleApproveMembership}
              handleRejectMembership={handleRejectMembership}
              getMemberEditDraft={getMemberEditDraft}
              updateMemberEditDraft={updateMemberEditDraft}
              handleUpdateMemberRoleOrStatus={handleUpdateMemberRoleOrStatus}
              handleLinkMemberProfile={handleLinkMemberProfile}
              isOwner={isOwner}
              isDemoMode={isDemoMode}
              isMutating={isMutating}
            />
          </>
        )}

        {/* PLAYERS & ROSTER CATEGORY */}
        {showPlayers && (
          <>
            <AdminPlayersSection
              unmergedPlayers={unmergedPlayers}
              newPlayerDisplayName={newPlayerDisplayName}
              setNewPlayerDisplayName={setNewPlayerDisplayName}
              newPlayerIsGuest={newPlayerIsGuest}
              setNewPlayerIsGuest={setNewPlayerIsGuest}
              duplicateNameWarning={duplicateNameWarning}
              handleCreatePlayerProfile={handleCreatePlayerProfile}
              playerStatusReasons={playerStatusReasons}
              setPlayerStatusReasons={setPlayerStatusReasons}
              handleTogglePlayerActiveStatus={handleTogglePlayerActiveStatus}
              isDemoMode={isDemoMode}
              isMutating={isMutating}
            />

            <AdminGuestMergeSection
              unmergedGuestPlayers={unmergedGuestPlayers}
              unmergedPermanentPlayers={unmergedPermanentPlayers}
              mergeSourceGuestId={mergeSourceGuestId}
              setMergeSourceGuestId={setMergeSourceGuestId}
              mergeTargetPermanentId={mergeTargetPermanentId}
              setMergeTargetPermanentId={setMergeTargetPermanentId}
              mergePreview={mergePreview}
              setMergePreview={setMergePreview}
              setMergePreviewMatchSeq={setMergePreviewMatchSeq}
              mergeConfirmedCheckbox={mergeConfirmedCheckbox}
              setMergeConfirmedCheckbox={setMergeConfirmedCheckbox}
              mergeReason={mergeReason}
              setMergeReason={setMergeReason}
              isPreviewStale={isPreviewStale}
              lastMergeOutcome={lastMergeOutcome}
              handlePreviewGuestMerge={handlePreviewGuestMerge}
              handleExecuteGuestMerge={handleExecuteGuestMerge}
              isDemoMode={isDemoMode}
              isMutating={isMutating}
            />
          </>
        )}

        {/* CLUB & SYSTEM CATEGORY */}
        {showSystem && (
          <>
            <AdminOwnershipSection
              isOwner={isOwner}
              viewerRole={viewerRole}
              eligibleOwnershipRecipients={eligibleOwnershipRecipients}
              newOwnerMembershipId={newOwnerMembershipId}
              setNewOwnerMembershipId={setNewOwnerMembershipId}
              ownershipTransferReason={ownershipTransferReason}
              setOwnershipTransferReason={setOwnershipTransferReason}
              ownershipTransferConfirmed={ownershipTransferConfirmed}
              setOwnershipTransferConfirmed={setOwnershipTransferConfirmed}
              handleTransferOwnership={handleTransferOwnership}
              isDemoMode={isDemoMode}
              isMutating={isMutating}
            />

            <AdminRatingHealthSection
              publication={publication}
              viewerRole={viewerRole}
              isDemoMode={isDemoMode}
              onRetryRecalculation={onRetryRecalculation}
            />
          </>
        )}
      </div>
    </section>
  );
}
