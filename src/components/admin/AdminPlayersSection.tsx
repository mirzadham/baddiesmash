import React, { useState } from 'react';
import { UserPlus, Users, UserX, ShieldAlert, Sparkles, ChevronDown, ListFilter } from 'lucide-react';
import { StatusBadge } from '../StatusBadge';

export interface AdminPlayerItem {
  id: string;
  display_name: string;
  is_guest: boolean;
  is_active: boolean;
}

interface AdminPlayersSectionProps {
  unmergedPlayers: AdminPlayerItem[];
  newPlayerDisplayName: string;
  setNewPlayerDisplayName: (val: string) => void;
  newPlayerIsGuest: boolean;
  setNewPlayerIsGuest: (val: boolean) => void;
  duplicateNameWarning: boolean;
  handleCreatePlayerProfile: (e: React.FormEvent) => Promise<void>;
  playerStatusReasons: Record<string, string>;
  setPlayerStatusReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleTogglePlayerActiveStatus: (playerId: string, nextActive: boolean) => Promise<void>;
  isDemoMode: boolean;
  isMutating: boolean;
}

export function AdminPlayersSection({
  unmergedPlayers,
  newPlayerDisplayName,
  setNewPlayerDisplayName,
  newPlayerIsGuest,
  setNewPlayerIsGuest,
  duplicateNameWarning,
  handleCreatePlayerProfile,
  playerStatusReasons,
  setPlayerStatusReasons,
  handleTogglePlayerActiveStatus,
  isDemoMode,
  isMutating,
}: AdminPlayersSectionProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [showAllList, setShowAllList] = useState<boolean>(false);

  const activeCount = unmergedPlayers.filter((p) => p.is_active).length;
  const inactiveCount = unmergedPlayers.filter((p) => !p.is_active).length;
  const guestCount = unmergedPlayers.filter((p) => p.is_guest).length;

  // Selected player defaults to first player if not set or invalid
  const selectedPlayer =
    unmergedPlayers.find((p) => p.id === selectedPlayerId) ??
    (unmergedPlayers.length > 0 ? unmergedPlayers[0] : null);

  const currentReason = selectedPlayer ? playerStatusReasons[selectedPlayer.id] ?? '' : '';
  const isReasonValid = currentReason.trim().length >= 3;

  return (
    <div
      data-testid="admin-section-players"
      className="bg-[#121c28] border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden"
    >
      {/* Decorative accent glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Users size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-full">
                Roster Control
              </span>
              <span className="text-xs text-slate-500">Section 3</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
              Player Profiles &amp; Roster
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {activeCount} Active
          </span>
          {inactiveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs font-semibold text-slate-400">
              {inactiveCount} Inactive
            </span>
          )}
          {guestCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300">
              {guestCount} Guests
            </span>
          )}
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-400 mt-3 mb-5 leading-relaxed">
        Permanent player profiles and temporary guests can exist before or without user accounts.
        Duplicate display names are kept as separate profiles and are never automatically linked or merged.
      </p>

      {/* Create Player Profile Box */}
      <div className="bg-[#0b121b] border border-slate-800 rounded-xl p-4 sm:p-5 mb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
          <UserPlus size={14} className="text-cyan-400" />
          Create New Player Profile
        </div>

        <form onSubmit={(e) => void handleCreatePlayerProfile(e)} noValidate>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <label
                htmlFor="admin-create-player-name"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                New Player Display Name
              </label>
              <input
                id="admin-create-player-name"
                type="text"
                value={newPlayerDisplayName}
                onChange={(e) => setNewPlayerDisplayName(e.target.value)}
                disabled={isDemoMode || isMutating}
                placeholder="e.g. Marcus Lim"
                className="w-full h-11 px-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
              />
            </div>

            <div className="md:col-span-3 flex items-center h-11">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={newPlayerIsGuest}
                  onChange={(e) => setNewPlayerIsGuest(e.target.checked)}
                  disabled={isDemoMode || isMutating}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                />
                <span>Temporary Guest</span>
              </label>
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={isDemoMode || isMutating || !newPlayerDisplayName.trim()}
                data-testid="create-player-submit-btn"
                className="w-full h-11 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.98] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={14} />
                Create Profile
              </button>
            </div>
          </div>

          {duplicateNameWarning && (
            <div
              role="note"
              data-testid="duplicate-player-name-warning"
              className="mt-3.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5 leading-relaxed"
            >
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <strong>Notice:</strong> An existing player in this group already has the display name &ldquo;
                {newPlayerDisplayName.trim()}&rdquo;. Creating this profile will assign a separate unique profile ID and will never automatically merge or link by display name.
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Roster Control Dropdown & Focused Management Card */}
      <div className="bg-[#0b121b] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <label
            htmlFor="admin-roster-player-select"
            className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2"
          >
            <ListFilter size={14} className="text-cyan-400" />
            Manage Roster Status
          </label>
          <span className="text-[11px] text-slate-500 font-mono">
            {unmergedPlayers.length} total profiles
          </span>
        </div>

        {unmergedPlayers.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl text-slate-500 text-xs">
            No player profiles found. Create the first profile above.
          </div>
        ) : (
          <>
            {/* Player Selector Dropdown */}
            <div className="relative mb-4">
              <select
                id="admin-roster-player-select"
                aria-label="Select player to manage status"
                value={selectedPlayer?.id ?? ''}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={isDemoMode || isMutating}
                className="w-full h-11 pl-3.5 pr-10 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50 cursor-pointer appearance-none"
              >
                {unmergedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} ({p.is_guest ? 'Guest' : 'Permanent'} • {p.is_active ? 'Active' : 'Inactive'})
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>

            {/* Selected Player Management Card */}
            {selectedPlayer && (
              <div
                key={selectedPlayer.id}
                data-testid={`admin-player-row-${selectedPlayer.id}`}
                className="p-4 bg-slate-900/80 border border-slate-700/80 rounded-xl hover:border-slate-600/80 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Identity info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm uppercase shrink-0 ${
                      selectedPlayer.is_guest
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                        : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
                    }`}
                  >
                    {selectedPlayer.display_name.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm sm:text-base truncate">
                        {selectedPlayer.display_name}
                      </span>
                      {selectedPlayer.is_guest && <StatusBadge variant="guest" />}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          selectedPlayer.is_active
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {selectedPlayer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                      <span>ID: {selectedPlayer.id.slice(-8)}</span>
                      <span>•</span>
                      <span>
                        {selectedPlayer.is_guest
                          ? 'Temporary Drop-in Guest'
                          : 'Permanent Player Profile'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status toggle with required audit reason */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    aria-label={`Status change reason for ${selectedPlayer.display_name}`}
                    placeholder="Reason (min 3 chars)"
                    value={currentReason}
                    onChange={(e) =>
                      setPlayerStatusReasons((prev) => ({
                        ...prev,
                        [selectedPlayer.id]: e.target.value,
                      }))
                    }
                    disabled={isDemoMode || isMutating}
                    className="h-10 px-3 bg-[#0b121b] border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors sm:w-56 disabled:opacity-50"
                  />

                  <button
                    type="button"
                    disabled={isDemoMode || isMutating || !isReasonValid}
                    onClick={() =>
                      void handleTogglePlayerActiveStatus(
                        selectedPlayer.id,
                        !selectedPlayer.is_active
                      )
                    }
                    data-testid={`toggle-player-active-btn-${selectedPlayer.id}`}
                    className={`h-10 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] ${
                      selectedPlayer.is_active
                        ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    {selectedPlayer.is_active ? (
                      <>
                        <UserX size={13} />
                        Set Inactive
                      </>
                    ) : (
                      <>
                        <UserPlus size={13} />
                        Set Active
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Expandable "View All Roster" drawer toggle */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Want to browse the complete roster list?
              </span>
              <button
                type="button"
                onClick={() => setShowAllList((prev) => !prev)}
                className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline flex items-center gap-1"
              >
                {showAllList ? 'Hide Full List' : `View All Roster (${unmergedPlayers.length})`}
              </button>
            </div>

            {/* Optional Full Roster View */}
            {showAllList && (
              <div className="grid gap-2.5 mt-4 pt-2 border-t border-slate-800/60 animate-in fade-in duration-200">
                {unmergedPlayers.map((p) => {
                  const reason = playerStatusReasons[p.id] ?? '';
                  const valid = reason.trim().length >= 3;

                  return (
                    <div
                      key={p.id}
                      data-testid={`admin-player-row-${p.id}`}
                      className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-700 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] uppercase shrink-0 ${
                            p.is_guest
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {p.display_name.slice(0, 2)}
                        </div>
                        <span className="font-bold text-white truncate">{p.display_name}</span>
                        {p.is_guest && <StatusBadge variant="guest" />}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            p.is_active
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label={`Status change reason for ${p.display_name}`}
                          placeholder="Reason (min 3 chars)"
                          value={reason}
                          onChange={(e) =>
                            setPlayerStatusReasons((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          disabled={isDemoMode || isMutating}
                          className="h-8 px-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 sm:w-44 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={isDemoMode || isMutating || !valid}
                          onClick={() =>
                            void handleTogglePlayerActiveStatus(p.id, !p.is_active)
                          }
                          data-testid={`toggle-player-active-btn-${p.id}`}
                          className={`h-8 px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none ${
                            p.is_active
                              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                          }`}
                        >
                          {p.is_active ? 'Set Inactive' : 'Set Active'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
