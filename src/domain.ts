declare const domainBrand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [domainBrand]: Name;
};

export type ChessComUsername = Brand<string, 'ChessComUsername'>;
export type MatchId = Brand<string, 'MatchId'>;
export type ProblemId = Brand<string, 'ProblemId'>;
export type Fen = Brand<string, 'Fen'>;
export type SanMove = Brand<string, 'SanMove'>;
export type UciMove = Brand<string, 'UciMove'>;
export type AvatarUrl = Brand<string, 'AvatarUrl'>;
export type Timestamp = Brand<number, 'Timestamp'>;
export type EloRating = Brand<number, 'EloRating'>;
export type ReviewCount = Brand<number, 'ReviewCount'>;
export type IntervalDays = Brand<number, 'IntervalDays'>;
export type Centipawns = Brand<number, 'Centipawns'>;
export type PawnEvaluation = Brand<number, 'PawnEvaluation'>;

export const asUsername = (value: string): ChessComUsername => value.trim() as ChessComUsername;
export const asMatchId = (value: string): MatchId => value as MatchId;
export const asFen = (value: string): Fen => value as Fen;
export const asSanMove = (value: string): SanMove => value as SanMove;
export const asUciMove = (value: string): UciMove => value as UciMove;
export const asAvatarUrl = (value: string): AvatarUrl => value as AvatarUrl;
export const asTimestamp = (value: number): Timestamp => value as Timestamp;
export const asEloRating = (value: number): EloRating => value as EloRating;
export const asReviewCount = (value: number): ReviewCount => value as ReviewCount;
export const asIntervalDays = (value: number): IntervalDays => value as IntervalDays;
export const asCentipawns = (value: number): Centipawns => value as Centipawns;
export const asPawnEvaluation = (value: number): PawnEvaluation => value as PawnEvaluation;

export const SIDES = { white: 'white', black: 'black' } as const;
export type Side = (typeof SIDES)[keyof typeof SIDES];
export const CHESS_COLORS = { white: 'w', black: 'b' } as const;
export type ChessColor = (typeof CHESS_COLORS)[keyof typeof CHESS_COLORS];
export const ISSUE_CATEGORIES = {
  blunder: 'blunder',
  mistake: 'mistake',
  inaccuracy: 'inaccuracy',
} as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[keyof typeof ISSUE_CATEGORIES];
export const REVIEW_OUTCOMES = {
  failed: 'failed',
  good: 'good',
  best: 'best',
  skipped: 'skipped',
} as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[keyof typeof REVIEW_OUTCOMES];
export const MATCH_RESULTS = ['1-0', '0-1', '1/2-1/2', '*'] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

export interface PlayerProfile {
  username: ChessComUsername;
  avatarUrl: AvatarUrl | null;
  updatedAt: Timestamp;
}

export interface MatchPlayer {
  username: ChessComUsername;
  rating: EloRating | null;
}

export interface MatchRecord {
  id: MatchId;
  gameUrl: string | null;
  players: Readonly<Record<Side, MatchPlayer>>;
  playedAt: Timestamp;
  result: MatchResult;
  pgn: string;
}

export interface ReviewProblem {
  id: ProblemId;
  matchId: MatchId;
  playerSide: Side;
  fenBeforeOpponentMove: Fen;
  fenToSolve: Fen;
  opponentMove: SanMove;
  playedMove: SanMove;
  turn: number;
  bestMoves: readonly SanMove[];
  category: IssueCategory;
  evaluation: PawnEvaluation;
  evaluationMateIn: number | null;
  evaluationBeforeMove: PawnEvaluation;
  evaluationBeforeMoveMateIn: number | null;
  loss: PawnEvaluation;
  dueAt: Timestamp;
  failures: ReviewCount;
  successes: ReviewCount;
  intervalDays: IntervalDays;
  lastReviewedAt: Timestamp | null;
  lastOutcome: ReviewOutcome | null;
}

export interface DiaryDatabase {
  profile: PlayerProfile | null;
  matches: Readonly<Record<MatchId, MatchRecord>>;
  analyzedMatchIds: Readonly<Partial<Record<MatchId, number>>>;
  problems: Readonly<Record<ProblemId, ReviewProblem>>;
}

export interface AnalysisCandidate {
  fenBeforeOpponentMove: Fen;
  fenToSolve: Fen;
  opponentMove: SanMove;
  playedMove: SanMove;
  turn: number;
  bestMoves: readonly SanMove[];
  category: IssueCategory;
  evaluation: PawnEvaluation;
  evaluationMateIn: number | null;
  evaluationBeforeMove: PawnEvaluation;
  evaluationBeforeMoveMateIn: number | null;
  loss: PawnEvaluation;
}
