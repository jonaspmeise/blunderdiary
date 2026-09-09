import { RefreshCw, Sparkles, UserRound } from 'lucide-react';
import type { DiaryDatabase } from '../domain';
import type { ImportProgress } from '../services/chessCom';
import { dueProblems, passedProblemsToday } from '../storage';

interface DashboardProps {
  readonly database: DiaryDatabase;
  readonly isSyncing: boolean;
  readonly progress: ImportProgress | null;
  readonly onReview: () => void;
  readonly onSync: () => void;
}

export function Dashboard({ database, isSyncing, progress, onReview, onSync }: DashboardProps) {
  const due = dueProblems(database);
  const passedToday = passedProblemsToday(database);
  return (
    <main className="dashboard">
      <header className="app-header">
        <div className="brand">
          blunder <span>diary</span>
        </div>
        <button className="account-control" type="button" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? <span className="spinner compact" /> : <RefreshCw size={15} />}
          {database.profile?.avatarUrl ? (
            <img className="avatar" src={database.profile.avatarUrl} alt="" />
          ) : (
            <UserRound size={15} />
          )}
          <span>{database.profile?.username}</span>
        </button>
      </header>
      <section className="queue-hero">
        <div>
          <span className="eyebrow">today</span>
          <h1>
            {isSyncing && due.length === 0
              ? 'Reading games.'
              : due.length
                ? 'Ready to review.'
                : 'All clear.'}
          </h1>
          <p>
            {isSyncing
              ? progress?.totalGames
                ? 'Analyzing recent games in the background.'
                : 'Connecting to Chess.com'
              : due.length
                ? 'A position is ready.'
                : 'No positions due right now.'}
          </p>
        </div>
        <button className="review-command" type="button" onClick={onReview} disabled={!due.length}>
          <Sparkles size={18} />
          <span>Review</span>
        </button>
      </section>
      <section className="daily-statistics" aria-label="Today's review statistics">
        <div>
          <strong>{passedToday}</strong>
          <span>passed today</span>
        </div>
        <div>
          <strong>{due.length}</strong>
          <span>left today</span>
        </div>
      </section>
      {isSyncing && due.length === 0 && (
        <div className="position-skeleton" aria-label="Loading positions">
          <span />
          <span />
          <span />
        </div>
      )}
    </main>
  );
}
