import { useState } from 'react';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveLeaderboardFromSnapshot,
  deriveSessionDetailFromSnapshot,
  formatMalaysiaDate,
} from '../services/readViewModels.ts';
import type { EffectivePublicationBannerState } from '../services/trackerRepository.ts';

export interface LeaderboardViewProps {
  snapshot: GroupReadSnapshot;
  publication: EffectivePublicationBannerState;
  onRetryRecalculation: () => Promise<void>;
  onSelectPlayer: (playerId: string) => void;
}

type LeaderboardFilterMode = 'all_time' | 'current_session' | 'season';

/**
 * Leaderboard view (`RATE-01`..`RATE-06`, `ATT-01`, `DEC-009`, `DEC-010`, `DEC-016`, `DEC-036`):
 * - Always defaults to All-Time when opened ("Always default to All-time; do not remember last tab").
 * - Ranks strictly by full internal `NUMERIC(10,4)` precision (`ratingScaled`), sharing competition
 *   rank (`1, 1, 3`) only on exact internal ties.
 * - Clearly labels `Guest` (`DEC-010`) and `Provisional (<3 matches)` (`RATE-06`).
 * - Separates session attendance from match standings (`ATT-01`).
 */
export function LeaderboardView({
  snapshot,
  publication,
  onRetryRecalculation,
  onSelectPlayer,
}: LeaderboardViewProps) {
  // Always default to 'all_time' on mount
  const [filterMode, setFilterMode] =
    useState<LeaderboardFilterMode>('all_time');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    snapshot.sessions[0]?.id ?? '',
  );

  const allTimeRows = deriveLeaderboardFromSnapshot(snapshot, includeInactive);
  const sessionDetail = selectedSessionId
    ? deriveSessionDetailFromSnapshot(snapshot, selectedSessionId)
    : null;

  return (
    <div data-testid="view-leaderboard">
      <PublicationStatusBanner
        publication={publication}
        viewerRole={snapshot.viewerMembership.role}
        isDemoMode={snapshot.isDemoMode}
        onRetryRecalculation={onRetryRecalculation}
      />

      <section className="card" aria-labelledby="leaderboard-heading">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2 id="leaderboard-heading" style={{ margin: 0 }}>
              Group Standings &amp; Ratings
            </h2>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
              }}
            >
              Elo estimates relative strength within this group&apos;s doubles
              match history and is not an objective proof of skill.
            </p>
          </div>

          <div
            role="group"
            aria-label="Leaderboard scope filter"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
          >
            <button
              type="button"
              className={`touch-target ${filterMode === 'all_time' ? 'touch-target-primary' : ''}`}
              aria-pressed={filterMode === 'all_time'}
              onClick={() => setFilterMode('all_time')}
            >
              All-Time Elo
            </button>
            <button
              type="button"
              className={`touch-target ${filterMode === 'current_session' ? 'touch-target-primary' : ''}`}
              aria-pressed={filterMode === 'current_session'}
              onClick={() => setFilterMode('current_session')}
            >
              Current / Session Standings
            </button>
            <button
              type="button"
              className={`touch-target ${filterMode === 'season' ? 'touch-target-primary' : ''}`}
              aria-pressed={filterMode === 'season'}
              onClick={() => setFilterMode('season')}
            >
              Season (Stage 2)
            </button>
          </div>
        </div>

        {filterMode === 'all_time' && (
          <div data-testid="leaderboard-all-time-panel">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 0.75rem',
                background: 'var(--bg-surface-subtle)',
                borderRadius: '0.5rem',
                marginBottom: '0.75rem',
                fontSize: '0.83rem',
              }}
            >
              <span>
                <strong>Rounding &amp; Ranking Policy:</strong> Displayed ratings
                are rounded to whole numbers and per-match changes to 0.1
                independently from internal <code>NUMERIC(10,4)</code> values.
                Competition ranks (1, 1, 3) are sorted on full 4-decimal
                precision; identical rounded integers may not be an exact tie.
              </span>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Include inactive profiles
              </label>
            </div>

            {allTimeRows.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>
                No player profiles available for the leaderboard.
              </p>
            ) : (
              <div className="data-table-wrapper">
                <table
                  className="data-table"
                  aria-label="All-time Elo leaderboard"
                >
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Player</th>
                      <th scope="col">Status Labels</th>
                      <th scope="col">Elo Rating</th>
                      <th scope="col">Exact (10,4)</th>
                      <th scope="col">Win Rate (W/MP)</th>
                      <th scope="col">Attendance (Att/Held)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTimeRows.map((row) => (
                      <tr
                        key={row.playerId}
                        data-testid={`leaderboard-row-${row.playerId}`}
                      >
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
                            }}
                          >
                            {row.displayName}
                          </button>
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '0.35rem',
                            }}
                          >
                            {row.isGuest && <StatusBadge variant="guest" />}
                            {row.isProvisional && (
                              <StatusBadge variant="provisional" />
                            )}
                            {!row.isGuest && !row.isProvisional && (
                              <span
                                style={{
                                  fontSize: '0.78rem',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                Established
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="rating-mono"
                          style={{ fontSize: '1.05rem' }}
                        >
                          {row.ratingDisplay}
                        </td>
                        <td
                          className="rating-mono"
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {row.ratingNumeric4}
                        </td>
                        <td>{row.winRatePercentDisplay}</td>
                        <td>
                          {row.attendanceRatePercentDisplay ??
                            `${row.sessionsAttendedCount}/0`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {filterMode === 'current_session' && (
          <div data-testid="leaderboard-session-panel">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <label
                  htmlFor="leaderboard-session-select"
                  style={{ fontWeight: 600, marginRight: '0.5rem' }}
                >
                  Select Session:
                </label>
                <select
                  id="leaderboard-session-select"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  style={{
                    minHeight: '44px',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  {snapshot.sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatMalaysiaDate(s.session_started_at)} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              {sessionDetail &&
                sessionDetail.standings.isProvisionalUntilFinalized && (
                  <StatusBadge
                    variant="provisional"
                    customLabel="Provisional until session finalization"
                  />
                )}
            </div>

            <p
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                marginTop: 0,
              }}
            >
              Session standings rank players with at least 1 completed match by{' '}
              <strong>Wins</strong>, then <strong>Win Rate</strong>, then{' '}
              <strong>Point Difference</strong>. Win rate is not adjusted for
              match count; sample sizes are shown explicitly.
            </p>

            {!sessionDetail ? (
              <p style={{ color: 'var(--text-muted)' }}>No session selected.</p>
            ) : (
              <>
                {sessionDetail.standings.playedRows.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>
                    No completed matches in this session yet.
                  </p>
                ) : (
                  <div className="data-table-wrapper">
                    <table
                      className="data-table"
                      aria-label="Session match standings"
                    >
                      <thead>
                        <tr>
                          <th scope="col">Rank</th>
                          <th scope="col">Player</th>
                          <th scope="col">Wins</th>
                          <th scope="col">Losses</th>
                          <th scope="col">Win Rate (W/MP)</th>
                          <th scope="col">Point Diff (Scored–Conceded)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionDetail.standings.playedRows.map((row) => (
                          <tr
                            key={row.playerId}
                            data-testid={`session-standing-row-${row.playerId}`}
                          >
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
                            <td className="rating-mono">{row.wins}</td>
                            <td className="rating-mono">{row.losses}</td>
                            <td>{row.winRatePercentDisplay}</td>
                            <td className="rating-mono">
                              {row.pointDifference > 0
                                ? `+${row.pointDifference}`
                                : row.pointDifference}{' '}
                              ({row.pointsScored}–{row.pointsConceded})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Separate Bench / 0-Match Attendance Section (`ATT-01`) */}
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    background: 'var(--bg-surface-subtle)',
                  }}
                  data-testid="session-bench-attendance"
                >
                  <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '0.95rem' }}>
                    Attended Session — 0 Completed Matches Played (Bench)
                  </h3>
                  <p
                    style={{
                      margin: '0 0 0.5rem 0',
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Attendance is recorded separately from match participation
                    (ATT-01). Attending without playing counts toward session
                    attendance without altering win/loss standings or Elo
                    ratings.
                  </p>
                  {sessionDetail.standings.nonPlayingAttendees.length === 0 ? (
                    <span
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      All session attendees have played at least one completed
                      match.
                    </span>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.25rem',
                        fontSize: '0.9rem',
                      }}
                    >
                      {sessionDetail.standings.nonPlayingAttendees.map((att) => (
                        <li key={att.playerId}>
                          <strong>{att.displayName}</strong>{' '}
                          {att.isGuest ? '(Guest) ' : ''}— Present (0 matches
                          played)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {filterMode === 'season' && (
          <div
            data-testid="leaderboard-season-panel"
            style={{
              padding: '1rem',
              borderRadius: '0.5rem',
              background: 'var(--bg-surface-subtle)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Seasonal Ratings Paused in Stage 1</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              No active season is configured (`season_id = NULL`). In accordance
              with the approved Stage 1 roadmap (`DEC-014`), all completed
              matches contribute to the All-Time Elo leaderboard, while Season
              management UI is scheduled for Stage 2.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
