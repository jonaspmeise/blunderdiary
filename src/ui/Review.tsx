import { ArrowLeft, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  evaluateLegalMoves,
  evaluateReviewMove,
  loadPositionAfterMove,
  moveAnimationFor,
  tryMove,
  type MoveAnimation,
  type PositionEvaluation,
  type ReviewEvaluation,
  type LegalMoveEvaluation,
  type Square,
} from '../chess';
import {
  EVALUATION_BAR,
  OPPONENT_MOVE_ANIMATION_MS,
  OPPONENT_MOVE_START_DELAY_MS,
  REVEAL_MOVE_PREVIEW_MS,
  REVIEW_LOSS_THRESHOLDS,
} from '../constants';
import {
  REVIEW_OUTCOMES,
  SIDES,
  asPawnEvaluation,
  type DiaryDatabase,
  type Fen,
  type ReviewOutcome,
  type ReviewProblem,
  type SanMove,
} from '../domain';
import { StockfishEngine } from '../engine';
import { dueProblems } from '../storage';
import { Board, PieceIcon } from './Board';

interface ReviewProps {
  readonly database: DiaryDatabase;
  readonly problem: ReviewProblem;
  readonly onClose: () => void;
  readonly onFail: (problem: ReviewProblem) => void;
  readonly onAdvance: (problem: ReviewProblem) => void;
  readonly onComplete: (problem: ReviewProblem, outcome: ReviewOutcome) => void;
}

type Phase =
  | 'replay'
  | 'solve'
  | 'evaluating'
  | 'punishing'
  | 'result'
  | 'revealing'
  | 'reveal-best'
  | 'reveal-retry'
  | 'showing-played';

const outcomeForLoss = (loss: number): ReviewOutcome => {
  if (loss <= REVIEW_LOSS_THRESHOLDS.best) {
    return REVIEW_OUTCOMES.best;
  }
  return loss <= REVIEW_LOSS_THRESHOLDS.good ? REVIEW_OUTCOMES.good : REVIEW_OUTCOMES.failed;
};

const formatEvaluation = (evaluation: PositionEvaluation): string =>
  evaluation.mateIn === null
    ? `${evaluation.score >= 0 ? '+' : ''}${evaluation.score.toFixed(1)}`
    : `${evaluation.mateIn >= 0 ? '+' : '-'}M${Math.abs(evaluation.mateIn)}`;

const evaluationSummary = (evaluation: ReviewEvaluation): string => {
  const finalEvaluation = evaluation.opponentResponse?.evaluation ?? evaluation.after;
  if (evaluation.before.mateIn !== null || evaluation.after.mateIn !== null) {
    return `Engine: ${formatEvaluation(evaluation.before)} to ${formatEvaluation(finalEvaluation)}.`;
  }
  const magnitude = Math.abs(evaluation.before.score - finalEvaluation.score).toFixed(1);
  const change = evaluation.loss > 0 ? `lost ${magnitude}` : `gained ${magnitude}`;
  const response = evaluation.opponentResponse ? ` after ${evaluation.opponentResponse.san}` : '';
  return `Engine: ${formatEvaluation(evaluation.before)} to ${formatEvaluation(finalEvaluation)}${response} (${change} pawns).`;
};

const revealLabel = (move: LegalMoveEvaluation): string =>
  move.evaluation.mateIn === null
    ? `${move.change >= 0 ? '+' : ''}${move.change.toFixed(1)}`
    : formatEvaluation(move.evaluation);

const winnerFor = (database: DiaryDatabase, problem: ReviewProblem): string | null => {
  const match = database.matches[problem.matchId];
  if (!match || match.result === '*' || match.result === '1/2-1/2') {
    return null;
  }
  return match.players[match.result === '1-0' ? SIDES.white : SIDES.black].username;
};

const gameDate = (playedAt: number): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    playedAt
  );

const ratingLabel = (rating: number | null): string =>
  rating === null ? 'unrated' : `${rating} Elo`;

export function Review({ database, problem, onClose, onFail, onAdvance, onComplete }: ReviewProps) {
  const [phase, setPhase] = useState<Phase>('replay');
  const [fen, setFen] = useState(problem.fenBeforeOpponentMove);
  const [selected, setSelected] = useState<Square | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [opponentMove, setOpponentMove] = useState<MoveAnimation | null>(null);
  const [isOpponentMoving, setIsOpponentMoving] = useState(false);
  const [reviewEvaluation, setReviewEvaluation] = useState<ReviewEvaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState(false);
  const [revealLabels, setRevealLabels] = useState<Readonly<Partial<Record<Square, string>>>>({});
  const [isRevealEvaluating, setIsRevealEvaluating] = useState(false);
  const punishmentTimer = useRef<number | null>(null);
  const playedMoveTimer = useRef<number | null>(null);
  const moveAnimationTimer = useRef<number | null>(null);
  const failureRecorded = useRef(false);
  useEffect(() => {
    setPhase('replay');
    setFen(problem.fenBeforeOpponentMove);
    setSelected(null);
    setOutcome(null);
    setReviewEvaluation(null);
    setEvaluationError(false);
    setRevealLabels({});
    setIsRevealEvaluating(false);
    setOpponentMove(null);
    setIsOpponentMoving(false);
    if (punishmentTimer.current !== null) {
      window.clearTimeout(punishmentTimer.current);
    }
    if (playedMoveTimer.current !== null) {
      window.clearTimeout(playedMoveTimer.current);
    }
    if (moveAnimationTimer.current !== null) {
      window.clearTimeout(moveAnimationTimer.current);
    }
    failureRecorded.current = false;
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
      if (punishmentTimer.current !== null) {
        window.clearTimeout(punishmentTimer.current);
      }
      if (playedMoveTimer.current !== null) {
        window.clearTimeout(playedMoveTimer.current);
      }
      if (moveAnimationTimer.current !== null) {
        window.clearTimeout(moveAnimationTimer.current);
      }
    };
  }, [problem.id]);
  const retry = () => {
    setFen(problem.fenToSolve);
    setSelected(null);
    setOutcome(null);
    setReviewEvaluation(null);
    setEvaluationError(false);
    setRevealLabels({});
    setPhase('solve');
  };
  const recordFailure = () => {
    onFail(problem);
    failureRecorded.current = true;
  };
  const animatePlayerMove = (fenBefore: Fen, move: SanMove, fenAfter: Fen) => {
    setFen(fenAfter);
    const animation = moveAnimationFor(fenBefore, move);
    if (!animation) {
      return;
    }
    setOpponentMove(animation);
    window.requestAnimationFrame(() => setIsOpponentMoving(true));
    if (moveAnimationTimer.current !== null) {
      window.clearTimeout(moveAnimationTimer.current);
    }
    moveAnimationTimer.current = window.setTimeout(() => {
      setOpponentMove(null);
      setIsOpponentMoving(false);
    }, OPPONENT_MOVE_ANIMATION_MS);
  };
  const showPlayedMove = () => {
    animatePlayerMove(
      problem.fenToSolve,
      problem.playedMove,
      loadPositionAfterMove(problem.fenToSolve, problem.playedMove)
    );
    setSelected(null);
    setPhase('showing-played');
    playedMoveTimer.current = window.setTimeout(() => {
      setFen(problem.fenToSolve);
      setPhase('solve');
    }, REVEAL_MOVE_PREVIEW_MS);
  };
  const revealMoves = async (square: Square) => {
    setSelected(square);
    setRevealLabels({});
    setIsRevealEvaluating(true);
    try {
      const engine = await StockfishEngine.create();
      try {
        const evaluations = await evaluateLegalMoves(fen, square, problem.playerSide, engine);
        setRevealLabels(
          Object.fromEntries(evaluations.map((move) => [move.to, revealLabel(move)]))
        );
      } finally {
        engine.dispose();
      }
    } finally {
      setIsRevealEvaluating(false);
    }
  };
  const chooseSquare = async (square: Square) => {
    if (phase === 'revealing') {
      if (selected && revealLabels[square]) {
        const move = tryMove(fen, selected, square);
        if (move) {
          animatePlayerMove(fen, move.san, move.fen);
          setRevealLabels({});
          setSelected(null);
          if (problem.bestMoves.includes(move.san)) {
            if (!failureRecorded.current) {
              recordFailure();
            }
            setPhase('reveal-best');
            playedMoveTimer.current = window.setTimeout(
              () => onAdvance(problem),
              OPPONENT_MOVE_ANIMATION_MS
            );
          } else {
            setPhase('reveal-retry');
          }
        }
        return;
      }
      await revealMoves(square);
      return;
    }
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
    animatePlayerMove(problem.fenToSolve, move.san, move.fen);
    setSelected(null);
    setPhase('evaluating');
    let isPunishing = false;
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
        const reviewOutcome = outcomeForLoss(evaluation.loss);
        setOutcome(reviewOutcome);
        if (reviewOutcome === REVIEW_OUTCOMES.failed) {
          recordFailure();
        }
        if (reviewOutcome === REVIEW_OUTCOMES.failed && evaluation.opponentResponse) {
          const responseAnimation = moveAnimationFor(move.fen, evaluation.opponentResponse.san);
          if (moveAnimationTimer.current !== null) {
            window.clearTimeout(moveAnimationTimer.current);
          }
          setFen(evaluation.opponentResponse.fen);
          setOpponentMove(responseAnimation);
          window.requestAnimationFrame(() => setIsOpponentMoving(true));
          setPhase('punishing');
          isPunishing = true;
          punishmentTimer.current = window.setTimeout(() => {
            setOpponentMove(null);
            setIsOpponentMoving(false);
            setPhase('result');
          }, OPPONENT_MOVE_ANIMATION_MS);
          return;
        }
      } finally {
        engine.dispose();
      }
    } catch {
      setEvaluationError(true);
      setOutcome(REVIEW_OUTCOMES.failed);
      recordFailure();
    } finally {
      if (!isPunishing) {
        setPhase('result');
      }
    }
  };
  const match = database.matches[problem.matchId];
  const winner = winnerFor(database, problem);
  const due = dueProblems(database);
  const newProblems = due.filter((candidate) => candidate.lastReviewedAt === null).length;
  const relearnProblems = due.filter(
    (candidate) => candidate.lastOutcome === REVIEW_OUTCOMES.failed
  ).length;
  const displayedEvaluation: PositionEvaluation = reviewEvaluation?.opponentResponse?.evaluation ??
    reviewEvaluation?.after ?? {
      score: problem.evaluationBeforeMove,
      mateIn: problem.evaluationBeforeMoveMateIn,
    };
  const whiteEvaluation: PositionEvaluation =
    problem.playerSide === SIDES.white
      ? displayedEvaluation
      : {
          score: asPawnEvaluation(-Number(displayedEvaluation.score)),
          mateIn: displayedEvaluation.mateIn === null ? null : -displayedEvaluation.mateIn,
        };
  const evaluation = Math.max(
    EVALUATION_BAR.minimum,
    Math.min(
      EVALUATION_BAR.maximum,
      whiteEvaluation.mateIn === null
        ? EVALUATION_BAR.center + whiteEvaluation.score * EVALUATION_BAR.percentPerPawn
        : whiteEvaluation.mateIn > 0
          ? EVALUATION_BAR.maximum
          : EVALUATION_BAR.minimum
    )
  );
  const title =
    phase === 'replay'
      ? 'Watch closely.'
      : phase === 'solve'
        ? `${problem.playerSide === SIDES.white ? 'White' : 'Black'} to move`
        : phase === 'evaluating'
          ? 'Checking.'
          : phase === 'punishing'
            ? 'Punished.'
            : phase === 'revealing'
              ? 'Reveal.'
              : phase === 'reveal-best'
                ? 'Best move. Repeat this problem.'
                : phase === 'reveal-retry'
                  ? 'Not best. Try again.'
                  : phase === 'showing-played'
                    ? `You played ${problem.playedMove}.`
                    : outcome === REVIEW_OUTCOMES.best
                      ? 'Best.'
                      : outcome === REVIEW_OUTCOMES.failed
                        ? 'Missed.'
                        : 'Close, not best.';
  return (
    <main className="review-page">
      <header className="review-header">
        <button className="icon-button" type="button" onClick={onClose} aria-label="Back">
          <ArrowLeft size={19} />
        </button>
        <div className="review-match">
          {match?.gameUrl && (
            <a href={match.gameUrl} className="game-link" target="_blank" rel="noreferrer">
              Open on Chess.com
            </a>
          )}
          <span className="match-title">
            {match
              ? `${match.players[SIDES.white].username} vs ${match.players[SIDES.black].username}`
              : 'Saved position'}
          </span>
          {match && (
            <span className="match-players">
              <span>
                {match.players[SIDES.white].username} (
                {ratingLabel(match.players[SIDES.white].rating)}) <PieceIcon type="p" color="w" />
              </span>
              <span>vs</span>
              <span>
                {match.players[SIDES.black].username} (
                {ratingLabel(match.players[SIDES.black].rating)}) <PieceIcon type="p" color="b" />
              </span>
            </span>
          )}
          <span>
            move # {problem.turn}
            {match ? ` · ${gameDate(match.playedAt)}` : ''}
          </span>
          {winner && <span className="match-winner">🏆 {winner}</span>}
        </div>
        <div className="review-meta">
          <div className="review-statistics" aria-label="Review progress">
            <span className="review-stat remaining" title="Puzzles left to do">
              {due.length}
            </span>
            <span className="review-stat new" title="New problems">
              {newProblems}
            </span>
            <span className="review-stat relearn" title="Relearn problems">
              {relearnProblems}
            </span>
          </div>
        </div>
      </header>
      <section className="review-layout">
        <div
          className="evaluation"
          title={`White evaluation: ${formatEvaluation(whiteEvaluation)}`}
          aria-label={`White evaluation: ${formatEvaluation(whiteEvaluation)}`}
        >
          <div className="evaluation-fill" style={{ height: `${evaluation}%` }} />
        </div>
        <Board
          fen={fen}
          side={problem.playerSide}
          selectedSquare={selected}
          animation={opponentMove}
          isAnimating={isOpponentMoving}
          targetLabels={revealLabels}
          onSquareSelect={(square) => void chooseSquare(square)}
        />
        <aside className="review-panel">
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
          {phase === 'punishing' && reviewEvaluation?.opponentResponse && (
            <p>Opponent reply: {reviewEvaluation.opponentResponse.san}</p>
          )}
          {phase === 'revealing' && (
            <p>
              {isRevealEvaluating
                ? 'Evaluating replies.'
                : 'Select a piece to inspect its legal moves.'}
            </p>
          )}
          {phase === 'reveal-best' && (
            <p>This was the engine's best move. Moving to the next problem.</p>
          )}
          {phase === 'reveal-retry' && (
            <p>That move was played on the board. Reset and find the best continuation.</p>
          )}
          <div className="review-actions">
            {phase === 'result' && outcome === REVIEW_OUTCOMES.failed ? (
              <>
                <button className="quiet-button" type="button" onClick={retry}>
                  Retry
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setFen(problem.fenToSolve);
                    setSelected(null);
                    setRevealLabels({});
                    setPhase('revealing');
                  }}
                >
                  Reveal
                </button>
              </>
            ) : phase === 'reveal-best' ? (
              <span className="review-pending">
                <span className="spinner compact" />
              </span>
            ) : phase === 'reveal-retry' ? (
              <button className="quiet-button" type="button" onClick={retry}>
                Retry
              </button>
            ) : phase === 'result' ? (
              <>
                {outcome === REVIEW_OUTCOMES.good && (
                  <button className="quiet-button" type="button" onClick={retry}>
                    Retry
                  </button>
                )}
                <button
                  className="primary"
                  type="button"
                  onClick={() => onComplete(problem, outcome ?? REVIEW_OUTCOMES.good)}
                >
                  Next
                </button>
              </>
            ) : phase === 'revealing' ? (
              <button className="quiet-button" type="button" onClick={retry}>
                Retry
              </button>
            ) : phase === 'solve' ? (
              <>
                <button className="quiet-button" type="button" onClick={showPlayedMove}>
                  You played
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setRevealLabels({});
                    setPhase('revealing');
                  }}
                >
                  Reveal
                </button>
              </>
            ) : phase === 'punishing' || phase === 'evaluating' ? (
              <span className="review-pending">
                <span className="spinner compact" />
              </span>
            ) : (
              <button
                className="icon-button"
                type="button"
                onClick={() => onComplete(problem, REVIEW_OUTCOMES.skipped)}
                aria-label="Skip"
                title="Skip"
              >
                <SkipForward size={18} />
              </button>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
