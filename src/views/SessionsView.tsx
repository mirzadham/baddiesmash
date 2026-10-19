import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, RotateCcw, Shuffle } from 'lucide-react';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { validateMatchScore } from '../domain/scoring.ts';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveSessionDetailFromSnapshot,
  type EnrichedMatchCard,
  formatMalaysiaDate,
  formatMalaysiaDateTime,
} from '../services/readViewModels.ts';
import type {
  EffectivePublicationBannerState,
  TrackerRepository,
} from '../services/trackerRepository.ts';
import type {
  DbPlayerRow,
  RecalculationExecutionOutcome,
  SessionInactivityStatusResponse,
} from '../types/database.ts';

export interface SessionsViewProps {
  snapshot: GroupReadSnapshot;
  publication: EffectivePublicationBannerState;
  repository: TrackerRepository;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectPlayer: (playerId: string) => void;
  onRefreshGroupState: () => Promise<void>;
  onRetryRecalculation: () => Promise<void>;
}

interface ActiveUndoPromptState {
  matchId: string;
  sequenceNumber: number;
  undoExpiresAtIso: string;
  recordedByUserId: string;
}

function generateClientSubmissionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function SessionsView({
  snapshot,
  publication,
  repository,
  selectedSessionId,
  onSelectSession,
  onSelectPlayer,
  onRefreshGroupState,
  onRetryRecalculation,
}: SessionsViewProps) {
  const effectiveSessionId =
    selectedSessionId ?? snapshot.sessions[0]?.id ?? null;
  const detail = effectiveSessionId
    ? deriveSessionDetailFromSnapshot(snapshot, effectiveSessionId)
    : null;

  const viewerRole = snapshot.viewerMembership.role;
  const viewerUserId = snapshot.viewerMembership.user_id;
  const isAdminOrOwner = viewerRole === 'admin' || viewerRole === 'owner';
  const canRecord =
    viewerRole === 'recorder' ||
    viewerRole === 'admin' ||
    viewerRole === 'owner';

  const activeGroupSession = useMemo(
    () => snapshot.sessions.find((s) => s.status === 'active') ?? null,
    [snapshot.sessions],
  );

  const playerMap = useMemo(() => {
    const map = new Map<string, DbPlayerRow>();
    for (const p of snapshot.players) {
      map.set(p.id, p);
    }
    return map;
  }, [snapshot.players]);

  const activeNonMergedPlayers = useMemo(
    () =>
      snapshot.players.filter(
        (p) => p.is_active && p.merged_into_player_id === null,
      ),
    [snapshot.players],
  );

  // Feedback & recalculation outcome banners
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutationRecalcFailure, setMutationRecalcFailure] = useState<{
    actionLabel: string;
    errorMessage: string;
    requiredSeq: number;
    publishedVersionId: string | null;
  } | null>(null);

  const inspectRecalculationOutcome = useCallback(
    (
      recalc: RecalculationExecutionOutcome | null | undefined,
      actionLabel: string,
    ) => {
      if (!recalc) {
        return;
      }
      if (!recalc.recalculation_succeeded) {
        setMutationRecalcFailure({
          actionLabel,
          errorMessage:
            recalc.error_message ??
            'Elo rating recalculation did not complete on the server.',
          requiredSeq: recalc.required_match_state_seq,
          publishedVersionId: recalc.published_rating_version_id,
        });
      } else {
        setMutationRecalcFailure(null);
      }
    },
    [],
  );

  // 1. Start New Session State (SES-01, Policy 3A)
  const [showStartSessionPanel, setShowStartSessionPanel] = useState<boolean>(
    () => snapshot.sessions.length === 0,
  );
  const [newSessionStartedAt, setNewSessionStartedAt] = useState<string>(() =>
    new Date().toISOString(),
  );
  const [selectedInitialAttendees, setSelectedInitialAttendees] = useState<
    string[]
  >([]);
  const [ackBackdatedSessionWarning, setAckBackdatedSessionWarning] =
    useState<boolean>(false);
  const [startSessionError, setStartSessionError] = useState<string | null>(
    null,
  );
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);

  const isBackdatedBeforeRatedSession = useMemo(() => {
    const parsedMs = Date.parse(newSessionStartedAt);
    if (Number.isNaN(parsedMs)) {
      return false;
    }
    const ratedSessionIds = new Set(
      snapshot.matches
        .filter((m) => m.status === 'completed')
        .map((m) => m.session_id),
    );
    return snapshot.sessions.some(
      (s) =>
        ratedSessionIds.has(s.id) &&
        Date.parse(s.session_started_at) > parsedMs,
    );
  }, [newSessionStartedAt, snapshot.matches, snapshot.sessions]);

  // 2. Stale 12-Hour Inactivity Status (SES-04)
  const [inactivityStatus, setInactivityStatus] =
    useState<SessionInactivityStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (
      !detail ||
      (detail.session.status !== 'active' &&
        detail.session.status !== 'reopened')
    ) {
      setInactivityStatus(null);
      return;
    }

    void repository
      .getSessionInactivityStatus(detail.session.id)
      .then((res) => {
        if (!cancelled) {
          setInactivityStatus(res);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInactivityStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    detail?.session.id,
    detail?.session.status,
    detail?.session.last_meaningful_activity_at,
    repository,
  ]);

  // 3. Controller Handover / Takeover State (SES-02)
  const [handoverTargetUserId, setHandoverTargetUserId] = useState<string>('');
  const [handoverReason, setHandoverReason] = useState<string>('');
  const [takeoverReason, setTakeoverReason] = useState<string>('');
  const [isUpdatingController, setIsUpdatingController] =
    useState<boolean>(false);

  // 4. Edit Session Start Time State (Policy 3B & 3A)
  const [showEditStartTimePanel, setShowEditStartTimePanel] =
    useState<boolean>(false);
  const [editStartTimeValue, setEditStartTimeValue] = useState<string>('');
  const [editStartTimeReason, setEditStartTimeReason] = useState<string>('');
  const [editStartTimeAckRecalc, setEditStartTimeAckRecalc] =
    useState<boolean>(false);
  const [isSavingStartTime, setIsSavingStartTime] = useState<boolean>(false);

  // 5. Finalize / Reopen Session State (SES-03, Policy 3C)
  const [isFinalizingSession, setIsFinalizingSession] =
    useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [isReopeningSession, setIsReopeningSession] = useState<boolean>(false);

  // 6. Attendance & Temporary Guest State (ATT-01, ID-02)
  const [togglingAttendancePlayerId, setTogglingAttendancePlayerId] = useState<
    string | null
  >(null);
  const [newGuestDisplayName, setNewGuestDisplayName] = useState<string>('');
  const [isCreatingGuest, setIsCreatingGuest] = useState<boolean>(false);

  // 7. Mobile-First Doubles Match Entry State (MATCH-01..MATCH-04, SES-03)
  const [clientSubmissionId, setClientSubmissionId] = useState<string>(() =>
    generateClientSubmissionId(),
  );
  const [teamAPlayer1, setTeamAPlayer1] = useState<string>('');
  const [teamAPlayer2, setTeamAPlayer2] = useState<string>('');
  const [teamBPlayer1, setTeamBPlayer1] = useState<string>('');
  const [teamBPlayer2, setTeamBPlayer2] = useState<string>('');
  const [teamAScoreInput, setTeamAScoreInput] = useState<string>('');
  const [teamBScoreInput, setTeamBScoreInput] = useState<string>('');
  const [resumingDraftMatchId, setResumingDraftMatchId] = useState<
    string | null
  >(null);
  const [isSavingMatch, setIsSavingMatch] = useState<boolean>(false);
  const [matchSaveError, setMatchSaveError] = useState<string | null>(null);

  // 8. 10-Second Immediate Undo State (MATCH-05)
  const [activeUndoPrompt, setActiveUndoPrompt] =
    useState<ActiveUndoPromptState | null>(null);
  const [undoRemainingSeconds, setUndoRemainingSeconds] = useState<number>(10);
  const [isUndoingMatch, setIsUndoingMatch] = useState<boolean>(false);
  const [undoExpiredMessage, setUndoExpiredMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!activeUndoPrompt) {
      return;
    }
    const computeRemaining = () => {
      const expiresMs = Date.parse(activeUndoPrompt.undoExpiresAtIso);
      if (Number.isNaN(expiresMs)) {
        return 10;
      }
      return Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
    };
    setUndoRemainingSeconds(computeRemaining());
    const timer = setInterval(() => {
      const rem = computeRemaining();
      setUndoRemainingSeconds(rem);
    }, 500);
    return () => clearInterval(timer);
  }, [activeUndoPrompt]);

  // 9. Post-Window Match Correction / Void State (MATCH-06, RATE-03)
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [correctionAction, setCorrectionAction] = useState<'correct' | 'void'>(
    'correct',
  );
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [corrTeamA1, setCorrTeamA1] = useState<string>('');
  const [corrTeamA2, setCorrTeamA2] = useState<string>('');
  const [corrTeamB1, setCorrTeamB1] = useState<string>('');
  const [corrTeamB2, setCorrTeamB2] = useState<string>('');
  const [corrScoreA, setCorrScoreA] = useState<string>('');
  const [corrScoreB, setCorrScoreB] = useState<string>('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] =
    useState<boolean>(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Sync editStartTimeValue when selected session changes
  useEffect(() => {
    if (detail) {
      setEditStartTimeValue(detail.session.session_started_at);
    }
  }, [detail?.session.id, detail?.session.session_started_at]);

  // Resolve controller display label without exposing private emails (PRIV-01)
  const resolveControllerDisplay = (controllerUserId: string | null): string => {
    if (!controllerUserId) {
      return 'Unassigned';
    }
    const isSelf = controllerUserId === viewerUserId;
    const mem = (snapshot.groupMemberships ?? []).find(
      (m) => m.user_id === controllerUserId,
    );
    const linkedPlayer = mem?.linked_player_id
      ? playerMap.get(mem.linked_player_id)
      : null;
    const baseName = linkedPlayer
      ? `${linkedPlayer.display_name} (${mem?.role ?? 'member'})`
      : mem
        ? `${mem.role} (${controllerUserId.slice(0, 8)})`
        : `User ${controllerUserId.slice(0, 8)}`;
    return isSelf ? `${baseName} — You` : baseName;
  };

  // Eligible controller handover recipients (approved recorder/admin/owner excluding current controller)
  const eligibleHandoverRecipients = useMemo(() => {
    if (!detail) {
      return [];
    }
    return (snapshot.groupMemberships ?? []).filter(
      (m) =>
        m.status === 'approved' &&
        (m.role === 'recorder' || m.role === 'admin' || m.role === 'owner') &&
        m.user_id !== detail.session.controller_user_id,
    );
  }, [detail, snapshot.groupMemberships]);

  // Present attendees for the selected session
  const presentAttendeeIds = useMemo(() => {
    if (!detail) {
      return new Set<string>();
    }
    return new Set(
      snapshot.sessionAttendees
        .filter((sa) => sa.session_id === detail.session.id)
        .map((sa) => sa.player_id),
    );
  }, [detail, snapshot.sessionAttendees]);

  const presentAttendeePlayers = useMemo(() => {
    if (!detail) {
      return [];
    }
    return snapshot.players.filter((p) => presentAttendeeIds.has(p.id));
  }, [detail, presentAttendeeIds, snapshot.players]);

  // Players who have already participated in a non-voided match in this session (ATT-01 removal guard)
  const playedInSessionPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!detail) {
      return ids;
    }
    for (const card of detail.matches) {
      if (card.match.status !== 'voided') {
        ids.add(card.teamA[0].playerId);
        ids.add(card.teamA[1].playerId);
        ids.add(card.teamB[0].playerId);
        ids.add(card.teamB[1].playerId);
      }
    }
    return ids;
  }, [detail]);

  // Unresolved incomplete match drafts in this session (SES-03)
  const incompleteDraftCards = useMemo(() => {
    if (!detail) {
      return [];
    }
    return detail.matches.filter((c) => c.match.status === 'incomplete');
  }, [detail]);

  // Duplicate player check for court match entry
  const selectedMatchSlots = [
    teamAPlayer1,
    teamAPlayer2,
    teamBPlayer1,
    teamBPlayer2,
  ].filter(Boolean);
  const hasDuplicateMatchPlayers =
    new Set(selectedMatchSlots).size !== selectedMatchSlots.length;
  const allFourMatchPlayersSelected =
    Boolean(teamAPlayer1) &&
    Boolean(teamAPlayer2) &&
    Boolean(teamBPlayer1) &&
    Boolean(teamBPlayer2) &&
    !hasDuplicateMatchPlayers;

  // Live score validation for court match entry (MATCH-02)
  const liveScoreValidation = useMemo(() => {
    if (teamAScoreInput.trim() === '' || teamBScoreInput.trim() === '') {
      return null;
    }
    const scoreA = Number(teamAScoreInput);
    const scoreB = Number(teamBScoreInput);
    return validateMatchScore(scoreA, scoreB);
  }, [teamAScoreInput, teamBScoreInput]);

  // Duplicate player warning when creating a temporary guest (ID-02)
  const duplicateGuestNameExists = useMemo(() => {
    const trimmed = newGuestDisplayName.trim().toLowerCase();
    if (!trimmed) {
      return false;
    }
    return snapshot.players.some(
      (p) =>
        p.merged_into_player_id === null &&
        p.display_name.trim().toLowerCase() === trimmed,
    );
  }, [newGuestDisplayName, snapshot.players]);

  // Handlers
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setStartSessionError(null);
    setActionError(null);
    setStatusNotice(null);
    setIsStartingSession(true);
    try {
      const res = await repository.startGroupSession({
        groupId: snapshot.group.id,
        sessionStartedAt: newSessionStartedAt.trim() || null,
        initialAttendeePlayerIds: selectedInitialAttendees,
        acknowledgeBackdatedRecalcWarning: ackBackdatedSessionWarning,
      });
      setShowStartSessionPanel(false);
      setAckBackdatedSessionWarning(false);
      onSelectSession(res.session_id);
      setStatusNotice(
        res.is_backdated_before_rated
          ? 'Backdated session started and chronological Elo replay triggered.'
          : 'New session started. You are the active session controller.',
      );
      await onRefreshGroupState();
    } catch (err) {
      setStartSessionError(
        err instanceof Error ? err.message : 'Failed to start session.',
      );
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleToggleAttendance = async (
    playerId: string,
    nextPresent: boolean,
  ) => {
    if (!detail) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setTogglingAttendancePlayerId(playerId);
    try {
      await repository.updateSessionAttendance({
        sessionId: detail.session.id,
        playerId,
        present: nextPresent,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      const playerName = playerMap.get(playerId)?.display_name ?? 'Player';
      setStatusNotice(
        nextPresent
          ? `${playerName} checked in to session attendance.`
          : `${playerName} removed from session attendance.`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to update session attendance.',
      );
    } finally {
      setTogglingAttendancePlayerId(null);
    }
  };

  const handleCreateGuestAndCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) {
      return;
    }
    const trimmed = newGuestDisplayName.trim();
    if (trimmed.length < 2) {
      setActionError('Guest display name must be at least 2 characters.');
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsCreatingGuest(true);
    try {
      const createdPlayerId = await repository.createPlayerProfile({
        groupId: snapshot.group.id,
        displayName: trimmed,
        isGuest: true,
      });
      await repository.updateSessionAttendance({
        sessionId: detail.session.id,
        playerId: createdPlayerId,
        present: true,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      setNewGuestDisplayName('');
      setStatusNotice(
        `Temporary guest "${trimmed}" created with a distinct UUID identity and checked in to this session.`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to create temporary guest and check in.',
      );
    } finally {
      setIsCreatingGuest(false);
    }
  };

  const handleVoluntaryHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) {
      return;
    }
    if (!handoverTargetUserId) {
      setActionError('Select an approved Recorder, Admin, or Owner to hand over control.');
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsUpdatingController(true);
    try {
      const prevLease = detail.session.controller_lease_version;
      const res = await repository.transferOrTakeoverSessionController({
        sessionId: detail.session.id,
        newControllerUserId: handoverTargetUserId,
        reason: handoverReason.trim() || 'Voluntary controller handover',
        expectedLeaseVersion: prevLease,
      });
      setHandoverReason('');
      setHandoverTargetUserId('');
      setStatusNotice(
        `Session controller handed over (Lease v${prevLease} → v${res.controller_lease_version}).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to hand over session controller.',
      );
    } finally {
      setIsUpdatingController(false);
    }
  };

  const handleClaimOrTakeoverController = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsUpdatingController(true);
    try {
      const prevLease = detail.session.controller_lease_version;
      const res = await repository.transferOrTakeoverSessionController({
        sessionId: detail.session.id,
        newControllerUserId: viewerUserId,
        reason:
          takeoverReason.trim() ||
          'Controller takeover by authorized session recorder',
        expectedLeaseVersion: prevLease,
      });
      setTakeoverReason('');
      setStatusNotice(
        `Session control claimed (${res.action_type}, Lease v${prevLease} → v${res.controller_lease_version}). Any stale tab held by the previous controller is now fenced.`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to claim or take over session control.',
      );
    } finally {
      setIsUpdatingController(false);
    }
  };

  const handleUpdateSessionStartTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) {
      return;
    }
    if (editStartTimeReason.trim().length < 3) {
      setActionError(
        'A reason of at least 3 characters is required when editing session start time (Policy 3B).',
      );
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsSavingStartTime(true);
    try {
      const res = await repository.updateSessionStartTime({
        sessionId: detail.session.id,
        newStartedAt: editStartTimeValue.trim(),
        reason: editStartTimeReason.trim(),
        expectedLeaseVersion: detail.session.controller_lease_version,
        acknowledgeRecalcWarning: editStartTimeAckRecalc,
      });
      inspectRecalculationOutcome(
        res.recalculation,
        'Session start-time update',
      );
      setShowEditStartTimePanel(false);
      setEditStartTimeReason('');
      setEditStartTimeAckRecalc(false);
      setStatusNotice(
        'Session start time updated and audited (chronological Elo replay checked).',
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to update session start time.',
      );
    } finally {
      setIsSavingStartTime(false);
    }
  };

  const handleFinalizeSession = async () => {
    if (!detail) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsFinalizingSession(true);
    try {
      const res = await repository.finalizeGroupSession({
        sessionId: detail.session.id,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      setStatusNotice(
        `Session finalized at ${formatMalaysiaDateTime(res.session_ended_at)}.`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to finalize session.',
      );
    } finally {
      setIsFinalizingSession(false);
    }
  };

  const handleReopenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) {
      return;
    }
    if (reopenReason.trim().length < 3) {
      setActionError(
        'A reason of at least 3 characters is required to reopen a completed session.',
      );
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setIsReopeningSession(true);
    try {
      const res = await repository.reopenCompletedSession({
        sessionId: detail.session.id,
        reason: reopenReason.trim(),
      });
      setReopenReason('');
      setStatusNotice(
        `Session reopened (Lease v${res.controller_lease_version}). Forgotten matches recorded now will append at the end of the session (Policy 3C).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to reopen session.',
      );
    } finally {
      setIsReopeningSession(false);
    }
  };

  // Swap & Clear Court Entry Controls (MATCH-01)
  const handleSwapTeams = () => {
    const prevA1 = teamAPlayer1;
    const prevA2 = teamAPlayer2;
    setTeamAPlayer1(teamBPlayer1);
    setTeamAPlayer2(teamBPlayer2);
    setTeamBPlayer1(prevA1);
    setTeamBPlayer2(prevA2);
    const prevScoreA = teamAScoreInput;
    setTeamAScoreInput(teamBScoreInput);
    setTeamBScoreInput(prevScoreA);
  };

  const handleSwapPartners = () => {
    const prevA2 = teamAPlayer2;
    setTeamAPlayer2(teamBPlayer1);
    setTeamBPlayer1(prevA2);
  };

  const handleClearMatchSlots = () => {
    setTeamAPlayer1('');
    setTeamAPlayer2('');
    setTeamBPlayer1('');
    setTeamBPlayer2('');
    setTeamAScoreInput('');
    setTeamBScoreInput('');
    setResumingDraftMatchId(null);
    setMatchSaveError(null);
    setClientSubmissionId(generateClientSubmissionId());
  };

  const submitMatchAttempt = async () => {
    if (!detail || isSavingMatch) {
      return;
    }
    if (!allFourMatchPlayersSelected) {
      setMatchSaveError(
        'Select 4 distinct present session attendees for Team A and Team B before saving.',
      );
      return;
    }
    const scoreA = Number(teamAScoreInput);
    const scoreB = Number(teamBScoreInput);
    const validation = validateMatchScore(scoreA, scoreB);
    if (!validation.valid) {
      setMatchSaveError(
        `Invalid badminton score (${teamAScoreInput || '–'}–${teamBScoreInput || '–'}): ${validation.reason ?? 'Invalid score'}`,
      );
      return;
    }

    setMatchSaveError(null);
    setActionError(null);
    setStatusNotice(null);
    setUndoExpiredMessage(null);
    setIsSavingMatch(true);

    try {
      const res = await repository.recordCompletedMatch({
        sessionId: detail.session.id,
        clientSubmissionId,
        teamAPlayer1,
        teamAPlayer2,
        teamBPlayer1,
        teamBPlayer2,
        teamAScore: scoreA,
        teamBScore: scoreB,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });

      inspectRecalculationOutcome(res.recalculation, 'Match recording');

      // If this completed match was resumed from an incomplete draft, void the draft row so it no longer blocks finalization (SES-03)
      if (resumingDraftMatchId) {
        try {
          await repository.correctOrVoidMatch({
            matchId: resumingDraftMatchId,
            action: 'void',
            reason: `Incomplete draft superseded by completed Match #${res.sequence_number}`,
            expectedLeaseVersion: detail.session.controller_lease_version,
          });
        } catch {
          // Even if draft cleanup fails, the completed match was confirmed; refresh will show remaining state
        }
        setResumingDraftMatchId(null);
      }

      // Confirmed save -> clear slots and rotate client_submission_id for the next match (MATCH-01, MATCH-03, MATCH-04)
      setTeamAPlayer1('');
      setTeamAPlayer2('');
      setTeamBPlayer1('');
      setTeamBPlayer2('');
      setTeamAScoreInput('');
      setTeamBScoreInput('');
      setClientSubmissionId(generateClientSubmissionId());

      if (!res.idempotent_retry) {
        setActiveUndoPrompt({
          matchId: res.match_id,
          sequenceNumber: res.sequence_number,
          undoExpiresAtIso: new Date(Date.now() + 10000).toISOString(),
          recordedByUserId: viewerUserId,
        });
      }

      setStatusNotice(
        res.idempotent_retry
          ? `Idempotent retry confirmed: Match #${res.sequence_number} was already recorded without duplicate insertion.`
          : `Match #${res.sequence_number} recorded (${scoreA}–${scoreB}).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      // Retain form inputs AND keep the exact same clientSubmissionId for safe idempotent retry (MATCH-03, MATCH-04)
      setMatchSaveError(
        err instanceof Error
          ? err.message
          : 'Failed to save match. Your entries are retained for safe retry.',
      );
    } finally {
      setIsSavingMatch(false);
    }
  };

  const handleRecordMatchFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMatchAttempt();
  };

  const handleSaveIncompleteDraft = async () => {
    if (!detail || isSavingMatch) {
      return;
    }
    if (!allFourMatchPlayersSelected) {
      setMatchSaveError(
        'Select 4 distinct present attendees before saving an incomplete match draft.',
      );
      return;
    }
    setMatchSaveError(null);
    setActionError(null);
    setStatusNotice(null);
    setIsSavingMatch(true);
    try {
      const res = await repository.createIncompleteMatchDraft({
        sessionId: detail.session.id,
        clientSubmissionId,
        teamAPlayer1,
        teamAPlayer2,
        teamBPlayer1,
        teamBPlayer2,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      setTeamAPlayer1('');
      setTeamAPlayer2('');
      setTeamBPlayer1('');
      setTeamBPlayer2('');
      setTeamAScoreInput('');
      setTeamBScoreInput('');
      setResumingDraftMatchId(null);
      setClientSubmissionId(generateClientSubmissionId());
      setStatusNotice(
        `Incomplete match draft saved (${res.match_id.slice(0, 8)}). Resolve or void all drafts before finalizing the session (SES-03).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setMatchSaveError(
        err instanceof Error
          ? err.message
          : 'Failed to save incomplete match draft.',
      );
    } finally {
      setIsSavingMatch(false);
    }
  };

  const handleResumeDraftInForm = (draftCard: EnrichedMatchCard) => {
    setTeamAPlayer1(draftCard.teamA[0].playerId);
    setTeamAPlayer2(draftCard.teamA[1].playerId);
    setTeamBPlayer1(draftCard.teamB[0].playerId);
    setTeamBPlayer2(draftCard.teamB[1].playerId);
    setTeamAScoreInput('');
    setTeamBScoreInput('');
    setResumingDraftMatchId(draftCard.match.id);
    setMatchSaveError(null);
    setClientSubmissionId(generateClientSubmissionId());
    setStatusNotice(
      'Incomplete draft loaded into court entry slots. Enter final scores and click Record Completed Match to complete it.',
    );
  };

  const handleVoidIncompleteDraft = async (draftMatchId: string) => {
    if (!detail) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    try {
      await repository.correctOrVoidMatch({
        matchId: draftMatchId,
        action: 'void',
        reason: 'Incomplete match draft voided before session finalization',
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      if (resumingDraftMatchId === draftMatchId) {
        setResumingDraftMatchId(null);
      }
      setStatusNotice('Incomplete match draft voided.');
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to void incomplete match draft.',
      );
    }
  };

  const handleImmediateUndo = async () => {
    if (!detail || !activeUndoPrompt || isUndoingMatch) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    setUndoExpiredMessage(null);
    setIsUndoingMatch(true);
    const targetPrompt = activeUndoPrompt;
    try {
      const res = await repository.undoMatchWithinWindow({
        matchId: targetPrompt.matchId,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      inspectRecalculationOutcome(
        res.recalculation,
        `10-second undo of Match #${targetPrompt.sequenceNumber}`,
      );
      setActiveUndoPrompt(null);
      setStatusNotice(
        `Match #${targetPrompt.sequenceNumber} undone within the 10-second window (marked voided; sequence #${targetPrompt.sequenceNumber} preserved).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to undo recorded match.';
      if (/undo_window_expired|10-second immediate undo window/i.test(msg)) {
        setActiveUndoPrompt(null);
        setUndoExpiredMessage(
          `The 10-second immediate undo window expired on the server (${msg}). Match #${targetPrompt.sequenceNumber} remains confirmed in official results. Use the Post-Window Correction / Void form on the match card with a reason to amend or void it.`,
        );
      } else {
        setActionError(msg);
      }
    } finally {
      setIsUndoingMatch(false);
    }
  };

  const openCorrectionForm = (card: EnrichedMatchCard) => {
    setEditingMatchId(card.match.id);
    setCorrectionAction('correct');
    setCorrectionReason('');
    setCorrTeamA1(card.teamA[0].playerId);
    setCorrTeamA2(card.teamA[1].playerId);
    setCorrTeamB1(card.teamB[0].playerId);
    setCorrTeamB2(card.teamB[1].playerId);
    setCorrScoreA(
      card.match.team_a_score !== null ? String(card.match.team_a_score) : '',
    );
    setCorrScoreB(
      card.match.team_b_score !== null ? String(card.match.team_b_score) : '',
    );
    setCorrectionError(null);
  };

  const handleSubmitCorrectionOrVoid = async (
    e: React.FormEvent,
    card: EnrichedMatchCard,
  ) => {
    e.preventDefault();
    if (!detail || isSubmittingCorrection) {
      return;
    }
    if (correctionReason.trim().length < 3) {
      setCorrectionError(
        'A reason of at least 3 characters is required for post-window corrections or voids (MATCH-06).',
      );
      return;
    }

    if (correctionAction === 'correct') {
      const slots = [corrTeamA1, corrTeamA2, corrTeamB1, corrTeamB2].filter(
        Boolean,
      );
      if (slots.length !== 4 || new Set(slots).size !== 4) {
        setCorrectionError(
          'All 4 participant slots must have distinct session attendees.',
        );
        return;
      }
      const sA = Number(corrScoreA);
      const sB = Number(corrScoreB);
      const val = validateMatchScore(sA, sB);
      if (!val.valid) {
        setCorrectionError(
          `Invalid corrected score (${corrScoreA}–${corrScoreB}): ${val.reason ?? 'Invalid score'}`,
        );
        return;
      }
    }

    setCorrectionError(null);
    setActionError(null);
    setStatusNotice(null);
    setIsSubmittingCorrection(true);
    try {
      const res = await repository.correctOrVoidMatch({
        matchId: card.match.id,
        action: correctionAction,
        reason: correctionReason.trim(),
        teamAScore: correctionAction === 'correct' ? Number(corrScoreA) : null,
        teamBScore: correctionAction === 'correct' ? Number(corrScoreB) : null,
        teamAPlayer1: correctionAction === 'correct' ? corrTeamA1 : null,
        teamAPlayer2: correctionAction === 'correct' ? corrTeamA2 : null,
        teamBPlayer1: correctionAction === 'correct' ? corrTeamB1 : null,
        teamBPlayer2: correctionAction === 'correct' ? corrTeamB2 : null,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      inspectRecalculationOutcome(
        res.recalculation,
        correctionAction === 'correct'
          ? `Correction of Match #${res.sequence_number ?? card.match.sequence_number}`
          : `Void of Match #${res.sequence_number ?? card.match.sequence_number}`,
      );
      setEditingMatchId(null);
      setCorrectionReason('');
      setStatusNotice(
        correctionAction === 'correct'
          ? `Match #${res.sequence_number ?? card.match.sequence_number} corrected and audited (sequence number preserved; chronological Elo replay triggered).`
          : `Match #${res.sequence_number ?? card.match.sequence_number} voided and audited (sequence number preserved; excluded from official ratings).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setCorrectionError(
        err instanceof Error
          ? err.message
          : 'Failed to submit match correction or void.',
      );
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  // Stale 12h calculation (SES-04)
  const isStale12hSession = useMemo(() => {
    if (!detail) {
      return false;
    }
    if (
      detail.session.status !== 'active' &&
      detail.session.status !== 'reopened'
    ) {
      return false;
    }
    if (inactivityStatus) {
      return inactivityStatus.is_stale_12h_warning;
    }
    const elapsedMs =
      Date.now() - Date.parse(detail.session.last_meaningful_activity_at);
    return elapsedMs >= 43200 * 1000;
  }, [detail, inactivityStatus]);

  const inactiveHoursDisplay = useMemo(() => {
    if (!detail) {
      return 0;
    }
    const seconds =
      inactivityStatus?.inactive_seconds ??
      Math.max(
        0,
        Math.floor(
          (Date.now() -
            Date.parse(detail.session.last_meaningful_activity_at)) /
            1000,
        ),
      );
    return Math.floor(seconds / 3600);
  }, [detail, inactivityStatus]);

  const isViewerController =
    detail?.session.controller_user_id === viewerUserId;
  const isSessionOpenForRecording =
    detail?.session.status === 'active' ||
    detail?.session.status === 'reopened';
  const canViewerMutateSession =
    isSessionOpenForRecording && (isViewerController || isAdminOrOwner);
  const canViewerEditStartTime =
    detail !== null &&
    ((detail.session.status === 'active' &&
      (isViewerController || isAdminOrOwner)) ||
      ((detail.session.status === 'completed' ||
        detail.session.status === 'reopened') &&
        isAdminOrOwner));

  return (
    <div data-testid="view-sessions">
      <PublicationStatusBanner
        publication={publication}
        viewerRole={viewerRole}
        isDemoMode={snapshot.isDemoMode}
        onRetryRecalculation={onRetryRecalculation}
      />

      {mutationRecalcFailure && (
        <section
          className="card"
          role="alert"
          data-testid="mutation-recalc-failure-alert"
          style={{
            borderLeft: '4px solid var(--accent-danger)',
            background: 'var(--bg-danger-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <strong>
              ⚠ {mutationRecalcFailure.actionLabel} Saved — Elo Rating
              Recalculation Failed (Stale / Failed)
            </strong>
            <StatusBadge variant="stale_or_failed" />
          </div>
          <p style={{ margin: '0.4rem 0', fontSize: '0.88rem' }}>
            The match or session change was committed, but deterministic Elo
            recalculation reported an error:{' '}
            <code>{mutationRecalcFailure.errorMessage}</code>. The last valid
            published rating version (
            <code>
              {mutationRecalcFailure.publishedVersionId?.slice(0, 8) ?? 'none'}
            </code>
            , required seq #{mutationRecalcFailure.requiredSeq}) remains
            preserved until an Admin or Owner retries recalculation.
          </p>
        </section>
      )}

      {statusNotice && (
        <section
          className="card"
          role="status"
          aria-live="polite"
          data-testid="sessions-status-notice"
          style={{
            borderLeft: '4px solid var(--accent-success)',
            padding: '0.75rem 1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>✓ {statusNotice}</span>
            <button
              type="button"
              className="touch-target"
              onClick={() => setStatusNotice(null)}
              style={{ minHeight: '36px', padding: '0.2rem 0.6rem' }}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {actionError && (
        <section
          className="card"
          role="alert"
          data-testid="sessions-action-error"
          style={{
            borderLeft: '4px solid var(--accent-danger)',
            background: 'var(--bg-danger-subtle)',
            padding: '0.75rem 1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>✕ {actionError}</span>
            <button
              type="button"
              className="touch-target"
              onClick={() => setActionError(null)}
              style={{ minHeight: '36px', padding: '0.2rem 0.6rem' }}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* Chronological Session Selector List & Start Session Trigger */}
      <section className="card" aria-labelledby="sessions-list-heading">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <h2 id="sessions-list-heading" style={{ margin: 0 }}>
            Sessions ({snapshot.sessions.length})
          </h2>
          {canRecord && (
            <button
              type="button"
              className="touch-target touch-target-primary"
              aria-expanded={showStartSessionPanel}
              data-testid="toggle-start-session-btn"
              onClick={() => setShowStartSessionPanel((prev) => !prev)}
            >
              {showStartSessionPanel
                ? 'Hide Start Session Form ▲'
                : '+ Start New Session'}
            </button>
          )}
        </div>

        <p
          style={{
            marginTop: 0,
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          Dates are displayed in Malaysia time (<code>Asia/Kuala_Lumpur</code>,{' '}
          <code>DD MMM YYYY</code>). Doubles only, one court, one match at a
          time.
        </p>

        {/* Start New Session Panel (SES-01, Policy 3A) */}
        {showStartSessionPanel && canRecord && (
          <form
            onSubmit={handleStartSession}
            data-testid="start-session-panel"
            style={{
              margin: '0.85rem 0 1rem 0',
              padding: '1rem',
              borderRadius: '0.65rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface-subtle)',
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: '1.02rem' }}>
              Start New Group Session
            </h3>

            {activeGroupSession && (
              <div
                role="note"
                data-testid="existing-active-session-warning"
                style={{
                  padding: '0.65rem 0.85rem',
                  marginBottom: '0.75rem',
                  borderRadius: '0.45rem',
                  background: 'var(--bg-warning-subtle)',
                  color: 'var(--text-warning)',
                  fontSize: '0.85rem',
                }}
              >
                ⚠ An active session ({formatMalaysiaDate(activeGroupSession.session_started_at)})
                is already open. Only one active session is permitted per group
                at a time (<code>SES-01</code>); finalize it before starting a
                new session.
              </div>
            )}

            {startSessionError && (
              <div
                role="alert"
                data-testid="start-session-error-alert"
                style={{
                  padding: '0.65rem 0.85rem',
                  marginBottom: '0.75rem',
                  borderRadius: '0.45rem',
                  background: 'var(--bg-danger-subtle)',
                  color: 'var(--text-danger)',
                  fontSize: '0.86rem',
                }}
              >
                ✕ {startSessionError}
              </div>
            )}

            <div style={{ marginBottom: '0.75rem' }}>
              <label
                htmlFor="start-session-datetime-input"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  marginBottom: '0.25rem',
                }}
              >
                Session Start Date/Time (ISO UTC or Malaysia Timestamp):
              </label>
              <input
                id="start-session-datetime-input"
                type="text"
                value={newSessionStartedAt}
                onChange={(e) => setNewSessionStartedAt(e.target.value)}
                data-testid="start-session-datetime-input"
                style={{
                  width: '100%',
                  maxWidth: '380px',
                  minHeight: '44px',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border-color)',
                }}
              />
            </div>

            {/* Policy 3A Backdated Warning & Acknowledgment */}
            {(isBackdatedBeforeRatedSession ||
              /Backdated session|prior rated/i.test(
                startSessionError ?? '',
              )) && (
              <div
                role="region"
                aria-label="Backdated session warning"
                data-testid="backdated-session-warning"
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--accent-warning)',
                  background: 'var(--bg-warning-subtle)',
                  fontSize: '0.85rem',
                }}
              >
                <strong>
                  ⚠ Policy 3A — Backdated Session Before Existing Rated Matches:
                </strong>
                <p style={{ margin: '0.35rem 0' }}>
                  This session start time is earlier than an existing session
                  containing completed (rated) matches. Creating a backdated
                  session requires <strong>Admin or Owner</strong> authorization
                  and will recalculate historical Elo ratings in chronological
                  session order.
                </p>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ackBackdatedSessionWarning}
                    onChange={(e) =>
                      setAckBackdatedSessionWarning(e.target.checked)
                    }
                    data-testid="acknowledge-backdated-session-checkbox"
                  />
                  <span>
                    Acknowledge historical Elo recalculation for backdated
                    session (Policy 3A)
                  </span>
                </label>
              </div>
            )}

            {/* Initial Attendees Selection */}
            <fieldset
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <legend style={{ fontWeight: 600, fontSize: '0.86rem' }}>
                Initial Session Attendees ({selectedInitialAttendees.length}{' '}
                selected)
              </legend>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <button
                  type="button"
                  className="touch-target"
                  style={{ minHeight: '38px', fontSize: '0.8rem' }}
                  onClick={() =>
                    setSelectedInitialAttendees(
                      activeNonMergedPlayers.map((p) => p.id),
                    )
                  }
                >
                  Select All Active ({activeNonMergedPlayers.length})
                </button>
                <button
                  type="button"
                  className="touch-target"
                  style={{ minHeight: '38px', fontSize: '0.8rem' }}
                  onClick={() => setSelectedInitialAttendees([])}
                >
                  Clear Selection
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.4rem',
                }}
              >
                {activeNonMergedPlayers.map((player) => {
                  const checked = selectedInitialAttendees.includes(player.id);
                  return (
                    <label
                      key={player.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.86rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        data-testid={`initial-attendee-checkbox-${player.id}`}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInitialAttendees((prev) => [
                              ...prev,
                              player.id,
                            ]);
                          } else {
                            setSelectedInitialAttendees((prev) =>
                              prev.filter((id) => id !== player.id),
                            );
                          }
                        }}
                      />
                      <span>
                        {player.display_name}{' '}
                        {player.is_guest ? '(Guest)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="submit"
              className="touch-target touch-target-primary"
              disabled={snapshot.isDemoMode || isStartingSession}
              data-testid="start-session-submit-btn"
            >
              {isStartingSession
                ? 'Starting Session...'
                : snapshot.isDemoMode
                  ? 'Start Session (Disabled in Demo Mode)'
                  : 'Confirm Start Session'}
            </button>
          </form>
        )}

        {snapshot.sessions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No sessions found.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {snapshot.sessions.map((s) => {
              const isSelected = s.id === effectiveSessionId;
              const attCount = snapshot.sessionAttendees.filter(
                (sa) => sa.session_id === s.id,
              ).length;
              const matchCount = snapshot.matches.filter(
                (m) => m.session_id === s.id && m.status === 'completed',
              ).length;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  aria-pressed={isSelected}
                  data-testid={`session-card-${s.id}`}
                  style={{
                    textAlign: 'left',
                    padding: '0.85rem',
                    borderRadius: '0.65rem',
                    border: isSelected
                      ? '2px solid var(--accent-primary)'
                      : '1px solid var(--border-color)',
                    background: isSelected
                      ? 'var(--bg-surface-subtle)'
                      : 'var(--bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <strong>{formatMalaysiaDate(s.session_started_at)}</strong>
                    <StatusBadge
                      variant={
                        s.status === 'active'
                          ? 'active_session'
                          : s.status === 'reopened'
                            ? 'reopened_session'
                            : 'completed_session'
                      }
                    />
                  </div>
                  <div
                    style={{
                      fontSize: '0.83rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {attCount} attendees • {matchCount} completed matches
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Selected Session Detail & Live Court Control */}
      {detail && (
        <section
          className="card"
          aria-labelledby="session-detail-heading"
          data-testid="session-detail-panel"
        >
          {/* 12-Hour Stale Session Warning Banner (SES-04) */}
          {isStale12hSession && (
            <div
              role="region"
              aria-label="Stale session inactivity warning"
              data-testid="stale-session-warning-banner"
              style={{
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                borderRadius: '0.55rem',
                borderLeft: '4px solid var(--accent-warning)',
                background: 'var(--bg-warning-subtle)',
              }}
            >
              <strong>
                ⚠ Stale Active Session — Inactive for ≥ 12 Hours (
                {inactiveHoursDisplay}h elapsed)
              </strong>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem' }}>
                Last meaningful court activity was recorded at{' '}
                <code>
                  {formatMalaysiaDateTime(
                    inactivityStatus?.last_meaningful_activity_at ??
                      detail.session.last_meaningful_activity_at,
                  )}
                </code>
                . Sessions are <strong>never automatically closed</strong> (
                <code>SES-04</code>); please finalize this session if play has
                concluded, or continue recording matches.
              </p>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <h2 id="session-detail-heading" style={{ margin: 0 }}>
                Session Detail — {detail.dateDisplay}
              </h2>
              <p
                style={{
                  margin: '0.25rem 0 0 0',
                  fontSize: '0.84rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Started:{' '}
                {formatMalaysiaDateTime(detail.session.session_started_at)}
                {detail.session.session_ended_at
                  ? ` • Ended: ${formatMalaysiaDateTime(detail.session.session_ended_at)}`
                  : ''}{' '}
                •{' '}
                <span data-testid="session-lease-version">
                  Controller Lease v{detail.session.controller_lease_version}
                </span>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <StatusBadge
                variant={
                  detail.session.status === 'active'
                    ? 'active_session'
                    : detail.session.status === 'reopened'
                      ? 'reopened_session'
                      : 'completed_session'
                }
              />
              {canViewerEditStartTime && (
                <button
                  type="button"
                  className="touch-target"
                  style={{ minHeight: '40px', fontSize: '0.82rem' }}
                  data-testid="toggle-edit-start-time-btn"
                  onClick={() => setShowEditStartTimePanel((prev) => !prev)}
                >
                  {showEditStartTimePanel
                    ? 'Close Start-Time Editor'
                    : 'Edit Start Time (Policy 3B)'}
                </button>
              )}
            </div>
          </div>

          {/* Edit Session Start Time Panel (Policy 3B & 3A) */}
          {showEditStartTimePanel && canViewerEditStartTime && (
            <form
              onSubmit={handleUpdateSessionStartTime}
              data-testid="edit-session-start-time-panel"
              style={{
                padding: '0.85rem',
                marginBottom: '1rem',
                borderRadius: '0.55rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface-subtle)',
              }}
            >
              <h3 style={{ marginTop: 0, fontSize: '0.96rem' }}>
                Edit Session Start Date/Time (Policy 3B)
              </h3>
              <p style={{ margin: '0.25rem 0 0.65rem 0', fontSize: '0.83rem' }}>
                Active sessions may be edited by the active controller or an
                Admin/Owner. Completed or reopened sessions require Admin/Owner
                authorization. Changes are audited and replay Elo ratings if
                session chronology changes.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.65rem',
                  marginBottom: '0.65rem',
                }}
              >
                <div>
                  <label
                    htmlFor="edit-start-time-input"
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: '0.84rem',
                    }}
                  >
                    New Session Start Date/Time:
                  </label>
                  <input
                    id="edit-start-time-input"
                    type="text"
                    value={editStartTimeValue}
                    onChange={(e) => setEditStartTimeValue(e.target.value)}
                    data-testid="edit-start-time-input"
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      padding: '0.35rem 0.6rem',
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-start-time-reason-input"
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: '0.84rem',
                    }}
                  >
                    Start-Time Correction Reason (Required):
                  </label>
                  <input
                    id="edit-start-time-reason-input"
                    type="text"
                    placeholder="e.g. Court booking started 30 mins earlier"
                    value={editStartTimeReason}
                    onChange={(e) => setEditStartTimeReason(e.target.value)}
                    data-testid="edit-start-time-reason-input"
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      padding: '0.35rem 0.6rem',
                    }}
                  />
                </div>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.84rem',
                  marginBottom: '0.65rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={editStartTimeAckRecalc}
                  onChange={(e) => setEditStartTimeAckRecalc(e.target.checked)}
                  data-testid="edit-start-time-ack-checkbox"
                />
                <span>
                  Acknowledge historical Elo recalculation if chronology moves
                  before a rated session (Policy 3A / 3B)
                </span>
              </label>
              <button
                type="submit"
                className="touch-target touch-target-primary"
                disabled={snapshot.isDemoMode || isSavingStartTime}
                data-testid="save-start-time-btn"
              >
                {isSavingStartTime
                  ? 'Saving Start Time...'
                  : 'Save Session Start Time'}
              </button>
            </form>
          )}

          {/* Session Controller Lease, Handover & Takeover Bar (SES-02) */}
          <div
            data-testid="session-controller-panel"
            style={{
              padding: '0.85rem',
              marginBottom: '1rem',
              borderRadius: '0.55rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div>
                <strong>Single Active Session Controller (SES-02):</strong>{' '}
                <span data-testid="current-controller-display">
                  {resolveControllerDisplay(detail.session.controller_user_id)}
                </span>
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Lease Version: <code>v{detail.session.controller_lease_version}</code>
              </span>
            </div>

            {isSessionOpenForRecording && canRecord && (
              <div style={{ marginTop: '0.65rem' }}>
                {isViewerController ? (
                  <form
                    onSubmit={handleVoluntaryHandover}
                    data-testid="controller-handover-form"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <label
                        htmlFor="handover-recipient-select"
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        Hand Over To Member:
                      </label>
                      <select
                        id="handover-recipient-select"
                        value={handoverTargetUserId}
                        onChange={(e) =>
                          setHandoverTargetUserId(e.target.value)
                        }
                        data-testid="handover-recipient-select"
                        style={{ minHeight: '42px', padding: '0.3rem 0.5rem' }}
                      >
                        <option value="">-- Select Recorder / Admin --</option>
                        {eligibleHandoverRecipients.map((m) => {
                          const p = m.linked_player_id
                            ? playerMap.get(m.linked_player_id)
                            : null;
                          return (
                            <option key={m.user_id} value={m.user_id}>
                              {p
                                ? `${p.display_name} (${m.role})`
                                : `${m.role} (${m.user_id.slice(0, 8)})`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="handover-reason-input"
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        Handover Reason:
                      </label>
                      <input
                        id="handover-reason-input"
                        type="text"
                        placeholder="e.g. Stepping onto court to play"
                        value={handoverReason}
                        onChange={(e) => setHandoverReason(e.target.value)}
                        data-testid="handover-reason-input"
                        style={{ minHeight: '42px', padding: '0.3rem 0.5rem' }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="touch-target"
                      disabled={snapshot.isDemoMode || isUpdatingController}
                      data-testid="confirm-handover-btn"
                    >
                      {isUpdatingController
                        ? 'Handing Over...'
                        : 'Hand Over Session Control'}
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={handleClaimOrTakeoverController}
                    data-testid="controller-takeover-section"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ flex: '1 1 240px' }}>
                      <label
                        htmlFor="takeover-reason-input"
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        Controller Takeover Reason (Increments Lease Version):
                      </label>
                      <input
                        id="takeover-reason-input"
                        type="text"
                        placeholder="e.g. Previous controller phone unavailable"
                        value={takeoverReason}
                        onChange={(e) => setTakeoverReason(e.target.value)}
                        data-testid="takeover-reason-input"
                        style={{
                          width: '100%',
                          minHeight: '42px',
                          padding: '0.3rem 0.5rem',
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="touch-target touch-target-primary"
                      disabled={snapshot.isDemoMode || isUpdatingController}
                      data-testid="claim-controller-btn"
                    >
                      {isUpdatingController
                        ? 'Claiming Control...'
                        : 'Claim / Take Over Session Control'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Session Finalization & Reopen Controls (SES-03, Policy 3C) */}
          <div
            data-testid="session-lifecycle-actions"
            style={{
              padding: '0.85rem',
              marginBottom: '1.25rem',
              borderRadius: '0.55rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
            }}
          >
            {isSessionOpenForRecording ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <strong>Session Lifecycle (SES-03):</strong>{' '}
                    <span>
                      Status is <code>{detail.session.status}</code>.
                      {detail.session.status === 'reopened' &&
                        ' Forgotten matches recorded in a reopened session append at MAX(sequence_number) + 1 (Policy 3C).'}
                    </span>
                  </div>
                  {(isViewerController || isAdminOrOwner) && (
                    <button
                      type="button"
                      className="touch-target"
                      disabled={snapshot.isDemoMode || isFinalizingSession}
                      data-testid="finalize-session-btn"
                      onClick={handleFinalizeSession}
                    >
                      {isFinalizingSession
                        ? 'Finalizing...'
                        : 'Finalize Session'}
                    </button>
                  )}
                </div>

                {detail.incompleteMatchCount > 0 && (
                  <div
                    role="alert"
                    data-testid="finalize-blocked-incomplete-warning"
                    style={{
                      marginTop: '0.6rem',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '0.45rem',
                      background: 'var(--bg-warning-subtle)',
                      color: 'var(--text-warning)',
                      fontSize: '0.85rem',
                    }}
                  >
                    ⚠ <strong>Finalization Blocker (SES-03):</strong>{' '}
                    {detail.incompleteMatchCount} incomplete match draft(s) must
                    be completed or voided below before this session can be
                    finalized.
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: isAdminOrOwner ? '0.65rem' : 0 }}>
                  <strong>Session Finalized:</strong>{' '}
                  {detail.session.session_ended_at
                    ? formatMalaysiaDateTime(detail.session.session_ended_at)
                    : 'Completed'}
                  . Match entry and attendance changes are locked unless reopened
                  by an Admin or Owner.
                </div>
                {isAdminOrOwner && (
                  <form
                    onSubmit={handleReopenSession}
                    data-testid="reopen-session-form"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ flex: '1 1 240px' }}>
                      <label
                        htmlFor="reopen-session-reason-input"
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        Reopen Session Reason (Admin/Owner — Policy 3C):
                      </label>
                      <input
                        id="reopen-session-reason-input"
                        type="text"
                        placeholder="e.g. Record forgotten final match of the evening"
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                        data-testid="reopen-session-reason-input"
                        style={{
                          width: '100%',
                          minHeight: '42px',
                          padding: '0.3rem 0.5rem',
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="touch-target"
                      disabled={snapshot.isDemoMode || isReopeningSession}
                      data-testid="reopen-session-btn"
                    >
                      {isReopeningSession
                        ? 'Reopening...'
                        : 'Reopen Completed Session'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Attendance Check-In, Late Arrivals & Guest Creation (ATT-01, ID-02) */}
          <div
            data-testid="session-attendance-panel"
            style={{
              padding: '0.9rem',
              marginBottom: '1.25rem',
              borderRadius: '0.6rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface-subtle)',
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
              Attendance Check-In &amp; Late Arrivals ({detail.attendeeCount}{' '}
              Present • {detail.standings.nonPlayingAttendees.length} Bench / 0
              Matches)
            </h3>
            <p
              style={{
                marginTop: 0,
                fontSize: '0.83rem',
                color: 'var(--text-secondary)',
              }}
            >
              Present attendees with 0 matches played are recorded in session
              attendance and excluded from win-rate rankings (<code>ATT-01</code>
              ). Attendees who have already played a non-voided match in this
              session cannot be removed from attendance.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '0.5rem',
                marginBottom: '0.85rem',
              }}
            >
              {activeNonMergedPlayers.map((player) => {
                const isPresent = presentAttendeeIds.has(player.id);
                const playedInSession = playedInSessionPlayerIds.has(player.id);
                return (
                  <div
                    key={player.id}
                    data-testid={`attendance-row-${player.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '0.45rem',
                      border: '1px solid var(--border-color)',
                      background: isPresent
                        ? 'var(--bg-surface)'
                        : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: '0.86rem' }}>
                      <strong>{player.display_name}</strong>{' '}
                      {player.is_guest && <StatusBadge variant="guest" />}
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {isPresent ? '✓ Present' : 'Absent'}
                        {playedInSession ? ' • [Played in Session]' : ''}
                      </div>
                    </div>
                    {canViewerMutateSession && (
                      <button
                        type="button"
                        className="touch-target"
                        disabled={
                          snapshot.isDemoMode ||
                          togglingAttendancePlayerId === player.id
                        }
                        data-testid={`attendance-toggle-${player.id}`}
                        onClick={() =>
                          handleToggleAttendance(player.id, !isPresent)
                        }
                        style={{
                          minHeight: '38px',
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        {isPresent ? 'Remove' : 'Check In'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '0.84rem', marginBottom: '0.75rem' }}>
              <strong>Bench Attendees (0 Matches Played):</strong>{' '}
              {detail.standings.nonPlayingAttendees.length === 0 ? (
                <span>All present attendees played in at least 1 match.</span>
              ) : (
                <span>
                  {detail.standings.nonPlayingAttendees
                    .map((a) => a.displayName)
                    .join(', ')}
                </span>
              )}
            </div>

            {/* Inline Temporary Guest Creation (ATT-01, ID-02) */}
            {canViewerMutateSession && (
              <form
                onSubmit={handleCreateGuestAndCheckIn}
                data-testid="session-create-guest-form"
                style={{
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ flex: '1 1 220px' }}>
                    <label
                      htmlFor="session-guest-name-input"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Add Drop-In Temporary Guest to Session:
                    </label>
                    <input
                      id="session-guest-name-input"
                      type="text"
                      placeholder="Guest display name (e.g. Kelvin Drop-In)"
                      value={newGuestDisplayName}
                      onChange={(e) => setNewGuestDisplayName(e.target.value)}
                      data-testid="session-guest-name-input"
                      style={{
                        width: '100%',
                        minHeight: '42px',
                        padding: '0.3rem 0.55rem',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="touch-target"
                    disabled={snapshot.isDemoMode || isCreatingGuest}
                    data-testid="session-create-guest-btn"
                  >
                    {isCreatingGuest
                      ? 'Adding Guest...'
                      : '+ Create Guest & Check In'}
                  </button>
                </div>

                {duplicateGuestNameExists && (
                  <p
                    role="note"
                    data-testid="guest-duplicate-name-warning"
                    style={{
                      margin: '0.4rem 0 0 0',
                      fontSize: '0.82rem',
                      color: 'var(--text-warning)',
                    }}
                  >
                    ⚠ A player with the display name &ldquo;
                    {newGuestDisplayName.trim()}&rdquo; already exists in this
                    group. Creating a guest creates a separate UUID identity and
                    will never automatically merge profiles by name (
                    <code>ID-02</code>).
                  </p>
                )}
              </form>
            )}
          </div>

          {/* 10-Second Immediate Undo Banner (MATCH-05) */}
          {activeUndoPrompt && (
            <div
              role="status"
              aria-live="polite"
              data-testid="immediate-undo-banner"
              style={{
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                borderRadius: '0.55rem',
                borderLeft: '4px solid var(--accent-primary)',
                background: 'var(--bg-surface-subtle)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div>
                <strong>
                  ↺ Match #{activeUndoPrompt.sequenceNumber} Saved — 10-Second
                  Immediate Undo Window
                </strong>
                <div
                  style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}
                >
                  Original recorder may undo accidental entry within 10 seconds (
                  {undoRemainingSeconds}s remaining). Server enforces exact
                  expiry.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="touch-target touch-target-primary"
                  disabled={snapshot.isDemoMode || isUndoingMatch}
                  data-testid="immediate-undo-btn"
                  onClick={handleImmediateUndo}
                >
                  {isUndoingMatch
                    ? 'Undoing...'
                    : 'Undo Match (Within 10s Window)'}
                </button>
                <button
                  type="button"
                  className="touch-target"
                  onClick={() => setActiveUndoPrompt(null)}
                >
                  Keep Match
                </button>
              </div>
            </div>
          )}

          {undoExpiredMessage && (
            <div
              role="alert"
              data-testid="undo-expired-alert"
              style={{
                padding: '0.8rem 1rem',
                marginBottom: '1rem',
                borderRadius: '0.5rem',
                borderLeft: '4px solid var(--accent-warning)',
                background: 'var(--bg-warning-subtle)',
                fontSize: '0.86rem',
              }}
            >
              ⚠ {undoExpiredMessage}
            </div>
          )}

          {/* Unresolved Incomplete Match Drafts Section (SES-03) */}
          {incompleteDraftCards.length > 0 && (
            <div
              data-testid="incomplete-drafts-section"
              style={{
                padding: '0.85rem',
                marginBottom: '1.25rem',
                borderRadius: '0.55rem',
                border: '1px solid var(--accent-warning)',
                background: 'var(--bg-warning-subtle)',
              }}
            >
              <h3 style={{ marginTop: 0, fontSize: '0.98rem' }}>
                Unresolved Incomplete Match Drafts ({incompleteDraftCards.length})
              </h3>
              <p style={{ margin: '0.25rem 0 0.65rem 0', fontSize: '0.83rem' }}>
                Complete or void each draft before finalizing the session (
                <code>SES-03</code>).
              </p>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {incompleteDraftCards.map((draft) => (
                  <div
                    key={draft.match.id}
                    data-testid={`incomplete-draft-${draft.match.id}`}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '0.45rem',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      Draft: {draft.teamA[0].displayName} &amp;{' '}
                      {draft.teamA[1].displayName} vs{' '}
                      {draft.teamB[0].displayName} &amp;{' '}
                      {draft.teamB[1].displayName}
                    </div>
                    {canViewerMutateSession && (
                      <div style={{ display: 'flex', gap: '0.45rem' }}>
                        <button
                          type="button"
                          className="touch-target touch-target-primary"
                          data-testid={`resume-draft-btn-${draft.match.id}`}
                          onClick={() => handleResumeDraftInForm(draft)}
                          style={{ minHeight: '38px', fontSize: '0.8rem' }}
                        >
                          Resume Draft in Form
                        </button>
                        <button
                          type="button"
                          className="touch-target"
                          data-testid={`void-draft-btn-${draft.match.id}`}
                          onClick={() =>
                            handleVoidIncompleteDraft(draft.match.id)
                          }
                          style={{ minHeight: '38px', fontSize: '0.8rem' }}
                        >
                          Void Incomplete Draft
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mobile-First Doubles Match Entry Panel (MATCH-01..MATCH-04, UI-01) */}
          {isSessionOpenForRecording && (
            <form
              onSubmit={handleRecordMatchFormSubmit}
              data-testid="match-entry-panel"
              style={{
                padding: '1rem',
                marginBottom: '1.25rem',
                borderRadius: '0.65rem',
                border: '2px solid var(--accent-primary)',
                background: 'var(--bg-surface)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                  Record Doubles Court Match
                </h3>
                <span
                  style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}
                  data-testid="match-submission-id"
                >
                  Submission ID: <code>{clientSubmissionId}</code>
                </span>
              </div>

              <p
                style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.83rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Select 4 distinct present attendees. Score rules: first to at
                least 21, win by 2, hard cap 30 (e.g. 21–19, 22–20, 30–29).
              </p>

              {!canViewerMutateSession && (
                <div
                  role="note"
                  data-testid="not-controller-match-entry-note"
                  style={{
                    padding: '0.65rem 0.85rem',
                    marginBottom: '0.75rem',
                    borderRadius: '0.45rem',
                    background: 'var(--bg-warning-subtle)',
                    fontSize: '0.84rem',
                  }}
                >
                  ℹ Only the active session controller (or an Admin/Owner) can
                  submit matches. Use{' '}
                  <strong>Claim / Take Over Session Control</strong> above if you
                  are taking over court recording.
                </div>
              )}

              {resumingDraftMatchId && (
                <div
                  role="status"
                  data-testid="resuming-draft-banner"
                  style={{
                    padding: '0.55rem 0.75rem',
                    marginBottom: '0.75rem',
                    borderRadius: '0.45rem',
                    background: 'var(--bg-surface-subtle)',
                    fontSize: '0.83rem',
                  }}
                >
                  Completing resumed draft{' '}
                  <code>{resumingDraftMatchId.slice(0, 8)}</code> — enter final
                  scores below to record the completed match and clear the draft.
                </div>
              )}

              {/* Failed Save Banner with Retained Form Data & Safe Idempotent Retry (MATCH-03, MATCH-04) */}
              {matchSaveError && (
                <div
                  role="alert"
                  data-testid="match-save-failed-alert"
                  style={{
                    padding: '0.8rem',
                    marginBottom: '0.85rem',
                    borderRadius: '0.5rem',
                    borderLeft: '4px solid var(--accent-danger)',
                    background: 'var(--bg-danger-subtle)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                    ✕ Match Save Unconfirmed / Failed — Entries Retained
                  </div>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                    {matchSaveError}
                  </p>
                  <p
                    style={{
                      margin: '0.25rem 0 0.5rem 0',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Your selected players, scores, and idempotent submission ID (
                    <code>{clientSubmissionId}</code>) are preserved. Retrying
                    will never create a duplicate match record.
                  </p>
                  <button
                    type="button"
                    className="touch-target touch-target-primary"
                    disabled={snapshot.isDemoMode || isSavingMatch}
                    data-testid="retry-match-save-btn"
                    onClick={() => {
                      void submitMatchAttempt();
                    }}
                  >
                    {isSavingMatch
                      ? 'Retrying Save...'
                      : 'Retry Save Match (Idempotent)'}
                  </button>
                </div>
              )}

              {/* One-Tap Swap & Clear Controls */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '0.85rem',
                }}
              >
                <button
                  type="button"
                  className="touch-target"
                  data-testid="swap-teams-btn"
                  onClick={handleSwapTeams}
                >
                  <ArrowUpDown size={14} />
                  <span>Swap Teams (A ↔ B)</span>
                </button>
                <button
                  type="button"
                  className="touch-target"
                  data-testid="swap-partners-btn"
                  onClick={handleSwapPartners}
                >
                  <Shuffle size={14} />
                  <span>Swap Partners (A2 ↔ B1)</span>
                </button>
                <button
                  type="button"
                  className="touch-target"
                  data-testid="clear-match-slots-btn"
                  onClick={handleClearMatchSlots}
                >
                  <RotateCcw size={14} />
                  <span>Clear Slots</span>
                </button>
              </div>

              {/* 4 Player Slot Selectors */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.85rem',
                  marginBottom: '0.85rem',
                }}
              >
                {/* Team A */}
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-subtle)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
                    Team A
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label
                      htmlFor="match-slot-a1"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Team A — Player 1:
                    </label>
                    <select
                      id="match-slot-a1"
                      value={teamAPlayer1}
                      onChange={(e) => setTeamAPlayer1(e.target.value)}
                      data-testid="match-slot-a1"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '0.35rem 0.5rem',
                      }}
                    >
                      <option value="">-- Select Attendee --</option>
                      {presentAttendeePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} {p.is_guest ? '(Guest)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label
                      htmlFor="match-slot-a2"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Team A — Player 2:
                    </label>
                    <select
                      id="match-slot-a2"
                      value={teamAPlayer2}
                      onChange={(e) => setTeamAPlayer2(e.target.value)}
                      data-testid="match-slot-a2"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '0.35rem 0.5rem',
                      }}
                    >
                      <option value="">-- Select Attendee --</option>
                      {presentAttendeePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} {p.is_guest ? '(Guest)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="match-score-a-input"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Team A Score:
                    </label>
                    <input
                      id="match-score-a-input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={30}
                      placeholder="21"
                      value={teamAScoreInput}
                      onChange={(e) => setTeamAScoreInput(e.target.value)}
                      data-testid="match-score-a-input"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '0.35rem 0.6rem',
                        fontSize: '1.05rem',
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>

                {/* Team B */}
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-subtle)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
                    Team B
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label
                      htmlFor="match-slot-b1"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Team B — Player 1:
                    </label>
                    <select
                      id="match-slot-b1"
                      value={teamBPlayer1}
                      onChange={(e) => setTeamBPlayer1(e.target.value)}
                      data-testid="match-slot-b1"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '0.35rem 0.5rem',
                      }}
                    >
                      <option value="">-- Select Attendee --</option>
                      {presentAttendeePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} {p.is_guest ? '(Guest)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label
                      htmlFor="match-slot-b2"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Team B — Player 2:
                    </label>
                    <select
                      id="match-slot-b2"
                      value={teamBPlayer2}
                      onChange={(e) => setTeamBPlayer2(e.target.value)}
                      data-testid="match-slot-b2"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '0.35rem 0.5rem',
                      }}
                    >
                      <option value="">-- Select Attendee --</option>
                      {presentAttendeePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} {p.is_guest ? '(Guest)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="match-score-b-input"
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      Team B Score:
                    </label>
                    <input
                      id="match-score-b-input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={30}
                      placeholder="19"
                      value={teamBScoreInput}
                      onChange={(e) => setTeamBScoreInput(e.target.value)}
                      data-testid="match-score-b-input"
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '0.35rem 0.6rem',
                        fontSize: '1.05rem',
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>
              </div>

              {hasDuplicateMatchPlayers && (
                <div
                  role="alert"
                  data-testid="match-duplicate-player-error"
                  style={{
                    marginBottom: '0.75rem',
                    fontSize: '0.85rem',
                    color: 'var(--text-danger)',
                    fontWeight: 600,
                  }}
                >
                  ✕ All 4 court slots must have distinct players (a player cannot
                  occupy multiple slots in the same match).
                </div>
              )}

              {liveScoreValidation && !liveScoreValidation.valid && (
                <div
                  role="alert"
                  data-testid="match-score-validation-error"
                  style={{
                    marginBottom: '0.75rem',
                    fontSize: '0.85rem',
                    color: 'var(--text-danger)',
                    fontWeight: 600,
                  }}
                >
                  ✕ Invalid score ({teamAScoreInput}–{teamBScoreInput}):{' '}
                  {liveScoreValidation.reason}
                </div>
              )}

              {liveScoreValidation && liveScoreValidation.valid && (
                <div
                  data-testid="match-score-validation-valid"
                  style={{
                    marginBottom: '0.75rem',
                    fontSize: '0.85rem',
                    color: 'var(--accent-success)',
                    fontWeight: 600,
                  }}
                >
                  ✓ Valid score ({teamAScoreInput}–{teamBScoreInput}) — Team{' '}
                  {liveScoreValidation.winner} wins.
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.6rem',
                }}
              >
                <button
                  type="submit"
                  className="touch-target touch-target-primary"
                  disabled={snapshot.isDemoMode || isSavingMatch}
                  data-testid="record-match-submit-btn"
                >
                  {isSavingMatch
                    ? 'Saving Match...'
                    : snapshot.isDemoMode
                      ? 'Record Match (Disabled in Demo Mode)'
                      : 'Record Completed Match'}
                </button>

                <button
                  type="button"
                  className="touch-target"
                  disabled={snapshot.isDemoMode || isSavingMatch}
                  data-testid="save-incomplete-draft-btn"
                  onClick={handleSaveIncompleteDraft}
                >
                  Save as Incomplete Match Draft
                </button>
              </div>
            </form>
          )}

          {/* Session Standings Summary */}
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            Session Standings ({detail.completedMatchCount} Completed Matches)
          </h3>
          {detail.standings.playedRows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              No completed matches in this session.
            </p>
          ) : (
            <div className="data-table-wrapper" style={{ marginBottom: '1rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">W–L</th>
                    <th scope="col">Win Rate</th>
                    <th scope="col">Point Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.standings.playedRows.map((row) => (
                    <tr key={row.playerId}>
                      <td className="rating-mono">
                        #{row.rank}
                        {row.isTiedRank ? ' (T)' : ''}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(row.playerId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--accent-primary)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            marginRight: '0.4rem',
                          }}
                        >
                          {row.displayName}
                        </button>
                        {row.isGuest && <StatusBadge variant="guest" />}
                      </td>
                      <td className="rating-mono">
                        {row.wins}–{row.losses}
                      </td>
                      <td>{row.winRatePercentDisplay}</td>
                      <td className="rating-mono">
                        {row.pointDifference > 0
                          ? `+${row.pointDifference}`
                          : row.pointDifference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Session Match History, Rating Breakdown & Post-Window Corrections */}
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            Session Match History (Chronological Sequence)
          </h3>
          <p
            style={{
              marginTop: 0,
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
            }}
          >
            Displayed <code>before</code> and <code>after</code> ratings are
            rounded to whole numbers and <code>change</code> values to 1 decimal
            place independently from internal <code>NUMERIC(10,4)</code> values.
          </p>

          {detail.matches.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              No matches recorded in this session.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {detail.matches.map((card) => {
                const isExpanded = expandedMatchId === card.match.id;
                const isEditingCorrection = editingMatchId === card.match.id;

                return (
                  <article
                    key={card.match.id}
                    data-testid={`match-card-${card.match.id}`}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.65rem',
                      padding: '0.85rem',
                      minWidth: 0,
                      maxWidth: '100%',
                      background:
                        card.match.status === 'voided'
                          ? 'var(--bg-surface-subtle)'
                          : 'var(--bg-surface)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                        Match #{card.match.sequence_number ?? 'Draft'}
                      </span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {card.match.is_disputed && (
                          <StatusBadge variant="disputed" />
                        )}
                        {card.match.status === 'voided' && (
                          <StatusBadge variant="voided" />
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: card.winnerSide === 'A' ? 700 : 500,
                          }}
                        >
                          Team A {card.winnerSide === 'A' ? '✓' : ''}
                        </div>
                        <div style={{ fontSize: '0.92rem' }}>
                          {card.teamA[0].displayName} &amp;{' '}
                          {card.teamA[1].displayName}
                        </div>
                      </div>

                      <div
                        className="rating-mono"
                        style={{
                          fontSize: '1.2rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '0.4rem',
                          background: 'var(--bg-surface-subtle)',
                        }}
                      >
                        {card.match.team_a_score ?? '–'} :{' '}
                        {card.match.team_b_score ?? '–'}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontWeight: card.winnerSide === 'B' ? 700 : 500,
                          }}
                        >
                          {card.winnerSide === 'B' ? '✓ ' : ''}Team B
                        </div>
                        <div style={{ fontSize: '0.92rem' }}>
                          {card.teamB[0].displayName} &amp;{' '}
                          {card.teamB[1].displayName}
                        </div>
                      </div>
                    </div>

                    {card.match.status === 'voided' && card.match.void_reason && (
                      <p
                        style={{
                          margin: '0.35rem 0',
                          fontSize: '0.83rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <strong>Void reason:</strong> {card.match.void_reason}{' '}
                        (Excluded from official standings and Elo replay;
                        sequence number #{card.match.sequence_number} preserved.)
                      </p>
                    )}

                    {card.match.is_disputed && (
                      <p
                        style={{
                          margin: '0.35rem 0',
                          fontSize: '0.83rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <strong>Dispute invariant (DIS-01):</strong> A disputed
                        match remains in official standings and ratings unless an
                        authorized correction or void changes it.
                      </p>
                    )}

                    {card.match.status === 'completed' && (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                            marginTop: '0.25rem',
                          }}
                        >
                          <button
                            type="button"
                            className="touch-target"
                            style={{
                              minHeight: '44px',
                              padding: '0.3rem 0.75rem',
                              fontSize: '0.83rem',
                            }}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedMatchId(
                                isExpanded ? null : card.match.id,
                              )
                            }
                          >
                            {isExpanded
                              ? 'Hide Rating Breakdown ▲'
                              : 'Show Rating Breakdown (Before → After / Δ) ▼'}
                          </button>

                          {canViewerMutateSession && (
                            <button
                              type="button"
                              className="touch-target"
                              style={{
                                minHeight: '44px',
                                padding: '0.3rem 0.75rem',
                                fontSize: '0.83rem',
                              }}
                              aria-expanded={isEditingCorrection}
                              data-testid={`open-correction-btn-${card.match.id}`}
                              onClick={() => {
                                if (isEditingCorrection) {
                                  setEditingMatchId(null);
                                } else {
                                  openCorrectionForm(card);
                                }
                              }}
                            >
                              {isEditingCorrection
                                ? 'Close Correction Form'
                                : 'Correct or Void Match'}
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div
                            className="data-table-wrapper"
                            style={{ marginTop: '0.6rem' }}
                          >
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th scope="col">Team</th>
                                  <th scope="col">Player</th>
                                  <th scope="col">Before (Rounded)</th>
                                  <th scope="col">Change (1-Dec)</th>
                                  <th scope="col">After (Rounded)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...card.teamA, ...card.teamB].map((slot) => (
                                  <tr key={`${card.match.id}-${slot.playerId}`}>
                                    <td>Team {slot.teamSide}</td>
                                    <td>
                                      {slot.displayName}{' '}
                                      {slot.isGuest ? '(Guest)' : ''}
                                    </td>
                                    <td className="rating-mono">
                                      {slot.beforeDisplay ?? '–'}
                                    </td>
                                    <td className="rating-mono">
                                      {slot.changeDisplay ?? '–'}
                                    </td>
                                    <td className="rating-mono">
                                      {slot.afterDisplay ?? '–'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Post-Window Match Correction / Void Form (MATCH-06, RATE-03) */}
                        {isEditingCorrection && canViewerMutateSession && (
                          <form
                            onSubmit={(e) =>
                              handleSubmitCorrectionOrVoid(e, card)
                            }
                            data-testid={`correction-form-${card.match.id}`}
                            style={{
                              marginTop: '0.75rem',
                              padding: '0.85rem',
                              borderRadius: '0.55rem',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-surface-subtle)',
                            }}
                          >
                            <h4 style={{ marginTop: 0, fontSize: '0.95rem' }}>
                              Post-Window Correction or Void — Match #
                              {card.match.sequence_number} (Sequence Preserved)
                            </h4>

                            {correctionError && (
                              <div
                                role="alert"
                                data-testid={`correction-error-${card.match.id}`}
                                style={{
                                  padding: '0.55rem 0.75rem',
                                  marginBottom: '0.65rem',
                                  borderRadius: '0.4rem',
                                  background: 'var(--bg-danger-subtle)',
                                  color: 'var(--text-danger)',
                                  fontSize: '0.84rem',
                                }}
                              >
                                ✕ {correctionError}
                              </div>
                            )}

                            <div
                              style={{
                                display: 'flex',
                                gap: '0.75rem',
                                marginBottom: '0.65rem',
                              }}
                            >
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontWeight: 600,
                                  fontSize: '0.85rem',
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`corr-action-${card.match.id}`}
                                  value="correct"
                                  checked={correctionAction === 'correct'}
                                  onChange={() => setCorrectionAction('correct')}
                                  data-testid={`correction-mode-correct-${card.match.id}`}
                                />
                                <span>Correct Score / Participants</span>
                              </label>
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontWeight: 600,
                                  fontSize: '0.85rem',
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`corr-action-${card.match.id}`}
                                  value="void"
                                  checked={correctionAction === 'void'}
                                  onChange={() => setCorrectionAction('void')}
                                  data-testid={`correction-mode-void-${card.match.id}`}
                                />
                                <span>Void Match</span>
                              </label>
                            </div>

                            {correctionAction === 'correct' && (
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    'repeat(auto-fit, minmax(180px, 1fr))',
                                  gap: '0.55rem',
                                  marginBottom: '0.65rem',
                                }}
                              >
                                <div>
                                  <label
                                    htmlFor={`corr-a1-${card.match.id}`}
                                    style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Team A Player 1:
                                  </label>
                                  <select
                                    id={`corr-a1-${card.match.id}`}
                                    value={corrTeamA1}
                                    onChange={(e) =>
                                      setCorrTeamA1(e.target.value)
                                    }
                                    data-testid={`corr-slot-a1-${card.match.id}`}
                                    style={{ width: '100%', minHeight: '38px' }}
                                  >
                                    {presentAttendeePlayers.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.display_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label
                                    htmlFor={`corr-a2-${card.match.id}`}
                                    style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Team A Player 2:
                                  </label>
                                  <select
                                    id={`corr-a2-${card.match.id}`}
                                    value={corrTeamA2}
                                    onChange={(e) =>
                                      setCorrTeamA2(e.target.value)
                                    }
                                    data-testid={`corr-slot-a2-${card.match.id}`}
                                    style={{ width: '100%', minHeight: '38px' }}
                                  >
                                    {presentAttendeePlayers.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.display_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label
                                    htmlFor={`corr-b1-${card.match.id}`}
                                    style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Team B Player 1:
                                  </label>
                                  <select
                                    id={`corr-b1-${card.match.id}`}
                                    value={corrTeamB1}
                                    onChange={(e) =>
                                      setCorrTeamB1(e.target.value)
                                    }
                                    data-testid={`corr-slot-b1-${card.match.id}`}
                                    style={{ width: '100%', minHeight: '38px' }}
                                  >
                                    {presentAttendeePlayers.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.display_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label
                                    htmlFor={`corr-b2-${card.match.id}`}
                                    style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Team B Player 2:
                                  </label>
                                  <select
                                    id={`corr-b2-${card.match.id}`}
                                    value={corrTeamB2}
                                    onChange={(e) =>
                                      setCorrTeamB2(e.target.value)
                                    }
                                    data-testid={`corr-slot-b2-${card.match.id}`}
                                    style={{ width: '100%', minHeight: '38px' }}
                                  >
                                    {presentAttendeePlayers.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.display_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label
                                    htmlFor={`corr-score-a-${card.match.id}`}
                                    style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Corrected Team A Score:
                                  </label>
                                  <input
                                    id={`corr-score-a-${card.match.id}`}
                                    type="number"
                                    value={corrScoreA}
                                    onChange={(e) =>
                                      setCorrScoreA(e.target.value)
                                    }
                                    data-testid={`corr-score-a-${card.match.id}`}
                                    style={{ width: '100%', minHeight: '38px' }}
                                  />
                                </div>
                                <div>
                                  <label
                                    htmlFor={`corr-score-b-${card.match.id}`}
                                    style={{
                                      display: 'block',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Corrected Team B Score:
                                  </label>
                                  <input
                                    id={`corr-score-b-${card.match.id}`}
                                    type="number"
                                    value={corrScoreB}
                                    onChange={(e) =>
                                      setCorrScoreB(e.target.value)
                                    }
                                    data-testid={`corr-score-b-${card.match.id}`}
                                    style={{ width: '100%', minHeight: '38px' }}
                                  />
                                </div>
                              </div>
                            )}

                            <div style={{ marginBottom: '0.65rem' }}>
                              <label
                                htmlFor={`corr-reason-${card.match.id}`}
                                style={{
                                  display: 'block',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                }}
                              >
                                Correction / Void Reason (Required, Audited):
                              </label>
                              <input
                                id={`corr-reason-${card.match.id}`}
                                type="text"
                                placeholder="e.g. Scoreboard was read in reverse"
                                value={correctionReason}
                                onChange={(e) =>
                                  setCorrectionReason(e.target.value)
                                }
                                data-testid={`correction-reason-input-${card.match.id}`}
                                style={{
                                  width: '100%',
                                  minHeight: '42px',
                                  padding: '0.35rem 0.6rem',
                                }}
                              />
                            </div>

                            <button
                              type="submit"
                              className="touch-target touch-target-primary"
                              disabled={
                                snapshot.isDemoMode || isSubmittingCorrection
                              }
                              data-testid={`submit-correction-btn-${card.match.id}`}
                            >
                              {isSubmittingCorrection
                                ? 'Submitting...'
                                : correctionAction === 'correct'
                                  ? 'Submit Match Correction'
                                  : 'Confirm Void Match'}
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
