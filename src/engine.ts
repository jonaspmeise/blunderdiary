import {
  CENTIPAWNS_PER_PAWN,
  ENGINE_DEPTH,
  ENGINE_MULTI_PV,
  ENGINE_READY_TIMEOUT_MS,
} from './constants';
import {
  asCentipawns,
  asPawnEvaluation,
  asUciMove,
  type Centipawns,
  type PawnEvaluation,
  type UciMove,
} from './domain';

export interface EngineEvaluation {
  readonly score: PawnEvaluation;
  readonly bestMoves: readonly UciMove[];
}

const scoreFromInfo = (line: string): Centipawns | null => {
  const centipawn = line.match(/ score cp (-?\d+)/)?.[1];
  if (centipawn) {
    return asCentipawns(Number(centipawn));
  }

  const mate = line.match(/ score mate (-?\d+)/)?.[1];
  return mate ? asCentipawns(Math.sign(Number(mate)) * 10_000) : null;
};

const principalVariationFromInfo = (
  line: string
): { readonly index: number; readonly move: UciMove } | null => {
  const match = line.match(/ multipv (\d+) .* pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
  return match ? { index: Number(match[1]), move: asUciMove(match[2]) } : null;
};

export class StockfishEngine {
  private readonly worker = new Worker('/stockfish-18-lite-single.js');
  private pending: ((evaluation: EngineEvaluation) => void) | null = null;
  private latestScore = asCentipawns(0);
  private bestMoves: UciMove[] = [];

  private constructor() {}

  static async create(): Promise<StockfishEngine> {
    const engine = new StockfishEngine();
    await engine.waitForReady();
    engine.worker.postMessage(`setoption name MultiPV value ${ENGINE_MULTI_PV}`);
    return engine;
  }

  evaluate(fen: string): Promise<EngineEvaluation> {
    if (this.pending) {
      throw new Error('Stockfish is already evaluating a position');
    }

    this.latestScore = asCentipawns(0);
    this.bestMoves = [];
    return new Promise<EngineEvaluation>((resolve) => {
      this.pending = resolve;
      this.worker.onmessage = (event: MessageEvent<string>) => this.handleLine(event.data);
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${ENGINE_DEPTH}`);
    });
  }

  dispose(): void {
    this.worker.postMessage('quit');
    this.worker.terminate();
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Stockfish did not start')),
        ENGINE_READY_TIMEOUT_MS
      );
      this.worker.onmessage = (event: MessageEvent<string>) => {
        if (event.data === 'uciok') {
          this.worker.postMessage('isready');
        }
        if (event.data === 'readyok') {
          window.clearTimeout(timeout);
          resolve();
        }
      };
      this.worker.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Stockfish could not start'));
      };
      this.worker.postMessage('uci');
    });
  }

  /** Parses the UCI stream until the engine completes the active search. */
  private handleLine(line: string): void {
    if (line.startsWith('info ')) {
      const score = scoreFromInfo(line);
      const variation = principalVariationFromInfo(line);
      if (score !== null && (!variation || variation.index === 1)) {
        this.latestScore = score;
      }
      if (variation) {
        this.bestMoves[variation.index - 1] = variation.move;
      }
      return;
    }

    if (line.startsWith('bestmove') && this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({
        score: asPawnEvaluation(this.latestScore / CENTIPAWNS_PER_PAWN),
        bestMoves: this.bestMoves.filter((move): move is UciMove => Boolean(move)),
      });
    }
  }
}
