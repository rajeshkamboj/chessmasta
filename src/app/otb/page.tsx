"use client";

import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { Chess } from "chess.js";
import { useRouter } from "next/navigation";
import Board from "@/components/Board";
import MoveList from "@/components/MoveList";
import { getEngine, cpToPawns } from "@/lib/chess/engine";
import { pickBotMove, eloDescription } from "@/lib/chess/bot";
import { checksCapturesThreats, categorize, detectPattern, opponentThreats, replaySans, uciToSan, START_FEN, PATTERN_LABELS } from "@/lib/chess/analyze";
import { coachForMistake, threatReveal } from "@/lib/chess/coach";
import { Swords, Eye, ListChecks, Send, ClipboardPen } from "lucide-react";

type Stage = "setup" | "threat" | "scan" | "candidate" | "feedback" | "done";
type Reflection = { threat?: string; reason?: string; candidate?: string; dropCp?: number; pattern?: string };

export default function OtbPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"log" | "live">("log");
  const [stage, setStage] = useState<Stage>("setup");
  const [meta, setMeta] = useState({ opponent: "Bot (~800)", userColor: "white", result: "*", elo: 800, fast: true, title: "" });
  const [fen, setFen] = useState(START_FEN);
  const [sans, setSans] = useState<string[]>([]);
  const fens = useRef<string[]>([START_FEN]);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [reflections, setReflections] = useState<Record<string, Reflection>>({});
  const [threatText, setThreatText] = useState("");
  const [scanText, setScanText] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [candidate, setCandidate] = useState<{ from: string; to: string; san: string } | null>(null);
  const [feedback, setFeedback] = useState<{ category: string; text: string; best: string; drop: number; pattern: string } | null>(null);
  const [engineThinking, setEngineThinking] = useState(false);
  const userTurn = useRef(true);
  void fens;

  const game = useMemo(() => new Chess(fen), [fen]);
  const myColorLetter = meta.userColor === "white" ? "w" : "b";
  const isMyTurn = game.turn() === myColorLetter;

  function start() {
    const g = new Chess(START_FEN);
    fens.current = [START_FEN];
    if (meta.userColor === "black") {
      userTurn.current = false;
      // bot opens as White
      void engineMove(g);
    }
    setStage(mode === "log" ? "done" : meta.fast ? "candidate" : "threat");
  }

  function push(from: string, to: string): string | null {
    const g = new Chess(fen);
    try {
      const m = g.move({ from, to, promotion: "q" });
      setFen(g.fen());
      fens.current.push(g.fen());
      setSans((s) => [...s, m.san]);
      setLast({ from, to });
      return m.san;
    } catch {
      return null;
    }
  }

  async function engineMove(g: Chess) {
    setEngineThinking(true);
    try {
      const bm = await pickBotMove(g.fen(), meta.elo);
      if (!bm) return;
      const m = g.move({ from: bm.from, to: bm.to, promotion: bm.promotion || "q" });
      setFen(g.fen());
      fens.current.push(g.fen());
      setSans((s) => [...s, m.san]);
      setLast({ from: m.from, to: m.to });
      return bm;
    } finally {
      setEngineThinking(false);
    }
  }

  // live mode: user plays candidate on the board (fen NOT advanced until confirmed)
  function onCandidate(from: string, to: string): boolean {
    if (mode === "log" || stage === "done") {
      const san = push(from, to);
      return san !== null;
    }
    if (!isMyTurn) return false;
    const g = new Chess(fen);
    try {
      const m = g.move({ from, to, promotion: "q" });
      const cand = { from: m.from, to: m.to, san: m.san };
      setCandidate(cand);
      if (meta.fast) void submitCandidate(cand);
      return false; // don't commit display change
    } catch {
      return false;
    }
  }

  async function submitCandidate(c = candidate) {
    if (!c) return;
    setEngineThinking(true);
    try {
      const e = getEngine();
      await e.ready();
      const before = await e.evaluate(fen, 12);
      const g = new Chess(fen);
      g.move(c.san);
      const after = await e.evaluate(g.fen(), 12);
      const evalBefore = before.cp;
      const evalAfter = -after.cp;
      const drop = Math.max(0, Math.round(evalBefore - evalAfter));
      const category = categorize(drop, evalBefore);
      const pattern = detectPattern(fen, c.san, evalBefore, drop, sans.length);
      const bestSan = uciToSan(fen, before.bestMoveUci) || c.san;
      const hisBest = uciToSan(g.fen(), after.bestMoveUci);
      setFeedback({
        category,
        text:
          category === "good"
            ? `Solid. That holds. ${threatReveal(after.bestMoveUci, g.fen())}`
            : coachForMistake({ fen, playedSan: c.san, bestSan, dropCp: drop, category, pattern, moveNumber: Math.floor(sans.length / 2) + 1 } as never) +
              (hisBest ? ` His reply was going to be ${hisBest}.` : ""),
        best: bestSan, drop, pattern,
      });
      const ply = sans.length + 1;
      setReflections((r) => ({ ...r, [String(ply)]: { ...r[String(ply)], candidate: c.san, dropCp: drop, pattern } }));
      setStage("feedback");
    } finally {
      setEngineThinking(false);
    }
  }

  async function confirmMove() {
    if (!candidate) return;
    const g = new Chess(fen);
    g.move(candidate.san);
    setFen(g.fen());
    fens.current.push(g.fen());
    setSans((s) => [...s, candidate.san]);
    setLast({ from: candidate.from, to: candidate.to });
    setCandidate(null);
    setFeedback(null);
    setThreatText(""); setScanText(""); setReasonText("");
    if (g.isGameOver()) {
      setStage("done");
      return;
    }
    await engineMove(g);
    if (g.isGameOver()) { setStage("done"); return; }
    setStage(meta.fast ? "candidate" : "threat");
  }

  // Fast mode: auto-continue past the feedback after a beat.
  useEffect(() => {
    if (stage !== "feedback" || !feedback || !meta.fast) return;
    const t = setTimeout(() => void confirmMove(), feedback.category === "good" ? 900 : 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, feedback]);

  function saveReflection(updates: Partial<Reflection>) {
    const ply = String(sans.length + (isMyTurn ? 1 : 0));
    setReflections((r) => ({ ...r, [ply]: { ...(r[ply] ?? {}), ...updates } }));
  }

  async function saveAndReview() {
    const moves = replaySans(sans);
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: meta.title || `${mode === "live" ? "Training game" : "OTB"} vs ${meta.opponent}`,
        whiteName: meta.userColor === "white" ? "You" : meta.opponent,
        blackName: meta.userColor === "black" ? "You" : meta.opponent,
        result: meta.result, userColor: meta.userColor, source: mode === "live" ? "practice" : "otb",
        moves, reflections,
      }),
    });
    const data = await res.json();
    router.push(`/games/${data.id}`);
  }

  const cct = useMemo(() => checksCapturesThreats(fen), [fen]);
  const threats = useMemo(() => opponentThreats(fen), [fen]);
  const over = game.isGameOver();
  const resultText = over ? (game.isCheckmate() ? (game.turn() === myColorLetter ? "You were checkmated" : "You delivered mate") : game.isStalemate() ? "Stalemate" : "Draw") : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">OTB trainer</h1>
        <p className="text-sm text-muted">Log a finished over-the-board game — or train live with the coach sitting next to you.</p>
      </div>

      {stage === "setup" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <button onClick={() => { setMode("log"); }} className={`panel card-hover p-6 text-left ${mode === "log" ? "border-gold/60" : ""}`}>
            <ClipboardPen size={22} className="mb-2 text-gold" />
            <h2 className="font-display text-lg font-semibold">Log a finished game</h2>
            <p className="mt-1 text-sm text-muted">Played your father? Enter the moves here afterwards, then let Stockfish + the coach dissect it.</p>
          </button>
          <button onClick={() => { setMode("live"); }} className={`panel card-hover p-6 text-left ${mode === "live" ? "border-gold/60" : ""}`}>
            <Swords size={22} className="mb-2 text-gold" />
            <h2 className="font-display text-lg font-semibold">Live training game</h2>
            <p className="mt-1 text-sm text-muted">Play the engine. Before every move the coach asks the questions a real OTB coach asks.</p>
          </button>
          <div className="panel space-y-3 p-5 md:col-span-2">
            <div className="grid gap-3 sm:grid-cols-4">
              <input className="input" value={meta.opponent} onChange={(e) => setMeta({ ...meta, opponent: e.target.value })} placeholder="Opponent" />
              <select className="input" value={meta.userColor} onChange={(e) => setMeta({ ...meta, userColor: e.target.value })}>
                <option value="white">You are White</option><option value="black">You are Black</option>
              </select>
              <button className="btn btn-gold justify-center" onClick={start}>Start</button>
            </div>
            {mode === "live" && (
              <div className="space-y-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-72 flex-1">
                    <div className="flex items-center justify-between">
                      <label className="label">Opponent strength</label>
                      <span className="font-display text-xl font-semibold text-gold">{meta.elo}</span>
                    </div>
                    <input
                      type="range" min={300} max={1800} step={100} value={meta.elo}
                      onChange={(e) => setMeta({ ...meta, elo: Number(e.target.value), opponent: `Bot (~${e.target.value})` })}
                      className="w-full accent-gold"
                    />
                    <div className="flex justify-between text-[10px] text-muted"><span>300</span><span>800 — dad's level</span><span>1300</span><span>1800</span></div>
                    <p className="mt-1 text-xs text-muted">{eloDescription(meta.elo)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setMeta({ ...meta, fast: true })} className={`btn ${meta.fast ? "btn-gold" : "btn-ghost"}`}>Fast play</button>
                    <button onClick={() => setMeta({ ...meta, fast: false })} className={`btn ${!meta.fast ? "btn-gold" : "btn-ghost"}`}>Coach questions</button>
                  </div>
                </div>
                <p className="text-xs text-muted">{meta.fast ? "Just play — the coach speaks only when it matters." : "Strict mode: before every move the coach drills the OTB thinking routine (threats → checks/captures → candidate → blunder-check)."}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
          <div>
            <div className="board-glow">
              <Board fen={fen} boardId="otb" orientation={meta.userColor as "white" | "black"} onMove={onCandidate} lastMove={last}
                interactive={mode === "log" || (isMyTurn && (meta.fast || stage === "candidate") && stage !== "feedback" && !engineThinking && !over)} />
            </div>
            {candidate && stage === "candidate" && !meta.fast && (
              <p className="mt-2 text-sm text-muted">Candidate: <strong className="text-cream">{candidate.san}</strong> — confirm or play a different move on the board.</p>
            )}
            {over && <p className="mt-2 font-display text-lg font-semibold text-gold">{resultText}</p>}
          </div>

          <div className="space-y-4">
            {mode === "log" ? (
              <div className="panel p-4">
                <p className="label mb-1">Move entry</p>
                <p className="text-sm text-muted">Click or drag pieces to enter the game as it happened. Wrong move? Delete the last half-move.</p>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-ghost" onClick={() => { if (!sans.length) return; const g = new Chess(fen); g.undo(); setFen(g.fen()); fens.current.pop(); setSans((s) => s.slice(0, -1)); }}>Undo last</button>
                  <button className="btn btn-ghost" onClick={() => { setFen(START_FEN); setSans([]); fens.current = [START_FEN]; setLast(null); }}>Clear</button>
                </div>
              </div>
            ) : (
              <>
                {stage === "threat" && (
                  <div className="panel border-l-4 border-gold p-4">
                    <p className="label flex items-center gap-1.5"><Eye size={13} /> First — observe</p>
                    <p className="coach-quote mt-1.5 text-lg">What did his last move change? What is he threatening?</p>
                    <p className="mt-1 text-xs text-muted">Answer before you even look at your own ideas. Say it out loud if you can.</p>
                    <textarea className="input mt-3" rows={2} value={threatText} onChange={(e) => { setThreatText(e.target.value); saveReflection({ threat: e.target.value }); }} placeholder="e.g. His queen moved out and now hits b7…" />
                    {threats.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-gold">Reveal what is actually attacked (after you answered)</summary>
                        <ul className="mt-1 list-inside list-disc text-cream/85">{threats.map((t) => <li key={t}>{t}</li>)}</ul>
                      </details>
                    )}
                    <button className="btn btn-gold mt-3" onClick={() => setStage("scan")}>I know his threat →</button>
                  </div>
                )}
                {stage === "scan" && (
                  <div className="panel border-l-4 border-gold p-4">
                    <p className="label flex items-center gap-1.5"><ListChecks size={13} /> Now scan — Checks · Captures · Threats</p>
                    <p className="mt-1.5 text-sm">List your forcing moves out loud BEFORE choosing. Write the best candidate of each kind if you can.</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="panel2 p-2"><p className="label">Checks</p><p>{cct.checks.slice(0, 4).join(", ") || "none"}</p></div>
                      <div className="panel2 p-2"><p className="label">Captures</p><p>{cct.captures.slice(0, 4).join(", ") || "none"}</p></div>
                      <div className="panel2 p-2"><p className="label">Targets</p><p>{cct.threats.join(", ") || "none"}</p></div>
                    </div>
                    <textarea className="input mt-3" rows={2} value={scanText} onChange={(e) => setScanText(e.target.value)} placeholder="My candidate moves are…" />
                    <button className="btn btn-gold mt-3" onClick={() => setStage("candidate")}>Now play your candidate on the board →</button>
                  </div>
                )}
                {stage === "candidate" && (
                  <div className="panel border-l-4 border-gold p-4">
                    <p className="label flex items-center gap-1.5"><Send size={13} /> Your move — {meta.opponent} is waiting</p>
                    {meta.fast ? (
                      <p className="mt-1.5 text-sm text-muted">
                        Think first, then move. Same routine as OTB: <em className="text-cream">what's his threat?</em> → checks/captures/threats → blunder-check. The coach judges every move.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1.5 text-sm">Play your candidate on the board. Then — before locking it — one blunder check: <em>after this move, what can he just take?</em></p>
                        <textarea className="input mt-3" rows={2} value={reasonText} onChange={(e) => { setReasonText(e.target.value); saveReflection({ reason: e.target.value }); }} placeholder="Why this move? (one sentence)" />
                        <button className="btn btn-gold mt-3" disabled={!candidate || engineThinking} onClick={() => void submitCandidate()}>
                          {engineThinking ? "Coach is thinking…" : candidate ? `Coach evaluates ${candidate.san}` : "Play a move on the board first"}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {stage === "feedback" && feedback && (
                  <div className="panel border-l-4 p-4" style={{ borderLeftColor: feedback.category === "good" ? "#6fbf73" : feedback.category === "blunder" ? "#d76a5e" : "#d8a23a" }}>
                    <p className="label">{feedback.category === "good" ? "Coach approves" : `${feedback.category}${feedback.pattern ? ` · ${PATTERN_LABELS[feedback.pattern] ?? feedback.pattern}` : ""}`}</p>
                    <p className="coach-quote mt-1.5 text-cream/90">{feedback.text}</p>
                    {feedback.category !== "good" && <p className="mt-1 text-sm text-muted">Best was <strong className="text-good">{feedback.best}</strong>. You said: “{reasonText || "—"}”</p>}
                    {reasonText && <p className="mt-1 text-xs text-muted">Your stated threat-read: “{threatText || "you skipped it"}”</p>}
                    <button className="btn btn-gold mt-3" onClick={confirmMove}>{engineThinking ? "…" : meta.fast ? (feedback.category === "good" ? "Continuing automatically… (skip)" : "Got it — let him answer →") : "Play it and let him answer →"}</button>
                  </div>
                )}
                {engineThinking && <p className="text-sm text-muted">Engine thinking…</p>}
              </>
            )}

            <div className="panel p-4">
              <p className="label mb-2">Moves</p>
              <MoveList sans={sans} currentPly={sans.length} onSelect={() => {}} />
            </div>

            {sans.length >= 2 || over ? (
              <div className="panel space-y-3 p-4">
                <p className="label">Finish & save</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" placeholder="Title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
                  <select className="input" value={meta.result} onChange={(e) => setMeta({ ...meta, result: e.target.value })}>
                    <option value="*">Unfinished</option><option value="1-0">White won</option><option value="0-1">Black won</option><option value="1/2-1/2">Draw</option>
                  </select>
                </div>
                {over && meta.result === "*" && (
                  <button className="btn btn-ghost" onClick={() => setMeta({ ...meta, result: game.isCheckmate() ? (game.turn() === "w" ? "0-1" : "1-0") : "1/2-1/2" })}>Auto-set result</button>
                )}
                <button className="btn btn-gold" onClick={saveAndReview}>Save game & go to analysis →</button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
