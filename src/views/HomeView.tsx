import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveEnrichedMatchesFromSnapshot,
  deriveLeaderboardFromSnapshot,
  formatMalaysiaDate,
} from '../services/readViewModels.ts';
import type { EffectivePublicationBannerState } from '../services/trackerRepository.ts';

export interface HomeViewProps {
  snapshot: GroupReadSnapshot;
  publication: EffectivePublicationBannerState;
  onRetryRecalculation: () => Promise<void>;
  onNavigateTab: (tab: 'home' | 'leaderboard' | 'sessions' | 'profile') => void;
  onSelectPlayer: (playerId: string) => void;
  onSelectSession: (sessionId: string) => void;
}

export function HomeView({
  snapshot,
  publication,
  onRetryRecalculation,
  onNavigateTab,
  onSelectPlayer,
  onSelectSession,
}: HomeViewProps) {
  const leaderboard = deriveLeaderboardFromSnapshot(snapshot, false).slice(0, 5);
  const recentMatches = deriveEnrichedMatchesFromSnapshot(snapshot).slice(0, 4);
  const activeOrLatestSession = snapshot.sessions[0] ?? null;

  return (
    <div data-testid="view-home">
      <PublicationStatusBanner
        publication={publication}
        viewerRole={snapshot.viewerMembership.role}
        isDemoMode={snapshot.isDemoMode}
        onRetryRecalculation={onRetryRecalculation}
      />

      {/* Active / Latest Session Card */}
      <section className="card" aria-labelledby="home-session-heading">
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
          <h2 id="home-session-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
            {activeOrLatestSession?.status === 'active'
              ? 'Current Active Session'
              : 'Latest Session'}
          </h2>
          {activeOrLatestSession && (
            <StatusBadge
              variant={
                activeOrLatestSession.status === 'active'
                  ? 'active_session'
                  : activeOrLatestSession.status === 'reopened'
                    ? 'reopened_session'
                    : 'completed_session'
              }
            />
          )}
        </div>

        {activeOrLatestSession ? (
          <div>
            <p style={{ margin: '0.25rem 0', color: 'var(--text-secondary)' }}>
              <strong>Date:</strong>{' '}
              {formatMalaysiaDate(activeOrLatestSession.session_started_at)} •{' '}
              <strong>Attendees:</strong>{' '}
              {
                snapshot.sessionAttendees.filter(
                  (sa) => sa.session_id === activeOrLatestSession.id,
                ).length
              }{' '}
              • <strong>Completed Matches:</strong>{' '}
              {
                snapshot.matches.filter(
                  (m) =>
                    m.session_id === activeOrLatestSession.id &&
                    m.status === 'completed',
                ).length
              }
            </p>
            {(activeOrLatestSession.status === 'active' ||
              activeOrLatestSession.status === 'reopened') &&
              Date.now() -
                Date.parse(activeOrLatestSession.last_meaningful_activity_at) >=
                43200 * 1000 && (
                <p
                  style={{
                    margin: '0.35rem 0',
                    fontSize: '0.84rem',
                    color: 'var(--text-warning)',
                    fontWeight: 600,
                  }}
                  data-testid="home-stale-session-indicator"
                >
                  ⚠ Active session has been inactive for ≥ 12 hours (never
                  auto-closed — review or finalize in Sessions).
                </p>
              )}
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="touch-target touch-target-primary"
                onClick={() => {
                  onSelectSession(activeOrLatestSession.id);
                  onNavigateTab('sessions');
                }}
              >
                View Session Standings & Attendance →
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-muted)' }}>
              No sessions have been recorded for this group yet.
            </p>
            <button
              type="button"
              className="touch-target touch-target-primary"
              onClick={() => onNavigateTab('sessions')}
            >
              Open Sessions &amp; Start First Session →
            </button>
          </div>
        )}
      </section>

      {/* Top All-Time Players Preview */}
      <section className="card" aria-labelledby="home-top-players-heading">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <h2
            id="home-top-players-heading"
            style={{ margin: 0, fontSize: '1.15rem' }}
          >
            All-Time Leaderboard Top 5
          </h2>
          <button
            type="button"
            className="touch-target"
            onClick={() => onNavigateTab('leaderboard')}
          >
            Full Leaderboard →
          </button>
        </div>

        {leaderboard.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No active players found.</p>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Elo (Rounded)</th>
                  <th scope="col">Record (W-L)</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.playerId}>
                    <td className="rating-mono">
                      #{row.rank}
                      {row.isTiedRank ? ' (T)' : ''}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPlayer(row.playerId);
                          onNavigateTab('profile');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--accent-primary)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          marginRight: '0.5rem',
                        }}
                      >
                        {row.displayName}
                      </button>
                      {row.isGuest && <StatusBadge variant="guest" />}
                      {row.isProvisional && (
                        <StatusBadge variant="provisional" />
                      )}
                    </td>
                    <td className="rating-mono">{row.ratingDisplay}</td>
                    <td>{row.winRatePercentDisplay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Matches */}
      <section className="card" aria-labelledby="home-recent-matches-heading">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <h2
            id="home-recent-matches-heading"
            style={{ margin: 0, fontSize: '1.15rem' }}
          >
            Recent Matches
          </h2>
          <button
            type="button"
            className="touch-target"
            onClick={() => onNavigateTab('sessions')}
          >
            All Sessions →
          </button>
        </div>

        {recentMatches.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No matches recorded yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {recentMatches.map((card) => (
              <div
                key={card.match.id}
                style={{
                  padding: '0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.35rem',
                  }}
                >
                  <span>
                    {card.sessionDateDisplay} • Match #
                    {card.match.sequence_number ?? 'Draft'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
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
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                  }}
                >
                  <span>
                    {card.teamA[0].displayName} &amp; {card.teamA[1].displayName}{' '}
                    vs {card.teamB[0].displayName} &amp;{' '}
                    {card.teamB[1].displayName}
                  </span>
                  <span className="rating-mono">
                    {card.match.team_a_score ?? '–'}–
                    {card.match.team_b_score ?? '–'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
