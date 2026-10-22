import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, UserPlus, Users, AlertTriangle } from 'lucide-react';
import type { DbPlayerRow } from '../../types/database.ts';
import { PlayerAvatar } from '../leaderboard/PlayerAvatar.tsx';
import { StatusBadge } from '../StatusBadge.tsx';

export interface AttendanceSectionProps {
  attendees: DbPlayerRow[];
  benchAttendees: DbPlayerRow[];
  canEditAttendance: boolean;
  onOpenCheckInModal?: () => void;
  onOpenAddGuestModal?: () => void;
  onSelectPlayer: (playerId: string) => void;
  // Extended attendance roster props
  allGroupPlayers?: DbPlayerRow[];
  presentAttendeeIds?: Set<string>;
  playedInSessionPlayerIds?: Set<string>;
  onToggleAttendance?: (playerId: string, present: boolean) => void;
  togglingAttendancePlayerId?: string | null;
  isDemoMode?: boolean;
  newGuestDisplayName?: string;
  onNewGuestDisplayNameChange?: (val: string) => void;
  duplicateGuestNameExists?: boolean;
  isCreatingGuest?: boolean;
  onCreateGuestAndCheckIn?: (e: React.FormEvent) => void;
}

/**
 * Attendance & Bench Section matching session_new_2.jfif:
 * - Header: "Attendance" with "+ Check-In" and "+ Guest" action buttons
 * - Subtitle: "{total} Attendees • {benchCount} on Bench (0 Matches)"
 * - Visual row: Avatar cluster of attendees + clickable bench badges
 * - Sleek Attendance Roster & Drop-In Guest Form
 */
export function AttendanceSection({
  attendees,
  benchAttendees,
  canEditAttendance,
  onOpenCheckInModal,
  onOpenAddGuestModal,
  onSelectPlayer,
  allGroupPlayers = [],
  presentAttendeeIds = new Set(),
  playedInSessionPlayerIds = new Set(),
  onToggleAttendance,
  togglingAttendancePlayerId = null,
  isDemoMode = false,
  newGuestDisplayName = '',
  onNewGuestDisplayNameChange,
  duplicateGuestNameExists = false,
  isCreatingGuest = false,
  onCreateGuestAndCheckIn,
}: AttendanceSectionProps) {
  const [isRosterExpanded, setIsRosterExpanded] = useState(true);
  const visibleAvatars = attendees.slice(0, 6);
  const remainingCount = attendees.length - visibleAvatars.length;

  return (
    <div
      data-testid="session-attendance-panel"
      className="py-3 px-4 border-b border-slate-800/80 flex flex-col gap-2.5"
    >
      {/* Section Header with Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-sm sm:text-base text-slate-200">
          <Users size={16} className="text-emerald-400" />
          <span>Attendance</span>
        </div>

        {canEditAttendance && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsRosterExpanded(true);
                onOpenCheckInModal?.();
              }}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <Plus size={12} strokeWidth={2.5} />
              <span>Check-In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRosterExpanded(true);
                onOpenAddGuestModal?.();
              }}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <UserPlus size={12} strokeWidth={2.5} />
              <span>Guest</span>
            </button>
          </div>
        )}
      </div>

      {/* Attendance & Bench Metrics */}
      <div
        className="text-xs text-slate-400 font-normal flex items-center gap-1.5 flex-wrap"
        data-testid="session-bench-attendance"
      >
        <span>{attendees.length} Attendees</span>
        <span>•</span>
        <span
          className={
            benchAttendees.length > 0
              ? 'text-amber-400 font-medium'
              : 'text-slate-400'
          }
        >
          {benchAttendees.length} on Bench (0 Matches)
        </span>
      </div>

      {/* Avatar Cluster & Bench Indicators */}
      <div className="flex items-center gap-3 overflow-x-auto py-1 scrollbar-none">
        {/* Overlapping Avatar Stack */}
        <div className="flex items-center -space-x-2 flex-shrink-0">
          {visibleAvatars.map((player) => (
            <div
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              className="cursor-pointer transition-transform hover:scale-110 hover:z-10 rounded-full border border-slate-900"
              title={player.display_name}
            >
              <PlayerAvatar
                displayName={player.display_name}
                playerId={player.id}
                size={30}
              />
            </div>
          ))}
          {remainingCount > 0 && (
            <div className="w-[30px] h-[30px] rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0">
              +{remainingCount}
            </div>
          )}
        </div>

        {/* Bench Player Pills */}
        {benchAttendees.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap py-0.5">
            {benchAttendees.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPlayer(p.id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:border-amber-400 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>{p.display_name} (Bench)</span>
              </button>
            ))}
            {benchAttendees.length > 4 && (
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                +{benchAttendees.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Inline Roster & Temporary Guest Manager */}
      {allGroupPlayers.length > 0 && (
        <div className="mt-1 pt-2 border-t border-slate-800/60 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Check-In Roster ({allGroupPlayers.length} members)
            </span>
            <button
              type="button"
              onClick={() => setIsRosterExpanded((prev) => !prev)}
              className="text-slate-400 hover:text-white transition-colors p-1"
              aria-label={isRosterExpanded ? 'Collapse roster' : 'Expand roster'}
            >
              {isRosterExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {isRosterExpanded && (
            <div className="flex flex-col gap-2.5">
              {/* Player Check-in Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {allGroupPlayers.map((player) => {
                  const isPresent = presentAttendeeIds.has(player.id);
                  const playedInSession = playedInSessionPlayerIds.has(player.id);

                  return (
                    <div
                      key={player.id}
                      data-testid={`attendance-row-${player.id}`}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-colors ${
                        isPresent
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-[#16202e] border-slate-800/80 opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar
                          displayName={player.display_name}
                          playerId={player.id}
                          size={24}
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-white truncate block">
                              {player.display_name}
                            </span>
                            {player.is_guest && <StatusBadge variant="guest" />}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {isPresent ? 'Present' : 'Absent'}
                            {playedInSession ? ' • Played' : ''}
                          </span>
                        </div>
                      </div>

                      {canEditAttendance && onToggleAttendance && (
                        <button
                          type="button"
                          data-testid={`attendance-toggle-${player.id}`}
                          disabled={
                            isDemoMode ||
                            togglingAttendancePlayerId === player.id
                          }
                          onClick={() =>
                            onToggleAttendance(player.id, !isPresent)
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex-shrink-0 ${
                            isPresent
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          }`}
                        >
                          {isPresent ? 'Remove' : 'Check In'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Temporary Drop-In Guest Form */}
              {canEditAttendance && onCreateGuestAndCheckIn && (
                <form
                  onSubmit={onCreateGuestAndCheckIn}
                  data-testid="session-create-guest-form"
                  className="mt-1 pt-2 border-t border-slate-800/60 flex flex-col gap-1.5"
                >
                  <label
                    htmlFor="session-guest-name-input"
                    className="text-[11px] font-semibold text-slate-300"
                  >
                    Add Drop-In Temporary Guest to Session:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="session-guest-name-input"
                      type="text"
                      placeholder="Guest display name (e.g. Kelvin Drop-In)"
                      value={newGuestDisplayName}
                      onChange={(e) =>
                        onNewGuestDisplayNameChange?.(e.target.value)
                      }
                      data-testid="session-guest-name-input"
                      className="flex-1 bg-[#101722] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isDemoMode || isCreatingGuest}
                      data-testid="session-create-guest-btn"
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
                    >
                      {isCreatingGuest ? 'Adding...' : '+ Create Guest'}
                    </button>
                  </div>

                  {duplicateGuestNameExists && (
                    <p
                      role="note"
                      data-testid="guest-duplicate-name-warning"
                      className="text-[11px] text-amber-300 font-medium flex items-center gap-1"
                    >
                      <AlertTriangle size={12} className="shrink-0" />
                      <span>
                        A player with this name exists in this group. Creating
                        a guest creates a separate UUID identity and will never
                        automatically merge profiles.
                      </span>
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
