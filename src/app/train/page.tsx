"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import Link from "next/link";
import Board from "@/components/Board";
import { feedbackAfterAttempt } from "@/lib/chess/coach";
import { PATTERN_LABELS } from "@/lib/chess/analyze";
import { Dumbbell, Check, X, ArrowRight } from "lucide-react";

type Due = {
  id: number; kind: string; fen: string; prompt: string; solutionSan: string; box: number; attempts: number;
  mistakeId: number | null; pattern: string | null; playedSan: string | null; explanation: string | null; userReason: string | null;
};

type Phase = "think" | "verdict";

export default function TrainPage() {
  const [queue, setQueue] = useState<Due[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [patternCounts, setPatternCounts] = useState<{ pattern: string; count: number }[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("think");
  const [selected, setSelected] = useState<{ san: string } | null>(null);
  const [solved, setSolved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [doneCount, setDoneCount] = useState(0);

  async function load() {
    setLoading(true);
    const r = await (await fetch("/api/exercises")).json();
    setQueue(r.due); setTotalDue(r.totalDue); setPatternCounts(r.patternCounts);
    setIdx(0); setPhase("think"); setSelected(null); setSolved(null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const ex = queue[idx];
  const game = useMemo(() => (ex ? new Chess(ex.fen) : null), [ex]);
  const myColor = game ? (game.turn() === "w" ? "white" : "black") : "white";

  function onMove(from: string, to: string): boolean {
    if (!ex || phase !== "think") return false;
    const g = new Chess(ex.fen);
    try {
      const m = g.move({ from, to, promotion: "q" });
      setSelected({ san: m.san });
      const ok = normalize(m.san) === normalize(ex.solutionSan);
      void answer(ok);
      return false; // don't mutate board until verdict
    } catch { return false; }
  }

  function normalize(s: string) {
    return s.replace(/[+#!?]+$/, "");
  }

  async function answer(ok: boolean) {
    setSolved(ok);
    setPhase("verdict");
    await fetch(`/api/exercises/${ex!.id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ solved: ok }) });
    setDoneCount((d) => d + 1);
  }

  function next() {
    if (idx + 1 < queue.length) { setIdx(idx + 1); setPhase("think"); setSelected(null); setSolved(null); }
    else load();
  }

  if (loading) return <p className="text-muted">Preparing your drills…</p>;

  if (!ex) {
    return (
      <div className="panel mx-auto max-w-xl p-8 text-center">
        <Dumbbell size={28} className="mx-auto mb-3 text-gold" />
        <h1 className="font-display text-2xl font-semibold">{doneCount > 0 ? "Session complete." : "Nothing due right now."}</h1>
        <p className="coach-quote mt-2 text-muted">
          {doneCount > 0
            ? `You worked through ${doneCount} of your own positions. That is exactly how patterns die. Come back when the schedule knocks again.`
            : "Analyze a game first — every mistake you make becomes an exercise in this queue automatically."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/games" className="btn btn-ghost">Analyze a game</Link>
          <Link href="/openings" className="btn btn-gold">Drill openings</Link>
        </div>
      </div>
    );
  }

  const occurrences = ex.pattern ? patternCounts.find((p) => p.pattern === ex.pattern)?.count ?? 1 : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold">Weakness training</h1>
          <p className="text-sm text-muted">{totalDue} due today · exercise {idx + 1} of {queue.length} · box {ex.box}/5 {ex.pattern ? `· ${PATTERN_LABELS[ex.pattern] ?? ex.pattern}` : `· ${ex.kind}`}</p>
        </div>
        <div className="pill bg-felt text-cream">{occurrences > 1 ? `Pattern seen ${occurrences}× in your games` : "From your games"}</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
        <div>
          <div className="board-glow">
            <Board fen={ex.fen} boardId={`train-${ex.id}`} orientation={myColor} onMove={onMove} interactive={phase === "think"}
              lastMove={phase === "verdict" && selected ? moved(ex.fen, selected.san) : undefined} />
          </div>
          {phase === "verdict" && (
            <p className="mt-2 text-center text-sm text-muted">You played <strong className="text-cream">{selected?.san}</strong></p>
          )}
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <p className="label">{ex.kind} exercise · {myColor} to move</p>
            <p className="coach-quote mt-2 text-lg leading-snug">{ex.prompt}</p>
            {phase === "think" ? (
              <div className="mt-4 rounded-lg border border-line bg-panel2 p-3 text-sm text-muted">
                <p className="mb-1 font-semibold text-cream">Think before moving. Same routine as OTB:</p>
                <ol className="list-inside list-decimal space-y-0.5">
                  <li>What changed / what's threatened?</li>
                  <li>Checks → Captures → Threats.</li>
                  <li>Blunder-check the final position.</li>
                </ol>
              </div>
            ) : (
              <div className={`mt-4 rounded-lg border p-4 ${solved ? "border-felt bg-felt2/40" : "border-bad/40 bg-bad/10"}`}>
                <p className="flex items-center gap-2 font-semibold">
                  {solved ? <Check size={16} className="text-good" /> : <X size={16} className="text-bad" />}
                  {solved ? "Correct." : `Not it — the move was ${ex.solutionSan}.`}
                </p>
                <p className="coach-quote mt-2 text-sm text-cream/90">{feedbackAfterAttempt(solved!, ex.pattern ?? ex.kind, ex.solutionSan, occurrences)}</p>
                {ex.userReason && <p className="mt-2 text-xs text-muted">When you played it in the game you said: “{ex.userReason}”</p>}
                {ex.explanation && <details className="mt-2 text-sm"><summary className="cursor-pointer text-gold">The coach's full note from the game</summary><p className="mt-1 text-muted">{ex.explanation}</p></details>}
                <p className="mt-2 text-xs text-muted">{solved ? (ex.box >= 5 ? "Mastered — retired." : `Next review in ${[0,1,2,4,7,15][Math.min(5, ex.box + 1)]} day(s).`) : "Back to box 1 — you'll see this again tomorrow."}</p>
                <button className="btn btn-gold mt-3" onClick={next}>{idx + 1 < queue.length ? "Next position" : "Check for more"} <ArrowRight size={14} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function moved(fen: string, san: string) {
  try {
    const g = new Chess(fen);
    const m = g.moves({ verbose: true }).find((x) => x.san === san);
    return m ? { from: m.from, to: m.to } : null;
  } catch { return null; }
}
