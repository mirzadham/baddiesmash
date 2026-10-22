import { AlertTriangle, Plus, Users } from 'lucide-react';
import { MedalBadge } from '../components/icons/MedalBadges.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { DesignerShuttlecock } from '../components/icons/DesignerBadmintonIcons.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveWeeklyLeaderboardFromSnapshot,
  formatMalaysiaDate,
} from '../services/readViewModels.ts';

export interface HomeViewProps {
  snapshot: GroupReadSnapshot;
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
  onNavigateTab,
  onSelectPlayer,
  onSelectSession,
}: HomeViewProps) {
  const weeklyLeaderboard = deriveWeeklyLeaderboardFromSnapshot(snapshot).slice(0, 3);
  const activeOrLatestSession = snapshot.sessions[0] ?? null;

  const isSessionActive =
    activeOrLatestSession?.status === 'active' ||
    activeOrLatestSession?.status === 'reopened';

  const attendeeCount = activeOrLatestSession
    ? snapshot.sessionAttendees.filter(
        (sa) => sa.session_id === activeOrLatestSession.id,
      ).length
    : 0;

  const completedMatchesCount = activeOrLatestSession
    ? snapshot.matches.filter(
        (m) =>
          m.session_id === activeOrLatestSession.id && m.status === 'completed',
      ).length
    : 0;

  const isStaleSession =
    Boolean(activeOrLatestSession && isSessionActive) &&
    Date.now() - Date.parse(activeOrLatestSession!.last_meaningful_activity_at) >=
      43200 * 1000;

  return (
    <div data-testid="view-home" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="mb-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] m-0">
          Home
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5 m-0 font-normal">
          Courtside session tracker &amp; group ratings
        </p>
      </div>

      {/* Primary Action Button: + Start New Session / Resume Active Session */}
      <button
        type="button"
        className="smashtrack-cta-btn"
        onClick={() => {
          if (activeOrLatestSession && isSessionActive) {
            onSelectSession(activeOrLatestSession.id);
          }
          onNavigateTab('sessions');
        }}
      >
        <Plus size={22} strokeWidth={3} />
        <span>
          {isSessionActive ? 'Resume Active Session' : 'Start New Session'}
        </span>
      </button>

      {/* Latest / Active Session Hero Card */}
      {activeOrLatestSession ? (
        <section
          className="smashtrack-session-card"
          aria-labelledby="home-session-heading"
        >
          {/* Card Header: Title & Date */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2
                id="home-session-heading"
                style={{
                  margin: 0,
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {isSessionActive ? 'Current Session' : 'Latest Session'}
              </h2>
              {isSessionActive && <StatusBadge variant="active_session" />}
            </div>

            <span
              style={{
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              {formatMalaysiaDate(activeOrLatestSession.session_started_at)}
            </span>
          </div>

          {/* 12-Hour Stale Session Warning Indicator (Requirement SES-04) */}
          {isStaleSession && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.65rem',
                background: 'var(--status-warn-bg)',
                border: '1px solid var(--status-warn-border)',
                color: 'var(--status-warn-fg)',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              data-testid="home-stale-session-indicator"
            >
              <AlertTriangle size={16} />
              <span>
                Active session has been inactive for ≥ 12 hours (never
                auto-closed, review or finalize in Sessions).
              </span>
            </div>
          )}

          {/* Metrics Grid: Attendees & Matches Completed */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
              alignItems: 'center',
              padding: '0.85rem 0.5rem',
              marginBottom: '1.15rem',
            }}
          >
            {/* Attendees Stat */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                borderRight: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  marginBottom: '0.25rem',
                }}
              >
                <Users size={24} style={{ color: 'var(--brand-accent)' }} />
                <span
                  className="rating-mono"
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {attendeeCount}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 400,
                  color: 'var(--text-secondary)',
                }}
              >
                Attendees
              </span>
            </div>

            {/* Matches Completed Stat */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  marginBottom: '0.25rem',
                }}
              >
                <DesignerShuttlecock size={24} />
                <span
                  className="rating-mono"
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {completedMatchesCount}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 400,
                  color: 'var(--text-secondary)',
                }}
              >
                Matches Completed
              </span>
            </div>
          </div>

          {/* Card CTA Button: View Session */}
          <button
            type="button"
            className="smashtrack-blue-btn"
            onClick={() => {
              onSelectSession(activeOrLatestSession.id);
              onNavigateTab('sessions');
            }}
          >
            <span>View Session</span>
            <span aria-hidden="true" style={{ marginLeft: '0.25rem' }}>→</span>
          </button>
        </section>
      ) : (
        <section
          className="smashtrack-session-card"
          aria-labelledby="home-session-empty-heading"
        >
          <h2
            id="home-session-empty-heading"
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.15rem',
              fontWeight: 700,
            }}
          >
            Latest Session
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              margin: '0 0 1rem 0',
            }}
          >
            No sessions have been recorded for this group yet.
          </p>
          <button
            type="button"
            className="smashtrack-blue-btn"
            onClick={() => onNavigateTab('sessions')}
          >
            <span>Open Sessions &amp; Start First Session</span>
          </button>
        </section>
      )}

      {/* Weekly Leaderboard Section */}
      <section aria-labelledby="home-leaderboard-heading">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h2
            id="home-leaderboard-heading"
            style={{
              margin: 0,
              fontSize: '1.2rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Weekly Leaderboard
          </h2>

          <button
            type="button"
            onClick={() => onNavigateTab('leaderboard')}
            className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.92rem',
              fontWeight: 600,
              padding: '0.25rem 0.5rem',
            }}
          >
            See All
          </button>
        </div>

        <div className="smashtrack-leaderboard-card">
          {weeklyLeaderboard.length === 0 ? (
            <p
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                margin: 0,
              }}
            >
              No matches recorded for this week yet.
            </p>
          ) : (
            <div>
              {weeklyLeaderboard.map((row) => (
                <div key={row.playerId} className="smashtrack-weekly-row">
                  {/* Left: Medal Badge, Avatar, Name & Win Rate */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <MedalBadge rank={row.rank} size={38} />

                    {/* Circular Avatar */}
                    {row.avatarUrl ? (
                      <img
                        src={row.avatarUrl}
                        alt={row.displayName}
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '9999px',
                          objectFit: 'cover',
                          border: '2px solid var(--border-color)',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '9999px',
                          background: 'var(--bg-surface-elevated)',
                          border: '2px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          color: '#f8fafc',
                          flexShrink: 0,
                        }}
                      >
                        {getPlayerInitials(row.displayName)}
                      </div>
                    )}

                    {/* Player Info */}
                    <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          flexWrap: 'nowrap',
                          overflow: 'hidden',
                        }}
                      >
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
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            fontSize: '0.98rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row.displayName}
                        </button>
                        {row.isGuest && <StatusBadge variant="guest" />}
                        {row.isProvisional && (
                          <StatusBadge variant="provisional" customLabel="Provisional" />
                        )}
                      </div>

                      {/* Subtitle: 14W - 3L • 82.4% Win Rate */}
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          marginTop: '0.15rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: 400,
                        }}
                      >
                        {row.wins}W - {row.losses}L • {row.winRatePercentDisplay}{' '}
                        Win Rate
                      </div>
                    </div>
                  </div>

                  {/* Right: Elo / Points Display */}
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '0.75rem' }}>
                    <div
                      className="rating-mono"
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {row.ratingDisplay} pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
