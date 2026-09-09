import { useEffect, useRef, useState } from 'react';
import { applyReview, dueProblems, loadDatabase, saveDatabase, upsertProblem } from '../storage';
import {
  asMatchId,
  type DiaryDatabase,
  type ProblemId,
  type ReviewOutcome,
  type ReviewProblem,
} from '../domain';
import { REVIEW_SEVERITY_WINDOW } from '../constants';
import { importGames } from '../services/chessCom';
import type { ImportProgress } from '../services/chessCom';
import { saveLastUsername } from '../storage';
import { Dashboard } from './Dashboard';
import { Review } from './Review';
import { Setup } from './Setup';

const problemIdFromLocation = (): ProblemId | null => {
  const value = new URLSearchParams(window.location.search).get('problem');
  return value ? (value as ProblemId) : null;
};

const mergeImportedDatabase = (current: DiaryDatabase, imported: DiaryDatabase): DiaryDatabase => {
  const reanalyzedMatchIds = new Set(
    Object.entries(imported.analyzedMatchIds)
      .filter(
        ([matchId, version]) =>
          typeof version === 'number' &&
          version > (current.analyzedMatchIds[asMatchId(matchId)] ?? 0)
      )
      .map(([matchId]) => matchId)
  );
  const retainedProblems = Object.fromEntries(
    Object.entries(current.problems).filter(
      ([, problem]) => !reanalyzedMatchIds.has(problem.matchId)
    )
  );
  return {
    profile: imported.profile ?? current.profile,
    matches: { ...current.matches, ...imported.matches },
    analyzedMatchIds: { ...current.analyzedMatchIds, ...imported.analyzedMatchIds },
    problems: { ...imported.problems, ...retainedProblems },
  };
};

const nextReviewProblem = (problems: readonly ReviewProblem[]): ReviewProblem | null => {
  const worstLoss = problems[0]?.loss;
  if (worstLoss === undefined) {
    return null;
  }
  const candidates = problems.filter(
    (problem) => problem.loss >= worstLoss - REVIEW_SEVERITY_WINDOW
  );
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
};

export function App() {
  const [database, setDatabase] = useState<DiaryDatabase>(loadDatabase);
  const [problemId, setProblemId] = useState<ProblemId | null>(problemIdFromLocation);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const bootSynced = useRef(false);
  const databaseRef = useRef(database);
  const currentProblem = problemId ? database.problems[problemId] : null;
  const updateDatabase = (update: (current: DiaryDatabase) => DiaryDatabase) => {
    setDatabase((current) => {
      const next = update(current);
      databaseRef.current = next;
      saveDatabase(next);
      return next;
    });
  };
  const publishImported = (imported: DiaryDatabase) =>
    updateDatabase((current) => mergeImportedDatabase(current, imported));
  const openProblem = (nextProblemId: ProblemId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('problem', nextProblemId);
    window.history.pushState({}, '', url);
    setProblemId(nextProblemId);
  };
  const closeProblem = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('problem');
    window.history.pushState({}, '', url);
    setProblemId(null);
  };
  const sync = async (username: string | undefined = database.profile?.username) => {
    if (!username) {
      return;
    }
    bootSynced.current = true;
    saveLastUsername(username);
    setIsSyncing(true);
    setProgress({ completedGames: 0, totalGames: 0, discoveredProblems: 0 });
    try {
      publishImported(
        await importGames(username, databaseRef.current, publishImported, setProgress)
      );
    } finally {
      setIsSyncing(false);
      setProgress(null);
    }
  };
  useEffect(() => {
    if (database.profile && !bootSynced.current) {
      bootSynced.current = true;
      void sync();
    }
  }, [database.profile]);
  useEffect(() => {
    const handlePopState = () => setProblemId(problemIdFromLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const complete = (problem: ReviewProblem, outcome: ReviewOutcome) => {
    const nextProblem =
      outcome === 'best' || outcome === 'good'
        ? nextReviewProblem(
            dueProblems(database).filter((candidate) => candidate.id !== problem.id)
          )
        : null;
    updateDatabase((current) => {
      const latest = current.problems[problem.id] ?? problem;
      return upsertProblem(current, applyReview(latest, outcome));
    });
    if (nextProblem) {
      openProblem(nextProblem.id);
    } else {
      closeProblem();
    }
  };
  if (!database.profile) {
    return <Setup onImport={sync} />;
  }
  return (
    <div className="app-shell">
      {currentProblem ? (
        <Review
          database={database}
          problem={currentProblem}
          onClose={closeProblem}
          onComplete={complete}
        />
      ) : (
        <Dashboard
          database={database}
          isSyncing={isSyncing}
          progress={progress}
          onReview={() => {
            const next = nextReviewProblem(dueProblems(database));
            if (next) {
              openProblem(next.id);
            }
          }}
          onSync={() => void sync()}
        />
      )}
    </div>
  );
}
