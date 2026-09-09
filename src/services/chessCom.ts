import { analyzeMatch } from '../chess';
import { MAX_RECENT_ARCHIVES } from '../constants';
import {
  asAvatarUrl,
  asEloRating,
  asIntervalDays,
  asMatchId,
  asReviewCount,
  asTimestamp,
  asUsername,
  MATCH_RESULTS,
  SIDES,
  type AnalysisCandidate,
  type ChessComUsername,
  type DiaryDatabase,
  type MatchRecord,
  type MatchResult,
  type ProblemId,
  type ReviewProblem,
  type Side,
} from '../domain';
import { StockfishEngine } from '../engine';
import {
  markMatchAnalyzed,
  saveDatabase,
  upsertMatch,
  upsertProblem,
  upsertProfile,
} from '../storage';

interface ChessComGame {
  readonly uuid: string;
  readonly white: { readonly username: string; readonly rating: number };
  readonly black: { readonly username: string; readonly rating: number };
  readonly end_time: number;
  readonly pgn: string;
  readonly url: string;
}

interface ChessComProfile {
  readonly avatar?: string;
}

export interface ImportProgress {
  readonly completedGames: number;
  readonly totalGames: number;
  readonly discoveredProblems: number;
}

const resultFromPgn = (pgn: string): MatchResult => {
  const result = pgn.match(/\[Result "(.+)"\]/)?.[1];
  return MATCH_RESULTS.includes(result as MatchResult) ? (result as MatchResult) : '*';
};

const toMatch = (game: ChessComGame): MatchRecord => ({
  id: asMatchId(game.uuid || game.url),
  players: {
    [SIDES.white]: {
      username: asUsername(game.white.username),
      rating: asEloRating(game.white.rating),
    },
    [SIDES.black]: {
      username: asUsername(game.black.username),
      rating: asEloRating(game.black.rating),
    },
  },
  playedAt: asTimestamp(game.end_time * 1_000),
  result: resultFromPgn(game.pgn),
  pgn: game.pgn,
});

const toProblem = (
  match: MatchRecord,
  side: Side,
  candidate: AnalysisCandidate,
  index: number
): ReviewProblem => ({
  id: `${match.id}:${candidate.playedMove}:${index}` as ProblemId,
  matchId: match.id,
  playerSide: side,
  ...candidate,
  dueAt: asTimestamp(Date.now()),
  failures: asReviewCount(0),
  successes: asReviewCount(0),
  intervalDays: asIntervalDays(0),
  lastReviewedAt: null,
});

const fetchGames = async (username: ChessComUsername): Promise<readonly ChessComGame[]> => {
  const response = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`
  );
  if (!response.ok) {
    throw new Error('Chess.com player not found');
  }
  const archiveUrls = ((await response.json()) as { archives: readonly string[] }).archives
    .slice(-MAX_RECENT_ARCHIVES)
    .reverse();
  const archives = await Promise.all(
    archiveUrls.map(async (archiveUrl) => {
      const archiveResponse = await fetch(archiveUrl);
      if (!archiveResponse.ok) {
        throw new Error('Could not load recent games');
      }
      return archiveResponse.json() as Promise<{ games: readonly ChessComGame[] }>;
    })
  );
  return archives.flatMap((archive) => archive.games);
};

const fetchProfile = async (username: ChessComUsername): Promise<ChessComProfile> => {
  const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`);
  if (!response.ok) {
    throw new Error('Chess.com player not found');
  }
  return response.json() as Promise<ChessComProfile>;
};

export const importGames = async (
  rawUsername: string,
  database: DiaryDatabase,
  onUpdate?: (database: DiaryDatabase) => void,
  onProgress?: (progress: ImportProgress) => void
): Promise<DiaryDatabase> => {
  const username = asUsername(rawUsername);
  const [profile, loadedGames] = await Promise.all([fetchProfile(username), fetchGames(username)]);
  const games = loadedGames;
  let next = upsertProfile(database, {
    username,
    avatarUrl: profile.avatar ? asAvatarUrl(profile.avatar) : null,
    updatedAt: asTimestamp(Date.now()),
  });
  saveDatabase(next);
  onUpdate?.(next);
  const engine = await StockfishEngine.create();
  let completedGames = 0;
  let discoveredProblems = 0;
  try {
    for (const game of games) {
      const match = toMatch(game);
      if (next.analyzedMatchIds[match.id]) {
        completedGames += 1;
        onProgress?.({ completedGames, totalGames: games.length, discoveredProblems });
        continue;
      }
      next = upsertMatch(next, match);
      saveDatabase(next);
      onUpdate?.(next);
      const side =
        match.players[SIDES.white].username.toLowerCase() === username.toLowerCase()
          ? SIDES.white
          : SIDES.black;
      const candidates = await analyzeMatch(match, username, engine);
      discoveredProblems += candidates.length;
      candidates.forEach((candidate, index) => {
        next = upsertProblem(next, toProblem(match, side, candidate, index));
      });
      next = markMatchAnalyzed(next, match.id);
      completedGames += 1;
      saveDatabase(next);
      onUpdate?.(next);
      onProgress?.({ completedGames, totalGames: games.length, discoveredProblems });
    }
  } finally {
    engine.dispose();
  }
  saveDatabase(next);
  return next;
};
