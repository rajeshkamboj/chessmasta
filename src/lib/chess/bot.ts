import { Chess } from "chess.js";
import { getEngine } from "./engine";

export type BotMove = { from: string; to: string; promotion?: string; blundered: boolean };

// ELO 300..1800 → search depth, candidate pool, human blunder rate.
export function eloConfig(elo: number) {
  const t = Math.max(0, Math.min(1, (elo - 300) / 1500));
  return {
    depth: Math.max(1, Math.round(1 + t * 15)), // 1 → 16
    k: elo < 900 ? 6 : elo < 1400 ? 4 : 3,
    temperature: Math.max(0.03, 0.55 * (1 - t)), // rank-sampling sharpness
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

export async function pickBotMove(fen: string, elo: number): Promise<BotMove | null> {
  const game = new Chess(fen);
  const legal = game.moves({ verbose: true });
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

  const e = getEngine();
  await e.ready();
  const multi = await e.evaluateMulti(fen, cfg.depth, cfg.k);
  if (!multi.moves.length) {
    const m = legal[Math.floor(Math.random() * legal.length)];
    return { from: m.from, to: m.to, promotion: m.promotion, blundered: false };
  }
  // Weighted rank sampling: best move usually, but not always — and less often when weak.
  const weights = multi.moves.map((_, i) => Math.pow(cfg.temperature, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let choice = multi.moves[0];
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      choice = multi.moves[i];
      break;
    }
  }
  return { from: choice.uci.slice(0, 2), to: choice.uci.slice(2, 4), promotion: choice.uci[4], blundered: false };
}
