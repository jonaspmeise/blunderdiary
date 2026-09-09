import {
  boardSquares,
  legalTargets,
  piecesForFen,
  type MoveAnimation,
  type Square,
} from '../chess';
import type { CSSProperties } from 'react';
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
  readonly animation: MoveAnimation | null;
  readonly isAnimating: boolean;
  readonly onSquareSelect: (square: Square) => void;
}

export function Board({
  fen,
  side,
  selectedSquare,
  animation,
  isAnimating,
  onSquareSelect,
}: BoardProps) {
  const pieces = new Map(piecesForFen(fen).map((piece) => [piece.square, piece]));
  const targets = selectedSquare ? legalTargets(fen, selectedSquare) : [];
  const squares = boardSquares(side);
  const animationStart = animation ? squares.indexOf(animation.from) : -1;
  const animationEnd = animation ? squares.indexOf(animation.to) : -1;
  const animationStyle: CSSProperties & Record<'--destination-x' | '--destination-y', string> = {
    transform: `translate(${(animationStart % BOARD_DIMENSION) * 100}%, ${Math.floor(animationStart / BOARD_DIMENSION) * 100}%)`,
    '--destination-x': `${(animationEnd % BOARD_DIMENSION) * 100}%`,
    '--destination-y': `${Math.floor(animationEnd / BOARD_DIMENSION) * 100}%`,
  };
  return (
    <div className="board" aria-label="Chess board">
      {squares.map((square, index) => {
        const piece = animation?.to === square ? undefined : pieces.get(square);
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
      {animation && (
        <span className={`moving-piece${isAnimating ? ' active' : ''}`} style={animationStyle}>
          {PIECES[animation.piece.type][animation.piece.color === CHESS_COLORS.white ? 'w' : 'b']}
        </span>
      )}
    </div>
  );
}
