import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveRatingPublicationState,
  type RatingPublicationBannerState,
} from '../domain/elo.ts';
import { sanitizeInvitationRpcError } from '../lib/inviteToken.ts';
import type {
  AdminMembershipDirectoryEntry,
  BootstrapInitialGroupResponse,
  DbGroupMembershipRow,
  DbGroupRow,
  DbMatchParticipantRow,
  DbMatchRatingChangeRow,
  DbMatchRow,
  DbPlayerRatingSnapshotRow,
  DbPlayerRow,
  DbSessionAttendeeRow,
  DbSessionRow,
  DecideMembershipRequestResponse,
  GuestMergeExecutionResponse,
  GuestMergePreviewResponse,
  IssueGroupInvitationResponse,
  MembershipRole,
  MembershipStatus,
  RatingPublicationStateResponse,
  RecalculationExecutionOutcome,
  RedeemGroupInvitationResponse,
} from '../types/database.ts';
import {
  type AdminGovernanceSnapshot,
  buildDeterministicDemoAdminGovernanceSnapshot,
  buildDeterministicDemoSnapshot,
  type GroupReadSnapshot,
  type InvitationMetadataRow,
} from './demoData.ts';

export type ViewerGateState =
  | { status: 'demo_mode'; snapshot: GroupReadSnapshot }
  | { status: 'unauthenticated' }
  | {
      status: 'no_membership';
      userId: string;
      userEmail: string | null;
      emailVerified: boolean;
    }
  | {
      status: 'pending_approval';
      userId: string;
      userEmail: string | null;
      membership: DbGroupMembershipRow;
    }
  | {
      status: 'rejected';
      userId: string;
      userEmail: string | null;
      membership: DbGroupMembershipRow;
    }
  | {
      status: 'suspended';
      userId: string;
      userEmail: string | null;
      membership: DbGroupMembershipRow;
    }
  | {
      status: 'departed';
      userId: string;
      userEmail: string | null;
      membership: DbGroupMembershipRow;
    }
  | {
      status: 'membership_check_failed';
      errorMessage: string;
    }
  | {
      status: 'approved';
      userId: string;
      userEmail: string | null;
      membership: DbGroupMembershipRow;
      snapshot: GroupReadSnapshot;
    };

export interface EffectivePublicationBannerState
  extends RatingPublicationBannerState {
  isVerified: boolean;
  publishedVersionId: string | null;
  publishedSeq: number | null;
  requiredSeq: number;
  rulesVersion: string;
  kFactor: number;
}

export interface BootstrapInitialGroupInput {
  groupName: string;
  groupSlug: string;
  ownerDisplayName?: string | null;
}

export interface RedeemGroupInvitationInput {
  rawToken: string;
  requestedPlayerId?: string | null;
  requestedNewPlayerName?: string | null;
}

export interface IssueGroupInvitationInput {
  groupId: string;
  invitedEmail: string;
  intendedRole: Exclude<MembershipRole, 'owner'>;
  proposedPlayerId?: string | null;
  expiresInDays?: number;
}

export interface RevokeGroupInvitationInput {
  invitationId: string;
  reason: string;
}

export interface DecideMembershipRequestInput {
  membershipId: string;
  decision: 'approve' | 'reject';
  reason?: string | null;
  linkedPlayerId?: string | null;
  createNewPlayer?: boolean;
  newPlayerDisplayName?: string | null;
}

export interface UpdateMembershipRoleOrStatusInput {
  membershipId: string;
  newRole: MembershipRole;
  newStatus: MembershipStatus;
  reason: string;
}

export interface LinkMemberPlayerProfileInput {
  membershipId: string;
  playerId: string | null;
  reason: string;
}

export interface CreatePlayerProfileInput {
  groupId: string;
  displayName: string;
  isGuest?: boolean;
}

export interface SetPlayerActiveStatusInput {
  playerId: string;
  isActive: boolean;
  reason: string;
}

export interface PreviewGuestMergeInput {
  groupId: string;
  sourceGuestPlayerId: string;
  targetPermanentPlayerId: string;
}

export interface ExecuteGuestMergeInput {
  groupId: string;
  sourceGuestPlayerId: string;
  targetPermanentPlayerId: string;
  reason: string;
}

export interface TransferGroupOwnershipInput {
  groupId: string;
  newOwnerMembershipId: string;
  reason: string;
}

/**
 * Resolves the UI publication health state from a `GroupReadSnapshot`.
 * Fail-closed (Condition 1B): If `publicationState` could not be verified from the backend RPC,
 * it NEVER labels the leaderboard `Current`.
 */
export function resolveEffectivePublicationBannerState(
  snapshot: GroupReadSnapshot,
): EffectivePublicationBannerState {
  const pub = snapshot.publicationState;
  const group = snapshot.group;

  if (!pub) {
    return {
      health: 'stale_or_failed',
      isCurrent: false,
      isVerified: false,
      bannerTitle: 'Rating publication status could not be verified',
      bannerMessage:
        'The backend publication status RPC did not confirm that ratings are current. Displayed ratings may not reflect the latest authoritative match history.',
      canAdminRetry:
        !snapshot.isDemoMode &&
        (snapshot.viewerMembership.role === 'admin' ||
          snapshot.viewerMembership.role === 'owner'),
      publishedVersionId: group.published_rating_version_id,
      publishedSeq: null,
      requiredSeq: group.required_match_state_seq,
      rulesVersion: group.current_rules_version,
      kFactor: group.default_k_factor,
    };
  }

  const derived = deriveRatingPublicationState({
    recalculationStatus: pub.recalculation_status,
    publishedVersionMatchStateSeq: pub.published_match_state_seq,
    requiredMatchStateSeq: pub.required_match_state_seq,
    lastError: pub.last_recalculation_error,
  });

  // Fail closed if the backend RPC explicitly reported is_current = false even if numbers matched
  const isCurrent = derived.isCurrent && pub.is_current;
  const health = isCurrent ? 'current' : derived.health;

  return {
    health,
    isCurrent,
    isVerified: true,
    bannerTitle: isCurrent
      ? null
      : (derived.bannerTitle ?? 'Ratings out of date — recalculation required'),
    bannerMessage: isCurrent
      ? null
      : (derived.bannerMessage ??
        'Published ratings do not reflect the latest match history.'),
    canAdminRetry:
      !snapshot.isDemoMode &&
      derived.canAdminRetry &&
      (snapshot.viewerMembership.role === 'admin' ||
        snapshot.viewerMembership.role === 'owner'),
    publishedVersionId: pub.published_rating_version_id,
    publishedSeq: pub.published_match_state_seq,
    requiredSeq: pub.required_match_state_seq,
    rulesVersion: group.current_rules_version,
    kFactor: group.default_k_factor,
  };
}

export interface TrackerRepository {
  readonly isDemoMode: boolean;
  loadViewerGateState(): Promise<ViewerGateState>;
  signInWithGoogle(): Promise<void>;
  signInWithEmailPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  retryRatingRecalculation(
    groupId: string,
    reason?: string,
  ): Promise<RecalculationExecutionOutcome>;

  // Checkpoint 3B — Onboarding & Administrative Governance RPCs
  bootstrapInitialGroup(
    input: BootstrapInitialGroupInput,
  ): Promise<BootstrapInitialGroupResponse>;
  redeemGroupInvitation(
    input: RedeemGroupInvitationInput,
  ): Promise<RedeemGroupInvitationResponse>;
  loadAdminGovernanceSnapshot(
    groupId: string,
  ): Promise<AdminGovernanceSnapshot>;
  issueGroupInvitation(
    input: IssueGroupInvitationInput,
  ): Promise<IssueGroupInvitationResponse>;
  revokeGroupInvitation(input: RevokeGroupInvitationInput): Promise<void>;
  decideMembershipRequest(
    input: DecideMembershipRequestInput,
  ): Promise<DecideMembershipRequestResponse>;
  updateMembershipRoleOrStatus(
    input: UpdateMembershipRoleOrStatusInput,
  ): Promise<void>;
  linkMemberPlayerProfile(input: LinkMemberPlayerProfileInput): Promise<void>;
  createPlayerProfile(input: CreatePlayerProfileInput): Promise<string>;
  setPlayerActiveStatus(input: SetPlayerActiveStatusInput): Promise<void>;
  previewGuestIntoPlayerMerge(
    input: PreviewGuestMergeInput,
  ): Promise<GuestMergePreviewResponse>;
  mergeGuestIntoPlayer(
    input: ExecuteGuestMergeInput,
  ): Promise<GuestMergeExecutionResponse>;
  transferGroupOwnership(input: TransferGroupOwnershipInput): Promise<void>;
}

/**
 * Explicitly labelled, read-only Demo Mode repository.
 * Never pretends authentication, authorization, or database writes succeed.
 */
export function createDemoTrackerRepository(
  customSnapshot?: GroupReadSnapshot,
  customAdminSnapshot?: AdminGovernanceSnapshot,
): TrackerRepository {
  const snapshot = customSnapshot ?? buildDeterministicDemoSnapshot();
  const adminSnapshot =
    customAdminSnapshot ?? buildDeterministicDemoAdminGovernanceSnapshot();

  return {
    isDemoMode: true,
    async loadViewerGateState(): Promise<ViewerGateState> {
      return {
        status: 'demo_mode',
        snapshot,
      };
    },
    async signInWithGoogle(): Promise<void> {
      throw new Error(
        'Demo Mode is active because Supabase environment variables are not configured. Live Google OAuth sign-in is disabled.',
      );
    },
    async signInWithEmailPassword(): Promise<void> {
      throw new Error(
        'Demo Mode is active because Supabase environment variables are not configured. Live email/password sign-in is disabled.',
      );
    },
    async signOut(): Promise<void> {
      throw new Error(
        'Demo Mode has no active authenticated session to sign out.',
      );
    },
    async retryRatingRecalculation(): Promise<RecalculationExecutionOutcome> {
      throw new Error(
        'Demo Mode is read-only and cannot execute server-side rating recalculation RPCs.',
      );
    },
    async bootstrapInitialGroup(): Promise<BootstrapInitialGroupResponse> {
      throw new Error(
        'Demo Mode is read-only and cannot bootstrap an initial group.',
      );
    },
    async redeemGroupInvitation(): Promise<RedeemGroupInvitationResponse> {
      throw new Error(
        'Demo Mode is read-only and cannot redeem group invitations.',
      );
    },
    async loadAdminGovernanceSnapshot(): Promise<AdminGovernanceSnapshot> {
      return adminSnapshot;
    },
    async issueGroupInvitation(): Promise<IssueGroupInvitationResponse> {
      throw new Error(
        'Demo Mode is read-only and cannot issue group invitations.',
      );
    },
    async revokeGroupInvitation(): Promise<void> {
      throw new Error(
        'Demo Mode is read-only and cannot revoke group invitations.',
      );
    },
    async decideMembershipRequest(): Promise<DecideMembershipRequestResponse> {
      throw new Error(
        'Demo Mode is read-only and cannot approve or reject membership requests.',
      );
    },
    async updateMembershipRoleOrStatus(): Promise<void> {
      throw new Error(
        'Demo Mode is read-only and cannot modify member roles or status.',
      );
    },
    async linkMemberPlayerProfile(): Promise<void> {
      throw new Error(
        'Demo Mode is read-only and cannot link member player profiles.',
      );
    },
    async createPlayerProfile(): Promise<string> {
      throw new Error(
        'Demo Mode is read-only and cannot create player profiles.',
      );
    },
    async setPlayerActiveStatus(): Promise<void> {
      throw new Error(
        'Demo Mode is read-only and cannot change player active status.',
      );
    },
    async previewGuestIntoPlayerMerge(): Promise<GuestMergePreviewResponse> {
      throw new Error(
        'Demo Mode is read-only and cannot execute server-side guest merge previews.',
      );
    },
    async mergeGuestIntoPlayer(): Promise<GuestMergeExecutionResponse> {
      throw new Error(
        'Demo Mode is read-only and cannot execute guest-to-player merges.',
      );
    },
    async transferGroupOwnership(): Promise<void> {
      throw new Error(
        'Demo Mode is read-only and cannot transfer group ownership.',
      );
    },
  };
}

/**
 * Live Supabase repository backed by `@supabase/supabase-js`.
 * Enforces fail-closed membership checks before loading any group data.
 */
export function createSupabaseTrackerRepository(
  client: SupabaseClient,
): TrackerRepository {
  async function fetchApprovedGroupReadSnapshot(
    membership: DbGroupMembershipRow,
  ): Promise<GroupReadSnapshot> {
    if (membership.status !== 'approved') {
      throw new Error(
        `Security invariant violation: attempted to fetch group data for non-approved membership status '${membership.status}'`,
      );
    }

    const groupId = membership.group_id;

    const [
      groupRes,
      pubStateRes,
      playersRes,
      sessionsRes,
      attendeesRes,
      matchesRes,
      participantsRes,
    ] = await Promise.all([
      client.from('groups').select('*').eq('id', groupId).single(),
      client.rpc('get_group_rating_publication_state', {
        p_group_id: groupId,
      }),
      client
        .from('players')
        .select('*')
        .eq('group_id', groupId)
        .order('display_name', { ascending: true }),
      client
        .from('sessions')
        .select('*')
        .eq('group_id', groupId)
        .order('session_started_at', { ascending: false }),
      client.from('session_attendees').select('*').eq('group_id', groupId),
      client
        .from('matches')
        .select('*')
        .eq('group_id', groupId)
        .order('sequence_number', { ascending: true }),
      client.from('match_participants').select('*').eq('group_id', groupId),
    ]);

    if (groupRes.error || !groupRes.data) {
      throw new Error(
        groupRes.error?.message ?? 'Failed to load group record from Supabase.',
      );
    }
    if (playersRes.error) {
      throw new Error(`Failed to load players: ${playersRes.error.message}`);
    }
    if (sessionsRes.error) {
      throw new Error(`Failed to load sessions: ${sessionsRes.error.message}`);
    }
    if (attendeesRes.error) {
      throw new Error(
        `Failed to load session attendees: ${attendeesRes.error.message}`,
      );
    }
    if (matchesRes.error) {
      throw new Error(`Failed to load matches: ${matchesRes.error.message}`);
    }
    if (participantsRes.error) {
      throw new Error(
        `Failed to load match participants: ${participantsRes.error.message}`,
      );
    }

    const group = groupRes.data as DbGroupRow;
    // Fail-closed: if get_group_rating_publication_state errored, keep publicationState = null
    // so resolveEffectivePublicationBannerState marks it as unverified rather than Current.
    const publicationState =
      !pubStateRes.error && pubStateRes.data
        ? (pubStateRes.data as RatingPublicationStateResponse)
        : null;

    const publishedVersionId =
      publicationState?.published_rating_version_id ??
      group.published_rating_version_id;

    let ratingSnapshots: DbPlayerRatingSnapshotRow[] = [];
    let matchRatingChanges: DbMatchRatingChangeRow[] = [];

    if (publishedVersionId) {
      const [snapsRes, changesRes] = await Promise.all([
        client
          .from('player_rating_snapshots')
          .select('*')
          .eq('group_id', groupId)
          .eq('rating_version_id', publishedVersionId),
        client
          .from('match_rating_changes')
          .select('*')
          .eq('group_id', groupId)
          .eq('rating_version_id', publishedVersionId),
      ]);

      if (snapsRes.error) {
        throw new Error(
          `Failed to load player rating snapshots: ${snapsRes.error.message}`,
        );
      }
      if (changesRes.error) {
        throw new Error(
          `Failed to load match rating changes: ${changesRes.error.message}`,
        );
      }

      ratingSnapshots = (snapsRes.data ?? []) as DbPlayerRatingSnapshotRow[];
      matchRatingChanges = (changesRes.data ?? []) as DbMatchRatingChangeRow[];
    }

    return {
      isDemoMode: false,
      group,
      viewerMembership: membership,
      publicationState,
      players: (playersRes.data ?? []) as DbPlayerRow[],
      sessions: (sessionsRes.data ?? []) as DbSessionRow[],
      sessionAttendees: (attendeesRes.data ?? []) as DbSessionAttendeeRow[],
      matches: (matchesRes.data ?? []) as DbMatchRow[],
      matchParticipants: (participantsRes.data ?? []) as DbMatchParticipantRow[],
      ratingSnapshots,
      matchRatingChanges,
    };
  }

  return {
    isDemoMode: false,

    async loadViewerGateState(): Promise<ViewerGateState> {
      const sessionRes = await client.auth.getSession();
      if (sessionRes.error) {
        return {
          status: 'membership_check_failed',
          errorMessage: `Authentication session verification failed: ${sessionRes.error.message}`,
        };
      }

      const user = sessionRes.data.session?.user ?? null;
      if (!user) {
        return { status: 'unauthenticated' };
      }

      const memRes = await client
        .from('group_memberships')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (memRes.error) {
        return {
          status: 'membership_check_failed',
          errorMessage: `Failed to verify group membership: ${memRes.error.message}`,
        };
      }

      const membership =
        (memRes.data?.[0] as DbGroupMembershipRow | undefined) ?? null;
      if (!membership) {
        return {
          status: 'no_membership',
          userId: user.id,
          userEmail: user.email ?? null,
          emailVerified: Boolean(user.email_confirmed_at),
        };
      }

      if (membership.status === 'pending_approval') {
        return {
          status: 'pending_approval',
          userId: user.id,
          userEmail: user.email ?? null,
          membership,
        };
      }

      if (membership.status === 'rejected') {
        return {
          status: 'rejected',
          userId: user.id,
          userEmail: user.email ?? null,
          membership,
        };
      }

      if (membership.status === 'suspended') {
        return {
          status: 'suspended',
          userId: user.id,
          userEmail: user.email ?? null,
          membership,
        };
      }

      if (membership.status === 'departed') {
        return {
          status: 'departed',
          userId: user.id,
          userEmail: user.email ?? null,
          membership,
        };
      }

      // Only when membership.status === 'approved' do we load group data
      try {
        const snapshot = await fetchApprovedGroupReadSnapshot(membership);
        return {
          status: 'approved',
          userId: user.id,
          userEmail: user.email ?? null,
          membership,
          snapshot,
        };
      } catch (err) {
        return {
          status: 'membership_check_failed',
          errorMessage:
            err instanceof Error
              ? err.message
              : 'Failed to load authorized group data.',
        };
      }
    },

    async signInWithGoogle(): Promise<void> {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        ...(typeof window !== 'undefined'
          ? { options: { redirectTo: window.location.origin } }
          : {}),
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async signInWithEmailPassword(
      email: string,
      password: string,
    ): Promise<void> {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async signOut(): Promise<void> {
      const { error } = await client.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    },

    async retryRatingRecalculation(
      groupId: string,
      reason = 'Manual admin recalculation retry from UI',
    ): Promise<RecalculationExecutionOutcome> {
      const { data, error } = await client.rpc(
        'retry_group_rating_recalculation',
        {
          p_group_id: groupId,
          p_reason: reason,
        },
      );
      if (error) {
        throw new Error(error.message);
      }
      const outcome = data as RecalculationExecutionOutcome | null;
      if (!outcome || !outcome.recalculation_succeeded) {
        throw new Error(
          outcome?.error_message ??
            'Rating recalculation retry did not succeed on the server.',
        );
      }
      return outcome;
    },

    async bootstrapInitialGroup(
      input: BootstrapInitialGroupInput,
    ): Promise<BootstrapInitialGroupResponse> {
      const { data, error } = await client.rpc('bootstrap_initial_group', {
        p_group_name: input.groupName,
        p_group_slug: input.groupSlug,
        p_owner_display_name: input.ownerDisplayName ?? null,
      });
      if (error) {
        throw new Error(sanitizeInvitationRpcError(error.message));
      }
      if (!data) {
        throw new Error('Server did not return a bootstrap response.');
      }
      return data as BootstrapInitialGroupResponse;
    },

    async redeemGroupInvitation(
      input: RedeemGroupInvitationInput,
    ): Promise<RedeemGroupInvitationResponse> {
      const { data, error } = await client.rpc('redeem_group_invitation', {
        p_raw_token: input.rawToken,
        p_requested_player_id: input.requestedPlayerId ?? null,
        p_requested_new_player_name: input.requestedNewPlayerName ?? null,
      });
      if (error) {
        throw new Error(
          sanitizeInvitationRpcError(error.message, input.rawToken),
        );
      }
      if (!data) {
        throw new Error('Server did not confirm invitation redemption.');
      }
      return data as RedeemGroupInvitationResponse;
    },

    async loadAdminGovernanceSnapshot(
      groupId: string,
    ): Promise<AdminGovernanceSnapshot> {
      const [invRes, memRes] = await Promise.all([
        client
          .from('invitations')
          .select(
            'id, group_id, invited_email_normalized, intended_role, proposed_player_id, status, expires_at, created_by_user_id, redeemed_by_user_id, redeemed_at, revoked_by_user_id, revoked_at, revoke_reason, created_at, updated_at',
          )
          .eq('group_id', groupId)
          .order('created_at', { ascending: false }),
        client.rpc('list_group_memberships_for_admin', {
          p_group_id: groupId,
        }),
      ]);

      if (invRes.error) {
        throw new Error(
          `Failed to load invitation metadata: ${invRes.error.message}`,
        );
      }
      if (memRes.error) {
        throw new Error(
          `Failed to load admin membership directory: ${memRes.error.message}`,
        );
      }

      return {
        invitations: (invRes.data ?? []) as InvitationMetadataRow[],
        memberships: (memRes.data ?? []) as AdminMembershipDirectoryEntry[],
      };
    },

    async issueGroupInvitation(
      input: IssueGroupInvitationInput,
    ): Promise<IssueGroupInvitationResponse> {
      const { data, error } = await client.rpc('issue_group_invitation', {
        p_group_id: input.groupId,
        p_invited_email: input.invitedEmail,
        p_intended_role: input.intendedRole,
        p_proposed_player_id: input.proposedPlayerId ?? null,
        p_expires_in_days: input.expiresInDays ?? 7,
      });
      if (error) {
        throw new Error(error.message);
      }
      const res = data as IssueGroupInvitationResponse | null;
      if (!res || !res.invitation_id || !res.raw_token) {
        throw new Error('Server did not return a valid invitation issuance response.');
      }
      return res;
    },

    async revokeGroupInvitation(
      input: RevokeGroupInvitationInput,
    ): Promise<void> {
      const { error } = await client.rpc('revoke_group_invitation', {
        p_invitation_id: input.invitationId,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async decideMembershipRequest(
      input: DecideMembershipRequestInput,
    ): Promise<DecideMembershipRequestResponse> {
      const { data, error } = await client.rpc('decide_membership_request', {
        p_membership_id: input.membershipId,
        p_decision: input.decision,
        p_reason: input.reason ?? null,
        p_linked_player_id: input.linkedPlayerId ?? null,
        p_create_new_player: input.createNewPlayer ?? false,
        p_new_player_display_name: input.newPlayerDisplayName ?? null,
      });
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error('Server did not confirm membership decision.');
      }
      return data as DecideMembershipRequestResponse;
    },

    async updateMembershipRoleOrStatus(
      input: UpdateMembershipRoleOrStatusInput,
    ): Promise<void> {
      const { error } = await client.rpc('update_membership_role_or_status', {
        p_membership_id: input.membershipId,
        p_new_role: input.newRole,
        p_new_status: input.newStatus,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async linkMemberPlayerProfile(
      input: LinkMemberPlayerProfileInput,
    ): Promise<void> {
      const { error } = await client.rpc('link_member_player_profile', {
        p_membership_id: input.membershipId,
        p_player_id: input.playerId,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async createPlayerProfile(
      input: CreatePlayerProfileInput,
    ): Promise<string> {
      const { data, error } = await client.rpc('create_player_profile', {
        p_group_id: input.groupId,
        p_display_name: input.displayName,
        p_is_guest: input.isGuest ?? false,
      });
      if (error) {
        throw new Error(error.message);
      }
      if (!data || typeof data !== 'string') {
        throw new Error('Server did not return a created player UUID.');
      }
      return data;
    },

    async setPlayerActiveStatus(
      input: SetPlayerActiveStatusInput,
    ): Promise<void> {
      const { error } = await client.rpc('set_player_active_status', {
        p_player_id: input.playerId,
        p_is_active: input.isActive,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async previewGuestIntoPlayerMerge(
      input: PreviewGuestMergeInput,
    ): Promise<GuestMergePreviewResponse> {
      const { data, error } = await client.rpc(
        'preview_guest_into_player_merge',
        {
          p_group_id: input.groupId,
          p_source_guest_player_id: input.sourceGuestPlayerId,
          p_target_permanent_player_id: input.targetPermanentPlayerId,
        },
      );
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error('Server did not return a guest merge preview.');
      }
      return data as GuestMergePreviewResponse;
    },

    async mergeGuestIntoPlayer(
      input: ExecuteGuestMergeInput,
    ): Promise<GuestMergeExecutionResponse> {
      const { data, error } = await client.rpc('merge_guest_into_player', {
        p_group_id: input.groupId,
        p_source_guest_player_id: input.sourceGuestPlayerId,
        p_target_permanent_player_id: input.targetPermanentPlayerId,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error('Server did not confirm guest merge execution.');
      }
      return data as GuestMergeExecutionResponse;
    },

    async transferGroupOwnership(
      input: TransferGroupOwnershipInput,
    ): Promise<void> {
      const { error } = await client.rpc('transfer_group_ownership', {
        p_group_id: input.groupId,
        p_new_owner_membership_id: input.newOwnerMembershipId,
        p_reason: input.reason,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
