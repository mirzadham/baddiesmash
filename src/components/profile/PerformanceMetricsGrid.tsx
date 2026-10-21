import React from 'react';
import type { deriveLeaderboardFromSnapshot } from '../../services/readViewModels.ts';

export type LeaderboardRow = ReturnType<typeof deriveLeaderboardFromSnapshot>[number];

export interface PerformanceMetricsGridProps {
  selectedRow: LeaderboardRow;
  recentForm: Array<'W' | 'L'>;
  winStreak: number;
}

export const PerformanceMetricsGrid: React.FC<PerformanceMetricsGridProps> = ({
  selectedRow,
  recentForm,
  winStreak,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {/* 2x2 Card Grid matching profile.jfif */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {/* Card 1: Recent Form (Last 5) */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#121a24] border border-sky-500/30 flex flex-col justify-between shadow-sm">
          <div className="text-[11px] sm:text-xs font-semibold text-slate-400">
            Recent Form <span className="text-[10px] text-slate-500">(Last 5)</span>
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {recentForm.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No matches</span>
            ) : (
              recentForm.map((res, i) => (
                <span
                  key={i}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-black text-xs shadow-sm ${
                    res === 'W'
                      ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                      : 'bg-rose-500 text-white shadow-rose-500/20'
                  }`}
                >
                  {res}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Card 2: Win Rate */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#121a24] border border-sky-500/30 flex flex-col justify-between shadow-sm">
          <div className="text-[11px] sm:text-xs font-semibold text-slate-400">
            Win Rate:
          </div>

          <div className="mt-1">
            <div className="text-xl sm:text-2xl font-black text-white rating-mono">
              {selectedRow.winRatePercentDisplay}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {selectedRow.wins}W – {selectedRow.losses}L
            </div>
          </div>
        </div>

        {/* Card 3: Win Streak */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#121a24] border border-sky-500/30 flex flex-col justify-between shadow-sm">
          <div className="text-[11px] sm:text-xs font-semibold text-slate-400">
            Win Streak:
          </div>

          <div className="mt-1">
            <div className="text-xl sm:text-2xl font-black text-white rating-mono">
              {winStreak} {winStreak === 1 ? 'Game' : 'Games'}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {winStreak > 0 ? 'Active streak' : 'No active streak'}
            </div>
          </div>
        </div>

        {/* Card 4: Total Points / Elo Rating */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#121a24] border border-sky-500/30 flex flex-col justify-between shadow-sm">
          <div className="text-[11px] sm:text-xs font-semibold text-slate-400">
            Total Points:
          </div>

          <div className="mt-1">
            <div className="text-xl sm:text-2xl font-black text-white rating-mono">
              {selectedRow.ratingDisplay}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
              Exact: {selectedRow.ratingNumeric4}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Metric Bar */}
      <div className="py-2 px-3.5 rounded-xl bg-[#121a24] border border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span className="font-semibold text-slate-300">
          Attendance Rate:
        </span>
        <span className="font-bold text-emerald-400 rating-mono">
          {selectedRow.attendanceRatePercentDisplay ?? '0.0% (0/0)'}
        </span>
      </div>
    </div>
  );
};
