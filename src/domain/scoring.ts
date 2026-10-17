export type ScoreErrorCode =
  | 'NON_INTEGER_SCORE'
  | 'NEGATIVE_SCORE'
  | 'EXCEEDS_MAX_CAP'
  | 'TIED_SCORE'
  | 'BELOW_MIN_WINNING_SCORE'
  | 'INSUFFICIENT_WIN_MARGIN'
  | 'INVALID_DEUCE_PROGRESSION';

export interface ScoreValidationResult {
  valid: boolean;
  winner: 'A' | 'B' | null;
  reason?: string;
  code?: ScoreErrorCode;
}

export interface MatchParticipantsInput {
  teamA: readonly [string, string] | readonly string[];
  teamB: readonly [string, string] | readonly string[];
  eligibleProfileIds?: ReadonlySet<string>;
}

export type ParticipantErrorCode =
  | 'WRONG_TEAM_SIZE'
  | 'EMPTY_PLAYER_ID'
  | 'DUPLICATE_PLAYER'
  | 'INELIGIBLE_PLAYER';

export interface ParticipantValidationResult {
  valid: boolean;
  reason?: string;
  code?: ParticipantErrorCode;
}

/**
 * Validates a single-game badminton doubles score according to canonical rules:
 * - First to at least 21 points
 * - Must win by at least 2 points from 20-20 onward (21-0..19, 22-20, 23-21, ..., 29-27)
 * - Hard cap at 30 points (30-28 or 30-29; 30-30 is invalid)
 */
export function validateMatchScore(
  teamAScore: number,
  teamBScore: number,
): ScoreValidationResult {
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore)) {
    return {
      valid: false,
      winner: null,
      code: 'NON_INTEGER_SCORE',
      reason: 'Both team scores must be whole integers.',
    };
  }

  if (teamAScore < 0 || teamBScore < 0) {
    return {
      valid: false,
      winner: null,
      code: 'NEGATIVE_SCORE',
      reason: 'Scores cannot be negative.',
    };
  }

  if (teamAScore > 30 || teamBScore > 30) {
    return {
      valid: false,
      winner: null,
      code: 'EXCEEDS_MAX_CAP',
      reason: 'Maximum allowed score is 30.',
    };
  }

  if (teamAScore === teamBScore) {
    return {
      valid: false,
      winner: null,
      code: 'TIED_SCORE',
      reason: 'A completed match cannot end in a tie.',
    };
  }

  const winner: 'A' | 'B' = teamAScore > teamBScore ? 'A' : 'B';
  const high = Math.max(teamAScore, teamBScore);
  const low = Math.min(teamAScore, teamBScore);

  if (high < 21) {
    return {
      valid: false,
      winner: null,
      code: 'BELOW_MIN_WINNING_SCORE',
      reason: 'Winning score must be at least 21.',
    };
  }

  if (high === 21) {
    if (low <= 19) {
      return { valid: true, winner };
    }
    return {
      valid: false,
      winner: null,
      code: 'INSUFFICIENT_WIN_MARGIN',
      reason: 'At 20–20 deuce, a team must win by 2 points (e.g., 22–20, not 21–20).',
    };
  }

  if (high >= 22 && high <= 29) {
    if (low === high - 2) {
      return { valid: true, winner };
    }
    if (low === high - 1) {
      return {
        valid: false,
        winner: null,
        code: 'INSUFFICIENT_WIN_MARGIN',
        reason: `Score ${high}–${low} does not have the required 2-point lead before the 30-point cap.`,
      };
    }
    return {
      valid: false,
      winner: null,
      code: 'INVALID_DEUCE_PROGRESSION',
      reason: `Score ${high}–${low} is impossible because the game would have ended at 21 unless extended by deuce.`,
    };
  }

  // high === 30
  if (low === 28 || low === 29) {
    return { valid: true, winner };
  }

  return {
    valid: false,
    winner: null,
    code: 'INVALID_DEUCE_PROGRESSION',
    reason: `Score 30–${low} is impossible because a 30-point game can only occur from 28–28 (30–28) or 29–29 (30–29).`,
  };
}

/**
 * Validates that a doubles match has exactly 4 distinct, eligible player profiles
 * (2 on Team A, 2 on Team B).
 */
export function validateMatchParticipants(
  input: MatchParticipantsInput,
): ParticipantValidationResult {
  if (input.teamA.length !== 2 || input.teamB.length !== 2) {
    return {
      valid: false,
      code: 'WRONG_TEAM_SIZE',
      reason: 'Doubles match requires exactly 2 players on Team A and 2 players on Team B.',
    };
  }

  const allPlayers = [...input.teamA, ...input.teamB].map((id) => id.trim());
  if (allPlayers.some((id) => id.length === 0)) {
    return {
      valid: false,
      code: 'EMPTY_PLAYER_ID',
      reason: 'All four player slots must be assigned.',
    };
  }

  const uniquePlayers = new Set(allPlayers);
  if (uniquePlayers.size !== 4) {
    return {
      valid: false,
      code: 'DUPLICATE_PLAYER',
      reason: 'All four players in a match must be distinct.',
    };
  }

  if (input.eligibleProfileIds) {
    for (const playerId of allPlayers) {
      if (!input.eligibleProfileIds.has(playerId)) {
        return {
          valid: false,
          code: 'INELIGIBLE_PLAYER',
          reason: `Player profile '${playerId}' is not eligible for this match.`,
        };
      }
    }
  }

  return { valid: true };
}
