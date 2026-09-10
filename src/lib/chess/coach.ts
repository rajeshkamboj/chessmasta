import { Chess } from "chess.js";
import { cpToPawns } from "./engine";
import { nameOf, uciToSan } from "./analyze";

export type MistakeInput = {
  fen: string;
  playedSan: string;
  bestSan: string;
  dropCp: number;
  category: string;
  pattern: string;
  moveNumber: number;
  pv?: string;
};

function pieceThatMoved(fen: string, san: string): string {
  try {
    const g = new Chess(fen);
    const m = g.moves({ verbose: true }).find((x) => x.san === san);
    if (m) return nameOf(m.piece);
  } catch {
    /* fall through */
  }
  return "piece";
}

function defenseHint(fen: string, bestSan: string): string {
  try {
    const g = new Chess(fen);
    const m = g.moves({ verbose: true }).find((x) => x.san === bestSan);
    if (!m) return "";
    if (m.captured) return ` — it would simply capture on ${m.to}`;
    if (m.san.includes("+")) return " — giving check first";
    if (m.piece === "k" || m.san === "O-O" || m.san === "O-O-O") return " — getting your king safe";
    return ` — moving your ${nameOf(m.piece)} to ${m.to}`;
  } catch {
    return "";
  }
}

export function coachForMistake(m: MistakeInput): string {
  const piece = pieceThatMoved(m.fen, m.playedSan);
  const lost = (Math.min(m.dropCp, 600) / 100).toFixed(1);
  const hint = defenseHint(m.fen, m.bestSan);

  const head =
    m.category === "blunder"
      ? `That was a blunder (${m.playedSan} lost about ${lost} pawns' worth).`
      : m.category === "mistake"
        ? `${m.playedSan} is a real mistake — it cost you roughly ${lost} pawns.`
        : `${m.playedSan} is slightly inaccurate.`;

  switch (m.pattern) {
    case "hanging_piece":
      return `${head} You moved your ${piece} and left material undefended. Before you release a move, ask yourself: “After my move, which of my pieces can he simply take?” The answer here was ${m.bestSan}${hint}. Protect your pieces first, then carry out your plan. Loose pieces drop off — this is fixable.`;
    case "overlooked_threat":
      return `${head} You carried on with your own idea while your opponent's threat was still on the board. Rule: after every single opponent move, ask “What does that move threaten?” before you think about anything else. ${m.bestSan}${hint} answered the threat; ${m.playedSan} ignored it.`;
    case "missed_tactic":
      return `${head} More importantly — you had ${m.bestSan}${hint}, which was winning or close to it. You were better and let it slip. At your level, tactical alertness in winning positions converts to real rating points: look for Checks, Captures, Threats first when you're ahead.`;
    case "mate_missed":
      return `${head} You had a forced mate in the position. When the enemy king is exposed, slow down and calculate checks to the end — you don't get these chances twice. ${m.bestSan} kept the attack going.`;
    case "opening":
      return `${head} In the opening, follow the checklist: center, develop knights and bishops, castle, connect rooks. ${m.bestSan}${hint} did that; ${m.playedSan} drifted. You don't need more theory — you need to *trust* your simple repertoire and stop improvising.`;
    case "endgame":
      return `${head} Endgames are precision: king activity, passed pawns, opposition. ${m.bestSan}${hint} was the technique; ${m.playedSan} gave away the plan. We'll add endgame drills.`;
    case "calculation":
      return `${head} This is a calculation error: the concrete line worked against you. ${m.bestSan}${hint} avoided it. When you calculate, don't stop after your opponent's first reply — visualize the final position and check it for tactics before moving.`;
    default:
      return `${head} Your move lacked a concrete purpose. ${m.bestSan}${hint} improved your position with a plan. After each of your moves, be able to say in one sentence what it achieves and what it allows.`;
  }
}

// Ask-style followup used in the OTB trainer / review page
export function coachQuestion(m: MistakeInput): string {
  switch (m.pattern) {
    case "hanging_piece":
      return "What did your move leave undefended? Remember the drill: look at the position AFTER your move, not before.";
    case "overlooked_threat":
      return "What was your opponent's last move threatening? Answering that question every move is your #1 OTB habit to build.";
    case "missed_tactic":
      return "Start from force: what Checks, Captures and Threats did you have here?";
    case "calculation":
      return "How deep did you actually calculate — two moves, or to quiescence?";
    case "opening":
      return "Was this still your repertoire? If not, what was your fallback principle?";
    default:
      return "In one sentence: what did you want, and what did you allow?";
  }
}

export function exercisePrompt(pattern: string, color: string, dropCp: number): string {
  const grade = dropCp >= 300 ? " (this one cost you a lot)" : "";
  switch (pattern) {
    case "overlooked_threat":
      return `You ignored a threat here as ${color}. Find the move that answers it${grade}.`;
    case "hanging_piece":
      return `You left material hanging here as ${color}. Find the move that keeps everything protected${grade}.`;
    case "missed_tactic":
      return `You were better here as ${color} but missed the knockout. Find it now${grade}.`;
    case "mate_missed":
      return `There is a forced mate here. Find the first move.`;
    case "opening":
      return `Opening decision you got wrong as ${color}. Play the principled move${grade}.`;
    case "endgame":
      return `Endgame technique as ${color}. Find the precise move${grade}.`;
    default:
      return `You went wrong here as ${color}. Find the best move${grade}.`;
  }
}

export function feedbackAfterAttempt(solved: boolean, pattern: string, solutionSan: string, occurrences: number): string {
  const streak = occurrences > 1 ? ` You have made this mistake type ${occurrences} times — that is exactly why we drill it.` : "";
  if (solved) {
    switch (pattern) {
      case "overlooked_threat":
        return `Good — you found ${solutionSan}. That habit of checking his threat first is what stops these games from slipping.${streak}`;
      case "hanging_piece":
        return `Correct, ${solutionSan} keeps everything guarded. One blunder-check per move saves more points than any opening.${streak}`;
      case "missed_tactic":
        return `Sharp. ${solutionSan} was the shot. Checks-Captures-Threats scanning is becoming a weapon for you.${streak}`;
      default:
        return `Right — ${solutionSan} was the move. Pattern banked; the next review will tell us if it stuck.${streak}`;
    }
  }
  switch (pattern) {
    case "overlooked_threat":
      return `Not it. His threat came first — the answer was ${solutionSan}. We'll show this one again soon.${streak}`;
    case "hanging_piece":
      return `Missed. ${solutionSan} was needed to keep your pieces safe. Count attackers AND defenders before every move.${streak}`;
    case "missed_tactic":
      return `You still don't see it: ${solutionSan}. Force first — checks, captures, threats. We'll revisit.${streak}`;
    default:
      return `No — the move was ${solutionSan}. Study the position, then expect to see it again in a few days.${streak}`;
  }
}

export function threatReveal(bestSanOpp: string, fen: string): string {
  const san = uciToSan(fen, bestSanOpp) || bestSanOpp;
  return `The point: his idea was ${san}. Compare that to what you thought he was threatening.`;
}

export function progressVerdict(trend: { recentAcpl: number; olderAcpl: number; blundersRecent: number; blundersOlder: number }): string {
  const { recentAcpl, olderAcpl, blundersRecent, blundersOlder } = trend;
  if (recentAcpl < olderAcpl - 15 && blundersRecent <= blundersOlder)
    return "Real progress: your average mistake size is shrinking and your blunders are going down. This is how ratings actually move. Keep drilling.";
  if (blundersRecent < blundersOlder)
    return "You are blundering less often — the single biggest lever at your level. Next: convert better positions (missed tactics are your next ceiling).";
  if (recentAcpl > olderAcpl + 15)
    return "Warning: your last games were *worse* than usual. That usually means playing too fast or tired. Slow down; use the Checks-Captures-Threats routine before every move.";
  return "Stable. Not enough games to call a trend — play and record more.";
}

export function gamesSummaryLine(n: number, topPattern: string, count: number): string {
  if (n === 0) return "No analyzed games yet. Record a game against your father and let's find out what is *actually* happening.";
  return `Across your analyzed play, your #1 leak is «${topPattern}» — ${count} times. We fix that and your results against 600–800 players change immediately.`;
}
