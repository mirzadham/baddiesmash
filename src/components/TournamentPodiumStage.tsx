import { TrendingUp } from 'lucide-react';
import type { AllTimeLeaderboardRow } from '../domain/standings.ts';
import { CrownGold, Svg3DPodiumStage } from './icons/DesignerBadmintonIcons.tsx';

export interface TournamentPodiumStageProps {
  top1: AllTimeLeaderboardRow | null;
  top2: AllTimeLeaderboardRow | null;
  top3: AllTimeLeaderboardRow | null;
  onSelectPlayer: (playerId: string) => void;
}

function getPlayerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const second = parts[1];
  if (first && second && first[0] && second[0]) {
    return (first[0] + second[0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Authentic 3D Stepped Tournament Award Stage.
 * Features a custom-illustrated 3D isometric vector SVG podium stage
 * with metallic specular lighting, embossed Olympic Roman medallions,
 * floating crown, and stepped contestant positions.
 */
export function TournamentPodiumStage({
  top1,
  top2,
  top3,
  onSelectPlayer,
}: TournamentPodiumStageProps) {
  if (!top1 && !top2 && !top3) {
    return null;
  }

  return (
    <div className="tournament-stage-wrapper">
      {/* Background Stage Spotlight Beam */}
      <div className="stage-spotlight" />

      {/* Stepped Contestants (resting above their respective 3D podium tiers) */}
      <div className="stage-contestants">
        {/* 2nd Place Contestant (Left - Silver Tier) */}
        <div className="stage-contestant contestant-2">
          {top2 ? (
            <>
              <div className="avatar-wrap avatar-wrap-2">
                <div className="stage-avatar stage-avatar-2">
                  {getPlayerInitials(top2.displayName)}
                </div>
              </div>

              <button
                type="button"
                className="stage-name-btn"
                onClick={() => onSelectPlayer(top2.playerId)}
                title={top2.displayName}
              >
                {top2.displayName}
              </button>

              <div className="stage-rating-volt">
                <TrendingUp size={13} />
                <span className="rating-mono">{top2.ratingDisplay}</span>
              </div>
              <span className="stage-sub-stat">{top2.winRatePercentDisplay} Win</span>
            </>
          ) : (
            <div style={{ height: '90px' }} />
          )}
        </div>

        {/* 1st Place Champion (Center - Gold Towering Tier) */}
        <div className="stage-contestant contestant-1">
          {top1 ? (
            <>
              {/* Royal Gold Crown Floating Above Champion */}
              <div className="stage-crown-wrap">
                <CrownGold size={36} />
              </div>

              <div className="avatar-wrap avatar-wrap-1">
                <div className="stage-avatar stage-avatar-1">
                  {getPlayerInitials(top1.displayName)}
                </div>
              </div>

              <button
                type="button"
                className="stage-name-btn stage-name-champion"
                onClick={() => onSelectPlayer(top1.playerId)}
                title={top1.displayName}
              >
                {top1.displayName}
              </button>

              <div className="stage-rating-volt stage-rating-champion">
                <TrendingUp size={16} />
                <span className="rating-mono">{top1.ratingDisplay}</span>
              </div>
              <span className="stage-sub-stat stage-sub-champion">
                {top1.winRatePercentDisplay} Win Rate
              </span>
            </>
          ) : (
            <div style={{ height: '130px' }} />
          )}
        </div>

        {/* 3rd Place Contestant (Right - Bronze Tier) */}
        <div className="stage-contestant contestant-3">
          {top3 ? (
            <>
              <div className="avatar-wrap avatar-wrap-3">
                <div className="stage-avatar stage-avatar-3">
                  {getPlayerInitials(top3.displayName)}
                </div>
              </div>

              <button
                type="button"
                className="stage-name-btn"
                onClick={() => onSelectPlayer(top3.playerId)}
                title={top3.displayName}
              >
                {top3.displayName}
              </button>

              <div className="stage-rating-volt">
                <TrendingUp size={13} />
                <span className="rating-mono">{top3.ratingDisplay}</span>
              </div>
              <span className="stage-sub-stat">{top3.winRatePercentDisplay} Win</span>
            </>
          ) : (
            <div style={{ height: '80px' }} />
          )}
        </div>
      </div>

      {/* The 3D Vector SVG Stepped Tournament Podium */}
      <div className="stage-podium-svg-wrap">
        <Svg3DPodiumStage />
      </div>

      {/* Floor Bevel Reflection Line */}
      <div className="stage-floor-beam" />
    </div>
  );
}
