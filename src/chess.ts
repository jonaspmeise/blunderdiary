import { Chess } from 'chess.js';
import {
  BOARD_FILES,
  BOARD_RANKS,
  CENTIPAWNS_PER_PAWN,
  ISSUE_LOSS_THRESHOLDS,
  MINIMUM_REVIEW_LOSS,
} from './constants';
import {
  asFen,
  asPawnEvaluation,
  asSanMove,
  CHESS_COLORS,
  ISSUE_CATEGORIES,
  SIDES,
  type AnalysisCandidate,
  type ChessColor,
  type Fen,
  type IssueCategory,
  type MatchRecord,
  type PawnEvaluation,
  type SanMove,
  type Side,
  type UciMove,
} from './domain';
import type { EngineEvaluation, StockfishEngine } from './engine';

export type Square = `${(typeof BOARD_FILES)[number]}${(typeof BOARD_RANKS)[number]}`;
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface BoardPiece {
  readonly square: Square;
  readonly color: ChessColor;
  readonly type: PieceType;
}

export interface MoveAnimation {
  readonly from: Square;
  readonly to: Square;
  readonly piece: BoardPiece;
}

export interface ReviewEvaluation {
  readonly before: PositionEvaluation;
  readonly after: PositionEvaluation;
  readonly loss: PawnEvaluation;
  readonly opponentResponse: OpponentResponse | null;
}

export interface PositionEvaluation {
  readonly score: PawnEvaluation;
  readonly mateIn: number | null;
}

export interface OpponentResponse {
  readonly san: SanMove;
  readonly fen: Fen;
  readonly evaluation: PositionEvaluation;
}

export interface LegalMove {
  readonly to: Square;
  readonly fen: Fen;
}

export interface LegalMoveEvaluation {
  readonly to: Square;
  readonly evaluation: PositionEvaluation;
  readonly change: PawnEvaluation;
}

export const boardSquares = (side: Side): readonly Square[] => {
  const squares: Square[] = BOARD_RANKS.flatMap<Square>((rank) =>
    BOARD_FILES.map((file): Square => `${file}${rank}`)
  );
  return side === SIDES.white ? squares : squares.reverse();
};

export const piecesForFen = (fen: Fen): readonly BoardPiece[] => {
  const chess = new Chess(fen);
  return chess.board().flatMap((row, rankIndex) =>
    row.flatMap((piece, fileIndex) =>
      piece
        ? [
            {
              square: `${BOARD_FILES[fileIndex]}${BOARD_RANKS[rankIndex]}`,
              color: piece.color,
              type: piece.type,
            },
          ]
        : []
    )
  );
};

export const legalTargets = (fen: Fen, from: Square): readonly Square[] =>
  new Chess(fen)
    .moves({ verbose: true })
    .filter((move) => move.from === from)
    .map((move) => move.to);

export const tryMove = (
  fen: Fen,
  from: Square,
  to: Square
): { readonly fen: Fen; readonly san: SanMove } | null => {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, promotion: 'q' });
    return move ? { fen: asFen(chess.fen()), san: asSanMove(move.san) } : null;
  } catch {
    return null;
  }
};

export const legalMoves = (fen: Fen, from: Square): readonly LegalMove[] =>
  [...new Set(legalTargets(fen, from))].flatMap((to) => {
    const move = tryMove(fen, from, to);
    return move ? [{ to, fen: move.fen }] : [];
  });

const playerPerspective = (evaluation: EngineEvaluation, side: Side): PositionEvaluation => {
  const multiplier = side === SIDES.white ? 1 : -1;
  return {
    score: asPawnEvaluation(evaluation.score * multiplier),
    mateIn: evaluation.mateIn === null ? null : evaluation.mateIn * multiplier,
  };
};

const moveFromUci = (
  fen: Fen,
  uci: UciMove
): { readonly san: SanMove; readonly fen: Fen } | null => {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return move ? { san: asSanMove(move.san), fen: asFen(chess.fen()) } : null;
  } catch {
    return null;
  }
};

export const evaluateReviewMove = async (
  fenBefore: Fen,
  fenAfter: Fen,
  playerSide: Side,
  engine: StockfishEngine
): Promise<ReviewEvaluation> => {
  const before = playerPerspective(await engine.evaluate(fenBefore), playerSide);
  const afterEngine = await engine.evaluate(fenAfter);
  const after = playerPerspective(afterEngine, playerSide);
  const responseMove = afterEngine.bestMoves[0]
    ? moveFromUci(fenAfter, afterEngine.bestMoves[0])
    : null;
  const opponentResponse = responseMove
    ? {
        ...responseMove,
        evaluation: playerPerspective(await engine.evaluate(responseMove.fen), playerSide),
      }
    : null;
  return { before, after, loss: asPawnEvaluation(before.score - after.score), opponentResponse };
};

export const evaluateLegalMoves = async (
  fen: Fen,
  from: Square,
  playerSide: Side,
  engine: StockfishEngine
): Promise<readonly LegalMoveEvaluation[]> => {
  const before = playerPerspective(await engine.evaluate(fen), playerSide);
  const moves = legalMoves(fen, from);
  const evaluations: LegalMoveEvaluation[] = [];
  for (const move of moves) {
    const evaluation = playerPerspective(await engine.evaluate(move.fen), playerSide);
    evaluations.push({
      to: move.to,
      evaluation,
      change: asPawnEvaluation(evaluation.score - before.score),
    });
  }
  return evaluations;
};

export const moveAnimationFor = (fen: Fen, san: SanMove): MoveAnimation | null => {
  try {
    const chess = new Chess(fen);
    const move = chess.move(san);
    return move
      ? {
          from: move.from,
          to: move.to,
          piece: {
            square: move.from,
            color: move.color,
            type: move.piece,
          },
        }
      : null;
  } catch {
    return null;
  }
};

const categoryForLoss = (loss: number): IssueCategory | null => {
  if (loss < MINIMUM_REVIEW_LOSS) {
    return null;
  }
  if (loss >= ISSUE_LOSS_THRESHOLDS.blunder / CENTIPAWNS_PER_PAWN) {
    return ISSUE_CATEGORIES.blunder;
  }
  if (loss >= ISSUE_LOSS_THRESHOLDS.mistake / CENTIPAWNS_PER_PAWN) {
    return ISSUE_CATEGORIES.mistake;
  }
  if (loss >= ISSUE_LOSS_THRESHOLDS.inaccuracy / CENTIPAWNS_PER_PAWN) {
    return ISSUE_CATEGORIES.inaccuracy;
  }
  return null;
};

const sanMovesFromUci = (fen: Fen, moves: readonly UciMove[]): readonly SanMove[] =>
  moves.flatMap((uci) => {
    try {
      const chess = new Chess(fen);
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      return move ? [asSanMove(move.san)] : [];
    } catch {
      return [];
    }
  });

const playerSideFor = (match: MatchRecord, username: string): Side =>
  match.players[SIDES.white].username.toLowerCase() === username.toLowerCase()
    ? SIDES.white
    : SIDES.black;

export const analyzeMatch = async (
  match: MatchRecord,
  username: string,
  engine: StockfishEngine
): Promise<readonly AnalysisCandidate[]> => {
  const playerSide = playerSideFor(match, username);
  const chess = new Chess();
  try {
    chess.loadPgn(match.pgn, { strict: false });
  } catch {
    return [];
  }

  const history = chess.history();
  chess.reset();
  const candidates: AnalysisCandidate[] = [];
  for (const [index, san] of history.entries()) {
    const movingSide = chess.turn() === CHESS_COLORS.white ? SIDES.white : SIDES.black;
    const fenBefore = asFen(chess.fen());
    const played = chess.move(san);
    if (!played) {
      continue;
    }
    const fenAfter = asFen(chess.fen());
    if (movingSide !== playerSide || index === 0) {
      continue;
    }
    if (new Chess(fenBefore).moves().length <= 1) {
      continue;
    }

    const before = await engine.evaluate(fenBefore);
    const after = await engine.evaluate(fenAfter);
    const loss =
      playerSide === SIDES.white ? before.score - after.score : after.score - before.score;
    const category = categoryForLoss(loss);
    const bestMoves = sanMovesFromUci(fenBefore, before.bestMoves);
    if (!category || bestMoves.includes(asSanMove(played.san))) {
      continue;
    }

    const priorPosition = new Chess();
    for (const priorMove of history.slice(0, index - 1)) {
      priorPosition.move(priorMove);
    }
    candidates.push({
      fenBeforeOpponentMove: asFen(priorPosition.fen()),
      fenToSolve: fenBefore,
      opponentMove: asSanMove(history[index - 1]),
      playedMove: asSanMove(played.san),
      turn: Math.floor(index / 2) + 1,
      bestMoves,
      category,
      evaluation: playerPerspective(after, playerSide).score,
      evaluationMateIn: playerPerspective(after, playerSide).mateIn,
      evaluationBeforeMove: playerPerspective(before, playerSide).score,
      evaluationBeforeMoveMateIn: playerPerspective(before, playerSide).mateIn,
      loss: asPawnEvaluation(loss),
    });
  }
  return candidates.sort((left, right) => right.loss - left.loss);
};

export const loadPositionAfterMove = (fen: Fen, move: SanMove): Fen => {
  const chess = new Chess(fen);
  chess.move(move);
  return asFen(chess.fen());
};
