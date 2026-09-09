import { ArrowLeft, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tryMove, loadPositionAfterMove, type Square } from '../chess';
import { EVALUATION_BAR, OPPONENT_MOVE_ANIMATION_MS } from '../constants';
import {
  asSanMove,
  ISSUE_CATEGORIES,
  REVIEW_OUTCOMES,
  SIDES,
  type DiaryDatabase,
  type ReviewOutcome,
  type ReviewProblem,
} from '../domain';
import { Board } from './Board';

interface ReviewProps {
  readonly database: DiaryDatabase;
  readonly problem: ReviewProblem;
  readonly onClose: () => void;
  readonly onComplete: (problem: ReviewProblem, outcome: ReviewOutcome) => void;
}

type Phase = 'replay' | 'solve' | 'result';

const outcomeFor = (problem: ReviewProblem, move: string): ReviewOutcome => {
  if (problem.bestMoves.includes(asSanMove(move))) {
    return REVIEW_OUTCOMES.best;
  }
  return problem.category === ISSUE_CATEGORIES.blunder
    ? REVIEW_OUTCOMES.failed
    : REVIEW_OUTCOMES.good;
};

export function Review({ database, problem, onClose, onComplete }: ReviewProps) {
  const [phase, setPhase] = useState<Phase>('replay');
  const [fen, setFen] = useState(problem.fenBeforeOpponentMove);
  const [selected, setSelected] = useState<Square | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFen(loadPositionAfterMove(problem.fenBeforeOpponentMove, problem.opponentMove));
      setPhase('solve');
    }, OPPONENT_MOVE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [problem]);
  const chooseSquare = (square: Square) => {
    if (phase !== 'solve') {
      return;
    }
    if (!selected) {
      setSelected(square);
      return;
    }
    const move = tryMove(fen, selected, square);
    if (!move) {
      setSelected(square);
      return;
    }
    setFen(move.fen);
    setSelected(null);
    setOutcome(outcomeFor(problem, move.san));
    setPhase('result');
  };
  const match = database.matches[problem.matchId];
  const evaluation = Math.max(
    EVALUATION_BAR.minimum,
    Math.min(
      EVALUATION_BAR.maximum,
      EVALUATION_BAR.center + problem.evaluation * EVALUATION_BAR.percentPerPawn
    )
  );
  const title =
    phase === 'replay'
      ? 'Watch closely.'
      : phase === 'solve'
        ? 'Your move.'
        : outcome === REVIEW_OUTCOMES.best
          ? 'Best.'
          : outcome === REVIEW_OUTCOMES.failed
            ? 'Missed.'
            : 'Playable.';
  return (
    <main className="review-page">
      <header className="review-header">
        <button className="icon-button" type="button" onClick={onClose} aria-label="Back">
          <ArrowLeft size={19} />
        </button>
        <span>
          {match
            ? `${match.players[SIDES.white].username} vs ${match.players[SIDES.black].username}`
            : 'Review'}
        </span>
        <span className={`tag ${problem.category}`}>{problem.category}</span>
      </header>
      <section className="review-layout">
        <div className="evaluation">
          <div className="evaluation-fill" style={{ height: `${evaluation}%` }} />
          <span>{problem.evaluation.toFixed(1)}</span>
        </div>
        <Board
          fen={fen}
          side={problem.playerSide}
          selectedSquare={selected}
          onSquareSelect={chooseSquare}
        />
        <aside className="review-panel">
          <span className="eyebrow">{phase === 'replay' ? 'replay' : 'one attempt'}</span>
          <h1>{title}</h1>
          {phase === 'result' && (
            <p>
              {outcome === REVIEW_OUTCOMES.best
                ? 'Locked in.'
                : `Best: ${problem.bestMoves[0] ?? 'engine line'}`}
            </p>
          )}
          <div className="review-actions">
            {phase === 'result' && (
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setFen(problem.fenToSolve);
                  setOutcome(null);
                  setPhase('solve');
                }}
                aria-label="Try again"
              >
                <RotateCcw size={18} />
              </button>
            )}
            <button
              className={phase === 'result' ? 'primary' : 'quiet-button'}
              type="button"
              onClick={() =>
                onComplete(
                  problem,
                  phase === 'result'
                    ? (outcome ?? REVIEW_OUTCOMES.skipped)
                    : REVIEW_OUTCOMES.skipped
                )
              }
            >
              {phase === 'result' ? (
                'Done'
              ) : (
                <>
                  <SkipForward size={16} /> Skip
                </>
              )}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
