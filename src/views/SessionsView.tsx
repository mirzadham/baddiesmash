import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveSessionDetailFromSnapshot,
  formatMalaysiaDate,
  formatMalaysiaDateTime,
} from '../services/readViewModels.ts';

export interface SessionsViewProps {
  snapshot: GroupReadSnapshot;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectPlayer: (playerId: string) => void;
}

export function SessionsView({
  snapshot,
  selectedSessionId,
  onSelectSession,
  onSelectPlayer,
}: SessionsViewProps) {
  const effectiveSessionId =
    selectedSessionId ?? snapshot.sessions[0]?.id ?? null;
  const detail = effectiveSessionId
    ? deriveSessionDetailFromSnapshot(snapshot, effectiveSessionId)
    : null;

  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  return (
    <div data-testid="view-sessions">
      {/* Chronological Session Selector List */}
      <section className="card" aria-labelledby="sessions-list-heading">
        <h2 id="sessions-list-heading" style={{ marginTop: 0 }}>
          Sessions ({snapshot.sessions.length})
        </h2>
        <p
          style={{
            marginTop: 0,
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          Dates are displayed in Malaysia time (<code>Asia/Kuala_Lumpur</code>,{' '}
          <code>DD MMM YYYY</code>). Live session court control and match entry
          are scheduled for Phase 4.
        </p>

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

      {/* Selected Session Detail */}
      {detail && (
        <section
          className="card"
          aria-labelledby="session-detail-heading"
          data-testid="session-detail-panel"
        >
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
                Started: {formatMalaysiaDateTime(detail.session.session_started_at)}
                {detail.session.session_ended_at
                  ? ` • Ended: ${formatMalaysiaDateTime(detail.session.session_ended_at)}`
                  : ''}{' '}
                • Controller Lease v{detail.session.controller_lease_version}
              </p>
            </div>
            <StatusBadge
              variant={
                detail.session.status === 'active'
                  ? 'active_session'
                  : detail.session.status === 'reopened'
                    ? 'reopened_session'
                    : 'completed_session'
              }
            />
          </div>

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

          {/* Bench Attendance (ATT-01) */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: 'var(--bg-surface-subtle)',
              marginBottom: '1.25rem',
            }}
          >
            <strong>
              Session Attendance ({detail.attendeeCount} Total Present •{' '}
              {detail.standings.nonPlayingAttendees.length} Bench / 0 Matches):
            </strong>{' '}
            {detail.standings.nonPlayingAttendees.length === 0 ? (
              <span>All present attendees played in at least 1 match.</span>
            ) : (
              <span>
                Bench attendees (0 matches played):{' '}
                {detail.standings.nonPlayingAttendees
                  .map((a) => a.displayName)
                  .join(', ')}
              </span>
            )}
          </div>

          {/* Session Match History & Rating Breakdown */}
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
                return (
                  <article
                    key={card.match.id}
                    data-testid={`match-card-${card.match.id}`}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.65rem',
                      padding: '0.85rem',
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
                        <div style={{ fontWeight: card.winnerSide === 'A' ? 700 : 500 }}>
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
                        <div style={{ fontWeight: card.winnerSide === 'B' ? 700 : 500 }}>
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
                        <button
                          type="button"
                          className="touch-target"
                          style={{
                            minHeight: '44px',
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.83rem',
                            marginTop: '0.25rem',
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
