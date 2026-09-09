import { ArrowLeft, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  evaluateReviewMove,
  loadPositionAfterMove,
  moveAnimationFor,
  tryMove,
  type MoveAnimation,
  type ReviewEvaluation,
  type Square,
} from '../chess';
import {
  EVALUATION_BAR,
  OPPONENT_MOVE_ANIMATION_MS,
  OPPONENT_MOVE_START_DELAY_MS,
  REVIEW_LOSS_THRESHOLDS,
} from '../constants';
import {
  REVIEW_OUTCOMES,
  SIDES,
  type DiaryDatabase,
  type ReviewOutcome,
  type ReviewProblem,
} from '../domain';
import { StockfishEngine } from '../engine';
import { Board } from './Board';

interface ReviewProps {
  readonly database: DiaryDatabase;
  readonly problem: ReviewProblem;
  readonly onClose: () => void;
  readonly onComplete: (problem: ReviewProblem, outcome: ReviewOutcome) => void;
}

type Phase = 'replay' | 'solve' | 'evaluating' | 'result';

const outcomeForLoss = (loss: number): ReviewOutcome => {
  if (loss <= REVIEW_LOSS_THRESHOLDS.best) {
    return REVIEW_OUTCOMES.best;
  }
  return loss <= REVIEW_LOSS_THRESHOLDS.good ? REVIEW_OUTCOMES.good : REVIEW_OUTCOMES.failed;
};

const evaluationSummary = (evaluation: ReviewEvaluation): string => {
  const magnitude = Math.abs(evaluation.loss).toFixed(1);
  const formatScore = (score: number): string => `${score >= 0 ? '+' : ''}${score.toFixed(1)}`;
  const change = evaluation.loss > 0 ? `lost ${magnitude}` : `gained ${magnitude}`;
  return `Engine: ${formatScore(evaluation.before)} to ${formatScore(evaluation.after)} (${change} pawns).`;
};

export function Review({ database, problem, onClose, onComplete }: ReviewProps) {
  const [phase, setPhase] = useState<Phase>('replay');
  const [fen, setFen] = useState(problem.fenBeforeOpponentMove);
  const [selected, setSelected] = useState<Square | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [opponentMove, setOpponentMove] = useState<MoveAnimation | null>(null);
  const [isOpponentMoving, setIsOpponentMoving] = useState(false);
  const [reviewEvaluation, setReviewEvaluation] = useState<ReviewEvaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState(false);
  useEffect(() => {
    setPhase('replay');
    setFen(problem.fenBeforeOpponentMove);
    setSelected(null);
    setOutcome(null);
    setReviewEvaluation(null);
    setEvaluationError(false);
    setOpponentMove(null);
    setIsOpponentMoving(false);
    let animationFrame = 0;
    let completionTimer: number | null = null;
    const startTimer = window.setTimeout(() => {
      const animation = moveAnimationFor(problem.fenBeforeOpponentMove, problem.opponentMove);
      setFen(loadPositionAfterMove(problem.fenBeforeOpponentMove, problem.opponentMove));
      if (!animation) {
        setPhase('solve');
        return;
      }
      setOpponentMove(animation);
      animationFrame = window.requestAnimationFrame(() => setIsOpponentMoving(true));
      completionTimer = window.setTimeout(() => {
        setOpponentMove(null);
        setIsOpponentMoving(false);
        setPhase('solve');
      }, OPPONENT_MOVE_ANIMATION_MS);
    }, OPPONENT_MOVE_START_DELAY_MS);
    return () => {
      window.clearTimeout(startTimer);
      if (completionTimer !== null) {
        window.clearTimeout(completionTimer);
      }
      window.cancelAnimationFrame(animationFrame);
    };
  }, [problem]);
  const chooseSquare = async (square: Square) => {
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
    setPhase('evaluating');
    try {
      const engine = await StockfishEngine.create();
      try {
        const evaluation = await evaluateReviewMove(
          problem.fenToSolve,
          move.fen,
          problem.playerSide,
          engine
        );
        setReviewEvaluation(evaluation);
        setOutcome(outcomeForLoss(evaluation.loss));
      } finally {
        engine.dispose();
      }
    } catch {
      setEvaluationError(true);
      setOutcome(REVIEW_OUTCOMES.failed);
    } finally {
      setPhase('result');
    }
  };
  const match = database.matches[problem.matchId];
  const evaluation = Math.max(
    EVALUATION_BAR.minimum,
    Math.min(
      EVALUATION_BAR.maximum,
      EVALUATION_BAR.center +
        (reviewEvaluation?.after ?? problem.evaluation) * EVALUATION_BAR.percentPerPawn
    )
  );
  const title =
    phase === 'replay'
      ? 'Watch closely.'
      : phase === 'solve'
        ? 'Your move.'
        : phase === 'evaluating'
          ? 'Checking.'
          : outcome === REVIEW_OUTCOMES.best
            ? 'Best.'
            : outcome === REVIEW_OUTCOMES.failed
              ? 'Missed.'
              : 'Good.';
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
          <span>{(reviewEvaluation?.after ?? problem.evaluation).toFixed(1)}</span>
        </div>
        <Board
          fen={fen}
          side={problem.playerSide}
          selectedSquare={selected}
          animation={opponentMove}
          isAnimating={isOpponentMoving}
          onSquareSelect={(square) => void chooseSquare(square)}
        />
        <aside className="review-panel">
          <span className="eyebrow">{phase === 'replay' ? 'replay' : 'one attempt'}</span>
          <h1>{title}</h1>
          {phase === 'result' && (
            <p>
              {evaluationError
                ? 'Engine check was unavailable.'
                : reviewEvaluation
                  ? evaluationSummary(reviewEvaluation)
                  : `Best: ${problem.bestMoves[0] ?? 'engine line'}`}
            </p>
          )}
          <div className="review-actions">
            {phase === 'result' && !evaluationError && (
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
              className={phase === 'result' ? 'primary' : 'icon-button'}
              type="button"
              disabled={phase === 'evaluating'}
              onClick={() =>
                onComplete(
                  problem,
                  phase === 'result'
                    ? (outcome ?? REVIEW_OUTCOMES.skipped)
                    : REVIEW_OUTCOMES.skipped
                )
              }
              aria-label={phase === 'result' ? 'Finish review' : 'Skip'}
              title={phase === 'result' ? undefined : 'Skip'}
            >
              {phase === 'result' ? 'Done' : <SkipForward size={18} />}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
