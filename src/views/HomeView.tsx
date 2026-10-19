import {
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import {
  CrossedRackets,
  DesignerShuttlecock,
  LaurelWreathShield,
} from '../components/icons/DesignerBadmintonIcons.tsx';
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

function getPlayerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const second = parts[1];
  if (first && second && first[0] && second[0]) {
    return (first[0] + second[0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
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

      {/* Active / Latest Session Hero Card */}
      <section className="seamless-ranking-panel" aria-labelledby="home-session-heading">
        <div className="seamless-header">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <DesignerShuttlecock size={28} />
              <div>
                <h2 id="home-session-heading" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                  {activeOrLatestSession?.status === 'active'
                    ? 'Current Active Session'
                    : 'Latest Session'}
                </h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Courtside doubles session status
                </span>
              </div>
            </div>

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
        </div>

        <div style={{ padding: '1rem 1.25rem' }}>
          {activeOrLatestSession ? (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                  padding: '0.85rem',
                  borderRadius: '0.75rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Session Date
                  </span>
                  <p style={{ margin: '0.15rem 0 0 0', fontWeight: 700, fontSize: '0.92rem' }}>
                    {formatMalaysiaDate(activeOrLatestSession.session_started_at)}
                  </p>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Attendance
                  </span>
                  <p style={{ margin: '0.15rem 0 0 0', fontWeight: 700, fontSize: '0.92rem' }}>
                    <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    {
                      snapshot.sessionAttendees.filter(
                        (sa) => sa.session_id === activeOrLatestSession.id,
                      ).length
                    }{' '}
                    players
                  </p>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Matches
                  </span>
                  <p style={{ margin: '0.15rem 0 0 0', fontWeight: 700, fontSize: '0.92rem' }}>
                    {
                      snapshot.matches.filter(
                        (m) =>
                          m.session_id === activeOrLatestSession.id &&
                          m.status === 'completed',
                      ).length
                    }{' '}
                    completed
                  </p>
                </div>
              </div>

              {(activeOrLatestSession.status === 'active' ||
                activeOrLatestSession.status === 'reopened') &&
                Date.now() -
                  Date.parse(activeOrLatestSession.last_meaningful_activity_at) >=
                  43200 * 1000 && (
                  <div
                    style={{
                      margin: '0.75rem 0',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.65rem',
                      background: 'var(--status-warn-bg)',
                      border: '1px solid var(--status-warn-border)',
                      color: 'var(--status-warn-fg)',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    data-testid="home-stale-session-indicator"
                  >
                    <AlertTriangle size={16} />
                    <span>
                      ⚠ Active session has been inactive for ≥ 12 hours (never
                      auto-closed — review or finalize in Sessions).
                    </span>
                  </div>
                )}

              <button
                type="button"
                className="touch-target touch-target-primary"
                onClick={() => {
                  onSelectSession(activeOrLatestSession.id);
                  onNavigateTab('sessions');
                }}
              >
                <span>View Session Standings & Attendance</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                No sessions have been recorded for this group yet.
              </p>
              <button
                type="button"
                className="touch-target touch-target-primary"
                onClick={() => onNavigateTab('sessions')}
              >
                <span>Open Sessions &amp; Start First Session</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Top All-Time Players Preview (Seamless Panel) */}
      <section className="seamless-ranking-panel" aria-labelledby="home-top-players-heading">
        <div className="seamless-header">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <div>
              <h2
                id="home-top-players-heading"
                style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}
              >
                All-Time Leaderboard Top 5
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Highest rated doubles players
              </span>
            </div>

            <button
              type="button"
              className="touch-target"
              style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
              onClick={() => onNavigateTab('leaderboard')}
            >
              <span>Full Leaderboard</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p style={{ padding: '1.25rem', color: 'var(--text-muted)', margin: 0 }}>No active players found.</p>
        ) : (
          <div>
            {leaderboard.map((row) => (
              <div
                key={row.playerId}
                className="seamless-row"
              >
                <div className="player-card-left">
                  <LaurelWreathShield
                    rank={row.rank}
                    isTied={row.isTiedRank}
                    size={42}
                  />

                  <div className="player-card-avatar">
                    {getPlayerInitials(row.displayName)}
                  </div>

                  <div className="player-card-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPlayer(row.playerId);
                          onNavigateTab('profile');
                        }}
                        className="player-card-name-btn"
                      >
                        {row.displayName}
                      </button>
                      {row.isGuest && <StatusBadge variant="guest" />}
                      {row.isProvisional && (
                        <StatusBadge variant="provisional" />
                      )}
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {row.winRatePercentDisplay} win rate • {row.wins}W - {row.losses}L
                    </span>
                  </div>
                </div>

                <div className="player-card-right">
                  <div className="rating-score-volt">
                    <TrendingUp size={13} />
                    <span className="rating-mono">{row.ratingDisplay}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Matches */}
      <section className="seamless-ranking-panel" aria-labelledby="home-recent-matches-heading">
        <div className="seamless-header">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CrossedRackets size={24} />
              <div>
                <h2
                  id="home-recent-matches-heading"
                  style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}
                >
                  Recent Matches
                </h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Latest court results
                </span>
              </div>
            </div>

            <button
              type="button"
              className="touch-target"
              style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
              onClick={() => onNavigateTab('sessions')}
            >
              <span>All Sessions</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {recentMatches.length === 0 ? (
          <p style={{ padding: '1.25rem', color: 'var(--text-muted)', margin: 0 }}>No matches recorded yet.</p>
        ) : (
          <div>
            {recentMatches.map((card) => {
              const aWon = (card.match.team_a_score ?? 0) > (card.match.team_b_score ?? 0);
              const bWon = (card.match.team_b_score ?? 0) > (card.match.team_a_score ?? 0);

              return (
                <div
                  key={card.match.id}
                  className="seamless-row"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.35rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span>
                        {card.sessionDateDisplay} • Match #{card.match.sequence_number ?? 'Draft'}
                      </span>
                      {card.match.is_disputed && <StatusBadge variant="disputed" />}
                      {card.match.status === 'voided' && <StatusBadge variant="voided" />}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: aWon ? 800 : 500,
                          color: aWon ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        {card.teamA[0].displayName} &amp; {card.teamA[1].displayName}
                      </div>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: bWon ? 800 : 500,
                          color: bWon ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        {card.teamB[0].displayName} &amp; {card.teamB[1].displayName}
                      </div>
                    </div>
                  </div>

                  {/* Scoreboard Pill */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.35rem 0.75rem',
                      background: 'var(--bg-surface-subtle)',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border-color)',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="rating-mono"
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: aWon ? 'var(--accent-volt)' : 'var(--text-primary)',
                      }}
                    >
                      {card.match.team_a_score ?? '–'}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>:</span>
                    <span
                      className="rating-mono"
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: bWon ? 'var(--accent-volt)' : 'var(--text-primary)',
                      }}
                    >
                      {card.match.team_b_score ?? '–'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
