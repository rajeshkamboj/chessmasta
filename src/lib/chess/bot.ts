import { Chess, Move } from "chess.js";
import { browserEngineAvailable, getEngine } from "./engine";

export type BotMove = { from: string; to: string; promotion?: string; blundered: boolean; fallback?: boolean };

// ELO 300..1800 → search depth, candidate pool, thinking time, human blunder rate.
export function eloConfig(elo: number) {
  const t = Math.max(0, Math.min(1, (elo - 300) / 1500));
  return {
    depth: Math.max(1, Math.round(1 + t * 13)), // 1 → 14
    movetime: Math.round(250 + t * 1250), // 250ms → 1.5s
    k: elo < 900 ? 6 : elo < 1400 ? 4 : 3,
    temperature: Math.max(0.03, 0.55 * (1 - t)),
    blunderChance: Math.max(0.01, 0.42 * Math.pow(1 - t, 1.4)),
  };
}

export function eloDescription(elo: number): string {
  if (elo <= 400) return "just learned the rules — hangs pieces";
  if (elo <= 600) return "beginner — grabs anything en prise";
  if (elo <= 800) return "your father's level — solid-ish, misses tactics";
  if (elo <= 1100) return "club player — watches threats, shallow plans";
  if (elo <= 1400) return "strong club — real opening play, few blunders";
  if (elo <= 1600) return "tournament player — punishes mistakes";
  return "sharp — you'd better be fully awake";
}

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** Engine-free 1-ply greedy player. Used if Stockfish is unavailable so the game never freezes. */
export function fallbackMove(fen: string): BotMove | null {
  const g = new Chess(fen);
  const legal = g.moves({ verbose: true }) as Move[];
  if (!legal.length) return null;
  let best: Move = legal[0];
  let bestScore = -Infinity;
  for (const m of legal) {
    const test = new Chess(fen);
    test.move(m);
    let score = m.captured ? VAL[m.captured] : 0;
    if (test.isCheckmate()) score += 100000;
    // penalise moving to a square the opponent attacks with something cheaper
    const attackers = (test.attackers(m.to, test.turn()) as string[] | undefined) ?? [];
    if (attackers.length) score -= VAL[m.piece] * 0.8;
    score += Math.random() * 40;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return { from: best.from, to: best.to, promotion: best.promotion, blundered: false, fallback: true };
}

export async function pickBotMove(fen: string, elo: number): Promise<BotMove | null> {
  const game = new Chess(fen);
  const legal = game.moves({ verbose: true }) as Move[];
  if (!legal.length) return null;
  const cfg = eloConfig(elo);

  // Human-style slip: low-rated players grab loose pieces, chase checks, lose the thread.
  if (Math.random() < cfg.blunderChance) {
    const captures = legal.filter((m) => m.captured);
    const checks = legal.filter((m) => m.san.includes("+"));
    const pawnPushes = legal.filter((m) => m.piece === "p");
    const roll = Math.random();
    const pool =
      captures.length && roll < 0.45
        ? captures
        : checks.length && roll < 0.65
          ? checks
          : pawnPushes.length && roll < 0.8
            ? pawnPushes
            : legal;
    const m = pool[Math.floor(Math.random() * pool.length)];
    return { from: m.from, to: m.to, promotion: m.promotion, blundered: true };
  }

  if (!browserEngineAvailable()) return fallbackMove(fen);

  try {
    const e = getEngine();
    const multi = await e.evaluateMulti(fen, cfg.depth, cfg.k, cfg.movetime);
    const usable = multi.moves.filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m.uci));
    if (!usable.length) return fallbackMove(fen);
    // Weighted rank sampling: best move usually, but not always — less often when weak.
    const weights = usable.map((_, i) => Math.pow(cfg.temperature, i));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let choice = usable[0];
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        choice = usable[i];
        break;
      }
    }
    // Validate against the rules before trusting it.
    const test = new Chess(fen);
    try {
      test.move({ from: choice.uci.slice(0, 2), to: choice.uci.slice(2, 4), promotion: choice.uci[4] || "q" });
    } catch {
      return fallbackMove(fen);
    }
    return { from: choice.uci.slice(0, 2), to: choice.uci.slice(2, 4), promotion: choice.uci[4], blundered: false };
  } catch {
    return fallbackMove(fen);
  }
}
