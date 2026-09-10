"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import Board from "@/components/Board";
import { BookOpen, Play, RotateCcw, Shield } from "lucide-react";
import { START_FEN } from "@/lib/chess/analyze";

type Line = {
  id: number; color: "white" | "black"; name: string; against: string; moves: string[]; startBy: "white" | "black";
  plan: string; traps: string; deviation: string; box: number; streak: number; attempts: number; dueAt: string;
};

export default function OpeningsPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [drill, setDrill] = useState<Line | null>(null);
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() { setLines(await (await fetch("/api/openings")).json()); }
  useEffect(() => { load(); }, []);

  const fens = useMemo(() => {
    if (!drill) return [START_FEN];
    const out: string[] = [];
    const g = new Chess(START_FEN);
    for (const san of drill.moves) { try { g.move(san); } catch { break; } out.push(g.fen()); }
    return [START_FEN, ...out];
  }, [drill]);

  // auto-play opponent moves during a drill
  useEffect(() => {
    if (!drill || done) return;
    const movesBefore = idx; // number of half-moves already played
    const sideToMove = movesBefore % 2 === 0 ? "white" : "black";
    if (sideToMove !== drill.color) {
      const t = setTimeout(() => setIdx((m) => m + 1), 500);
      return () => clearTimeout(t);
    }
  }, [idx, drill, done]);

  function onMove(from: string, to: string): boolean {
    if (!drill || done) return false;
    const expected = drill.moves[idx];
    const g = new Chess(fens[idx]);
    try {
      const m = g.move({ from, to, promotion: "q" });
      if (m.san.replace(/[+#]$/, "") === expected.replace(/[+#]$/, "")) {
        setMsg("Good — that's the repertoire move.");
        const next = idx + 1;
        if (next >= drill.moves.length) finish();
        else setIdx(next);
      } else {
        setErrors((e) => e + 1);
        setMsg(`Not the repertoire move (${m.san}). In ${drill.name} we play ${expected} here — because of the plan, not memorization.`);
      }
      return false;
    } catch { return false; }
  }

  async function finish() {
    setDone(true);
    const clean = errors === 0;
    await fetch("/api/openings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: drill!.id, solved: clean }) });
    load();
  }

  function startDrill(line: Line) { setDrill(line); setIdx(0); setErrors(0); setDone(false); setMsg(""); }

  const due = (l: Line) => new Date(l.dueAt) <= new Date();
  const white = lines.filter((l) => l.color === "white");
  const black = lines.filter((l) => l.color === "black");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Your repertoire</h1>
          <p className="text-sm text-muted">Small, simple, robust. Comfortable playable positions — not 30 moves of memory.</p>
        </div>
        <div className="pill bg-felt text-cream"><Shield size={13} /> honest goal: you never mess up the first 8 moves</div>
      </div>

      {drill ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,520px)_1fr]">
          <div>
            <div className="board-glow">
              <Board fen={fens[idx] ?? fens[fens.length - 1]} boardId="drill" orientation={drill.color} interactive={!done} onMove={onMove} />
            </div>
            <p className="mt-2 text-center text-xs text-muted">drilled as {drill.color} · move {Math.min(Math.floor(idx / 2) + 1, Math.ceil(drill.moves.length / 2))} of {Math.ceil(drill.moves.length / 2)} · mistakes: {errors}</p>
          </div>
          <div className="space-y-3">
            <div className="panel p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold">{drill.name}</h2>
                <button className="btn btn-ghost" onClick={() => setDrill(null)}>Back</button>
              </div>
              {msg && <p className="coach-quote mt-3 text-gold">{msg}</p>}
              {done ? (
                <div className="mt-3 rounded-lg border border-felt bg-felt2/40 p-4">
                  <p className="font-semibold text-good">Line complete {errors === 0 ? "with zero mistakes — scheduled ahead." : `with ${errors} slip(s) — we'll revisit it soon.`}</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <p><strong className="text-cream">Plan:</strong> <span className="text-muted">{drill.plan}</span></p>
                    <p><strong className="text-cream">Traps & tricks:</strong> <span className="text-muted">{drill.traps}</span></p>
                    <p><strong className="text-cream">When he leaves theory:</strong> <span className="text-gold">{drill.deviation}</span></p>
                  </div>
                  <button className="btn btn-gold mt-3" onClick={() => startDrill(drill)}><RotateCcw size={14} /> Drill again</button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">Your move — play the repertoire answer from memory. If you blank, remember the plan below is the memory hook.</p>
              )}
            </div>
            <div className="panel2 p-4 text-sm">
              <p className="label mb-1">Memory hook (plan)</p>
              <p className="text-muted">{drill.plan}</p>
            </div>
          </div>
        </div>
      ) : (
        [
          { title: "As White", list: white },
          { title: "As Black", list: black },
        ].map((grp) => (
          <section key={grp.title}>
            <h2 className="label mb-2 flex items-center gap-2"><BookOpen size={13} /> {grp.title}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {grp.list.map((l) => (
                <div key={l.id} className="panel card-hover p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{l.name}</p>
                      <p className="text-xs text-muted">{l.against}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {due(l) && <span className="pill bg-warn/20 text-warn">due</span>}
                      <span className="pill bg-panel2 text-muted">box {l.box}</span>
                    </div>
                  </div>
                  <button className="mt-2 text-left text-xs text-muted hover:text-cream" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    {open === l.id ? "Hide details ▲" : "Plan, traps, deviations ▼"}
                  </button>
                  {open === l.id && (
                    <div className="mt-2 space-y-1.5 border-t border-line pt-2 text-xs text-muted">
                      <p><strong className="text-cream/80">Line:</strong> {renderMoves(l.moves)}</p>
                      <p><strong className="text-cream/80">Plan:</strong> {l.plan}</p>
                      <p><strong className="text-cream/80">Traps:</strong> {l.traps}</p>
                      <p><strong className="text-gold">If he deviates:</strong> {l.deviation}</p>
                    </div>
                  )}
                  <button className="btn btn-gold mt-3 w-full justify-center" onClick={() => startDrill(l)}><Play size={14} /> Train this line</button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function renderMoves(moves: string[]): string {
  let out = "";
  for (let i = 0; i < moves.length; i += 2) out += `${i / 2 + 1}. ${moves[i]}${moves[i + 1] ? ` ${moves[i + 1]}` : ""} `;
  return out.trim();
}
