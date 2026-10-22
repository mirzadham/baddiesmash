import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { StatusBadge } from '../StatusBadge.tsx';
import type { DbSessionRow } from '../../types/database.ts';
import type { EnrichedMatchCard } from '../../services/readViewModels.ts';
import { formatMalaysiaDate } from '../../services/readViewModels.ts';

export interface PastSessionAccordionCardProps {
  session: DbSessionRow;
  matches: readonly EnrichedMatchCard[];
  attendeeCount: number;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (isExpanding: boolean) => void;
  isAdminOrOwner?: boolean;
  onSelectSession: (sessionId: string) => void;
  onSelectPlayer: (playerId: string) => void;
  onRequestReopen?: (sessionId: string) => void;
}

/**
 * Past Session Collapsible Accordion Card matching new ui design/sessions.jfif
 * - Header: "Session - Monday, Oct 19, 2026", [Completed] badge, chevron
 * - Subtitle: "12 Attendees • 8 Matches Completed"
 * - Expanded content: Match list with player names, scores, court badges
 */
export function PastSessionAccordionCard({
  session,
  matches,
  attendeeCount,
  isSelected = false,
  isExpanded: controlledExpanded,
  onToggleExpand,
  isAdminOrOwner = false,
  onSelectSession,
  onSelectPlayer,
  onRequestReopen,
}: PastSessionAccordionCardProps) {
  const [internalExpanded, setInternalExpanded] = useState<boolean>(false);
  const isExpanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const completedMatches = matches.filter(
    (m) => m.match.status === 'completed',
  );

  const handleToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const next = !isExpanded;
    if (onToggleExpand) {
      onToggleExpand(next);
    } else {
      setInternalExpanded(next);
    }
    // Only select session (and trigger scroll-to-top) when expanding!
    // When minimizing (closing), do NOT call onSelectSession, so user stays in place.
    if (next) {
      onSelectSession(session.id);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent toggle if clicking on an interactive child button or link
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    if (!isExpanded) {
      if (onToggleExpand) {
        onToggleExpand(true);
      } else {
        setInternalExpanded(true);
      }
      onSelectSession(session.id);
    }
  };

  return (
    <div
      data-testid={`session-card-${session.id}`}
      onClick={handleCardClick}
      className={`rounded-2xl border ${
        isSelected ? 'border-emerald-500/60 bg-[#14202d]' : 'border-slate-800/80 bg-[#121a24]'
      } transition-colors duration-200 overflow-hidden mb-3 hover:border-slate-700/80 cursor-pointer`}
    >
      {/* Accordion Header (Clickable) */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        className="w-full text-left p-4 sm:p-4.5 cursor-pointer flex flex-col gap-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        style={{ background: 'transparent', border: 'none' }}
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="font-semibold text-sm sm:text-base text-white tracking-tight">
            Session: {formatMalaysiaDate(session.session_started_at)}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge
              variant={
                session.status === 'reopened'
                  ? 'reopened_session'
                  : session.status === 'active'
                  ? 'active_session'
                  : 'completed_session'
              }
            />
            <span className="text-slate-400 hover:text-white transition-colors">
              {isExpanded ? (
                <ChevronUp size={18} strokeWidth={2.5} />
              ) : (
                <ChevronDown size={18} strokeWidth={2.5} />
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-normal">
          <span className="flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {attendeeCount} Attendees
          </span>
          <span>•</span>
          <span>{completedMatches.length} Matches Completed</span>
        </div>
      </button>

      {/* Expanded Match Content (matches sessions.jfif) */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 flex flex-col gap-2.5">
          {completedMatches.length === 0 ? (
            <div className="py-3 text-center text-xs text-slate-500 italic">
              No completed matches recorded in this session.
            </div>
          ) : (
            completedMatches.map((card) => {
              const teamAWon = card.winnerSide === 'A';
              const pA1 = card.teamA[0];
              const pA2 = card.teamA[1];
              const pB1 = card.teamB[0];
              const pB2 = card.teamB[1];
              return (
                <div
                  key={card.match.id}
                  className="rounded-xl border border-slate-800/60 bg-[#16202e] p-3 flex flex-col gap-1.5 transition-colors hover:border-slate-700/60"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span className="text-emerald-400/90 font-semibold">
                      Match #{card.match.sequence_number}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
                      Doubles • Court 1
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:gap-4 bg-[#101722] p-2.5 rounded-lg border border-slate-800/80">
                    {/* Left Team */}
                    <div className="flex-1 min-w-0 text-left">
                      <span className={`text-xs sm:text-sm leading-snug truncate block ${teamAWon ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                        <button
                          type="button"
                          onClick={() => pA1 && onSelectPlayer(pA1.playerId)}
                          className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer inline"
                        >
                          {pA1?.displayName ?? 'Player A1'}
                        </button>
                        <span className="mx-1 text-slate-500 font-normal">&amp;</span>
                        <button
                          type="button"
                          onClick={() => pA2 && onSelectPlayer(pA2.playerId)}
                          className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer inline"
                        >
                          {pA2?.displayName ?? 'Player A2'}
                        </button>
                      </span>
                    </div>

                    {/* Scores (Center) */}
                    <div className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-[#16202e] border border-slate-700/60 font-bold rating-mono text-xs sm:text-sm flex items-center justify-center gap-1.5">
                      <span className={teamAWon ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}>
                        {card.match.team_a_score ?? 0}
                      </span>
                      <span className="text-slate-500 font-normal text-xs">-</span>
                      <span className={!teamAWon ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}>
                        {card.match.team_b_score ?? 0}
                      </span>
                    </div>

                    {/* Right Team */}
                    <div className="flex-1 min-w-0 text-right">
                      <span className={`text-xs sm:text-sm leading-snug truncate block ${!teamAWon ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                        <button
                          type="button"
                          onClick={() => pB1 && onSelectPlayer(pB1.playerId)}
                          className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer inline"
                        >
                          {pB1?.displayName ?? 'Player B1'}
                        </button>
                        <span className="mx-1 text-slate-500 font-normal">&amp;</span>
                        <button
                          type="button"
                          onClick={() => pB2 && onSelectPlayer(pB2.playerId)}
                          className="hover:text-emerald-400 transition-colors bg-transparent border-0 p-0 cursor-pointer inline"
                        >
                          {pB2?.displayName ?? 'Player B2'}
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Admin Reopen Action (if session is completed and viewer is Admin/Owner) */}
          {session.status === 'completed' && isAdminOrOwner && onRequestReopen && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onRequestReopen(session.id)}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 transition-colors cursor-pointer"
                data-testid="reopen-session-btn"
              >
                <RotateCcw size={12} strokeWidth={2.5} />
                <span>Reopen Session (Admin)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
