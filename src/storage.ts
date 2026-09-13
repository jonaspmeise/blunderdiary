import {
  BEST_MOVE_INTERVAL_MULTIPLIER,
  DAY_MS,
  GOOD_MOVE_INTERVAL_MULTIPLIER,
  INITIAL_REVIEW_INTERVAL_DAYS,
  SKIPPED_REVIEW_DELAY_MS,
} from './constants';
import {
  asIntervalDays,
  asPawnEvaluation,
  asReviewCount,
  asTimestamp,
  REVIEW_OUTCOMES,
  type DiaryDatabase,
  type MatchId,
  type MatchRecord,
  type PlayerProfile,
  type ReviewOutcome,
  type ReviewProblem,
  type Timestamp,
} from './domain';

const STORAGE_KEY = 'blunder-diary/v2';
const LAST_USERNAME_KEY = 'blunder-diary/last-username';
const emptyDatabase = (): DiaryDatabase => ({
  profile: null,
  matches: {},
  analyzedMatchIds: {},
  problems: {},
});
const currentTime = (): Timestamp => asTimestamp(Date.now());

export const loadDatabase = (): DiaryDatabase => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return emptyDatabase();
    }
    const parsed = JSON.parse(value) as Partial<DiaryDatabase>;
    const analyzedMatchIds = Object.fromEntries(
      Object.entries(parsed.analyzedMatchIds ?? {}).map(([matchId, version]) => [
        matchId,
        typeof version === 'number' ? version : 0,
      ])
    ) as DiaryDatabase['analyzedMatchIds'];
    const problems = Object.fromEntries(
      Object.entries(parsed.problems ?? {}).map(([problemId, problem]) => {
        const storedProblem = problem as Partial<ReviewProblem>;
        const storedMateIn = (storedProblem as Record<string, unknown>)[
          'evaluationBeforeMoveMateIn'
        ];
        return [
          problemId,
          {
            ...storedProblem,
            evaluationMateIn: storedProblem.evaluationMateIn ?? null,
            evaluationBeforeMove: storedProblem.evaluationBeforeMove ?? storedProblem.evaluation,
            evaluationBeforeMoveMateIn: typeof storedMateIn === 'number' ? storedMateIn : null,
            loss: storedProblem.loss ?? asPawnEvaluation(0),
            lastOutcome: storedProblem.lastOutcome ?? null,
          },
        ];
      })
    ) as DiaryDatabase['problems'];
    return {
      profile: parsed.profile
        ? { ...parsed.profile, avatarUrl: parsed.profile.avatarUrl ?? null }
        : null,
      matches: Object.fromEntries(
        Object.entries(parsed.matches ?? {}).map(([matchId, match]) => [
          matchId,
          { ...match, gameUrl: match.gameUrl ?? null },
        ])
      ),
      analyzedMatchIds,
      problems,
    };
  } catch {
    return emptyDatabase();
  }
};

export const saveDatabase = (database: DiaryDatabase): void =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));

export const loadLastUsername = (): string => localStorage.getItem(LAST_USERNAME_KEY) ?? '';

export const saveLastUsername = (username: string): void =>
  localStorage.setItem(LAST_USERNAME_KEY, username);

export const clearDiaryData = (): DiaryDatabase => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LAST_USERNAME_KEY);
  return emptyDatabase();
};

export const upsertProfile = (database: DiaryDatabase, profile: PlayerProfile): DiaryDatabase => ({
  ...database,
  profile,
});

export const upsertMatch = (database: DiaryDatabase, match: MatchRecord): DiaryDatabase => ({
  ...database,
  matches: { ...database.matches, [match.id]: match },
});

export const markMatchAnalyzed = (
  database: DiaryDatabase,
  matchId: MatchId,
  version: number
): DiaryDatabase => ({
  ...database,
  analyzedMatchIds: { ...database.analyzedMatchIds, [matchId]: version },
});

export const upsertProblem = (database: DiaryDatabase, problem: ReviewProblem): DiaryDatabase => ({
  ...database,
  problems: { ...database.problems, [problem.id]: problem },
});

export const replaceProblemsForMatch = (
  database: DiaryDatabase,
  matchId: MatchId,
  problems: readonly ReviewProblem[]
): DiaryDatabase => ({
  ...database,
  problems: {
    ...Object.fromEntries(
      Object.entries(database.problems).filter(([, problem]) => problem.matchId !== matchId)
    ),
    ...Object.fromEntries(problems.map((problem) => [problem.id, problem])),
  },
});

export const dueProblems = (
  database: DiaryDatabase,
  now = currentTime()
): readonly ReviewProblem[] =>
  Object.values(database.problems)
    .filter((problem) => problem.dueAt <= now)
    .sort((left, right) => right.loss - left.loss || left.dueAt - right.dueAt);

export const passedProblemsToday = (database: DiaryDatabase, now = new Date()): number =>
  Object.values(database.problems).filter((problem) => {
    if (
      problem.lastOutcome !== REVIEW_OUTCOMES.best &&
      problem.lastOutcome !== REVIEW_OUTCOMES.good
    ) {
      return false;
    }
    if (problem.lastReviewedAt === null) {
      return false;
    }
    const reviewedAt = new Date(problem.lastReviewedAt);
    return (
      reviewedAt.getFullYear() === now.getFullYear() &&
      reviewedAt.getMonth() === now.getMonth() &&
      reviewedAt.getDate() === now.getDate()
    );
  }).length;

export const applyReview = (
  problem: ReviewProblem,
  outcome: ReviewOutcome,
  now = currentTime()
): ReviewProblem => {
  if (outcome === REVIEW_OUTCOMES.skipped) {
    return {
      ...problem,
      dueAt: asTimestamp(now + SKIPPED_REVIEW_DELAY_MS),
      lastReviewedAt: now,
      lastOutcome: outcome,
    };
  }
  if (outcome === REVIEW_OUTCOMES.failed) {
    return {
      ...problem,
      failures: asReviewCount(problem.failures + 1),
      intervalDays: asIntervalDays(0),
      dueAt: now,
      lastReviewedAt: now,
      lastOutcome: outcome,
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
    lastOutcome: outcome,
  };
};
