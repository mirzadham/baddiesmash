import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
} from 'lucide-react';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { TournamentPodiumStage } from '../components/TournamentPodiumStage.tsx';
import { LaurelWreathShield } from '../components/icons/DesignerBadmintonIcons.tsx';
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

function getPlayerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const second = parts[1];
  if (first && second && first[0] && second[0]) {
    return (first[0] + second[0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Leaderboard view (`RATE-01`..`RATE-06`, `ATT-01`, `DEC-009`, `DEC-010`, `DEC-016`, `DEC-036`):
 * - Features authentic 3D Stepped Tournament Podium Stage floating on canvas.
 * - Single seamless ranking panel with hairline row dividers (zero card-on-card nesting).
 * - Custom Designer Laurel Wreath Shields for metallic ranks (Gold, Silver, Bronze, Slate).
 * - Ranks strictly by full internal `NUMERIC(10,4)` precision (`ratingScaled`), sharing competition
 *   rank (`1, 1, 3`) only on exact internal ties.
 * - Clearly labels `Guest` (`DEC-010`) and `Provisional (<3 matches)` (`RATE-06`).
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
  const [showPolicyInfo, setShowPolicyInfo] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    snapshot.sessions[0]?.id ?? '',
  );

  const allTimeRows = deriveLeaderboardFromSnapshot(snapshot, includeInactive);
  const sessionDetail = selectedSessionId
    ? deriveSessionDetailFromSnapshot(snapshot, selectedSessionId)
    : null;

  // Podium top 3 players
  const top1 = allTimeRows[0] ?? null;
  const top2 = allTimeRows[1] ?? null;
  const top3 = allTimeRows[2] ?? null;

  return (
    <div data-testid="view-leaderboard">
      <PublicationStatusBanner
        publication={publication}
        viewerRole={snapshot.viewerMembership.role}
        isDemoMode={snapshot.isDemoMode}
        onRetryRecalculation={onRetryRecalculation}
      />

      {/* 3D Stepped Tournament Podium Stage (Floating directly on dark canvas - no card box!) */}
      {filterMode === 'all_time' && allTimeRows.length >= 3 && (
        <TournamentPodiumStage
          top1={top1}
          top2={top2}
          top3={top3}
          onSelectPlayer={onSelectPlayer}
        />
      )}

      {/* Single Seamless Ranking Panel (Zero Card-on-Card Nesting) */}
      <section className="seamless-ranking-panel" aria-labelledby="leaderboard-heading">
        {/* Panel Header & Scope Filter */}
        <div className="seamless-header">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.85rem',
            }}
          >
            <div>
              <h2 id="leaderboard-heading" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                Group Standings
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Doubles Elo ratings &amp; session match performance
              </span>
            </div>

            <div
              role="group"
              aria-label="Leaderboard scope filter"
              className="filter-tab-group"
            >
              <button
                type="button"
                className="filter-tab-btn"
                aria-pressed={filterMode === 'all_time'}
                onClick={() => setFilterMode('all_time')}
              >
                All-Time Elo
              </button>
              <button
                type="button"
                className="filter-tab-btn"
                aria-pressed={filterMode === 'current_session'}
                onClick={() => setFilterMode('current_session')}
              >
                Current / Session Standings
              </button>
              <button
                type="button"
                className="filter-tab-btn"
                aria-pressed={filterMode === 'season'}
                onClick={() => setFilterMode('season')}
              >
                Season (Stage 2)
              </button>
            </div>
          </div>

          {/* Subheader: Policy Drawer Button & Inactive Filter */}
          {filterMode === 'all_time' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                className="touch-target"
                style={{
                  minHeight: '36px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.78rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface-subtle)',
                }}
                onClick={() => setShowPolicyInfo((prev) => !prev)}
                aria-expanded={showPolicyInfo}
              >
                <Info size={13} />
                <span>Policy &amp; Methodology</span>
                {showPolicyInfo ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
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
          )}

          {showPolicyInfo && filterMode === 'all_time' && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.85rem 1rem',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.65rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <p style={{ margin: '0 0 0.35rem 0' }}>
                <strong>Rounding &amp; Ranking Policy:</strong> Displayed ratings
                are rounded to whole numbers and per-match changes to 0.1
                independently from internal <code>NUMERIC(10,4)</code> values.
                Competition ranks (1, 1, 3) are sorted on full 4-decimal
                precision; identical rounded integers may not be an exact tie.
              </p>
              <p style={{ margin: 0 }}>
                Elo estimates relative strength within this group&apos;s doubles
                match history and is not an objective proof of skill.
              </p>
            </div>
          )}
        </div>

        {/* Panel Content: All-Time Elo (Seamless Rows) */}
        {filterMode === 'all_time' && (
          <div data-testid="leaderboard-all-time-panel">
            {allTimeRows.length === 0 ? (
              <p style={{ padding: '1.5rem', color: 'var(--text-muted)', margin: 0 }}>
                No player profiles available for the leaderboard.
              </p>
            ) : (
              <div>
                {allTimeRows.map((row) => (
                  <div
                    key={row.playerId}
                    data-testid={`leaderboard-row-${row.playerId}`}
                    className="seamless-row"
                  >
                    <div className="player-card-left">
                      {/* Designer Laurel Wreath Shield */}
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <LaurelWreathShield
                          rank={row.rank}
                          isTied={row.isTiedRank}
                          size={44}
                        />
                        {/* Hidden semantic node for competition rank matchers */}
                        <span style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                          #{row.rank}
                        </span>
                      </div>

                      {/* Player Avatar */}
                      <div className="player-card-avatar">
                        {getPlayerInitials(row.displayName)}
                      </div>

                      {/* Player Info */}
                      <div className="player-card-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(row.playerId)}
                            className="player-card-name-btn"
                          >
                            {row.displayName}
                          </button>
                          {row.isGuest && <StatusBadge variant="guest" />}
                          {row.isProvisional && (
                            <StatusBadge variant="provisional" />
                          )}
                        </div>

                        <div className="player-card-meta">
                          <span>
                            {row.wins}W - {row.losses}L ({row.winRatePercentDisplay})
                          </span>
                          <span>•</span>
                          <span>
                            Att:{' '}
                            {row.attendanceRatePercentDisplay ??
                              `${row.sessionsAttendedCount}/0`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Rating Section */}
                    <div className="player-card-right">
                      <div className="player-rating-display">
                        <div className="rating-score-volt">
                          <TrendingUp size={14} />
                          <span className="rating-mono">
                            {row.ratingDisplay}
                          </span>
                        </div>
                        <span
                          className="rating-mono"
                          style={{
                            fontSize: '0.74rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {row.ratingNumeric4}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current / Session Standings Panel */}
        {filterMode === 'current_session' && (
          <div data-testid="leaderboard-session-panel" style={{ padding: '1rem 1.25rem' }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <label
                  htmlFor="leaderboard-session-select"
                  style={{ fontWeight: 600, marginRight: '0.5rem', fontSize: '0.88rem' }}
                >
                  Select Session:
                </label>
                <select
                  id="leaderboard-session-select"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  style={{
                    minHeight: '42px',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '0.55rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-subtle)',
                    color: 'var(--text-primary)',
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
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                marginTop: 0,
                marginBottom: '1rem',
              }}
            >
              Session standings rank players by <strong>Wins</strong>, then{' '}
              <strong>Win Rate</strong>, then <strong>Point Difference</strong>.
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
                  <div>
                    {sessionDetail.standings.playedRows.map((row) => (
                      <div
                        key={row.playerId}
                        data-testid={`session-standing-row-${row.playerId}`}
                        className="seamless-row"
                        style={{ paddingLeft: 0, paddingRight: 0 }}
                      >
                        <div className="player-card-left">
                          <LaurelWreathShield
                            rank={row.rank}
                            isTied={row.isTiedRank}
                            size={42}
                          />
                          <span style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                            #{row.rank}
                          </span>

                          <div className="player-card-avatar">
                            {getPlayerInitials(row.displayName)}
                          </div>

                          <div className="player-card-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                onClick={() => onSelectPlayer(row.playerId)}
                                className="player-card-name-btn"
                              >
                                {row.displayName}
                              </button>
                              {row.isGuest && <StatusBadge variant="guest" />}
                            </div>
                            <div className="player-card-meta">
                              <span>
                                {row.wins}W - {row.losses}L ({row.winRatePercentDisplay})
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="player-card-right">
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                            }}
                          >
                            <span
                              className="rating-mono"
                              style={{
                                color:
                                  row.pointDifference > 0
                                    ? 'var(--accent-volt)'
                                    : row.pointDifference < 0
                                      ? 'var(--status-stale-fg)'
                                      : 'var(--text-secondary)',
                                fontWeight: 800,
                                fontSize: '1.05rem',
                              }}
                            >
                              {row.pointDifference > 0
                                ? `+${row.pointDifference}`
                                : row.pointDifference}
                            </span>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              ({row.pointsScored}–{row.pointsConceded})
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Separate Bench / 0-Match Attendance Section (`ATT-01`) */}
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-color)',
                  }}
                  data-testid="session-bench-attendance"
                >
                  <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '0.92rem' }}>
                    Attended Session — 0 Completed Matches Played (Bench)
                  </h3>
                  <p
                    style={{
                      margin: '0 0 0.65rem 0',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Attendance is recorded separately from match participation
                    (ATT-01). Attending without playing counts toward session
                    attendance without altering standings or Elo ratings.
                  </p>
                  {sessionDetail.standings.nonPlayingAttendees.length === 0 ? (
                    <span
                      style={{
                        fontSize: '0.84rem',
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
                        fontSize: '0.88rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {sessionDetail.standings.nonPlayingAttendees.map((att) => (
                        <li key={att.playerId} style={{ marginBottom: '0.2rem' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>
                            {att.displayName}
                          </strong>{' '}
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

        {/* Season Panel */}
        {filterMode === 'season' && (
          <div
            data-testid="leaderboard-season-panel"
            style={{
              padding: '1.5rem',
              background: 'var(--bg-surface-subtle)',
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>Seasonal Ratings Paused in Stage 1</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
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
