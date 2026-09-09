import { useEffect, useRef, useState } from 'react';
import { applyReview, dueProblems, loadDatabase, saveDatabase, upsertProblem } from '../storage';
import type { DiaryDatabase, ReviewOutcome, ReviewProblem } from '../domain';
import { importGames } from '../services/chessCom';
import { Dashboard } from './Dashboard';
import { Review } from './Review';
import { Setup } from './Setup';

type Screen = 'dashboard' | 'review';

export function App() {
  const [database, setDatabase] = useState<DiaryDatabase>(loadDatabase);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [isSyncing, setIsSyncing] = useState(false);
  const bootSynced = useRef(false);
  const currentProblem = dueProblems(database)[0];
  const commit = (next: DiaryDatabase) => {
    saveDatabase(next);
    setDatabase(next);
  };
  const sync = async (username: string | undefined = database.profile?.username) => {
    if (!username) {
      return;
    }
    setIsSyncing(true);
    try {
      commit(await importGames(username, database));
    } finally {
      setIsSyncing(false);
    }
  };
  useEffect(() => {
    if (database.profile && !bootSynced.current) {
      bootSynced.current = true;
      void sync();
    }
  }, [database.profile]);
  const complete = (problem: ReviewProblem, outcome: ReviewOutcome) => {
    commit(upsertProblem(database, applyReview(problem, outcome)));
    setScreen('dashboard');
  };
  if (!database.profile) {
    return <Setup onImport={sync} />;
  }
  return (
    <div className="app-shell">
      {screen === 'review' && currentProblem ? (
        <Review
          database={database}
          problem={currentProblem}
          onClose={() => setScreen('dashboard')}
          onComplete={complete}
        />
      ) : (
        <Dashboard
          database={database}
          isSyncing={isSyncing}
          onReview={() => setScreen('review')}
          onSync={() => void sync()}
        />
      )}
    </div>
  );
}
