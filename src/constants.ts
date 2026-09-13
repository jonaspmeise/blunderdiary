export const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const BOARD_RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
export const BOARD_DIMENSION = BOARD_FILES.length;
export const MAX_RECENT_ARCHIVES = 3;
export const MAX_PROBLEMS_PER_MATCH = 1;
export const ENGINE_DEPTH = 13;
export const ENGINE_MULTI_PV = 3;
export const ENGINE_READY_TIMEOUT_MS = 15_000;
export const OPPONENT_MOVE_START_DELAY_MS = 120;
export const OPPONENT_MOVE_ANIMATION_MS = 360;
export const REVEAL_MOVE_PREVIEW_MS = 900;
export const ANALYSIS_VERSION = 7;
export const HOUR_MS = 60 * 60 * 1_000;
export const DAY_MS = 24 * HOUR_MS;
export const SKIPPED_REVIEW_DELAY_MS = HOUR_MS;
export const INITIAL_REVIEW_INTERVAL_DAYS = 1;
export const BEST_MOVE_INTERVAL_MULTIPLIER = 2.25;
export const GOOD_MOVE_INTERVAL_MULTIPLIER = 1.4;
export const CENTIPAWNS_PER_PAWN = 100;
export const ISSUE_LOSS_THRESHOLDS = {
  blunder: 350,
  mistake: 175,
  inaccuracy: 90,
} as const;
export const MINIMUM_REVIEW_LOSS = 1;
export const REVIEW_LOSS_THRESHOLDS = { best: 0.1, good: 0.25 } as const;
export const REVIEW_SEVERITY_WINDOW = 0.5;
export const EVALUATION_BAR = { minimum: 12, maximum: 88, center: 50, percentPerPawn: 8 } as const;
