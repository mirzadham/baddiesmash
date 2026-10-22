import React from 'react';
import { ShieldCheck, X, Users, UserPlus, Sliders } from 'lucide-react';

export type AdminCategoryTab = 'all' | 'members' | 'players' | 'system';

export interface AdminHeaderProps {
  activeCategory: AdminCategoryTab;
  onSelectCategory: (category: AdminCategoryTab) => void;
  pendingCount: number;
  onClose: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeCategory,
  onSelectCategory,
  pendingCount,
  onClose,
}) => {
  const tabs: Array<{ id: AdminCategoryTab; label: string; icon: React.ReactNode; badge?: number | undefined }> = [
    { id: 'all', label: 'All Tools', icon: <Sliders size={13} /> },
    {
      id: 'members',
      label: 'Members & Invites',
      icon: <Users size={13} />,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { id: 'players', label: 'Players & Roster', icon: <UserPlus size={13} /> },
    { id: 'system', label: 'Club & System', icon: <ShieldCheck size={13} /> },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#0d131f] border-b border-slate-800 pb-3 mb-4">
      {/* Top Bar with Title and Close Button */}
      <div className="flex items-center justify-between gap-3 pt-1 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2
              id="admin-governance-heading"
              className="text-base sm:text-lg font-bold text-white tracking-tight m-0 flex items-center gap-2"
            >
              Admin &amp; Governance
            </h2>
            <p className="text-[11px] text-slate-400 m-0">
              Club organizer tools &amp; membership management
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close admin tools"
          data-testid="close-admin-panel-btn"
          className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Segmented Category Pill Switcher */}
      <div
        role="group"
        aria-label="Filter admin tools by category"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1"
      >
        {tabs.map((tab) => {
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectCategory(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-[#16202e] text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
