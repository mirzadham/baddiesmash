import { runSyntheticEloStudy } from '../src/domain/simulation.ts';

const result = runSyntheticEloStudy(20261017);

console.log('=== Synthetic Elo Simulation Study (Seed: 20261017) ===');
console.log(
  `Season Independence Verified: ${result.seasonIndependenceVerified}`,
);
console.log(
  `Disputed Match Eligibility Verified: ${result.disputedMatchIncludedVerified}`,
);
console.log('');

const rows = Array.from(result.metricsByK.values()).map((m) => ({
  K: m.kFactor,
  'Spearman @10s': m.spearmanAtSession10,
  'Spearman @20s': m.spearmanAtSession20,
  'Spearman @40s': m.spearmanAtSession40,
  'RMSE @40s': m.rmseRegularsAtSession40,
  'Spread @40s': m.ratingSpreadAtSession40,
  'Max Match Delta': m.maxSingleMatchDelta,
  'Max Session Swing': m.maxSingleSessionPlayerSwing,
  'Newcomer -> Top 4 (matches)': m.newcomerMatchesToTop4,
  'Newcomer Rating @40s': m.newcomerRatingAtSession40,
  'Post-Fixed Recovery -> 1100': m.postFixedPairRecoveryMatchesTo1100,
  'Net Zero-Sum Drift': m.totalNetDriftFromBaselineScaled.toString(),
  'Replay Determinism': m.replayDeterminismVerified,
}));

console.table(rows);
