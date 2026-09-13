import { RefreshCw, RotateCcw, Sparkles, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { DiaryDatabase } from '../domain';
import type { ImportProgress } from '../services/chessCom';
import { dueProblems, passedProblemsToday } from '../storage';

interface DashboardProps {
  readonly database: DiaryDatabase;
  readonly isSyncing: boolean;
  readonly progress: ImportProgress | null;
  readonly onReview: () => void;
  readonly onSync: () => void;
  readonly onReset: () => void;
}

export function Dashboard({
  database,
  isSyncing,
  progress,
  onReview,
  onSync,
  onReset,
}: DashboardProps) {
  const due = dueProblems(database);
  const passedToday = passedProblemsToday(database);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  return (
    <main className="dashboard">
      <header className="app-header">
        <div className="brand">
          blunder <span>diary</span>
        </div>
        <div className="account-menu">
          <button
            className="icon-button"
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            aria-label="Refresh games"
            title="Refresh games"
          >
            {isSyncing ? <span className="spinner compact" /> : <RefreshCw size={15} />}
          </button>
          <button
            className="account-control"
            type="button"
            onClick={() => setIsAccountMenuOpen((open) => !open)}
            aria-expanded={isAccountMenuOpen}
          >
            {database.profile?.avatarUrl ? (
              <img className="avatar" src={database.profile.avatarUrl} alt="" />
            ) : (
              <UserRound size={15} />
            )}
            <span>{database.profile?.username}</span>
          </button>
          {isAccountMenuOpen && (
            <button className="reset-control" type="button" onClick={onReset}>
              <RotateCcw size={15} /> Reset local data
            </button>
          )}
        </div>
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
