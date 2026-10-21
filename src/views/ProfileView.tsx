import { useMemo, useState } from 'react';
import { Shield, Settings, LogOut, SunMoon } from 'lucide-react';
import { ProfileHeroCard } from '../components/profile/ProfileHeroCard.tsx';
import { PerformanceMetricsGrid } from '../components/profile/PerformanceMetricsGrid.tsx';
import {
  H2HRivalrySection,
  type H2HStatsData,
} from '../components/profile/H2HRivalrySection.tsx';
import {
  ProfileMatchHistorySection,
  type MatchStatusFilter,
} from '../components/profile/ProfileMatchHistorySection.tsx';
import type { GroupReadSnapshot } from '../services/demoData.ts';
import {
  deriveEnrichedMatchesFromSnapshot,
  deriveLeaderboardFromSnapshot,
  formatMalaysiaDate,
} from '../services/readViewModels.ts';

export interface ProfileViewProps {
  snapshot: GroupReadSnapshot;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  theme?: 'system' | 'light' | 'dark';
  onSelectTheme?: (theme: 'system' | 'light' | 'dark') => void;
  onOpenAdminTools?: () => void;
  onSignOut?: () => void;
}

/**
 * Player Profile & Match History View (`ID-01`, `RATE-04`, `RATE-06`, `DEC-036`, `DEC-044`, `DEC-052`, `PRIV-02`):
 * - Redesigned to match the athletic dark sports aesthetic in `profile.jfif`.
 * - Exposes the signed-in user's linked player profile first (or explains Viewer-only status
 *   when `linked_player_id === null` per `ID-01`).
 * - Exposes the publication health banner (`Current`, `Recalculating`, `Stale/Failed`).
 * - Displays 2x2 Performance Grid (Recent Form, Win Rate, Win Streak, Elo points, Attendance Rate).
 * - Displays H2H Rivalry & Partnerships with visual split comparison bars.
 * - Displays mobile-first Match History cards with filters.
 * - Displays Data Privacy & Account Lifecycle disclosures (`PRIV-02`).
 */
export function ProfileView({
  snapshot,
  selectedPlayerId,
  onSelectPlayer,
  theme,
  onSelectTheme,
  onOpenAdminTools,
  onSignOut,
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

  const h2hStats = useMemo<H2HStatsData | null>(() => {
    if (
      !effectivePlayerId ||
      !activeOpponentId ||
      effectivePlayerId === activeOpponentId
    ) {
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
      vsWinRate:
        vsMatches > 0 ? `${((vsWins / vsMatches) * 100).toFixed(0)}%` : '0%',
      partnerMatches,
      partnerWins,
      partnerLosses,
      partnerWinRate:
        partnerMatches > 0
          ? `${((partnerWins / partnerMatches) * 100).toFixed(0)}%`
          : '0%',
    };
  }, [effectivePlayerId, activeOpponentId, allMatchesForPlayer]);

  const recentForm = useMemo<Array<'W' | 'L'>>(() => {
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

  const winStreak = useMemo(() => {
    const completed = allMatchesForPlayer.filter(
      (c) => c.match.status === 'completed',
    );
    let streak = 0;
    for (const card of completed) {
      const playerSide = card.teamA.some(
        (s) => s.playerId === effectivePlayerId,
      )
        ? 'A'
        : 'B';
      if (card.winnerSide === playerSide) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [allMatchesForPlayer, effectivePlayerId]);

  return (
    <div data-testid="view-profile" className="flex flex-col gap-4 pb-20">
      {/* 2. Viewer Account Identity Separation Notice (ID-01) */}
      {viewerLinkedPlayerId === null && (
        <section
          className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col gap-1.5"
          role="note"
          data-testid="viewer-unlinked-profile-notice"
        >
          <strong>Viewer Account (No Linked Player Profile):</strong> Your login
          account is approved with role{' '}
          <code className="text-amber-200">{snapshot.viewerMembership.role}</code>
          , and is not currently linked to a player profile. Viewer accounts do not
          appear on leaderboards or participate in official matches until an Admin
          links a player profile, but you have full read access to browse all
          group profiles below.
        </section>
      )}

      {/* 3. Selected Player Summary, Performance Grid, H2H & Match History */}
      {selectedRow && selectedPlayerRecord ? (
        <>
          {/* Hero Card matching profile.jfif */}
          <ProfileHeroCard
            selectedRow={selectedRow}
            selectedPlayerRecord={selectedPlayerRecord}
            viewerLinkedPlayerId={viewerLinkedPlayerId}
            allPlayers={leaderboardAll}
            effectivePlayerId={selectedRow.playerId}
            onSelectPlayer={onSelectPlayer}
            formatMalaysiaDate={formatMalaysiaDate}
          />

          {/* 2x2 Performance Metrics Grid matching profile.jfif */}
          <PerformanceMetricsGrid
            selectedRow={selectedRow}
            recentForm={recentForm}
            winStreak={winStreak}
          />

          {/* H2H Rivalry & Partnerships matching profile.jfif */}
          <H2HRivalrySection
            otherPlayers={otherPlayers}
            activeOpponentId={activeOpponentId}
            activeOpponent={activeOpponent}
            h2hStats={h2hStats}
            onSelectOpponent={setSelectedOpponentId}
          />

          {/* Player Match History with Filters (DEC-052) */}
          <ProfileMatchHistorySection
            filteredMatches={filteredMatches}
            effectivePlayerId={selectedRow.playerId}
            sessionFilter={sessionFilter}
            statusFilter={statusFilter}
            sessions={snapshot.sessions}
            onSessionFilterChange={setSessionFilter}
            onStatusFilterChange={setStatusFilter}
            formatMalaysiaDate={formatMalaysiaDate}
          />
        </>
      ) : (
        <section className="p-4 rounded-xl bg-[#121a24] text-slate-400 text-xs text-center border border-slate-800">
          No player profile selected.
        </section>
      )}

      {/* 4. Data Privacy & Account Lifecycle (PRIV-02) */}
      <section
        className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 shadow-xl flex flex-col gap-3.5"
        data-testid="privacy-lifecycle-card"
        aria-labelledby="privacy-lifecycle-heading"
      >
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-emerald-400" />
          <h3
            id="privacy-lifecycle-heading"
            className="text-base sm:text-lg font-bold text-white tracking-tight"
          >
            Data Privacy &amp; Account Lifecycle
          </h3>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          This tracker is built for a trusted badminton group with strict privacy
          separation, deterministic ratings, and audited data integrity.
        </p>

        <div className="grid gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col gap-1">
            <strong className="text-white font-semibold text-xs sm:text-sm">
              1. Rating Ledger &amp; Match History Immutability
            </strong>
            <p className="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
              Completed doubles matches, scores, and sequential order numbers are
              immutable historical facts. Because all Elo ratings and leaderboard
              standings are mathematically derived from past matches, match history
              cannot be silently erased without corrupting all subsequent ratings.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col gap-1">
            <strong className="text-white font-semibold text-xs sm:text-sm">
              2. Account Deletion &amp; Player Profile Unlinking
            </strong>
            <p className="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
              If a member departs or requests account deletion, their login
              authentication record is removed and their membership status
              transitions to <code className="text-slate-300">departed</code>. The
              player profile remains with{' '}
              <code className="text-slate-300">linked_player_id = NULL</code>,
              preserving historical match scorecards and group rating integrity
              while severing all personal authentication credentials.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col gap-1">
            <strong className="text-white font-semibold text-xs sm:text-sm">
              3. Confidentiality of Contact Details &amp; Invitations
            </strong>
            <p className="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
              Member email addresses and raw invitation tokens are never displayed
              to other players or sent in client-side data.
              Invitation links are single-use and securely encrypted before database
              storage.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Preferences & Account Settings Section */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 shadow-xl flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Settings size={20} className="text-slate-400" />
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Preferences &amp; Account
          </h3>
        </div>

        <div className="flex flex-col gap-3">
          {/* Theme Selection */}
          {onSelectTheme && (
            <div className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <SunMoon size={18} className="text-slate-400" />
                <div>
                  <strong className="text-xs sm:text-sm font-semibold text-white block">
                    Display Theme
                  </strong>
                  <span className="text-[11px] text-slate-400 block">
                    Switch between Dark, Light, or follow system
                  </span>
                </div>
              </div>

              <select
                aria-label="Profile theme select"
                value={theme ?? 'dark'}
                onChange={(e) =>
                  onSelectTheme(e.target.value as 'system' | 'light' | 'dark')
                }
                className="bg-[#101722] text-slate-200 text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500"
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          )}

          {/* Admin Tools Button (Restricted to Admin/Owner only) */}
          {(snapshot.viewerMembership.role === 'admin' ||
            snapshot.viewerMembership.role === 'owner') &&
            onOpenAdminTools && (
              <div className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <strong className="text-xs sm:text-sm font-semibold text-white block">
                    Admin &amp; Owner Tools
                  </strong>
                  <span className="text-[11px] text-slate-400 block">
                    Manage invitations, promotions, and merges
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onOpenAdminTools}
                  data-testid="toggle-admin-tools-profile-btn"
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors cursor-pointer flex-shrink-0"
                >
                  Open Admin Tools
                </button>
              </div>
            )}

          {/* Sign Out Button */}
          {onSignOut && !snapshot.isDemoMode && (
            <div className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <LogOut size={18} className="text-rose-400" />
                <div>
                  <strong className="text-xs sm:text-sm font-semibold text-white block">
                    Account Session
                  </strong>
                  <span className="text-[11px] text-slate-400 block">
                    Sign out from this device
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onSignOut}
                className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer flex-shrink-0"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
