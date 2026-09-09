import {
  BEST_MOVE_INTERVAL_MULTIPLIER,
  DAY_MS,
  GOOD_MOVE_INTERVAL_MULTIPLIER,
  INITIAL_REVIEW_INTERVAL_DAYS,
  SKIPPED_REVIEW_DELAY_MS,
} from './constants';
import {
  asIntervalDays,
  asReviewCount,
  asTimestamp,
  REVIEW_OUTCOMES,
  type DiaryDatabase,
  type MatchRecord,
  type PlayerProfile,
  type ReviewOutcome,
  type ReviewProblem,
  type Timestamp,
} from './domain';

const STORAGE_KEY = 'blunder-diary/v2';
const emptyDatabase = (): DiaryDatabase => ({ profile: null, matches: {}, problems: {} });
const currentTime = (): Timestamp => asTimestamp(Date.now());

export const loadDatabase = (): DiaryDatabase => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as DiaryDatabase) : emptyDatabase();
  } catch {
    return emptyDatabase();
  }
};

export const saveDatabase = (database: DiaryDatabase): void =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));

export const upsertProfile = (database: DiaryDatabase, profile: PlayerProfile): DiaryDatabase => ({
  ...database,
  profile,
});

export const upsertMatch = (database: DiaryDatabase, match: MatchRecord): DiaryDatabase => ({
  ...database,
  matches: { ...database.matches, [match.id]: match },
});

export const upsertProblem = (database: DiaryDatabase, problem: ReviewProblem): DiaryDatabase => ({
  ...database,
  problems: { ...database.problems, [problem.id]: problem },
});

export const dueProblems = (
  database: DiaryDatabase,
  now = currentTime()
): readonly ReviewProblem[] =>
  Object.values(database.problems)
    .filter((problem) => problem.dueAt <= now)
    .sort((left, right) => left.dueAt - right.dueAt);

export const applyReview = (
  problem: ReviewProblem,
  outcome: ReviewOutcome,
  now = currentTime()
): ReviewProblem => {
  if (outcome === REVIEW_OUTCOMES.skipped) {
    return { ...problem, dueAt: asTimestamp(now + SKIPPED_REVIEW_DELAY_MS), lastReviewedAt: now };
  }
  if (outcome === REVIEW_OUTCOMES.failed) {
    return {
      ...problem,
      failures: asReviewCount(problem.failures + 1),
      intervalDays: asIntervalDays(0),
      dueAt: now,
      lastReviewedAt: now,
    };
  }

  const multiplier =
    outcome === REVIEW_OUTCOMES.best
      ? BEST_MOVE_INTERVAL_MULTIPLIER
      : GOOD_MOVE_INTERVAL_MULTIPLIER;
  const nextInterval = Math.max(
    INITIAL_REVIEW_INTERVAL_DAYS,
    problem.intervalDays === 0
      ? INITIAL_REVIEW_INTERVAL_DAYS
      : Math.ceil(problem.intervalDays * multiplier)
  );
  return {
    ...problem,
    successes: asReviewCount(problem.successes + 1),
    intervalDays: asIntervalDays(nextInterval),
    dueAt: asTimestamp(now + nextInterval * DAY_MS),
    lastReviewedAt: now,
  };
};
