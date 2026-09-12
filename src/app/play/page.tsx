"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "@/components/Board";
import MoveList from "@/components/MoveList";
import { getEngine, cpToPawns, evalForWhite } from "@/lib/chess/engine";
import { checksCapturesThreats, replaySans, sansFromPgn, START_FEN } from "@/lib/chess/analyze";
import { RotateCcw, Undo2, Redo2, Copy, Save, Search, Repeat } from "lucide-react";

export default function PlayPage() {
  const [fen, setFen] = useState(START_FEN);
  const [sans, setSans] = useState<string[]>([]);
  const [redo, setRedo] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [msg, setMsg] = useState("");
  const [evalState, setEvalState] = useState<{ cp: number; best: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const meta = useRef({ title: "", userColor: "white", whiteName: "Me", blackName: "Opponent", result: "*" });

  const game = useMemo(() => new Chess(fen), [fen]);

  useEffect(() => {
    let cancelled = false;
    async function refreshEval() {
      try {
        const e = getEngine();
        await e.ready();
        const r = await e.evaluate(fen, 12, 1200);
        const g = new Chess(fen);
        let best = r.bestMoveUci;
        try {
          const m = g.move({ from: r.bestMoveUci.slice(0, 2), to: r.bestMoveUci.slice(2, 4), promotion: r.bestMoveUci[4] || "q" });
          best = m.san;
        } catch {
          // ignore invalid best-move payloads
        }
        if (!cancelled) setEvalState({ cp: r.cp, best });
      } catch {
        if (!cancelled) setEvalState(null);
      }
    }

    void refreshEval();
    return () => { cancelled = true; };
  }, [fen]);

  function onMove(from: string, to: string): boolean {
    const g = new Chess(fen);
    try {
      const m = g.move({ from, to, promotion: "q" });
      setFen(g.fen());
      setSans((s) => [...s, m.san]);
      setRedo([]);
      setLast({ from, to });
      setEvalState(null);
      return true;
    } catch {
      return false;
    }
  }

  function undo() {
    if (!sans.length) return;
    const g = new Chess(fen);
    g.undo();
    setRedo((r) => [sans[sans.length - 1], ...r]);
    setSans((s) => s.slice(0, -1));
    setFen(g.fen());
    setLast(null);
    setEvalState(null);
  }

  function applyRedo() {
    if (!redo.length) return;
    const g = new Chess(fen);
    try {
      const m = g.move(redo[0]);
      setSans((s) => [...s, m.san]);
      setRedo((r) => r.slice(1));
      setFen(g.fen());
      setEvalState(null);
    } catch { /* ignore */ }
  }

  function newGame() {
    setFen(START_FEN); setSans([]); setRedo([]); setLast(null); setEvalState(null); setMsg("");
  }

  function pgn() {
    const g = new Chess();
    sans.forEach((s) => g.move(s));
    return g.pgn();
  }

  function importPgn() {
    const s = sansFromPgn(pgnText);
    if (!s.length) { setMsg("Could not parse that PGN."); return; }
    const g = new Chess();
    s.forEach((m) => g.move(m));
    setSans(s); setFen(g.fen()); setRedo([]); setLast(null); setMsg(`Imported ${s.length} half-moves.`);
  }

  async function evaluate() {
    setAnalyzing(true);
    try {
      const e = getEngine();
      await e.ready();
      const r = await e.evaluate(fen, 15);
      const g = new Chess(fen);
      let best = r.bestMoveUci;
      try { const m = g.move({ from: r.bestMoveUci.slice(0, 2), to: r.bestMoveUci.slice(2, 4), promotion: r.bestMoveUci[4] || "q" }); best = m.san; } catch { /* noop */ }
      setEvalState({ cp: r.cp, best });
    } finally { setAnalyzing(false); }
  }

  const cct = useMemo(() => checksCapturesThreats(fen), [fen]);
  const strength = evalState ? evalForWhite(evalState.cp, fen) : 0;
  const meterRatio = Math.min(0.5, Math.abs(strength) / 500);
  const strengthLabel = strength > 60 ? "White strong" : strength < -60 ? "Black strong" : "Balanced";
  const strengthTone = strength > 0 ? "text-good" : strength < 0 ? "text-bad" : "text-warn";

  async function save() {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...meta.current, pgn: pgn(), fen, moves: replaySans(sans), source: "practice" }),
    });
    if (res.ok) { setMsg("Saved to your games."); setShowSave(false); } else setMsg("Save failed.");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
      <div>
        <div className="board-glow relative">
          {evalState && (
            <div className="strength-meter pointer-events-none absolute left-3 right-3 top-3 z-10">
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-cream/80">
                <span>White</span>
                <span className={strengthTone}>{strengthLabel}</span>
                <span>Black</span>
              </div>
              <div className="meter-track mt-2">
                <div
                  className="meter-fill"
                  style={
                    strength >= 0
                      ? { left: "50%", width: `${meterRatio * 100}%` }
                      : { right: "50%", width: `${meterRatio * 100}%` }
                  }
                />
              </div>
              <div className="mt-1 text-center text-[10px] tracking-[.18em] text-cream/70">
                {cpToPawns(strength)}
              </div>
            </div>
          )}
          <Board fen={fen} boardId="play" orientation={orientation} onMove={onMove} lastMove={last} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={newGame}><RotateCcw size={14} /> New</button>
          <button className="btn btn-ghost" onClick={undo} disabled={!sans.length}><Undo2 size={14} /> Undo</button>
          <button className="btn btn-ghost" onClick={applyRedo} disabled={!redo.length}><Redo2 size={14} /> Redo</button>
          <button className="btn btn-ghost" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}><Repeat size={14} /> Flip</button>
          <button className="btn btn-ghost" onClick={() => setShowSave((s) => !s)}><Save size={14} /> Save</button>
          <button className="btn btn-gold" onClick={evaluate} disabled={analyzing}><Search size={14} /> {analyzing ? "Thinking…" : "Ask Stockfish"}</button>
        </div>
        {evalState && (
          <div className="panel2 mt-3 flex items-center gap-4 px-4 py-3">
            <span className={`font-display text-2xl font-semibold ${evalForWhite(evalState.cp, fen) >= 0 ? "text-good" : "text-bad"}`}>
              {cpToPawns(evalForWhite(evalState.cp, fen))}
            </span>
            <p className="text-sm text-muted">Best ({game.turn() === "w" ? "White" : "Black"}): <strong className="text-cream">{evalState.best}</strong> · depth 15 · {game.isCheckmate() ? "mate" : game.isDraw() ? "drawn position" : ""}</p>
          </div>
        )}
        {showSave && (
          <div className="panel mt-3 space-y-2 p-4">
            <div className="grid grid-cols-2 gap-2">
              <input className="input col-span-2" placeholder="Game title (e.g. vs Dad, club game)" onChange={(e) => (meta.current.title = e.target.value)} />
              <input className="input" placeholder="White player" onChange={(e) => (meta.current.whiteName = e.target.value)} />
              <input className="input" placeholder="Black player" onChange={(e) => (meta.current.blackName = e.target.value)} />
              <select className="input" onChange={(e) => (meta.current.userColor = e.target.value)} defaultValue="white">
                <option value="white">I was White</option><option value="black">I was Black</option>
              </select>
              <select className="input" onChange={(e) => (meta.current.result = e.target.value)} defaultValue="*">
                <option value="1-0">White won</option><option value="0-1">Black won</option><option value="1/2-1/2">Draw</option><option value="*">Unfinished</option>
              </select>
            </div>
            <button className="btn btn-gold" onClick={save}>Save game</button>
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </div>

      <div className="space-y-4">
        <div className="panel p-4">
          <p className="label mb-2">Move history</p>
          <MoveList sans={sans} currentPly={sans.length} onSelect={() => {}} />
        </div>
        <div className="panel p-4">
          <p className="label mb-2">Position</p>
          <div className="flex items-center gap-2">
            <code className="mono flex-1 truncate rounded-lg bg-panel2 px-3 py-2 text-xs text-cream/80">{fen}</code>
            <button className="btn btn-ghost !px-2.5" title="Copy FEN" onClick={() => navigator.clipboard.writeText(fen)}><Copy size={14} /></button>
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input mono text-xs" placeholder="Load FEN…" onKeyDown={(e) => { if (e.key === "Enter") { try { new Chess((e.target as HTMLInputElement).value); setFen((e.target as HTMLInputElement).value); setSans([]); setLast(null); } catch { setMsg("Invalid FEN."); } } }} />
          </div>
        </div>
        <div className="panel p-4">
          <p className="label mb-2">Checks · Captures · Threats <span className="text-gold">(do this every move)</span></p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><p className="text-xs text-muted">Checks</p><p className="text-cream/90">{cct.checks.slice(0, 4).join(", ") || "—"}</p></div>
            <div><p className="text-xs text-muted">Captures</p><p className="text-cream/90">{cct.captures.slice(0, 4).join(", ") || "—"}</p></div>
            <div><p className="text-xs text-muted">His loose pieces</p><p className="text-cream/90">{cct.threats.join(", ") || "—"}</p></div>
          </div>
        </div>
        <div className="panel p-4">
          <p className="label mb-2">Import PGN</p>
          <textarea className="input mono h-24 text-xs" value={pgnText} onChange={(e) => setPgnText(e.target.value)} placeholder="1. e4 e5 2. Nf3 Nc6 …" />
          <button className="btn btn-ghost mt-2" onClick={importPgn}>Import</button>
        </div>
      </div>
    </div>
  );
}
