import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  Trophy,
  Users,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { LeaderboardPodium } from '../components/leaderboard/LeaderboardPodium.tsx';
import { RankingRow } from '../components/leaderboard/RankingRow.tsx';
import { PlayerAvatar } from '../components/leaderboard/PlayerAvatar.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveLeaderboardFromSnapshot,
  deriveSessionDetailFromSnapshot,
  deriveWeeklyLeaderboardFromSnapshot,
  formatMalaysiaDate,
} from '../services/readViewModels.ts';

export interface LeaderboardViewProps {
  snapshot: GroupReadSnapshot;
  onSelectPlayer: (playerId: string) => void;
}

export type LeaderboardFilterMode =
  | 'all_time'
  | 'weekly'
  | 'current_session'
  | 'season';

export type LeaderboardFormatMode = 'doubles' | 'singles';

/**
 * Redesigned Leaderboard view matching new ui design/leaderboard.jfif:
 * - Clean mobile header: "Leaderboard" with Inter typography
 * - Filter dropdown on left (All-Time, Weekly, Current Session, Season, Inactive toggle)
 * - Singles | Doubles format switch on right
 * - 3D Sculptural Podium with Glowing Emerald Top, 5-point Golden Crown, and Ribbon Medals
 * - Dark rounded ranking card for rank 4 and below
 * - Preserves all test IDs, NUMERIC(10,4) sorting, and fail-closed security gates
 */
export function LeaderboardView({
  snapshot,
  onSelectPlayer,
}: LeaderboardViewProps) {
  // Always default to 'all_time' on mount
  const [filterMode, setFilterMode] =
    useState<LeaderboardFilterMode>('all_time');
  const [formatMode, setFormatMode] =
    useState<LeaderboardFormatMode>('doubles');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showPolicyInfo, setShowPolicyInfo] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    snapshot.sessions[0]?.id ?? '',
  );

  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const viewerLinkedPlayerId = snapshot.viewerMembership.linked_player_id;
  const allTimeRows = deriveLeaderboardFromSnapshot(snapshot, includeInactive);
  const weeklyRows = deriveWeeklyLeaderboardFromSnapshot(snapshot);
  const sessionDetail = selectedSessionId
    ? deriveSessionDetailFromSnapshot(snapshot, selectedSessionId)
    : null;

  // Active rows based on filter mode
  const activeRows =
    filterMode === 'weekly'
      ? (weeklyRows as unknown as typeof allTimeRows)
      : allTimeRows;

  // Top 3 for custom podium stage
  const top1 = activeRows[0] ?? null;
  const top2 = activeRows[1] ?? null;
  const top3 = activeRows[2] ?? null;
  // Rank 4 and below for ordinary list
  const listRows = activeRows.slice(3);

  const filterDisplayNames: Record<LeaderboardFilterMode, string> = {
    all_time: 'All Time',
    weekly: 'Weekly',
    current_session: 'Current Session',
    season: 'This Season',
  };

  return (
    <div data-testid="view-leaderboard" className="pb-12">
      {/* Page Heading Section matching new ui design/leaderboard.jfif */}
      <div className="mb-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] m-0">
          Leaderboard
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5 m-0 font-normal">
          See who&apos;s leading the court
        </p>
      </div>

      {/* Filter and Format Bar: Left = Filter ⌵, Right = Singles | Doubles */}
      <div className="flex items-center justify-between gap-3 mb-4 relative z-30">
        {/* Left: Filter Dropdown Selector */}
        <div className="relative" ref={filterMenuRef}>
          <button
            type="button"
            id="leaderboard-filter-dropdown-btn"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-subtle)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] shadow-sm hover:bg-[var(--bg-surface-elevated)] transition-all cursor-pointer"
            aria-expanded={isFilterOpen}
            aria-label="Filter leaderboard"
          >
            <Filter size={13} className="text-emerald-400" />
            <span>
              {filterMode === 'all_time'
                ? 'Filter'
                : `Filter: ${filterDisplayNames[filterMode]}`}
            </span>
            <ChevronDown
              size={13}
              className={`text-slate-400 transition-transform ${
                isFilterOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Filter Dropdown Menu (Always accessible for tests, visually floating when open) */}
          <div
            className={`transition-all duration-150 z-40 ${
              isFilterOpen
                ? 'absolute top-full left-0 mt-1.5 w-60 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5'
                : 'opacity-0 pointer-events-none absolute top-full left-0 -z-50'
            }`}
            role="menu"
            aria-label="Leaderboard scope options"
          >
            <div className="p-1 space-y-0.5">
              <button
                type="button"
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between ${
                  filterMode === 'all_time'
                    ? 'bg-emerald-600/20 text-emerald-400 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-pressed={filterMode === 'all_time'}
                onClick={() => {
                  setFilterMode('all_time');
                  setIsFilterOpen(false);
                }}
              >
                <span>All Time</span>
                {filterMode === 'all_time' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              <button
                type="button"
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between ${
                  filterMode === 'weekly'
                    ? 'bg-emerald-600/20 text-emerald-400 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-pressed={filterMode === 'weekly'}
                onClick={() => {
                  setFilterMode('weekly');
                  setIsFilterOpen(false);
                }}
              >
                <span>Weekly Leaderboard</span>
                {filterMode === 'weekly' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              <button
                type="button"
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between ${
                  filterMode === 'current_session'
                    ? 'bg-emerald-600/20 text-emerald-400 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-pressed={filterMode === 'current_session'}
                onClick={() => {
                  setFilterMode('current_session');
                  setIsFilterOpen(false);
                }}
              >
                <span>Current / Session Standings</span>
                {filterMode === 'current_session' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              <button
                type="button"
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between ${
                  filterMode === 'season'
                    ? 'bg-emerald-600/20 text-emerald-400 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                aria-pressed={filterMode === 'season'}
                onClick={() => {
                  setFilterMode('season');
                  setIsFilterOpen(false);
                }}
              >
                <span>This Season</span>
                {filterMode === 'season' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            </div>

            <div className="pt-1.5 mt-1 border-t border-slate-800 px-3 py-1.5 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Include inactive</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right: Singles | Doubles Format Switcher */}
        <div
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold select-none"
          role="group"
          aria-label="Match format toggle"
        >
          <button
            type="button"
            onClick={() => setFormatMode('singles')}
            aria-pressed={formatMode === 'singles'}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            className={`min-h-[28px] px-2 py-1 rounded transition-colors ${
              formatMode === 'singles'
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium'
            }`}
          >
            Singles
          </button>
          <span className="text-[var(--text-muted)] font-normal select-none" aria-hidden="true">|</span>
          <button
            type="button"
            onClick={() => setFormatMode('doubles')}
            aria-pressed={formatMode === 'doubles'}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            className={`min-h-[28px] px-2 py-1 rounded transition-colors ${
              formatMode === 'doubles'
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium'
            }`}
          >
            Doubles
          </button>
        </div>
      </div>

      {/* ================= SINGLES MODE PREVIEW (STAGE 2) ================= */}
      {formatMode === 'singles' ? (
        <div className="card text-center py-10 px-6 rounded-2xl bg-slate-900/90 border border-slate-800 my-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Users size={28} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">
            Singles Tracking Queued for Stage 2
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto mb-4">
            Under group rules, play is doubles only on one court. Singles
            leaderboards and matches are scheduled for a future update.
          </p>
          <button
            type="button"
            onClick={() => setFormatMode('doubles')}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition-colors"
          >
            View Official Doubles Leaderboard
          </button>
        </div>
      ) : (
        <>
          {/* ================= ALL-TIME & WEEKLY ELO PANEL ================= */}
          {(filterMode === 'all_time' || filterMode === 'weekly') && (
            <div data-testid="leaderboard-all-time-panel">
              {activeRows.length === 0 ? (
                /* Empty State for Newly Created Group */
                <div className="card text-center py-12 px-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Trophy size={32} />
                  </div>
                  <h2 className="text-lg font-bold text-white mb-1">
                    No Rankings Yet
                  </h2>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto mb-0">
                    Play and record matches in your first session to see players take their places on the podium and leaderboard!
                  </p>
                </div>
              ) : (
                <>
                  {/* 3D Stepped Podium for Top 3 Players */}
                  <LeaderboardPodium
                    top1={top1}
                    top2={top2}
                    top3={top3}
                    viewerLinkedPlayerId={viewerLinkedPlayerId}
                    onSelectPlayer={onSelectPlayer}
                  />

                  {/* Dark Rounded Ranking Card for Rank 4 and Below */}
                  <div
                    className="mt-3 rounded-2xl overflow-hidden border border-slate-800/90 shadow-xl"
                    style={{ background: 'var(--bg-surface)' }}
                  >
                    {/* Header bar of ranking card */}
                    <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-400">
                          {activeRows.length} {activeRows.length === 1 ? 'Player' : 'Players'}
                        </span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700 bg-slate-800 text-slate-400 hover:text-white font-medium transition-colors"
                          onClick={() => setShowPolicyInfo((prev) => !prev)}
                          aria-expanded={showPolicyInfo}
                        >
                          <Info size={11} />
                          <span>Policy</span>
                          {showPolicyInfo ? (
                            <ChevronUp size={11} />
                          ) : (
                            <ChevronDown size={11} />
                          )}
                        </button>
                      </div>

                      {filterMode === 'weekly' && (
                        <span className="text-[11px] font-semibold text-emerald-400">
                          Current Week
                        </span>
                      )}
                    </div>

                    {/* Policy Information Drawer */}
                    {showPolicyInfo && (
                      <div className="p-3 bg-slate-900/80 border-b border-slate-800 text-xs text-slate-400 leading-relaxed space-y-1">
                        <p className="m-0">
                          <strong>Elo Methodology:</strong> Ratings are calculated chronologically using K=24 doubles Elo baseline 1000 at full decimal precision.
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
                      <div className="p-6 text-center text-xs text-slate-500">
                        {activeRows.length <= 3
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
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                              className="font-bold text-sm text-[var(--text-primary)] hover:text-emerald-400 truncate"
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
                          {row.pointDifference > 0
                            ? `+${row.pointDifference}`
                            : row.pointDifference}
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
                    Attendance is recorded separately from match participation. Attending without playing counts toward session attendance without altering standings or Elo ratings.
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
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Trophy size={24} />
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Seasonal Ratings Paused in Stage 1
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mx-auto m-0 leading-relaxed">
                No active season is configured. All completed matches contribute directly to the All-Time Elo leaderboard. Custom seasons and seasonal ratings will launch in a future update.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
