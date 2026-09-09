import { Chess } from 'chess.js';
import { BOARD_FILES, BOARD_RANKS, CENTIPAWNS_PER_PAWN, ISSUE_LOSS_THRESHOLDS } from './constants';
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
  type SanMove,
  type Side,
  type UciMove,
} from './domain';
import type { StockfishEngine } from './engine';

export type Square = `${(typeof BOARD_FILES)[number]}${(typeof BOARD_RANKS)[number]}`;
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface BoardPiece {
  readonly square: Square;
  readonly color: ChessColor;
  readonly type: PieceType;
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

const categoryForLoss = (loss: number): IssueCategory | null => {
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

    const before = await engine.evaluate(fenBefore);
    const after = await engine.evaluate(fenAfter);
    const loss =
      playerSide === SIDES.white ? before.score - after.score : after.score - before.score;
    const category = categoryForLoss(loss);
    if (!category) {
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
      bestMoves: sanMovesFromUci(fenBefore, before.bestMoves),
      category,
      evaluation: asPawnEvaluation(after.score),
    });
  }
  return candidates;
};

export const loadPositionAfterMove = (fen: Fen, move: SanMove): Fen => {
  const chess = new Chess(fen);
  chess.move(move);
  return asFen(chess.fen());
};
