import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crown,
  Info,
  Trophy,
} from 'lucide-react';
import { PublicationStatusBanner } from '../components/PublicationStatusBanner.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { LeaderboardPodium } from '../components/leaderboard/LeaderboardPodium.tsx';
import { RankingRow } from '../components/leaderboard/RankingRow.tsx';
import { PlayerAvatar } from '../components/leaderboard/PlayerAvatar.tsx';
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

export type LeaderboardFilterMode = 'all_time' | 'current_session' | 'season';

/**
 * Redesigned Leaderboard view matching the attached reference aesthetic:
 * - Premium sports analytics × modern mobile app × distinctive custom illustration
 * - Signature purple accents (#7045C6) and refined light/dark surfaces
 * - Sculptural 3D podium for top 3 players with metallic rank treatments
 * - Clean ranking list for rank 4 and below with readable Elo, wins, win rate & matches
 * - Highlighted state for the authenticated player profile ("You")
 * - Support for All-Time, Current Session, and Season (Stage 2) tabs
 * - Preserves full data model, NUMERIC(10,4) rankings, and fail-closed security gates
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

  const viewerLinkedPlayerId = snapshot.viewerMembership.linked_player_id;
  const allTimeRows = deriveLeaderboardFromSnapshot(snapshot, includeInactive);
  const sessionDetail = selectedSessionId
    ? deriveSessionDetailFromSnapshot(snapshot, selectedSessionId)
    : null;

  // Top 3 for custom podium stage
  const top1 = allTimeRows[0] ?? null;
  const top2 = allTimeRows[1] ?? null;
  const top3 = allTimeRows[2] ?? null;
  // Rank 4 and below for ordinary list
  const listRows = allTimeRows.slice(3);

  return (
    <div data-testid="view-leaderboard" className="pb-8">
      {/* Publication / Recalculation Status Banner */}
      <PublicationStatusBanner
        publication={publication}
        viewerRole={snapshot.viewerMembership.role}
        isDemoMode={snapshot.isDemoMode}
        onRetryRecalculation={onRetryRecalculation}
      />

      {/* Page Heading Section (Reference layout) */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)] m-0">
          Leaderboard
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5 m-0 font-medium">
          See who&apos;s leading the court
        </p>
      </div>

      {/* Scope and Metric Filters (Reference layout: All Time / Current Session / Season + Elo Rating Chip) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-5">
        {/* Scope Segmented Control */}
        <div
          role="group"
          aria-label="Leaderboard scope filter"
          className="inline-flex max-w-full overflow-x-auto p-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] rounded-xl gap-1 text-xs font-semibold"
        >
          <button
            type="button"
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              filterMode === 'all_time'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            aria-pressed={filterMode === 'all_time'}
            onClick={() => setFilterMode('all_time')}
          >
            All Time
          </button>
          <button
            type="button"
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              filterMode === 'current_session'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            aria-pressed={filterMode === 'current_session'}
            onClick={() => setFilterMode('current_session')}
          >
            Current / Session Standings
          </button>
          <button
            type="button"
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              filterMode === 'season'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            aria-pressed={filterMode === 'season'}
            onClick={() => setFilterMode('season')}
          >
            This Season
          </button>
        </div>

        {/* Metric Chip: Elo Rating (Static indicator matching reference design) */}
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)] shadow-sm"
          title="Ranking primarily determined by doubles Elo rating"
        >
          <Crown size={14} className="text-[#f59e0b]" aria-hidden="true" />
          <span>Elo Rating</span>
        </div>
      </div>

      {/* ================= ALL-TIME ELO PANEL ================= */}
      {filterMode === 'all_time' && (
        <div data-testid="leaderboard-all-time-panel">
          {allTimeRows.length === 0 ? (
            /* Empty State for Newly Created Group */
            <div className="card text-center py-12 px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#7045c6]/10 flex items-center justify-center text-[#7045c6]">
                <Trophy size={32} />
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
                No Rankings Yet
              </h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto mb-0">
                Play and record matches in your first session to see players take their places on the podium and leaderboard!
              </p>
            </div>
          ) : (
            <>
              {/* Custom Sculptural 3D Podium for Top 3 Players */}
              <LeaderboardPodium
                top1={top1}
                top2={top2}
                top3={top3}
                viewerLinkedPlayerId={viewerLinkedPlayerId}
                onSelectPlayer={onSelectPlayer}
              />

              {/* Seamless Ranking List (Rank 4 and Below) */}
              <div className="seamless-ranking-panel mt-3">
                {/* Ranking Panel Subheader (Policy Drawer & Inactive Toggle) */}
                <div className="px-4 py-3 border-b border-[var(--border-color)]/60 bg-[var(--bg-surface-subtle)]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-secondary)]">
                      {allTimeRows.length} {allTimeRows.length === 1 ? 'Player' : 'Players'}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors"
                      onClick={() => setShowPolicyInfo((prev) => !prev)}
                      aria-expanded={showPolicyInfo}
                    >
                      <Info size={12} />
                      <span>Policy</span>
                      {showPolicyInfo ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  <label className="inline-flex items-center gap-1.5 font-medium text-[var(--text-secondary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeInactive}
                      onChange={(e) => setIncludeInactive(e.target.checked)}
                      className="rounded border-[var(--border-color)] text-[#7045c6] focus:ring-[#7045c6]"
                    />
                    <span>Include inactive</span>
                  </label>
                </div>

                {/* Policy Information Drawer */}
                {showPolicyInfo && (
                  <div className="p-3.5 bg-[var(--bg-surface-subtle)]/80 border-b border-[var(--border-color)] text-xs text-[var(--text-secondary)] leading-relaxed space-y-1.5">
                    <p className="m-0">
                      <strong>Elo Methodology:</strong> Ratings are calculated chronologically using K=24 doubles Elo baseline 1000 at full <code>NUMERIC(10,4)</code> precision.
                    </p>
                    <p className="m-0">
                      <strong>Competition Ties:</strong> Players with identical 4-decimal ratings share rank (e.g. 1, 1, 3). Two players with identical rounded integers may not be an exact tie.
                    </p>
                    <p className="m-0">
                      <strong>Provisional Status:</strong> Players with fewer than 3 completed matches display a provisional badge.
                    </p>
                  </div>
                )}

                {/* List Rows */}
                {listRows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                    {allTimeRows.length <= 3
                      ? 'All ranked players are featured on the podium above.'
                      : 'No additional players to display.'}
                  </div>
                ) : (
                  <div>
                    {listRows.map((row) => (
                      <RankingRow
                        key={row.playerId}
                        row={row}
                        isCurrentUser={viewerLinkedPlayerId === row.playerId}
                        onSelectPlayer={onSelectPlayer}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= CURRENT / SESSION STANDINGS PANEL ================= */}
      {filterMode === 'current_session' && (
        <div data-testid="leaderboard-session-panel" className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="leaderboard-session-select"
                className="font-bold text-sm text-[var(--text-primary)]"
              >
                Select Session:
              </label>
              <select
                id="leaderboard-session-select"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#7045c6]"
              >
                {snapshot.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatMalaysiaDate(s.session_started_at)} ({s.status})
                  </option>
                ))}
              </select>
            </div>

            {sessionDetail && sessionDetail.standings.isProvisionalUntilFinalized && (
              <StatusBadge
                variant="provisional"
                customLabel="Provisional until finalized"
              />
            )}
          </div>

          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Session standings rank players by <strong>Wins</strong>, then{' '}
            <strong>Win Rate</strong>, then <strong>Point Difference</strong>.
          </p>

          {!sessionDetail ? (
            <p className="text-sm text-[var(--text-muted)]">No session selected.</p>
          ) : sessionDetail.standings.playedRows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No completed matches in this session yet.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-color)]/50">
              {sessionDetail.standings.playedRows.map((row) => (
                <div
                  key={row.playerId}
                  data-testid={`session-standing-row-${row.playerId}`}
                  className="flex items-center justify-between py-2.5 px-2 hover:bg-[var(--bg-surface-subtle)]/50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center font-bold text-sm text-[var(--text-secondary)]">
                      #{row.rank}
                    </span>
                    <PlayerAvatar
                      displayName={row.displayName}
                      playerId={row.playerId}
                      size={36}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(row.playerId)}
                          className="font-bold text-sm text-[var(--text-primary)] hover:text-[#7045c6] truncate"
                        >
                          {row.displayName}
                        </button>
                        {row.isGuest && <StatusBadge variant="guest" />}
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {row.wins}W - {row.losses}L ({row.winRatePercentDisplay})
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`rating-mono font-black text-sm sm:text-base ${
                        row.pointDifference > 0
                          ? 'text-emerald-500'
                          : row.pointDifference < 0
                            ? 'text-rose-500'
                            : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}
                    </span>
                    <span className="block text-[10px] text-[var(--text-muted)]">
                      ({row.pointsScored}–{row.pointsConceded})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bench Attendance Section (ATT-01) */}
          {sessionDetail && (
            <div
              className="mt-6 p-4 rounded-xl bg-[var(--bg-surface-subtle)]/60 border border-[var(--border-color)]"
              data-testid="session-bench-attendance"
            >
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                Attended Session — 0 Matches Played (Bench)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Attendance is recorded separately from match participation (ATT-01). Attending without playing counts toward session attendance without altering standings or Elo ratings.
              </p>
              {sessionDetail.standings.nonPlayingAttendees.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] m-0">
                  All session attendees have played at least one completed match.
                </p>
              ) : (
                <ul className="space-y-1 text-xs text-[var(--text-secondary)] pl-4 list-disc m-0">
                  {sessionDetail.standings.nonPlayingAttendees.map((att) => (
                    <li key={att.playerId}>
                      <strong className="text-[var(--text-primary)]">
                        {att.displayName}
                      </strong>{' '}
                      {att.isGuest ? '(Guest) ' : ''}— Present (0 matches played)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= SEASON PANEL (Coming in Stage 2) ================= */}
      {filterMode === 'season' && (
        <div data-testid="leaderboard-season-panel" className="card p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#7045c6]/10 flex items-center justify-center text-[#7045c6]">
            <Trophy size={24} />
          </div>
          <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
            Seasonal Ratings Paused in Stage 1
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mx-auto m-0 leading-relaxed">
            No active season is configured (<code>season_id = NULL</code>). In accordance with the approved Stage 1 roadmap (<code>DEC-014</code>), all completed matches contribute directly to the All-Time Elo leaderboard. Custom seasons and seasonal ratings will launch in Stage 2.
          </p>
        </div>
      )}
    </div>
  );
}
