"use client";

import { use, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "@/components/Board";
import MoveList from "@/components/MoveList";
import { getEngine, evalForWhite, cpToPawns } from "@/lib/chess/engine";
import { aggregate, categorize, detectPattern, uciToSan, PATTERN_LABELS, START_FEN } from "@/lib/chess/analyze";
import { coachForMistake, coachQuestion, exercisePrompt } from "@/lib/chess/coach";
import { BrainCircuit, ChevronRight, MessageSquare } from "lucide-react";

type Game = {
  id: number; title: string; whiteName: string; blackName: string; result: string; userColor: string;
  moves: { san: string; fen: string }[]; reflections: Record<string, { reason?: string; threat?: string }>;
  analysis: { evaluations: Eval[] } | null; analyzedAt: string | null;
};
type Eval = {
  index: number; moveNumber: number; color: string; san: string; fen: string; evalBeforeCp: number; evalAfterCp: number;
  bestSan: string; pv: string; dropCp: number; category: string; pattern: string; explanation?: string; exercisePrompt?: string; userReason?: string;
};

export default function GameReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [ply, setPly] = useState(0);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  if (!loaded.current) {
    loaded.current = true;
    fetch(`/api/games/${id}`).then((r) => r.json()).then((g) => { setGame(g); setPly((g.moves ?? []).length); });
  }

  const fens = useMemo(() => {
    if (!game) return [START_FEN];
    const out = [game.moves[0]?.fen ?? START_FEN];
    for (const m of game.moves) { const g = new Chess(out[out.length - 1]); try { g.move(m.san); } catch { break; } out.push(g.fen()); }
    return out;
  }, [game]);

  async function analyze() {
    if (!game) return;
    setBusy(true);
    try {
      const e = getEngine();
      await e.ready();
      const raw: { cp: number; bestMoveUci: string; pv: string }[] = [];
      for (let i = 0; i < fens.length; i++) {
        setProgress(`Analyzing move ${i}/${fens.length - 1}…`);
        try {
          raw.push(await e.evaluate(fens[i], 12, 1200));
        } catch {
          // engine restarted — retry once, then fall back to a neutral eval
          try {
            raw.push(await e.evaluate(fens[i], 10, 1000));
          } catch {
            raw.push({ cp: raw[i - 1]?.cp !== undefined ? -raw[i - 1].cp : 0, bestMoveUci: "", pv: "" });
          }
        }
      }
      const userColor = game.userColor;
      const evals: Eval[] = game.moves.map((m, i) => {
        const before = raw[i];
        const after = raw[i + 1];
        const g = new Chess(fens[i]);
        const mover = g.turn();
        const me = mover === "w" ? "white" : "black";
        const evalBefore = before.cp; // POV mover
        const evalAfter = -after.cp; // POV mover
        const drop = Math.max(0, Math.round(evalBefore - evalAfter));
        const bestSan = uciToSan(fens[i], before.bestMoveUci) || m.san;
        const category = me === userColor ? categorize(drop, evalBefore) : drop >= 300 ? "blunder" : drop >= 150 ? "mistake" : drop >= 70 ? "inaccuracy" : "good";
        const pattern = me === userColor ? detectPattern(fens[i], m.san, evalBefore, drop, i) : "other";
        const refl = game.reflections?.[String(i + 1)];
        const input = { fen: fens[i], playedSan: m.san, bestSan, dropCp: drop, category, pattern, moveNumber: Math.floor(i / 2) + 1 };
        return {
          index: i, moveNumber: Math.floor(i / 2) + 1, color: me, san: m.san, fen: fens[i],
          evalBeforeCp: Math.round(evalBefore), evalAfterCp: Math.round(evalAfter), bestSan, pv: before.pv,
          dropCp: drop, category: category === "good" ? "good" : category, pattern: pattern === "other" ? "planning" : pattern,
          ...(me === userColor && category !== "good"
            ? { explanation: coachForMistake(input as never), exercisePrompt: exercisePrompt(pattern, me, drop), userReason: refl?.reason }
            : {}),
        };
      });
      await fetch(`/api/games/${id}/analysis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluations: evals }) });
      setGame({ ...game, analysis: { evaluations: evals }, analyzedAt: new Date().toISOString() });
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function saveWhy(moveIdx: number, reason: string) {
    if (!game) return;
    const reflections = { ...game.reflections, [String(moveIdx)]: { ...(game.reflections?.[String(moveIdx)] ?? {}), reason } };
    setGame({ ...game, reflections });
    await fetch(`/api/games/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reflections }) });
  }

  if (!game) return <p className="text-muted">Loading…</p>;

  const evals = game.analysis?.evaluations ?? null;
  const myErrors = (evals ?? []).filter((e) => e.color === game.userColor && e.category !== "good");
  const agg = evals ? aggregate(evals as never, game.userColor) : null;
  const categories = evals ? evals.map((e) => (e.category === "good" ? null : e.category)) : undefined;
  const cur = ply > 0 ? evals?.[ply - 1] : null;

  // eval sparkline (white POV, clamped)
  const points = evals
    ? (() => {
        const clamp = (v: number) => Math.max(-500, Math.min(500, v));
        const ys2 = evals.map((e) => clamp(e.color === "white" ? e.evalAfterCp : -e.evalAfterCp));
        const all = [clamp(evalForWhite(evals[0].evalBeforeCp, fens[0])), ...ys2];
        const w = 100 / Math.max(1, all.length - 1);
        return all.map((v, idx) => `${idx * w},${50 - v / (500 / 44)}`).join(" ");
      })()
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{game.title}</h1>
          <p className="text-sm text-muted">{game.whiteName} vs {game.blackName} — you played {game.userColor} · result {game.result}</p>
        </div>
        <button className="btn btn-gold" onClick={analyze} disabled={busy || !game.moves.length}>
          <BrainCircuit size={15} /> {busy ? progress || "Starting…" : game.analyzedAt ? "Re-analyze" : "Analyze with Stockfish"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
        <div>
          <div className="board-glow">
            <Board fen={fens[ply]} boardId="review" interactive={false} orientation={game.userColor as "white" | "black"}
              lastMove={ply > 0 && game.moves[ply - 1] ? (() => { const g = new Chess(fens[ply - 1]); const m = g.moves({ verbose: true }).find((x) => x.san === game.moves[ply - 1].san); return m ? { from: m.from, to: m.to } : null; })() : null}
            />
          </div>
          {evals && (
            <div className="panel2 mt-3 px-3 py-2">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-14 w-full">
                <rect x="0" y="0" width="100" height="50" fill="#e8dcc2" opacity="0.85" />
                <rect x="0" y="50" width="100" height="50" fill="#22291f" />
                <polyline points={points} fill="none" stroke="#e0b04c" strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke" transform="translate(0,0)" />
                {ply > 0 && <line x1={(100 / Math.max(1, evals.length)) * ply} x2={(100 / Math.max(1, evals.length)) * ply} y1="0" y2="100" stroke="#e0b04c" strokeWidth="0.6" />}
              </svg>
              <p className="mt-1 text-center text-xs text-muted">white's evaluation, move by move</p>
            </div>
          )}
          {cur && cur.category !== "good" && (
            <div className="panel mt-3 border-l-4 p-4" style={{ borderLeftColor: cur.category === "blunder" ? "#d76a5e" : cur.category === "mistake" ? "#d8a23a" : "#93a094" }}>
              <p className="label">{cur.category} · {PATTERN_LABELS[cur.pattern] ?? cur.pattern}</p>
              <p className="mt-1 text-sm"><span className="text-bad line-through">{cur.san}</span> <ChevronRight size={13} className="inline" /> <strong className="text-good">{cur.bestSan}</strong> <span className="text-muted">({cpToPawns(cur.evalBeforeCp)} → {cpToPawns(cur.evalAfterCp)})</span></p>
              {cur.explanation && <p className="coach-quote mt-2 text-[15px] text-cream/90">{cur.explanation}</p>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {agg && (
            <div className="panel p-4">
              <p className="label mb-2">Coach verdict</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Metric v={String(agg.blunders)} l="blunders" bad />
                <Metric v={String(agg.mistakes)} l="mistakes" warn />
                <Metric v={String(agg.inaccuracies)} l="inaccuracies" />
                <Metric v={`${agg.acpl}`} l="avg cp loss" />
              </div>
              <p className="coach-quote mt-3 text-sm text-muted">
                {agg.blunders >= 3
                  ? "Too many blunders — that's not a knowledge problem, it's a checking-before-moving problem. One scan per move and this game is competitive."
                  : agg.blunders === 0 && agg.mistakes <= 1
                    ? "Clean game by your standards. Now we sharpen: convert advantages faster and tighten the opening phase."
                    : "Average for you right now. The pattern list below is your training program — not generic puzzles, YOUR positions."}
              </p>
            </div>
          )}
          <div className="panel p-4">
            <p className="label mb-2">Moves</p>
            <MoveList sans={game.moves.map((m) => m.san)} currentPly={ply} onSelect={setPly} categories={categories} />
          </div>
        </div>
      </div>

      {myErrors.length > 0 && (
        <section className="panel p-5">
          <h2 className="font-display text-xl font-semibold">Critical moments — your side</h2>
          <p className="mb-4 text-sm text-muted">These positions are now in your training queue. Answer the coach honestly — it affects your training.</p>
          <div className="space-y-4">
            {myErrors.map((e) => (
              <div key={e.index} className="panel2 grid gap-3 p-4 md:grid-cols-[200px_1fr]">
                <div className="cursor-pointer" onClick={() => setPly(e.index + 1)}>
                  <div className="board-glow"><Board fen={e.fen} boardId={`err-${e.index}`} interactive={false} orientation={game.userColor as "white" | "black"} /></div>
                </div>
                <div>
                  <p className="text-sm">
                    <span className="pill bg-panel text-warn mr-2">move {e.moveNumber}{e.color === "black" ? "…" : "."}</span>
                    <span className="text-bad line-through">{e.san}</span> → <strong className="text-good">{e.bestSan}</strong>
                    <span className="ml-2 text-xs text-muted">{PATTERN_LABELS[e.pattern] ?? e.pattern}</span>
                  </p>
                  <p className="coach-quote mt-1.5 text-[15px] text-cream/90">{e.explanation}</p>
                  <div className="mt-2 flex items-start gap-2">
                    <MessageSquare size={14} className="mt-2 text-muted" />
                    <input
                      className="input text-sm"
                      placeholder={coachQuestion(e as never)}
                      defaultValue={game.reflections?.[String(e.index + 1)]?.reason ?? ""}
                      onBlur={(ev) => saveWhy(e.index + 1, ev.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ v, l, bad, warn }: { v: string; l: string; bad?: boolean; warn?: boolean }) {
  return (
    <div className="panel2 px-2 py-2">
      <p className={`font-display text-xl font-semibold ${bad ? "text-bad" : warn ? "text-warn" : "text-cream"}`}>{v}</p>
      <p className="text-[11px] text-muted">{l}</p>
    </div>
  );
}
