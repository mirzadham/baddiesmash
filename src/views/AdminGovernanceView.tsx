import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { sanitizeInvitationRpcError } from '../lib/inviteToken.ts';
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
    return (
      pendingDrafts[entry.membership_id] ?? {
        linkingMode: 'unselected',
        selectedPlayerId: entry.requested_player_id ?? '',
        newPlayerDisplayName: entry.requested_new_player_name ?? '',
        reason: '',
      }
    );
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
        `Invitation issued for ${trimmedEmail}. Copy the one-time token or link below immediately — it will never be shown again.`,
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

  return (
    <section
      className="card"
      aria-labelledby="admin-governance-heading"
      data-testid="admin-governance-panel"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <h2
            id="admin-governance-heading"
            style={{ margin: 0, fontSize: '1.15rem' }}
          >
            ⚙ Admin &amp; Owner Governance Panel
          </h2>
          <p
            style={{
              margin: '0.2rem 0 0 0',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
            }}
          >
            Viewer Role: <code>{viewerRole}</code> • All mutations are validated
            and audited in PostgreSQL (`SECURITY DEFINER` RPCs).
          </p>
        </div>
        <button
          type="button"
          className="touch-target"
          onClick={onClose}
          data-testid="close-admin-panel-btn"
        >
          Close ✕
        </button>
      </div>

      {isDemoMode && (
        <div
          role="note"
          data-testid="admin-demo-readonly-notice"
          style={{
            padding: '0.75rem',
            background: 'var(--status-warn-bg)',
            color: 'var(--status-warn-fg)',
            borderRadius: '0.5rem',
            fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          ◈ Demo Mode Read-Only Governance View: You can inspect the invitation,
          approval, player creation, guest merge, and ownership transfer
          controls below, but all server mutations are disabled because no
          Supabase backend is configured.
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          data-testid="admin-action-error"
          style={{
            padding: '0.75rem',
            background: 'var(--status-stale-bg)',
            color: 'var(--status-stale-fg)',
            borderRadius: '0.5rem',
            fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          ✕ {actionError}
        </div>
      )}

      {actionSuccessMessage && (
        <div
          role="status"
          data-testid="admin-action-success"
          style={{
            padding: '0.75rem',
            background: 'var(--status-ok-bg)',
            color: 'var(--status-ok-fg)',
            borderRadius: '0.5rem',
            fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          ✓ {actionSuccessMessage}
        </div>
      )}

      {isLoadingDirectory && (
        <p role="status" data-testid="admin-directory-loading">
          ↻ Loading invitation metadata and member directory...
        </p>
      )}

      {directoryError && (
        <div
          role="alert"
          data-testid="admin-directory-error"
          style={{
            padding: '0.75rem',
            background: 'var(--status-stale-bg)',
            color: 'var(--status-stale-fg)',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
            ✕ {directoryError}
          </p>
          <button
            type="button"
            className="touch-target"
            onClick={() => void loadAdminData()}
          >
            ↻ Retry Loading Directory
          </button>
        </div>
      )}

      {/* 1. INVITATION MANAGEMENT */}
      <div
        className="card"
        style={{ background: 'var(--bg-surface-alt)', marginBottom: '1rem' }}
        data-testid="admin-section-invitations"
      >
        <h3 style={{ marginTop: 0 }}>
          1. Single-Use Invitation Management
        </h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Invitations are bound to a normalized email address, expire in up to 7
          days, and are securely hashed in the database.
          The token is returned only once upon issuance so you can copy and
          share the link manually.
        </p>

        <form onSubmit={(e) => void handleIssueInvitation(e)} noValidate>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <label
                htmlFor="admin-invite-email"
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Invited Account Email
              </label>
              <input
                id="admin-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isDemoMode || isMutating}
                placeholder="member@example.com"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="admin-invite-role"
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Intended Role
              </label>
              <select
                id="admin-invite-role"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(
                    e.target.value as Exclude<MembershipRole, 'owner'>,
                  )
                }
                disabled={isDemoMode || isMutating}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
              >
                <option value="member">member</option>
                <option value="recorder">recorder</option>
                <option value="admin" disabled={!isOwner}>
                  admin {isOwner ? '' : '(Owner only)'}
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="admin-invite-proposed-player"
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Proposed Player UUID (Optional)
              </label>
              <select
                id="admin-invite-proposed-player"
                value={inviteProposedPlayerId}
                onChange={(e) => setInviteProposedPlayerId(e.target.value)}
                disabled={isDemoMode || isMutating}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
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
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
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
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="touch-target touch-target-primary"
            disabled={isDemoMode || isMutating}
            data-testid="issue-invitation-submit-btn"
          >
            {isMutating ? 'Issuing...' : 'Issue Single-Use Invitation'}
          </button>
        </form>

        {/* One-time raw token & invite link box (shown ONLY immediately after confirmed issuance) */}
        {oneTimeIssuedSecret && (
          <div
            role="region"
            aria-label="One-time invitation token"
            data-testid="one-time-invitation-secret-box"
            style={{
              marginTop: '1rem',
              padding: '0.85rem',
              border: '2px solid var(--status-ok-fg)',
              borderRadius: '0.5rem',
              background: 'var(--status-ok-bg)',
              color: 'var(--status-ok-fg)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
              🔑 One-Time Invitation Secret for{' '}
              {oneTimeIssuedSecret.invitedEmail}
            </div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem' }}>
              Copy and share this link or token now. It is stored securely — once dismissed, this token can never
              be viewed again.
            </p>
            <div style={{ fontSize: '0.82rem', marginBottom: '0.35rem' }}>
              <strong>Manual Share Link:</strong>{' '}
              <code data-testid="one-time-invite-link">
                {`${typeof window !== 'undefined' ? window.location.origin : 'https://tracker.local'}/?invite=${oneTimeIssuedSecret.rawToken}`}
              </code>
            </div>
            <div style={{ fontSize: '0.82rem', marginBottom: '0.6rem' }}>
              <strong>Invitation Token:</strong>{' '}
              <code data-testid="one-time-raw-token">
                {oneTimeIssuedSecret.rawToken}
              </code>
            </div>
            <button
              type="button"
              className="touch-target"
              onClick={() => setOneTimeIssuedSecret(null)}
              data-testid="dismiss-one-time-token-btn"
            >
              Dismiss One-Time Secret
            </button>
          </div>
        )}

        {/* Invitation Metadata List (never shows raw_token or token_hash) */}
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.92rem' }}>
            Issued Invitations
          </h4>
          {(adminSnapshot?.invitations ?? []).length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No invitations recorded for this group.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {(adminSnapshot?.invitations ?? []).map((inv) => (
                <div
                  key={inv.id}
                  data-testid={`invitation-row-${inv.id}`}
                  style={{
                    padding: '0.65rem',
                    borderRadius: '0.45rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.84rem' }}>
                    <strong>{inv.invited_email_normalized}</strong> • Role:{' '}
                    <code>{inv.intended_role}</code> • Status:{' '}
                    <code>{inv.status}</code> • Expires:{' '}
                    {inv.expires_at.slice(0, 10)}
                    {inv.revoke_reason && (
                      <span> • Revoke reason: {inv.revoke_reason}</span>
                    )}
                  </div>

                  {inv.status === 'pending' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.4rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
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
                        style={{
                          minHeight: '44px',
                          padding: '0.3rem 0.5rem',
                          borderRadius: '0.4rem',
                          border: '1px solid var(--border-color)',
                        }}
                      />
                      <button
                        type="button"
                        className="touch-target"
                        disabled={isDemoMode || isMutating}
                        onClick={() => void handleRevokeInvitation(inv.id)}
                        data-testid={`revoke-invitation-btn-${inv.id}`}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. PENDING MEMBERSHIP APPROVALS & MEMBER ROLES */}
      <div
        className="card"
        style={{ background: 'var(--bg-surface-alt)', marginBottom: '1rem' }}
        data-testid="admin-section-memberships"
      >
        <h3 style={{ marginTop: 0 }}>
          2. Membership Approvals &amp; Role Management
        </h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Pending accounts have zero access to group data until approved. When
          approving, you must explicitly select whether to link an existing
          player profile, create a new player profile, or approve as a Viewer
          without a linked player profile. Display names are never auto-linked.
        </p>

        <h4 style={{ margin: '0.5rem 0', fontSize: '0.92rem' }}>
          Pending Membership Requests ({pendingMemberships.length})
        </h4>
        {pendingMemberships.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No pending membership requests.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
            {pendingMemberships.map((entry) => {
              const draft = getPendingDraft(entry);
              return (
                <div
                  key={entry.membership_id}
                  data-testid={`pending-membership-card-${entry.membership_id}`}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: '0.35rem',
                      fontSize: '0.92rem',
                    }}
                  >
                    {entry.account_email} • Intended Role:{' '}
                    <code>{entry.role}</code>
                  </div>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.6rem',
                    }}
                  >
                    Membership UUID: <code>{entry.membership_id}</code>
                    {entry.requested_player_id && (
                      <span>
                        {' '}
                        • Requested Player UUID:{' '}
                        <code>{entry.requested_player_id}</code>
                      </span>
                    )}
                    {entry.requested_new_player_name && (
                      <span>
                        {' '}
                        • Requested New Player Name:{' '}
                        <strong>{entry.requested_new_player_name}</strong>
                      </span>
                    )}
                  </div>

                  <fieldset
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.45rem',
                      padding: '0.65rem',
                      marginBottom: '0.65rem',
                    }}
                    disabled={isDemoMode || isMutating}
                  >
                    <legend style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                      Explicit Player-Linking Decision (Required for Approval)
                    </legend>
                    <div
                      style={{
                        display: 'grid',
                        gap: '0.45rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
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
                        />
                        <span>
                          Option A: Link to an existing unlinked player profile
                          UUID
                        </span>
                      </label>
                      {draft.linkingMode === 'link_existing' && (
                        <div style={{ marginLeft: '1.5rem' }}>
                          <select
                            aria-label={`Select existing player UUID for ${entry.account_email}`}
                            value={draft.selectedPlayerId}
                            onChange={(e) =>
                              updatePendingDraft(entry.membership_id, entry, {
                                selectedPlayerId: e.target.value,
                              })
                            }
                            style={{
                              width: '100%',
                              minHeight: '44px',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '0.4rem',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            <option value="">
                              -- Select unlinked player profile UUID --
                            </option>
                            {unlinkedPermanentPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.display_name} (UUID: {p.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
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
                        />
                        <span>
                          Option B: Create and link a new permanent player
                          profile
                        </span>
                      </label>
                      {draft.linkingMode === 'create_new' && (
                        <div style={{ marginLeft: '1.5rem' }}>
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
                            style={{
                              width: '100%',
                              minHeight: '44px',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '0.4rem',
                              border: '1px solid var(--border-color)',
                            }}
                          />
                        </div>
                      )}

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
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
                        />
                        <span>
                          Option C: Approve as Viewer without a linked player profile
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
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
                      style={{
                        flex: 1,
                        minWidth: '180px',
                        minHeight: '44px',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '0.4rem',
                        border: '1px solid var(--border-color)',
                      }}
                    />
                    <button
                      type="button"
                      className="touch-target touch-target-primary"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleApproveMembership(entry)}
                      data-testid={`approve-membership-btn-${entry.membership_id}`}
                    >
                      Approve Request
                    </button>
                    <button
                      type="button"
                      className="touch-target"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleRejectMembership(entry)}
                      data-testid={`reject-membership-btn-${entry.membership_id}`}
                    >
                      Reject Request
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <h4 style={{ margin: '0.75rem 0 0.5rem 0', fontSize: '0.92rem' }}>
          Authorized Group Members Directory ({existingMemberships.length})
        </h4>
        <div style={{ display: 'grid', gap: '0.65rem' }}>
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
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.45rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                  }}
                >
                  {entry.account_email} • Role: <code>{entry.role}</code> •
                  Status: <code>{entry.status}</code> • Linked Player:{' '}
                  {linkedPlayer
                    ? `${linkedPlayer.display_name} (${linkedPlayer.id.slice(-6)})`
                    : 'None (Viewer-only)'}
                </div>

                {!isTargetOwner && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      alignItems: 'center',
                      marginTop: '0.4rem',
                    }}
                  >
                    <select
                      aria-label={`Role for ${entry.account_email}`}
                      value={editDraft.role}
                      onChange={(e) =>
                        updateMemberEditDraft(entry.membership_id, entry, {
                          role: e.target.value as MembershipRole,
                        })
                      }
                      disabled={isDemoMode || isMutating}
                      style={{
                        minHeight: '44px',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '0.4rem',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <option value="member">member</option>
                      <option value="recorder">recorder</option>
                      <option value="admin">
                        admin {isOwner ? '' : '(Owner required)'}
                      </option>
                    </select>

                    <select
                      aria-label={`Status for ${entry.account_email}`}
                      value={editDraft.status}
                      onChange={(e) =>
                        updateMemberEditDraft(entry.membership_id, entry, {
                          status: e.target.value as MembershipStatus,
                        })
                      }
                      disabled={isDemoMode || isMutating}
                      style={{
                        minHeight: '44px',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '0.4rem',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <option value="approved">approved</option>
                      <option value="suspended">suspended</option>
                      <option value="departed">departed</option>
                    </select>

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
                      style={{
                        minHeight: '44px',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '0.4rem',
                        border: '1px solid var(--border-color)',
                      }}
                    />

                    <button
                      type="button"
                      className="touch-target"
                      disabled={isDemoMode || isMutating}
                      onClick={() => void handleUpdateMemberRoleOrStatus(entry)}
                      data-testid={`update-member-btn-${entry.membership_id}`}
                    >
                      Update Role/Status
                    </button>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    alignItems: 'center',
                    marginTop: '0.45rem',
                  }}
                >
                  <select
                    aria-label={`Linked player UUID for ${entry.account_email}`}
                    value={editDraft.linkPlayerId}
                    onChange={(e) =>
                      updateMemberEditDraft(entry.membership_id, entry, {
                        linkPlayerId: e.target.value,
                      })
                    }
                    disabled={isDemoMode || isMutating}
                    style={{
                      minHeight: '44px',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '0.4rem',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <option value="">Unlinked (Viewer-only)</option>
                    {unmergedPermanentPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} ({p.id.slice(-6)})
                      </option>
                    ))}
                  </select>

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
                    style={{
                      minHeight: '44px',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '0.4rem',
                      border: '1px solid var(--border-color)',
                    }}
                  />

                  <button
                    type="button"
                    className="touch-target"
                    disabled={isDemoMode || isMutating}
                    onClick={() => void handleLinkMemberProfile(entry)}
                    data-testid={`link-member-profile-btn-${entry.membership_id}`}
                  >
                    Save Profile Link
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. PLAYER PROFILE CREATION & ROSTER */}
      <div
        className="card"
        style={{ background: 'var(--bg-surface-alt)', marginBottom: '1rem' }}
        data-testid="admin-section-players"
      >
        <h3 style={{ marginTop: 0 }}>
          3. Player Profile Creation &amp; Roster Status
        </h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Permanent player profiles and temporary guests can exist before or
          without user accounts. Duplicate display names are kept as separate
          profiles and are never automatically linked or merged.
        </p>

        <form onSubmit={(e) => void handleCreatePlayerProfile(e)} noValidate>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.65rem',
              alignItems: 'center',
              marginBottom: '0.65rem',
            }}
          >
            <div style={{ flex: 1, minWidth: '220px' }}>
              <label
                htmlFor="admin-create-player-name"
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                New Player Display Name
              </label>
              <input
                id="admin-create-player-name"
                type="text"
                value={newPlayerDisplayName}
                onChange={(e) => setNewPlayerDisplayName(e.target.value)}
                disabled={isDemoMode || isMutating}
                placeholder="e.g. Marcus Lim"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                }}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.88rem',
                marginTop: '1.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={newPlayerIsGuest}
                onChange={(e) => setNewPlayerIsGuest(e.target.checked)}
                disabled={isDemoMode || isMutating}
              />
              <span>Create as Temporary Guest</span>
            </label>

            <button
              type="submit"
              className="touch-target touch-target-primary"
              disabled={isDemoMode || isMutating}
              style={{ marginTop: '1.25rem' }}
              data-testid="create-player-submit-btn"
            >
              Create Player Profile
            </button>
          </div>

          {duplicateNameWarning && (
            <p
              role="note"
              data-testid="duplicate-player-name-warning"
              style={{
                padding: '0.55rem',
                background: 'var(--status-warn-bg)',
                color: 'var(--status-warn-fg)',
                borderRadius: '0.4rem',
                fontSize: '0.83rem',
                fontWeight: 600,
              }}
            >
              ℹ An existing player in this group already has the display name
              &ldquo;{newPlayerDisplayName.trim()}&rdquo;. Creating this profile
              will assign a separate profile and will never automatically merge or link
              by display name.
            </p>
          )}
        </form>

        <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.75rem' }}>
          {unmergedPlayers.map((p) => (
            <div
              key={p.id}
              data-testid={`admin-player-row-${p.id}`}
              style={{
                padding: '0.55rem 0.7rem',
                borderRadius: '0.4rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  flexWrap: 'wrap',
                  fontSize: '0.86rem',
                }}
              >
                <strong>{p.display_name}</strong>
                {p.is_guest && <StatusBadge variant="guest" />}
                <code>{p.id.slice(-6)}</code>
                <span>• {p.is_active ? 'Active' : 'Inactive'}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '0.4rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  type="text"
                  aria-label={`Status change reason for ${p.display_name}`}
                  placeholder="Reason (min 3 chars)"
                  value={playerStatusReasons[p.id] ?? ''}
                  onChange={(e) =>
                    setPlayerStatusReasons((prev) => ({
                      ...prev,
                      [p.id]: e.target.value,
                    }))
                  }
                  disabled={isDemoMode || isMutating}
                  style={{
                    minHeight: '44px',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.4rem',
                    border: '1px solid var(--border-color)',
                  }}
                />
                <button
                  type="button"
                  className="touch-target"
                  disabled={isDemoMode || isMutating}
                  onClick={() =>
                    void handleTogglePlayerActiveStatus(p.id, !p.is_active)
                  }
                  data-testid={`toggle-player-active-btn-${p.id}`}
                >
                  {p.is_active ? 'Set Inactive' : 'Set Active'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. GUEST-TO-PERMANENT PLAYER MERGE */}
      <div
        className="card"
        style={{ background: 'var(--bg-surface-alt)', marginBottom: '1rem' }}
        data-testid="admin-section-guest-merge"
      >
        <h3 style={{ marginTop: 0 }}>
          4. Guest-to-Permanent Player Merge
        </h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Merging a temporary guest into a permanent player transfers all match
          history and recalculates ratings chronologically. Same-match conflicts
          are checked automatically before execution.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <div>
            <label
              htmlFor="admin-merge-source-guest"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Source Temporary Guest (UUID)
            </label>
            <select
              id="admin-merge-source-guest"
              value={mergeSourceGuestId}
              onChange={(e) => {
                setMergeSourceGuestId(e.target.value);
                setMergePreview(null);
                setMergePreviewMatchSeq(null);
                setMergeConfirmedCheckbox(false);
              }}
              disabled={isDemoMode || isMutating}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.4rem 0.65rem',
                borderRadius: '0.4rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            >
              <option value="">-- Select unmerged guest UUID --</option>
              {unmergedGuestPlayers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.display_name} (UUID: {g.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="admin-merge-target-permanent"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Target Permanent Player (UUID)
            </label>
            <select
              id="admin-merge-target-permanent"
              value={mergeTargetPermanentId}
              onChange={(e) => {
                setMergeTargetPermanentId(e.target.value);
                setMergePreview(null);
                setMergePreviewMatchSeq(null);
                setMergeConfirmedCheckbox(false);
              }}
              disabled={isDemoMode || isMutating}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.4rem 0.65rem',
                borderRadius: '0.4rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            >
              <option value="">-- Select permanent player UUID --</option>
              {unmergedPermanentPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (UUID: {p.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className="touch-target"
          disabled={isDemoMode || isMutating}
          onClick={() => void handlePreviewGuestMerge()}
          data-testid="preview-guest-merge-btn"
        >
          {isMutating
            ? 'Loading Preview...'
            : '1. Generate Server Impact Preview'}
        </button>

        {mergePreview && (
          <div
            data-testid="guest-merge-preview-box"
            style={{
              marginTop: '0.85rem',
              padding: '0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem 0' }}>
              Server Merge Impact Preview:{' '}
              {mergePreview.source_guest_display_name} →{' '}
              {mergePreview.target_permanent_display_name}
            </h4>
            <ul
              style={{
                margin: '0 0 0.65rem 0',
                paddingLeft: '1.2rem',
                fontSize: '0.85rem',
              }}
            >
              <li>
                <strong>Affected Matches to Re-attribute:</strong>{' '}
                <span data-testid="preview-affected-matches">
                  {mergePreview.affected_match_count}
                </span>
              </li>
              <li>
                <strong>Guest Session Attendances:</strong>{' '}
                <span data-testid="preview-affected-attendance">
                  {mergePreview.affected_session_attendance_count}
                </span>
              </li>
              <li>
                <strong>Overlapping Session Attendances (Deduplicated):</strong>{' '}
                <span data-testid="preview-overlapping-attendance">
                  {mergePreview.overlapping_attendance_session_count}
                </span>
              </li>
              <li>
                <strong>Eligibility:</strong>{' '}
                {mergePreview.can_merge ? (
                  <strong style={{ color: 'var(--status-ok-fg)' }}>
                    ✓ Eligible for Atomic Merge
                  </strong>
                ) : (
                  <strong style={{ color: 'var(--status-stale-fg)' }}>
                    ✕ Blocked — Same-Match Conflict Detected
                  </strong>
                )}
              </li>
            </ul>

            {!mergePreview.can_merge && (
              <div
                role="alert"
                data-testid="guest-merge-conflict-alert"
                style={{
                  padding: '0.65rem',
                  background: 'var(--status-stale-bg)',
                  color: 'var(--status-stale-fg)',
                  borderRadius: '0.4rem',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                ✕ Cannot merge: both identities participated in the same
                match(es): {mergePreview.conflicting_match_ids.join(', ')}.
              </div>
            )}

            {isPreviewStale && (
              <div
                role="alert"
                data-testid="guest-merge-stale-preview-alert"
                style={{
                  padding: '0.65rem',
                  background: 'var(--status-warn-bg)',
                  color: 'var(--status-warn-fg)',
                  borderRadius: '0.4rem',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginTop: '0.5rem',
                }}
              >
                ⚠ Group match history changed after this preview was generated.
                Please click &ldquo;1. Generate Server Impact Preview&rdquo; to
                refresh before executing.
              </div>
            )}

            {mergePreview.can_merge && !isPreviewStale && (
              <form
                onSubmit={(e) => void handleExecuteGuestMerge(e)}
                noValidate
                style={{ marginTop: '0.75rem' }}
              >
                <div style={{ marginBottom: '0.6rem' }}>
                  <label
                    htmlFor="admin-merge-reason"
                    style={{
                      display: 'block',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Audit Reason for Guest Merge (Required, min 3 chars)
                  </label>
                  <input
                    id="admin-merge-reason"
                    type="text"
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    disabled={isDemoMode || isMutating}
                    placeholder="e.g. Confirmed drop-in guest Ethan is permanent member Diana"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '0.4rem 0.65rem',
                      borderRadius: '0.4rem',
                      border: '1px solid var(--border-color)',
                    }}
                  />
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                    marginBottom: '0.65rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={mergeConfirmedCheckbox}
                    onChange={(e) =>
                      setMergeConfirmedCheckbox(e.target.checked)
                    }
                    disabled={isDemoMode || isMutating}
                    data-testid="confirm-guest-merge-checkbox"
                  />
                  <span>
                    I confirm merging guest UUID{' '}
                    <code>{mergePreview.source_guest_player_id}</code> into
                    permanent player UUID{' '}
                    <code>{mergePreview.target_permanent_player_id}</code> and
                    recalculating chronological Elo ratings.
                  </span>
                </label>

                <button
                  type="submit"
                  className="touch-target touch-target-primary"
                  disabled={
                    isDemoMode ||
                    isMutating ||
                    !mergeConfirmedCheckbox ||
                    isPreviewStale
                  }
                  data-testid="execute-guest-merge-btn"
                >
                  {isMutating
                    ? 'Executing Atomic Merge...'
                    : '2. Confirm & Execute Atomic Guest Merge'}
                </button>
              </form>
            )}
          </div>
        )}

        {lastMergeOutcome && (
          <p
            style={{
              fontSize: '0.83rem',
              color: 'var(--text-secondary)',
              marginTop: '0.5rem',
            }}
          >
            Last merge published rating version:{' '}
            <code>{lastMergeOutcome.published_rating_version_id}</code>
          </p>
        )}
      </div>

      {/* 5. OWNERSHIP TRANSFER */}
      <div
        className="card"
        style={{ background: 'var(--bg-surface-alt)' }}
        data-testid="admin-section-ownership"
      >
        <h3 style={{ marginTop: 0 }}>5. Ownership Transfer</h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Only the current Group Owner may transfer ownership to another
          approved group member. The current Owner will become an Admin and
          the recipient will become the new Owner.
        </p>

        {!isOwner && (
          <p
            role="note"
            data-testid="ownership-transfer-owner-only-note"
            style={{
              padding: '0.6rem',
              background: 'var(--status-warn-bg)',
              color: 'var(--status-warn-fg)',
              borderRadius: '0.4rem',
              fontSize: '0.84rem',
              fontWeight: 600,
            }}
          >
            🔒 Ownership Transfer is restricted to the current Group Owner
            (your role is <code>{viewerRole}</code>).
          </p>
        )}

        <form onSubmit={(e) => void handleTransferOwnership(e)} noValidate>
          <div style={{ marginBottom: '0.65rem' }}>
            <label
              htmlFor="admin-transfer-owner-target"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
            >
              Recipient Approved Membership (Explicit Membership UUID)
            </label>
            <select
              id="admin-transfer-owner-target"
              value={newOwnerMembershipId}
              onChange={(e) => setNewOwnerMembershipId(e.target.value)}
              disabled={isDemoMode || isMutating || !isOwner}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.4rem 0.65rem',
                borderRadius: '0.4rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            >
              <option value="">
                -- Select eligible approved membership UUID --
              </option>
              {eligibleOwnershipRecipients.map((m) => (
                <option key={m.membership_id} value={m.membership_id}>
                  {m.account_email} (Role: {m.role} • Membership UUID:{' '}
                  {m.membership_id})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '0.65rem' }}>
            <label
              htmlFor="admin-transfer-owner-reason"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 600,
                marginBottom: '0.25rem',
              }}
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
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.4rem 0.65rem',
                borderRadius: '0.4rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              marginBottom: '0.65rem',
            }}
          >
            <input
              type="checkbox"
              checked={ownershipTransferConfirmed}
              onChange={(e) => setOwnershipTransferConfirmed(e.target.checked)}
              disabled={isDemoMode || isMutating || !isOwner}
              data-testid="confirm-ownership-transfer-checkbox"
            />
            <span>
              I confirm transferring Group Ownership and demoting my membership
              to <code>admin</code>.
            </span>
          </label>

          <button
            type="submit"
            className="touch-target"
            disabled={isDemoMode || isMutating || !isOwner}
            data-testid="transfer-ownership-submit-btn"
          >
            {isMutating
              ? 'Transferring Ownership...'
              : 'Transfer Group Ownership'}
          </button>
        </form>
      </div>

      {/* 6. RATING SYSTEM HEALTH & RECALCULATION */}
      {publication && (
        <div
          className="card"
          style={{ background: 'var(--bg-surface-alt)', marginTop: '1rem' }}
          data-testid="admin-section-ratings"
        >
          <h3 style={{ marginTop: 0 }}>6. Rating System Health &amp; Recalculation</h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            System ratings status. If ratings recalculation is interrupted or fails due to database timeouts, you can trigger a manual recalculation here.
          </p>
          <PublicationStatusBanner
            publication={publication}
            viewerRole={viewerRole}
            isDemoMode={isDemoMode}
            onRetryRecalculation={onRetryRecalculation}
          />
        </div>
      )}
    </section>
  );
}
