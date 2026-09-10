"use client";

export type EvalResult = {
  cp: number; // centipawns, POV of side to move in the evaluated FEN
  mate: number | null;
  bestMoveUci: string;
  pv: string;
  depth: number;
};

export type MultiResult = {
  moves: { uci: string; cp: number; mate: number | null }[]; // ranked best-first
  depth: number;
};

type Line = { uci: string; cp: number; mate: number | null; pv: string; depth: number };

type Req = {
  fen: string;
  depth: number;
  multi: number;
  movetime: number;
  resolve: (r: { eval: EvalResult; multi: MultiResult }) => void;
  reject: (e: Error) => void;
};

// NOTE: the single-file Stockfish build fetches "stockfish.wasm" relative to this
// script's URL, so both files must keep these exact names in /public/stockfish.
const WORKER_URL = "/stockfish/stockfish.js";

export class StockfishEngine {
  private worker: Worker | null = null;
  private booting: Promise<void> | null = null;
  private queue: Req[] = [];
  private cur: Req | null = null;
  private lines = new Map<number, Line>();
  private curMulti = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- lifecycle -------------------------------------------------------

  private boot(): Promise<void> {
    if (this.booting) return this.booting;
    this.booting = new Promise<void>((resolve, reject) => {
      let settled = false;
      let w: Worker;
      try {
        w = new Worker(WORKER_URL);
      } catch {
        this.booting = null;
        reject(new Error("Could not start the chess engine worker."));
        return;
      }
      this.worker = w;
      this.curMulti = 1;

      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) {
          this.booting = null;
          reject(err);
        } else resolve();
      };

      w.addEventListener("message", (e: MessageEvent) => {
        const d = e.data;
        if (typeof d !== "string") return;
        if (d === "uciok") {
          w.postMessage("setoption name Threads value 1");
          w.postMessage("setoption name Hash value 32");
          w.postMessage("setoption name MultiPV value 1");
          w.postMessage("isready");
          return;
        }
        if (d === "readyok" && !settled) {
          done();
          return;
        }
        this.onLine(d);
      });
      w.addEventListener("error", () => {
        done(new Error("Chess engine crashed while loading."));
        this.hardRestart(new Error("Chess engine crashed."));
      });
      w.postMessage("uci");
      setTimeout(() => {
        if (!settled) {
          done(new Error("Chess engine took too long to start."));
          try { w.terminate(); } catch { /* noop */ }
          this.worker = null;
        }
      }, 25000);
    });
    return this.booting;
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.timer = null;
    this.stopTimer = null;
  }

  /** Kill the worker and fail everything pending; next request boots a fresh one. */
  private hardRestart(err: Error) {
    this.clearTimers();
    try { this.worker?.terminate(); } catch { /* noop */ }
    this.worker = null;
    this.booting = null;
    const failed = [this.cur, ...this.queue].filter(Boolean) as Req[];
    this.cur = null;
    this.queue = [];
    this.lines.clear();
    for (const r of failed) r.reject(err);
  }

  // ---- UCI parsing -----------------------------------------------------

  private onLine(line: string) {
    if (!this.cur) return;
    if (line.startsWith("info")) {
      const dM = /\bdepth (\d+)/.exec(line);
      const sM = /score (cp|mate) (-?\d+)/.exec(line);
      const pvM = /\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/.exec(line);
      if (!dM || !sM || !pvM) return;
      const pv = pvM[1].trim();
      if (!pv) return;
      const mpv = Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1);
      const depth = Number(dM[1]);
      const abs = Number(sM[2]);
      const rec: Line = {
        depth,
        uci: pv.split(/\s+/)[0],
        pv,
        cp: sM[1] === "cp" ? abs : abs > 0 ? 100000 - abs * 100 : -100000 + abs * 100,
        mate: sM[1] === "mate" ? abs : null,
      };
      const prev = this.lines.get(mpv);
      if (!prev || depth >= prev.depth) this.lines.set(mpv, rec);
      return;
    }
    if (line.startsWith("bestmove")) this.finish(line.split(/\s+/)[1] ?? "");
  }

  private finish(bestmove: string) {
    const req = this.cur;
    if (!req) return;
    this.clearTimers();
    this.cur = null;
    const ranked = [...this.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    this.lines = new Map();
    const first = ranked[0];
    const valid = bestmove && bestmove !== "(none)" ? bestmove : (first?.uci ?? "");
    req.resolve({
      eval: {
        cp: first?.cp ?? 0,
        mate: first?.mate ?? null,
        bestMoveUci: first?.uci || valid,
        pv: first?.pv ?? valid,
        depth: first?.depth ?? 0,
      },
      multi: { moves: ranked.map((v) => ({ uci: v.uci, cp: v.cp, mate: v.mate })), depth: first?.depth ?? 0 },
    });
    void this.pump();
  }

  // ---- scheduling ------------------------------------------------------

  private async pump(): Promise<void> {
    if (this.cur || !this.queue.length) return;
    const req = this.queue[0];
    try {
      await this.boot();
    } catch (e) {
      this.queue.shift();
      req.reject(e as Error);
      return this.pump();
    }
    if (this.cur) return; // another pump won the race
    this.queue.shift();
    const w = this.worker;
    if (!w) {
      req.reject(new Error("Chess engine unavailable."));
      return this.pump();
    }
    this.cur = req;
    this.lines = new Map();

    // MultiPV may only be changed while the engine is idle — which it is here.
    if (this.curMulti !== req.multi) {
      w.postMessage(`setoption name MultiPV value ${req.multi}`);
      this.curMulti = req.multi;
    }
    w.postMessage(`position fen ${req.fen}`);
    w.postMessage(`go depth ${req.depth} movetime ${req.movetime}`);

    // Soft deadline: ask it to stop and use whatever it found.
    this.timer = setTimeout(() => {
      if (!this.cur) return;
      try { w.postMessage("stop"); } catch { /* noop */ }
      // Hard deadline: engine is wedged — restart it.
      this.stopTimer = setTimeout(() => {
        if (!this.cur) return;
        if (this.lines.size > 0) this.finish("");
        else this.hardRestart(new Error("The engine stopped responding and was restarted."));
      }, 2500);
    }, req.movetime + 6000);
  }

  private request(fen: string, depth: number, multi: number, movetime: number) {
    return new Promise<{ eval: EvalResult; multi: MultiResult }>((resolve, reject) => {
      this.queue.push({ fen, depth, multi, movetime, resolve, reject });
      void this.pump();
    });
  }

  // ---- public API ------------------------------------------------------

  async ready() {
    await this.boot();
  }

  async evaluate(fen: string, depth = 12, movetime = 1500): Promise<EvalResult> {
    return (await this.request(fen, depth, 1, movetime)).eval;
  }

  async evaluateMulti(fen: string, depth = 10, k = 4, movetime = 1200): Promise<MultiResult> {
    return (await this.request(fen, depth, Math.max(1, k), movetime)).multi;
  }

  quit() {
    this.hardRestart(new Error("Engine shut down."));
  }
}

let singleton: StockfishEngine | null = null;
export function getEngine(): StockfishEngine {
  if (!singleton) singleton = new StockfishEngine();
  return singleton;
}

export function evalForWhite(cp: number, fen: string): number {
  return fen.includes(" b ") ? -cp : cp;
}

export function cpToPawns(cp: number): string {
  if (Math.abs(cp) >= 90000) {
    const mateIn = Math.ceil((100000 - Math.abs(cp)) / 100);
    return (cp > 0 ? "#" : "-#") + mateIn;
  }
  return (cp / 100).toFixed(1);
}
