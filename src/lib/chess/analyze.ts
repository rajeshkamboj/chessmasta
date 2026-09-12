import { Chess } from "chess.js";
type Square = import("chess.js").Square;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type MoveRecord = { san: string; fen: string }; // fen = position BEFORE the move

export function replaySans(sans: string[], startFen = START_FEN): MoveRecord[] {
  const g = new Chess(startFen);
  const out: MoveRecord[] = [];
  for (const san of sans) {
    const fen = g.fen();
    try {
      g.move(san);
    } catch {
      break;
    }
    out.push({ san, fen });
  }
  return out;
}

export function sansFromPgn(pgn: string): string[] {
  const g = new Chess();
  try {
    g.loadPgn(pgn);
  } catch {
    return [];
  }
  return g.history();
}

export function finalFen(moves: MoveRecord[]): string {
  if (!moves.length) return START_FEN;
  const g = new Chess(moves[moves.length - 1].fen);
  g.move(moves[moves.length - 1].san);
  return g.fen();
}

const PIECE_VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export type MoveEval = {
  index: number; // ply index
  moveNumber: number;
  color: "white" | "black";
  san: string;
  fen: string; // before
  evalBeforeCp: number; // POV mover
  evalAfterCp: number; // POV mover
  bestSan: string;
  pv: string;
  dropCp: number;
  category: "good" | "inaccuracy" | "mistake" | "blunder" | "checkmate";
  pattern: string;
};

export const PATTERNS = [
  "hanging_piece",
  "missed_tactic",
  "mate_missed",
  "overlooked_threat",
  "opening",
  "endgame",
  "calculation",
  "planning",
] as const;

export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<string, string> = {
  hanging_piece: "Left a piece hanging",
  missed_tactic: "Missed a winning tactic",
  mate_missed: "Missed a mating attack",
  overlooked_threat: "Ignored the opponent's threat",
  opening: "Weak opening decision",
  endgame: "Endgame technique",
  calculation: "Calculation error",
  planning: "No clear plan",
};

function sideMaterial(g: Chess, color: "w" | "b"): number {
  let s = 0;
  for (const row of g.board())
    for (const c of row) if (c && c.color === color && c.type !== "k") s += PIECE_VAL[c.type];
  return s;
}

function isEndgame(g: Chess): boolean {
  const wm = sideMaterial(g, "w");
  const bm = sideMaterial(g, "b");
  const queensOff = !/[Qq]/.test(g.fen().split(" ")[0]);
  return (queensOff && wm + bm <= 2600) || wm + bm <= 1600;
}

// Is square `sq` (occupied by `color`) hanging for `color`'s opponent? (basic LPTO check)
function squareHanging(g: Chess, sq: Square, color: "w" | "b"): boolean {
  const piece = g.get(sq);
  if (!piece || piece.type === "k") return false;
  const opp = color === "w" ? "b" : "w";
  const attackers = (g.attackers(sq, opp) as Square[] | undefined) ?? [];
  if (!attackers.length) return false;
  const defenders = (g.attackers(sq, color) as Square[] | undefined) ?? [];
  if (!defenders.length) return true;
  const minAtk = Math.min(...attackers.map((a) => PIECE_VAL[g.get(a)?.type ?? "p"]));
  return PIECE_VAL[piece.type] > minAtk + 50; // attacker is cheaper => loose
}

type Piece = { square: Square; type: string; color: "w" | "b" };

function hangingPieces(g: Chess, color: "w" | "b"): Piece[] {
  const out: Piece[] = [];
  for (const row of g.board())
    for (const c of row)
      if (c && c.color === color && c.type !== "k" && squareHanging(g, c.square as Square, color))
        out.push(c as Piece);
  return out;
}

export function detectPattern(
  fenBefore: string,
  playedSan: string,
  evalBeforeCp: number,
  dropCp: number,
  ply: number
): Pattern {
  const before = new Chess(fenBefore);
  const mover = before.turn();
  const moveNumber = Math.floor(ply / 2) + 1;

  // Missed mate
  if (evalBeforeCp >= 90000) return "mate_missed";

  const after = new Chess(fenBefore);
  after.move(playedSan);

  // Was a piece already attacked & hanging before, and the move ignored it while something else fell?
  const hangBefore = hangingPieces(before, mover);
  const hangAfter = hangingPieces(after, mover);
  const bestVal = hangAfter.length ? Math.max(...hangAfter.map((p) => PIECE_VAL[p.type])) : 0;

  if (hangAfter.length > 0 && dropCp >= 120) {
    // new hanging piece created by this move?
    const newOnes = hangAfter.filter((p) => !hangBefore.some((q) => q.square === p.square));
    if (newOnes.length > 0) return "hanging_piece";
    if (hangBefore.some((p) => hangAfter.some((q) => q.square === p.square)) && bestVal >= 150)
      return "overlooked_threat";
  }

  // Had a big advantage and failed to convert => missed tactic
  if (evalBeforeCp >= 180 && dropCp >= 150) return "missed_tactic";

  if (moveNumber <= 10) return "opening";
  if (isEndgame(before)) return "endgame";
  return dropCp >= 260 ? "calculation" : "planning";
}

export function isCheckmateMove(fenBefore: string, san: string): boolean {
  try {
    const g = new Chess(fenBefore);
    const m = g.move(san);
    return Boolean(m && g.isCheckmate());
  } catch {
    return false;
  }
}

export function categorize(dropCp: number, evalBefore: number, isTerminal = false): MoveEval["category"] {
  if (isTerminal) return "checkmate";
  // Already dead lost or dead won: small wobbles aren't "mistakes" worth training.
  const abs = Math.abs(evalBefore);
  if (abs >= 600 && dropCp < abs * 0.5) return "good";
  if (dropCp >= 300) return "blunder";
  if (dropCp >= 150) return "mistake";
  if (dropCp >= 70) return "inaccuracy";
  return "good";
}

export type GameAggregate = {
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  acpl: number; // average centipawn loss
  byPattern: Record<string, number>;
};

export function aggregate(evaluations: MoveEval[], userColor: string): GameAggregate {
  const mine = evaluations.filter((e) => e.color === userColor);
  const nonTerminal = mine.filter((e) => e.category !== "good" && e.category !== "checkmate");
  const byPattern: Record<string, number> = {};
  for (const e of nonTerminal) byPattern[e.pattern] = (byPattern[e.pattern] ?? 0) + 1;
  return {
    blunders: nonTerminal.filter((e) => e.category === "blunder").length,
    mistakes: nonTerminal.filter((e) => e.category === "mistake").length,
    inaccuracies: nonTerminal.filter((e) => e.category === "inaccuracy").length,
    acpl: mine.length
      ? Math.round(mine.reduce((s, e) => s + (e.category === "checkmate" ? 0 : Math.min(e.dropCp, 300)), 0) / mine.length)
      : 0,
    byPattern,
  };
}

// ---- Thinking-process helpers (Checks / Captures / Threats) ----

export function checksCapturesThreats(fen: string): { checks: string[]; captures: string[]; threats: string[] } {
  const g = new Chess(fen);
  const me = g.turn();
  const moves = g.moves({ verbose: true });
  const opp = me === "w" ? "b" : "w";
  const checks = moves.filter((m) => m.san.includes("+") || m.san.includes("#")).map((m) => m.san);
  const captures = moves
    .filter((m) => m.captured)
    .sort((a, b) => PIECE_VAL[b.captured!] - PIECE_VAL[a.captured!])
    .slice(0, 6)
    .map((m) => m.san);
  // threats: opponent pieces I attack (hanging for them)
  const theirHanging = hangingPieces(g, opp)
    .sort((a, b) => PIECE_VAL[b.type] - PIECE_VAL[a.type])
    .slice(0, 4)
    .map((p) => `${nameOf(p.type)} on ${p.square}`);
  return { checks, captures, threats: theirHanging };
}

export function nameOf(t: string): string {
  return ({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" } as Record<string, string>)[t] ?? t;
}

// What does the opponent's last move threaten? (Called on position where user is to move.)
export function opponentThreats(fen: string): string[] {
  const g = new Chess(fen);
  const me = g.turn();
  const out: string[] = [];
  // my hanging pieces
  for (const p of hangingPieces(g, me).sort((a, b) => PIECE_VAL[b.type] - PIECE_VAL[a.type]).slice(0, 3))
    out.push(`Your ${nameOf(p.type)} on ${p.square} is under attack`);
  // opponent checking moves available next
  const opp = me === "w" ? "b" : "w";
  // simulate: null move not supported; scan current moves for checks against my king later — approximate via opponent's capture options after a pass is unreliable, so use current info only.
  void opp;
  if (g.inCheck()) out.unshift("You are in check — deal with it first");
  return out;
}

export function uciToSan(fen: string, uci: string): string {
  if (!uci || uci === "(none)") return "";
  try {
    const g = new Chess(fen);
    const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return m.san;
  } catch {
    return uci;
  }
}
