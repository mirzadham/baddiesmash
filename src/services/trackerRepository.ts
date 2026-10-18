import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveRatingPublicationState,
  type RatingPublicationBannerState,
} from '../domain/elo.ts';
import type {
  DbGroupMembershipRow,
  DbGroupRow,
  DbMatchParticipantRow,
  DbMatchRatingChangeRow,
  DbMatchRow,
  DbPlayerRatingSnapshotRow,
  DbPlayerRow,
  DbSessionAttendeeRow,
  DbSessionRow,
  RatingPublicationStateResponse,
  RecalculationExecutionOutcome,
} from '../types/database.ts';
import {
  buildDeterministicDemoSnapshot,
  type GroupReadSnapshot,
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
    bannerTitle:
      isCurrent
        ? null
        : derived.bannerTitle ?? 'Ratings out of date — recalculation required',
    bannerMessage:
      isCurrent
        ? null
        : derived.bannerMessage ??
          'Published ratings do not reflect the latest match history.',
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
}

/**
 * Explicitly labelled, read-only Demo Mode repository.
 * Never pretends authentication, authorization, or database writes succeed.
 */
export function createDemoTrackerRepository(
  customSnapshot?: GroupReadSnapshot,
): TrackerRepository {
  const snapshot = customSnapshot ?? buildDeterministicDemoSnapshot();
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
      throw new Error('Demo Mode has no active authenticated session to sign out.');
    },
    async retryRatingRecalculation(): Promise<RecalculationExecutionOutcome> {
      throw new Error(
        'Demo Mode is read-only and cannot execute server-side rating recalculation RPCs.',
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

      const membership = (memRes.data?.[0] as DbGroupMembershipRow | undefined) ?? null;
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
  };
}
