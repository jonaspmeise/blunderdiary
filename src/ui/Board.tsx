import {
  boardSquares,
  legalTargets,
  piecesForFen,
  type MoveAnimation,
  type PieceType,
  type Square,
} from '../chess';
import type { CSSProperties } from 'react';
import { BOARD_DIMENSION } from '../constants';
import { type ChessColor, type Fen, type Side } from '../domain';

interface PieceIconProps {
  readonly type: PieceType;
  readonly color: ChessColor;
  readonly className?: string;
}

export function PieceIcon({ type, color, className }: PieceIconProps) {
  return (
    <img
      className={`piece ${className ?? ''}`}
      src={`https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${color}${type}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

interface BoardProps {
  readonly fen: Fen;
  readonly side: Side;
  readonly selectedSquare: Square | null;
  readonly animation: MoveAnimation | null;
  readonly isAnimating: boolean;
  readonly targetLabels: Readonly<Partial<Record<Square, string>>>;
  readonly onSquareSelect: (square: Square) => void;
}

export function Board({
  fen,
  side,
  selectedSquare,
  animation,
  isAnimating,
  targetLabels,
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
            {piece && <PieceIcon type={piece.type} color={piece.color} />}
            {targetLabels[square] && (
              <span className="move-evaluation">{targetLabels[square]}</span>
            )}
          </button>
        );
      })}
      {animation && (
        <span className={`moving-piece${isAnimating ? ' active' : ''}`} style={animationStyle}>
          <PieceIcon type={animation.piece.type} color={animation.piece.color} />
        </span>
      )}
    </div>
  );
}
