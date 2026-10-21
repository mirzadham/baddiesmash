import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { ActiveSessionControllerCard } from '../components/sessions/ActiveSessionControllerCard.tsx';
import { PastSessionAccordionCard } from '../components/sessions/PastSessionAccordionCard.tsx';
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
  TrackerRepository,
} from '../services/trackerRepository.ts';
import type {
  DbPlayerRow,
  RecalculationExecutionOutcome,
  SessionInactivityStatusResponse,
} from '../types/database.ts';

export interface SessionsViewProps {
  snapshot: GroupReadSnapshot;
  repository: TrackerRepository;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectPlayer: (playerId: string) => void;
  onRefreshGroupState: () => Promise<void>;
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
  repository,
  selectedSessionId,
  onSelectSession,
  onSelectPlayer,
  onRefreshGroupState,
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

  // Auto-dismiss transient status notices after 4.5 seconds
  useEffect(() => {
    if (!statusNotice) return;
    const timer = setTimeout(() => {
      setStatusNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [statusNotice]);

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

  // 1. Start New Session State (SES-01)
  const [showStartSessionPanel, setShowStartSessionPanel] = useState<boolean>(
    () => snapshot.sessions.length === 0,
  );
  const [selectedInitialAttendees, setSelectedInitialAttendees] = useState<
    string[]
  >([]);
  const [startSessionError, setStartSessionError] = useState<string | null>(
    null,
  );
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);

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

  // 4. Finalize / Reopen Session State (SES-03, Policy 3C)
  const [isFinalizingSession, setIsFinalizingSession] =
    useState<boolean>(false);
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
  const [failedVoidDraftId, setFailedVoidDraftId] = useState<string | null>(
    null,
  );
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
        sessionStartedAt: null,
        initialAttendeePlayerIds: selectedInitialAttendees,
      });
      setShowStartSessionPanel(false);
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

  const handleReopenSession = async (reason: string) => {
    if (!detail) {
      return;
    }
    if (reason.trim().length < 3) {
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
        reason: reason.trim(),
      });
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
        const draftIdToVoid = resumingDraftMatchId;
        try {
          await repository.correctOrVoidMatch({
            matchId: draftIdToVoid,
            action: 'void',
            reason: `Incomplete draft superseded by completed Match #${res.sequence_number}`,
            expectedLeaseVersion: detail.session.controller_lease_version,
          });
          setFailedVoidDraftId(null);
        } catch (voidErr) {
          setFailedVoidDraftId(draftIdToVoid);
          setActionError(
            `Match #${res.sequence_number} was successfully recorded, but voiding the superseded draft failed (${voidErr instanceof Error ? voidErr.message : 'network error'}). The draft remains incomplete and will block session finalization. Please click 'Retry Voiding Draft' below.`,
          );
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
        `Incomplete match draft saved (${res.match_id.slice(0, 8)}). Resolve or void all drafts before finalizing the session.`,
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
      if (failedVoidDraftId === draftMatchId) {
        setFailedVoidDraftId(null);
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

  const isViewerController =
    detail?.session.controller_user_id === viewerUserId;
  const isSessionOpenForRecording =
    detail?.session.status === 'active' ||
    detail?.session.status === 'reopened';
  const canViewerMutateSession =
    isSessionOpenForRecording && (isViewerController || isAdminOrOwner);

  const [sessionFilter, setSessionFilter] = useState<'all' | 'doubles' | 'singles'>('all');

  const sessionHistoryList = useMemo(
    () => snapshot.sessions,
    [snapshot.sessions],
  );

  const handleCorrectionPayloadSubmit = async (
    matchId: string,
    payload: {
      action: 'correct' | 'void';
      reason: string;
      teamAScore?: number;
      teamBScore?: number;
      teamAPlayer1?: string;
      teamAPlayer2?: string;
      teamBPlayer1?: string;
      teamBPlayer2?: string;
    },
  ) => {
    if (!detail) {
      return;
    }
    setActionError(null);
    setStatusNotice(null);
    try {
      const res = await repository.correctOrVoidMatch({
        matchId,
        action: payload.action,
        reason: payload.reason.trim(),
        teamAScore:
          payload.action === 'correct' ? payload.teamAScore ?? null : null,
        teamBScore:
          payload.action === 'correct' ? payload.teamBScore ?? null : null,
        teamAPlayer1:
          payload.action === 'correct' ? payload.teamAPlayer1 ?? null : null,
        teamAPlayer2:
          payload.action === 'correct' ? payload.teamAPlayer2 ?? null : null,
        teamBPlayer1:
          payload.action === 'correct' ? payload.teamBPlayer1 ?? null : null,
        teamBPlayer2:
          payload.action === 'correct' ? payload.teamBPlayer2 ?? null : null,
        expectedLeaseVersion: detail.session.controller_lease_version,
      });
      inspectRecalculationOutcome(
        res.recalculation,
        payload.action === 'correct'
          ? `Correction of Match #${res.sequence_number}`
          : `Void of Match #${res.sequence_number}`,
      );
      setStatusNotice(
        payload.action === 'correct'
          ? `Match #${res.sequence_number} corrected and audited (sequence number preserved; chronological Elo replay triggered).`
          : `Match #${res.sequence_number} voided and audited (sequence number preserved; excluded from official ratings).`,
      );
      await onRefreshGroupState();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to submit match correction or void.',
      );
    }
  };

  return (
    <div data-testid="view-sessions" className="max-w-3xl mx-auto px-4 py-4 sm:py-6 flex flex-col gap-4 font-sans">
      {/* Recalc Failure Alert */}
      {mutationRecalcFailure && (
        <section
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex flex-col gap-1"
          role="alert"
          data-testid="mutation-recalc-failure-alert"
        >
          <div className="flex items-center justify-between gap-2">
            <strong>
              ⚠ {mutationRecalcFailure.actionLabel} Saved — Elo Rating Recalculation Failed (Stale / Failed)
            </strong>
            <StatusBadge variant="stale_or_failed" />
          </div>
          <p className="m-0 text-slate-300 text-xs">
            The change was committed, but deterministic Elo recalculation reported an error:{' '}
            <code>{mutationRecalcFailure.errorMessage}</code>. The last valid published rating version remains preserved until retried.
          </p>
        </section>
      )}

      {/* Status Notice (Auto-dismisses after 4.5s) */}
      {statusNotice && (
        <div
          role="status"
          aria-live="polite"
          data-testid="sessions-status-notice"
          className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-center justify-between gap-2 shadow-lg transition-all duration-200"
        >
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-emerald-400/80 hover:text-white text-xs px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Action Error */}
      {actionError && (
        <div
          role="alert"
          data-testid="sessions-action-error"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-center justify-between gap-2"
        >
          <span>✕ {actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Undo Expired Alert */}
      {undoExpiredMessage && (
        <div
          role="alert"
          data-testid="undo-expired-alert"
          className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm flex items-center justify-between gap-2"
        >
          <span>⚠ {undoExpiredMessage}</span>
          <button
            type="button"
            onClick={() => setUndoExpiredMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header: Title, Filter Pills, and + Start New Session CTA */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Sessions
        </h1>

        {canRecord && (
          <button
            type="button"
            data-testid="toggle-start-session-btn"
            onClick={() => setShowStartSessionPanel((prev) => !prev)}
            className="smashtrack-cta-btn"
          >
            {!showStartSessionPanel && <Plus size={20} strokeWidth={2.5} />}
            <span>{showStartSessionPanel ? 'Hide Start Session Form' : 'Start New Session'}</span>
          </button>
        )}

        {/* Filter Bar: [All] [Singles] [Doubles] matching sessions.jfif */}
        <div className="w-full bg-[#121a24] p-1 rounded-xl border border-slate-800/80 grid grid-cols-3 gap-1">
          {(['all', 'singles', 'doubles'] as const).map((tab) => {
            const isActive = sessionFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setSessionFilter(tab)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer text-center ${
                  isActive
                    ? 'bg-[#1c2738] text-emerald-400 border border-slate-700/80 shadow-sm'
                    : 'bg-transparent text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'singles' ? 'Singles' : 'Doubles'}
              </button>
            );
          })}
        </div>

        {/* Informational notice when Singles filter is clicked (Doubles-only invariant) */}
        {sessionFilter === 'singles' && (
          <div
            role="note"
            data-testid="singles-preview-banner"
            className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center gap-2"
          >
            <span className="text-amber-400 text-sm">ℹ</span>
            <span>
              Singles is not currently tracked. SMASHTRACK is exclusively configured for doubles matches in accordance with group rules.
            </span>
          </div>
        )}
      </div>

      {/* Start New Session Panel (SES-01, Policy 3A) */}
      {showStartSessionPanel && canRecord && (
        <form
          onSubmit={handleStartSession}
          data-testid="start-session-panel"
          className="p-4 rounded-2xl bg-[#121a24] border border-slate-800 shadow-xl flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm sm:text-base text-white m-0">
              Start New Group Session
            </h3>
            <span className="text-xs text-slate-400">One active session allowed</span>
          </div>

          {activeGroupSession && (
            <div
              role="note"
              data-testid="existing-active-session-warning"
              className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium"
            >
              ⚠ An active session ({formatMalaysiaDate(activeGroupSession.session_started_at)}) is already open. Only one active session is permitted per group at a time; finalize it before starting a new session.
            </div>
          )}

          {startSessionError && (
            <div
              role="alert"
              data-testid="start-session-error-alert"
              className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium"
            >
              ✕ {startSessionError}
            </div>
          )}

          {/* Initial Attendees Selection */}
          <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                Initial Attendees ({selectedInitialAttendees.length} selected)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedInitialAttendees(activeNonMergedPlayers.map((p) => p.id))
                  }
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInitialAttendees([])}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
              {activeNonMergedPlayers.map((player) => {
                const checked = selectedInitialAttendees.includes(player.id);
                return (
                  <label
                    key={player.id}
                    className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      data-testid={`initial-attendee-checkbox-${player.id}`}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInitialAttendees((prev) => [...prev, player.id]);
                        } else {
                          setSelectedInitialAttendees((prev) => prev.filter((id) => id !== player.id));
                        }
                      }}
                    />
                    <span className="truncate">
                      {player.display_name} {player.is_guest ? '(Guest)' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={snapshot.isDemoMode || isStartingSession}
            data-testid="start-session-submit-btn"
            className="w-full flex items-center justify-center text-center py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-40"
          >
            {isStartingSession
              ? 'Starting Session...'
              : snapshot.isDemoMode
                ? 'Start Session (Disabled in Demo Mode)'
                : 'Confirm Start Session'}
          </button>
        </form>
      )}

      {/* Active Court Session Hero Card (matching session_new_2.jfif) */}
      {detail && (
        <ActiveSessionControllerCard
          session={detail.session}
          controllerDisplay={resolveControllerDisplay(detail.session.controller_user_id)}
          isViewerController={isViewerController}
          canTakeover={canRecord && !isViewerController}
          canRecord={canRecord}
          canViewerMutateSession={canViewerMutateSession}
          isAdminOrOwner={isAdminOrOwner}
          isDemoMode={snapshot.isDemoMode}
          eligibleHandoverRecipients={eligibleHandoverRecipients}
          playerMap={playerMap}
          handoverTargetUserId={handoverTargetUserId}
          onHandoverTargetUserIdChange={setHandoverTargetUserId}
          handoverReason={handoverReason}
          onHandoverReasonChange={setHandoverReason}
          isUpdatingController={isUpdatingController}
          onVoluntaryHandover={handleVoluntaryHandover}
          takeoverReason={takeoverReason}
          onTakeoverReasonChange={setTakeoverReason}
          onClaimOrTakeoverController={handleClaimOrTakeoverController}
          isStale12hWarning={isStale12hSession}
          attendees={presentAttendeePlayers}
          allGroupPlayers={activeNonMergedPlayers}
          benchAttendees={detail.standings.nonPlayingAttendees
            .map((a) => playerMap.get(a.playerId)!)
            .filter(Boolean)}
          presentAttendeeIds={presentAttendeeIds}
          playedInSessionPlayerIds={playedInSessionPlayerIds}
          canEditAttendance={canViewerMutateSession}
          onToggleAttendance={handleToggleAttendance}
          togglingAttendancePlayerId={togglingAttendancePlayerId}
          newGuestDisplayName={newGuestDisplayName}
          onNewGuestDisplayNameChange={setNewGuestDisplayName}
          duplicateGuestNameExists={duplicateGuestNameExists}
          isCreatingGuest={isCreatingGuest}
          onCreateGuestAndCheckIn={handleCreateGuestAndCheckIn}
          incompleteDraftCards={incompleteDraftCards}
          failedVoidDraftId={failedVoidDraftId}
          onResumeDraftInForm={handleResumeDraftInForm}
          onVoidIncompleteDraft={handleVoidIncompleteDraft}
          isSessionOpenForRecording={isSessionOpenForRecording}
          playerA1Id={teamAPlayer1}
          playerA2Id={teamAPlayer2}
          playerB1Id={teamBPlayer1}
          playerB2Id={teamBPlayer2}
          onSelectA1={setTeamAPlayer1}
          onSelectA2={setTeamAPlayer2}
          onSelectB1={setTeamBPlayer1}
          onSelectB2={setTeamBPlayer2}
          scoreAInput={teamAScoreInput}
          scoreBInput={teamBScoreInput}
          onScoreAChange={setTeamAScoreInput}
          onScoreBChange={setTeamBScoreInput}
          scoreValidation={
            liveScoreValidation ?? {
              valid: false,
              winner: null,
            }
          }
          isSavingMatch={isSavingMatch}
          submissionId={clientSubmissionId}
          duplicateParticipantError={
            hasDuplicateMatchPlayers ? 'Duplicate player selected across teams' : null
          }
          matchSaveError={matchSaveError}
          resumingDraftMatchId={resumingDraftMatchId}
          onCancelResumeDraft={() => setResumingDraftMatchId(null)}
          activeUndoPrompt={activeUndoPrompt}
          undoSecondsRemaining={undoRemainingSeconds}
          isUndoing={isUndoingMatch}
          onRecordMatch={handleRecordMatchFormSubmit}
          onSaveDraft={handleSaveIncompleteDraft}
          onSwapPartners={handleSwapPartners}
          onSwapTeams={handleSwapTeams}
          onImmediateUndo={handleImmediateUndo}
          onDismissUndo={() => setActiveUndoPrompt(null)}
          onRetryMatchSave={submitMatchAttempt}
          standings={detail.standings.playedRows.map((r) => ({
            playerId: r.playerId,
            displayName: r.displayName,
            isGuest: r.isGuest,
            rank: r.rank,
            wins: r.wins,
            losses: r.losses,
            winRatePercentDisplay: r.winRatePercentDisplay,
            netEloChange: r.pointDifference ?? 0,
          }))}
          matches={detail.matches}
          onSubmitCorrection={handleCorrectionPayloadSubmit}
          onSelectPlayer={onSelectPlayer}
          incompleteDraftsCount={incompleteDraftCards.length}
          isFinalizing={isFinalizingSession}
          onFinalizeSession={handleFinalizeSession}
          onReopenSession={handleReopenSession}
          isReopening={isReopeningSession}
        />
      )}

      {/* Past Completed Sessions Accordion Section (matching sessions.jfif) */}
      <div className="flex flex-col gap-3 mt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Session History
          </h2>
          <span className="text-xs text-slate-400">
            {sessionHistoryList.length} sessions
          </span>
        </div>

        {sessionHistoryList.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#121a24] border border-slate-800 text-center text-xs text-slate-500 italic">
            No sessions recorded yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessionHistoryList.map((session) => {
              const pastDetail = deriveSessionDetailFromSnapshot(snapshot, session.id);
              return (
                <PastSessionAccordionCard
                  key={session.id}
                  session={session}
                  matches={pastDetail?.matches ?? []}
                  attendeeCount={pastDetail?.attendeeCount ?? 0}
                  isSelected={session.id === effectiveSessionId}
                  isAdminOrOwner={isAdminOrOwner}
                  onSelectSession={onSelectSession}
                  onSelectPlayer={onSelectPlayer}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
