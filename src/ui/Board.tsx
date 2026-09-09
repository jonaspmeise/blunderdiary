import { boardSquares, legalTargets, piecesForFen, type Square } from '../chess';
import { BOARD_DIMENSION } from '../constants';
import { CHESS_COLORS, type Fen, type Side } from '../domain';

const PIECES = {
  p: { w: '♙', b: '♟' },
  n: { w: '♘', b: '♞' },
  b: { w: '♗', b: '♝' },
  r: { w: '♖', b: '♜' },
  q: { w: '♕', b: '♛' },
  k: { w: '♔', b: '♚' },
} as const;

interface BoardProps {
  readonly fen: Fen;
  readonly side: Side;
  readonly selectedSquare: Square | null;
  readonly onSquareSelect: (square: Square) => void;
}

export function Board({ fen, side, selectedSquare, onSquareSelect }: BoardProps) {
  const pieces = new Map(piecesForFen(fen).map((piece) => [piece.square, piece]));
  const targets = selectedSquare ? legalTargets(fen, selectedSquare) : [];
  return (
    <div className="board" aria-label="Chess board">
      {boardSquares(side).map((square, index) => {
        const piece = pieces.get(square);
        const isLight = (Math.floor(index / BOARD_DIMENSION) + (index % BOARD_DIMENSION)) % 2 === 0;
        return (
          <button
            className={`square ${isLight ? 'light' : 'dark'}${selectedSquare === square ? ' selected' : ''}${targets.includes(square) ? ' target' : ''}`}
            key={square}
            type="button"
            onClick={() => onSquareSelect(square)}
            aria-label={square}
          >
            {piece && (
              <span className="piece">
                {PIECES[piece.type][piece.color === CHESS_COLORS.white ? 'w' : 'b']}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
