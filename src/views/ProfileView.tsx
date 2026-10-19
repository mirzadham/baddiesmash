import { useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveEnrichedMatchesFromSnapshot,
  deriveLeaderboardFromSnapshot,
  formatMalaysiaDate,
} from '../services/readViewModels.ts';
import type { EffectivePublicationBannerState } from '../services/trackerRepository.ts';

export interface ProfileViewProps {
  snapshot: GroupReadSnapshot;
  publication: EffectivePublicationBannerState;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onRetryRecalculation: () => Promise<void>;
}

type MatchStatusFilter = 'all' | 'completed' | 'disputed' | 'voided';

/**
 * Player Profile & Match History View (`ID-01`, `RATE-04`, `RATE-06`, `DEC-036`, `DEC-044`, `DEC-052`):
 * - Exposes the signed-in user's linked player profile first (or explains Viewer-only status
 *   when `linked_player_id === null` per `ID-01`).
 * - Exposes the publication health banner (`Current`, `Recalculating`, `Stale/Failed`) so profile
 *   views never claim stale ratings reflect the latest match history (`DEC-016`).
 * - Displays rounded before/after ratings and 1-decimal rating changes with independent-rounding
 *   disclosure.
 */
export function ProfileView({
  snapshot,
  publication,
  selectedPlayerId,
  onSelectPlayer,
  onRetryRecalculation,
}: ProfileViewProps) {
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('all');
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>('');

  const leaderboardAll = deriveLeaderboardFromSnapshot(snapshot, true);
  const viewerLinkedPlayerId = snapshot.viewerMembership.linked_player_id;

  const effectivePlayerId =
    selectedPlayerId ??
    viewerLinkedPlayerId ??
    leaderboardAll[0]?.playerId ??
    null;

  const selectedRow =
    leaderboardAll.find((r) => r.playerId === effectivePlayerId) ?? null;
  const selectedPlayerRecord =
    snapshot.players.find((p) => p.id === effectivePlayerId) ?? null;

  const allMatchesForPlayer = deriveEnrichedMatchesFromSnapshot(
    snapshot,
  ).filter((card) =>
    [...card.teamA, ...card.teamB].some(
      (slot) => slot.playerId === effectivePlayerId,
    ),
  );

  const filteredMatches = allMatchesForPlayer.filter((card) => {
    if (sessionFilter !== 'all' && card.match.session_id !== sessionFilter) {
      return false;
    }
    if (statusFilter === 'completed') {
      return card.match.status === 'completed';
    }
    if (statusFilter === 'disputed') {
      return card.match.is_disputed;
    }
    if (statusFilter === 'voided') {
      return card.match.status === 'voided';
    }
    return true;
  });

  const otherPlayers = useMemo(() => {
    return leaderboardAll.filter((p) => p.playerId !== effectivePlayerId);
  }, [leaderboardAll, effectivePlayerId]);

  const activeOpponentId =
    selectedOpponentId && selectedOpponentId !== effectivePlayerId
      ? selectedOpponentId
      : (otherPlayers[0]?.playerId ?? '');

  const activeOpponent = useMemo(() => {
    return leaderboardAll.find((p) => p.playerId === activeOpponentId) ?? null;
  }, [leaderboardAll, activeOpponentId]);

  const h2hStats = useMemo(() => {
    if (!effectivePlayerId || !activeOpponentId || effectivePlayerId === activeOpponentId) {
      return null;
    }
    let vsMatches = 0;
    let vsWins = 0;
    let vsLosses = 0;
    let partnerMatches = 0;
    let partnerWins = 0;
    let partnerLosses = 0;

    for (const card of allMatchesForPlayer) {
      if (card.match.status !== 'completed') continue;
      const playerSide = card.teamA.some((s) => s.playerId === effectivePlayerId)
        ? 'A'
        : 'B';
      const opponentSide = card.teamA.some((s) => s.playerId === activeOpponentId)
        ? 'A'
        : card.teamB.some((s) => s.playerId === activeOpponentId)
        ? 'B'
        : null;

      if (!opponentSide) continue;

      const playerWon = card.winnerSide === playerSide;

      if (playerSide === opponentSide) {
        partnerMatches++;
        if (playerWon) partnerWins++;
        else partnerLosses++;
      } else {
        vsMatches++;
        if (playerWon) vsWins++;
        else vsLosses++;
      }
    }

    return {
      vsMatches,
      vsWins,
      vsLosses,
      vsWinRate: vsMatches > 0 ? `${((vsWins / vsMatches) * 100).toFixed(0)}%` : '0%',
      partnerMatches,
      partnerWins,
      partnerLosses,
      partnerWinRate: partnerMatches > 0 ? `${((partnerWins / partnerMatches) * 100).toFixed(0)}%` : '0%',
    };
  }, [effectivePlayerId, activeOpponentId, allMatchesForPlayer]);

  const recentForm = useMemo(() => {
    return allMatchesForPlayer
      .filter((c) => c.match.status === 'completed')
      .slice(0, 5)
      .map((c) => {
        const playerSide = c.teamA.some((s) => s.playerId === effectivePlayerId)
          ? 'A'
          : 'B';
        return c.winnerSide === playerSide ? 'W' : 'L';
      });
  }, [allMatchesForPlayer, effectivePlayerId]);

  return (
    <div data-testid="view-profile">
      <PublicationStatusBanner
        publication={publication}
        viewerRole={snapshot.viewerMembership.role}
        isDemoMode={snapshot.isDemoMode}
        onRetryRecalculation={onRetryRecalculation}
      />

      {/* Viewer Account Identity Separation Notice (ID-01) */}
      {viewerLinkedPlayerId === null && (
        <section
          className="card"
          role="note"
          data-testid="viewer-unlinked-profile-notice"
          style={{
            background: 'var(--status-warn-bg)',
            color: 'var(--status-warn-fg)',
            borderColor: 'var(--status-warn-border)',
          }}
        >
          <strong>Viewer Account (No Linked Player Profile):</strong> Your login
          account is approved with role{' '}
          <code>{snapshot.viewerMembership.role}</code>, and is not currently
          linked to a player profile (<code>linked_player_id = NULL</code>). Per{' '}
          <code>ID-01</code>, viewer accounts do not appear on leaderboards or
          participate in official matches until an Admin links a player profile,
          but you have full read access to browse all group profiles below.
        </section>
      )}

      {/* Player Profile Switcher */}
      <section className="card" aria-labelledby="profile-selector-heading">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div>
            <h2 id="profile-selector-heading" style={{ margin: 0 }}>
              Player Profile &amp; Match History
            </h2>
            <p
              style={{
                margin: '0.2rem 0 0 0',
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
              }}
            >
              Browse any permanent or temporary guest player profile in the
              group.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="profile-player-select" style={{ fontWeight: 600 }}>
              Player:
            </label>
            <select
              id="profile-player-select"
              value={effectivePlayerId ?? ''}
              onChange={(e) => onSelectPlayer(e.target.value)}
              style={{
                minHeight: '48px',
                padding: '0.4rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            >
              {leaderboardAll.map((r) => (
                <option key={r.playerId} value={r.playerId}>
                  {r.displayName}
                  {r.playerId === viewerLinkedPlayerId ? ' (You)' : ''}
                  {r.isGuest ? ' [Guest]' : ''}
                  {!r.isActive ? ' [Inactive]' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Selected Player Summary */}
      {selectedRow && selectedPlayerRecord ? (
        <>
          <section
            className="card"
            aria-labelledby="selected-player-heading"
            data-testid="selected-player-summary"
          >
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
                <h3
                  id="selected-player-heading"
                  style={{ margin: 0, fontSize: '1.35rem' }}
                >
                  {selectedRow.displayName}
                  {selectedRow.playerId === viewerLinkedPlayerId && (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.85rem',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      (Your Linked Profile)
                    </span>
                  )}
                </h3>
                <p
                  style={{
                    margin: '0.2rem 0 0 0',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Profile joined:{' '}
                  {formatMalaysiaDate(selectedPlayerRecord.created_at)} • Stable
                  ID: <code>{selectedRow.playerId.slice(0, 8)}</code>
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {selectedRow.isGuest && <StatusBadge variant="guest" />}
                {selectedRow.isProvisional && (
                  <StatusBadge variant="provisional" />
                )}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  All-Time Elo (Rounded)
                </div>
                <div
                  className="rating-mono"
                  style={{ fontSize: '1.5rem', marginTop: '0.15rem' }}
                >
                  {selectedRow.ratingDisplay}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Exact: {selectedRow.ratingNumeric4} • Rank #{selectedRow.rank}
                  {selectedRow.isTiedRank ? ' (T)' : ''}
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Completed Matches
                </div>
                <div
                  className="rating-mono"
                  style={{ fontSize: '1.35rem', marginTop: '0.15rem' }}
                >
                  {selectedRow.wins}W – {selectedRow.losses}L
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Win rate: {selectedRow.winRatePercentDisplay}
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Attendance Rate (ATT-01)
                </div>
                <div
                  className="rating-mono"
                  style={{ fontSize: '1.25rem', marginTop: '0.15rem' }}
                >
                  {selectedRow.attendanceRatePercentDisplay ?? '0.0% (0/0)'}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Attended / sessions held since profile creation
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Recent Form (Last 5)
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    marginTop: '0.35rem',
                  }}
                >
                  {recentForm.length === 0 ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No matches</span>
                  ) : (
                    recentForm.map((res, i) => (
                      <span
                        key={i}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                          background: res === 'W' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: res === 'W' ? 'var(--accent-volt)' : '#f87171',
                          border: res === 'W' ? '1px solid var(--accent-primary)' : '1px solid #ef4444',
                        }}
                      >
                        {res}
                      </span>
                    ))
                  )}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Latest completed matches
                </div>
              </div>
            </div>
          </section>

          {/* Head-to-Head (H2H) Records Section */}
          <section
            className="card"
            data-testid="profile-h2h-section"
            aria-labelledby="profile-h2h-heading"
          >
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Swords size={22} style={{ color: 'var(--accent-volt)' }} />
                <div>
                  <h3 id="profile-h2h-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
                    Head-to-Head Rivalry &amp; Partnership
                  </h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Direct track record with fellow group members
                  </p>
                </div>
              </div>

              {otherPlayers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="h2h-opponent-select" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Compare with:
                  </label>
                  <select
                    id="h2h-opponent-select"
                    value={activeOpponentId}
                    onChange={(e) => setSelectedOpponentId(e.target.value)}
                    style={{
                      minHeight: '42px',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                    }}
                  >
                    {otherPlayers.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.displayName} {p.isGuest ? '(Guest)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {h2hStats && activeOpponent ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.85rem',
                }}
              >
                {/* As Opponents */}
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-volt)' }}>
                      As Opponents
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {h2hStats.vsMatches} {h2hStats.vsMatches === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  <div className="rating-mono" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    {h2hStats.vsWins}W – {h2hStats.vsLosses}L
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Win rate against {activeOpponent.displayName}: <strong>{h2hStats.vsWinRate}</strong>
                  </div>
                </div>

                {/* As Partners */}
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-primary)' }}>
                      As Doubles Partners
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {h2hStats.partnerMatches} {h2hStats.partnerMatches === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  <div className="rating-mono" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    {h2hStats.partnerWins}W – {h2hStats.partnerLosses}L
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Win rate when paired together: <strong>{h2hStats.partnerWinRate}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.88rem' }}>
                Select another player in the group to view direct head-to-head match records.
              </p>
            )}
          </section>

          {/* Player Match History with Filters (`DEC-052`) */}
          <section className="card" aria-labelledby="profile-history-heading">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <h3 id="profile-history-heading" style={{ margin: 0 }}>
                  Match History ({filteredMatches.length})
                </h3>
                <p
                  style={{
                    margin: '0.2rem 0 0 0',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Ordered newest first. Displayed before/after ratings (whole
                  numbers) and change (1 decimal) are rounded independently from
                  internal <code>NUMERIC(10,4)</code> values.
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                <label htmlFor="profile-session-filter" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Session:
                </label>
                <select
                  id="profile-session-filter"
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  style={{
                    minHeight: '44px',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <option value="all">All Sessions</option>
                  {snapshot.sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatMalaysiaDate(s.session_started_at)}
                    </option>
                  ))}
                </select>

                <label htmlFor="profile-status-filter" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Status:
                </label>
                <select
                  id="profile-status-filter"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as MatchStatusFilter)
                  }
                  style={{
                    minHeight: '44px',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed Only</option>
                  <option value="disputed">Disputed Only</option>
                  <option value="voided">Voided Only</option>
                </select>
              </div>
            </div>

            {filteredMatches.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>
                No matches match the selected filters for this player.
              </p>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Date &amp; Seq</th>
                      <th scope="col">Matchup</th>
                      <th scope="col">Score</th>
                      <th scope="col">Rating (Before → After)</th>
                      <th scope="col">Change (Δ)</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatches.map((card) => {
                      const playerSlot = [...card.teamA, ...card.teamB].find(
                        (s) => s.playerId === effectivePlayerId,
                      )!;
                      const won =
                        card.winnerSide !== null &&
                        card.winnerSide === playerSlot.teamSide;

                      return (
                        <tr key={card.match.id}>
                          <td>
                            <div>{card.sessionDateDisplay}</div>
                            <div
                              style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              Match #{card.match.sequence_number ?? 'Draft'}
                            </div>
                          </td>
                          <td>
                            <div>
                              <strong>Team A:</strong>{' '}
                              {card.teamA[0].displayName} &amp;{' '}
                              {card.teamA[1].displayName}
                            </div>
                            <div>
                              <strong>Team B:</strong>{' '}
                              {card.teamB[0].displayName} &amp;{' '}
                              {card.teamB[1].displayName}
                            </div>
                          </td>
                          <td className="rating-mono">
                            {card.match.team_a_score ?? '–'}–
                            {card.match.team_b_score ?? '–'}{' '}
                            {card.match.status === 'completed'
                              ? won
                                ? '(W)'
                                : '(L)'
                              : ''}
                          </td>
                          <td className="rating-mono">
                            {playerSlot.beforeDisplay !== null &&
                            playerSlot.afterDisplay !== null
                              ? `${playerSlot.beforeDisplay} → ${playerSlot.afterDisplay}`
                              : '–'}
                          </td>
                          <td className="rating-mono">
                            {playerSlot.changeDisplay ?? '–'}
                          </td>
                          <td>
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.35rem',
                                flexWrap: 'wrap',
                              }}
                            >
                              {card.match.is_disputed && (
                                <StatusBadge variant="disputed" />
                              )}
                              {card.match.status === 'voided' ? (
                                <StatusBadge variant="voided" />
                              ) : (
                                <span style={{ fontSize: '0.82rem' }}>
                                  Official
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="card">
          <p style={{ color: 'var(--text-muted)' }}>
            No player profile selected.
          </p>
        </section>
      )}

      {/* Data Privacy & Account Lifecycle (PRIV-02) */}
      <section
        className="card"
        data-testid="privacy-lifecycle-card"
        aria-labelledby="privacy-lifecycle-heading"
        style={{ marginTop: '1.25rem' }}
      >
        <h3
          id="privacy-lifecycle-heading"
          style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}
        >
          Data Privacy &amp; Account Lifecycle (PRIV-02)
        </h3>
        <p
          style={{
            margin: '0 0 0.75rem 0',
            fontSize: '0.84rem',
            color: 'var(--text-secondary)',
          }}
        >
          This tracker is built for a trusted badminton group with strict privacy
          separation, deterministic ratings, and audited data integrity.
        </p>

        <div style={{ display: 'grid', gap: '0.65rem', fontSize: '0.83rem' }}>
          <div
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: '0.45rem',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-color)',
            }}
          >
            <strong>1. Rating Ledger &amp; Match History Immutability</strong>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                color: 'var(--text-secondary)',
              }}
            >
              Completed doubles matches, scores, and sequential order numbers are
              immutable historical facts. Because all Elo ratings and leaderboard
              standings are mathematically derived from past matches, match history
              cannot be silently erased without corrupting all subsequent ratings.
            </p>
          </div>

          <div
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: '0.45rem',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-color)',
            }}
          >
            <strong>2. Account Deletion &amp; Player Profile Unlinking</strong>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                color: 'var(--text-secondary)',
              }}
            >
              If a member departs or requests account deletion, their login
              authentication record is removed and their membership status
              transitions to <code>departed</code>. The player profile remains with{' '}
              <code>linked_player_id = NULL</code>, preserving historical match
              scorecards and group rating integrity while severing all personal
              authentication credentials.
            </p>
          </div>

          <div
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: '0.45rem',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-color)',
            }}
          >
            <strong>3. Confidentiality of Contact Details &amp; Invitations</strong>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                color: 'var(--text-secondary)',
              }}
            >
              Member email addresses and raw invitation tokens are never displayed
              to other players or sent in client-side data bundles (PRIV-01).
              Invitation links are single-use and hashed (SHA-256) before database
              storage.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
