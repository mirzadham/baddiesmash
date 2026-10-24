import { useMemo, useState } from 'react';
import { Download, LogOut, Settings, Share, Smartphone } from 'lucide-react';
import { ProfileHeroCard } from '../components/profile/ProfileHeroCard.tsx';
import { AvatarUploadModal } from '../components/profile/AvatarUploadModal.tsx';
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
import { usePwaInstall } from '../lib/pwa.ts';

export interface ProfileViewProps {
  snapshot: GroupReadSnapshot;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onOpenAdminTools?: () => void;
  onUpdateAvatar?: (file: File) => Promise<void>;
  onSignOut?: () => void;
}

/**
 * Player Profile & Match History View (`ID-01`, `RATE-04`, `RATE-06`, `DEC-036`, `DEC-044`, `DEC-052`, `PRIV-02`):
 * - Redesigned to match the athletic dark sports aesthetic in `profile.jfif`.
 * - Exposes the signed-in user's linked player profile first (or explains Viewer-only status
 *   when `linked_player_id === null` per `ID-01`).
 * - Exposes the publication health banner (`Current`, `Recalculating`, `Stale/Failed`).
 * - Displays 2x2 Performance Grid (Total Points, Win Rate, Win Streak, Recent Form, Attendance Rate).
 * - Displays H2H Rivalry & Partnerships with visual split comparison bars.
 * - Displays mobile-first Match History cards with filters.
 */
export function ProfileView({
  snapshot,
  selectedPlayerId,
  onSelectPlayer,
  onOpenAdminTools,
  onUpdateAvatar,
  onSignOut,
}: ProfileViewProps) {
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('all');
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>('');
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState<boolean>(false);

  const { canInstall, isStandalone, isIos, triggerInstallPrompt } = usePwaInstall();

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
            onOpenAvatarUpload={() => setIsAvatarModalOpen(true)}
          />

          {/* Avatar Upload Modal with 1-Year Cooldown */}
          <AvatarUploadModal
            player={selectedPlayerRecord}
            isOpen={isAvatarModalOpen}
            onClose={() => setIsAvatarModalOpen(false)}
            onSaveAvatar={async (file) => {
              if (onUpdateAvatar) {
                await onUpdateAvatar(file);
              }
            }}
            isAdmin={
              snapshot.viewerMembership.role === 'admin' ||
              snapshot.viewerMembership.role === 'owner'
            }
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

      {/* 4. Preferences & Account Settings Section */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[#121a24] border border-slate-800 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Settings size={20} className="text-slate-400" />
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Preferences &amp; Account
          </h3>
        </div>

        <div className="flex flex-col gap-3">
          {/* PWA Home Screen Installation Guidance (DEC-056, DEC-066, Phase 33) */}
          {isStandalone ? (
            <div
              className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex items-center justify-between gap-3"
              data-testid="pwa-installed-card"
            >
              <div className="flex items-center gap-2.5">
                <Smartphone size={18} className="text-emerald-400" />
                <div>
                  <strong className="text-xs sm:text-sm font-semibold text-white block">
                    App Installed
                  </strong>
                  <span className="text-[11px] text-emerald-400/90 block">
                    Running as standalone mobile app
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                Active
              </span>
            </div>
          ) : canInstall ? (
            <div
              className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex items-center justify-between gap-3"
              data-testid="pwa-install-prompt-card"
            >
              <div className="flex items-center gap-2.5">
                <Download size={18} className="text-emerald-400" />
                <div>
                  <strong className="text-xs sm:text-sm font-semibold text-white block">
                    Install BADDIESMASH
                  </strong>
                  <span className="text-[11px] text-slate-400 block">
                    Install to home screen for 1-tap courtside access
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={triggerInstallPrompt}
                data-testid="pwa-install-btn"
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer flex-shrink-0"
              >
                Install
              </button>
            </div>
          ) : isIos ? (
            <div
              className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex flex-col gap-1.5"
              data-testid="pwa-ios-instructions-card"
            >
              <div className="flex items-center gap-2.5">
                <Share size={18} className="text-sky-400" />
                <strong className="text-xs sm:text-sm font-semibold text-white">
                  Install on iPhone / iPad
                </strong>
              </div>
              <span className="text-[11px] text-slate-400 leading-relaxed">
                Tap <span className="font-semibold text-slate-200">Share</span> in Safari, then select{' '}
                <span className="font-semibold text-emerald-400">Add to Home Screen</span> for 1-tap access.
              </span>
            </div>
          ) : (
            <div
              className="p-3 rounded-xl bg-[#16202e] border border-slate-800 flex items-center justify-between gap-3"
              data-testid="pwa-supported-card"
            >
              <div className="flex items-center gap-2.5">
                <Smartphone size={18} className="text-slate-400" />
                <div>
                  <strong className="text-xs sm:text-sm font-semibold text-white block">
                    Mobile Web App (PWA)
                  </strong>
                  <span className="text-[11px] text-slate-400 block">
                    Optimized for fast courtside mobile browser use
                  </span>
                </div>
              </div>
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
