import { RefreshCw, Sparkles } from 'lucide-react';
import { SIDES, type DiaryDatabase, type ReviewProblem } from '../domain';
import { dueProblems } from '../storage';

interface DashboardProps {
  readonly database: DiaryDatabase;
  readonly isSyncing: boolean;
  readonly onReview: () => void;
  readonly onSync: () => void;
}

const positionLabel = (database: DiaryDatabase, problem: ReviewProblem): string => {
  const match = database.matches[problem.matchId];
  return match
    ? `${match.players[SIDES.white].username} vs ${match.players[SIDES.black].username}`
    : 'Archived game';
};

export function Dashboard({ database, isSyncing, onReview, onSync }: DashboardProps) {
  const due = dueProblems(database);
  const problems = Object.values(database.problems).sort((left, right) => left.dueAt - right.dueAt);
  const recoveries = problems.reduce((total, problem) => total + problem.successes, 0);
  return (
    <main className="dashboard">
      <header className="app-header">
        <div className="brand">
          blunder <span>diary</span>
        </div>
        <button className="account-control" type="button" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? <span className="spinner compact" /> : <RefreshCw size={15} />}
          <span>{database.profile?.username}</span>
        </button>
      </header>
      <section className="queue-hero">
        <div>
          <span className="eyebrow">today</span>
          <h1>{due.length ? `${due.length} positions` : 'All clear.'}</h1>
          <p>{due.length ? 'Ready when you are.' : 'No positions due right now.'}</p>
        </div>
        <button className="review-command" type="button" onClick={onReview} disabled={!due.length}>
          <Sparkles size={18} />
          <span>Review</span>
        </button>
      </section>
      <section className="ledger">
        <div className="metric">
          <span>recovered</span>
          <strong>{recoveries}</strong>
        </div>
        <div className="metric">
          <span>in queue</span>
          <strong>{problems.length}</strong>
        </div>
      </section>
      <section className="position-list" aria-label="Review positions">
        <div className="section-title">
          <h2>Positions</h2>
          <span>{problems.length}</span>
        </div>
        {problems.length === 0 ? (
          <p className="empty-state">Import a game to begin.</p>
        ) : (
          problems.slice(0, 8).map((problem) => (
            <div className="position-row" key={problem.id}>
              <span className={`tag ${problem.category}`}>{problem.category}</span>
              <span>{positionLabel(database, problem)}</span>
              <time>
                {problem.dueAt <= Date.now()
                  ? 'now'
                  : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                      problem.dueAt
                    )}
              </time>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
