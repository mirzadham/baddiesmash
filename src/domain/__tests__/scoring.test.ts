import { describe, expect, it } from 'vitest';
import {
  validateMatchParticipants,
  validateMatchScore,
} from '../scoring.ts';

describe('validateMatchScore (MATCH-01)', () => {
  it('accepts standard wins at 21 with opponent <= 19', () => {
    expect(validateMatchScore(21, 0)).toEqual({ valid: true, winner: 'A' });
    expect(validateMatchScore(21, 19)).toEqual({ valid: true, winner: 'A' });
    expect(validateMatchScore(19, 21)).toEqual({ valid: true, winner: 'B' });
    expect(validateMatchScore(8, 21)).toEqual({ valid: true, winner: 'B' });
  });

  it('accepts valid deuce wins by exactly 2 points from 22-20 through 29-27', () => {
    expect(validateMatchScore(22, 20)).toEqual({ valid: true, winner: 'A' });
    expect(validateMatchScore(20, 22)).toEqual({ valid: true, winner: 'B' });
    expect(validateMatchScore(25, 23)).toEqual({ valid: true, winner: 'A' });
    expect(validateMatchScore(27, 29)).toEqual({ valid: true, winner: 'B' });
  });

  it('accepts valid 30-point hard cap scores (30-28 and 30-29)', () => {
    expect(validateMatchScore(30, 28)).toEqual({ valid: true, winner: 'A' });
    expect(validateMatchScore(28, 30)).toEqual({ valid: true, winner: 'B' });
    expect(validateMatchScore(30, 29)).toEqual({ valid: true, winner: 'A' });
    expect(validateMatchScore(29, 30)).toEqual({ valid: true, winner: 'B' });
  });

  it('rejects canonical invalid scores (21-20, 22-21, 30-30)', () => {
    const r21_20 = validateMatchScore(21, 20);
    expect(r21_20.valid).toBe(false);
    expect(r21_20.code).toBe('INSUFFICIENT_WIN_MARGIN');

    const r22_21 = validateMatchScore(22, 21);
    expect(r22_21.valid).toBe(false);
    expect(r22_21.code).toBe('INSUFFICIENT_WIN_MARGIN');

    const r30_30 = validateMatchScore(30, 30);
    expect(r30_30.valid).toBe(false);
    expect(r30_30.code).toBe('TIED_SCORE');
  });

  it('rejects impossible deuce progressions (e.g., 22-19, 25-18, 30-27)', () => {
    expect(validateMatchScore(22, 19).code).toBe('INVALID_DEUCE_PROGRESSION');
    expect(validateMatchScore(25, 18).code).toBe('INVALID_DEUCE_PROGRESSION');
    expect(validateMatchScore(30, 27).code).toBe('INVALID_DEUCE_PROGRESSION');
    expect(validateMatchScore(30, 0).code).toBe('INVALID_DEUCE_PROGRESSION');
  });

  it('rejects unfinished, negative, >30, and non-integer scores', () => {
    expect(validateMatchScore(20, 18).code).toBe('BELOW_MIN_WINNING_SCORE');
    expect(validateMatchScore(0, 0).code).toBe('TIED_SCORE');
    expect(validateMatchScore(-1, 21).code).toBe('NEGATIVE_SCORE');
    expect(validateMatchScore(31, 29).code).toBe('EXCEEDS_MAX_CAP');
    expect(validateMatchScore(21.5, 19).code).toBe('NON_INTEGER_SCORE');
    expect(validateMatchScore(Number.NaN, 21).code).toBe('NON_INTEGER_SCORE');
  });
});

describe('validateMatchParticipants (MATCH-02)', () => {
  it('accepts four distinct eligible players', () => {
    const eligible = new Set(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(
      validateMatchParticipants({
        teamA: ['p1', 'p2'],
        teamB: ['p3', 'p4'],
        eligibleProfileIds: eligible,
      }),
    ).toEqual({ valid: true });
  });

  it('rejects duplicate player within or across teams', () => {
    expect(
      validateMatchParticipants({
        teamA: ['p1', 'p1'],
        teamB: ['p3', 'p4'],
      }).code,
    ).toBe('DUPLICATE_PLAYER');

    expect(
      validateMatchParticipants({
        teamA: ['p1', 'p2'],
        teamB: ['p2', 'p4'],
      }).code,
    ).toBe('DUPLICATE_PLAYER');
  });

  it('rejects wrong team sizes, empty slots, and ineligible profiles', () => {
    expect(
      validateMatchParticipants({
        teamA: ['p1'],
        teamB: ['p3', 'p4'],
      }).code,
    ).toBe('WRONG_TEAM_SIZE');

    expect(
      validateMatchParticipants({
        teamA: ['p1', '  '],
        teamB: ['p3', 'p4'],
      }).code,
    ).toBe('EMPTY_PLAYER_ID');

    expect(
      validateMatchParticipants({
        teamA: ['p1', 'p2'],
        teamB: ['p3', 'unconfirmed-viewer'],
        eligibleProfileIds: new Set(['p1', 'p2', 'p3', 'p4']),
      }).code,
    ).toBe('INELIGIBLE_PLAYER');
  });
});
