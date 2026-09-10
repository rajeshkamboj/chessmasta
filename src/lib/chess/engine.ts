"use client";

export type EvalResult = {
  cp: number; // centipawns, POV of side to move in the evaluated FEN
  mate: number | null; // mate-in-N (signed, POV side to move) or null
  bestMoveUci: string;
  pv: string; // uci pv
  depth: number;
};

export type MultiResult = {
  moves: { uci: string; cp: number; mate: number | null }[]; // ranked best-first
  depth: number;
};

type Pending = {
  fen: string;
  depth: number;
  multi: number; // 1 = single pv
  resolve: (r: { eval: EvalResult; multi: MultiResult }) => void;
  reject: (e: Error) => void;
};

type Line = { uci: string; cp: number; mate: number | null; pv: string; depth: number };

export class StockfishEngine {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private queue: Pending[] = [];
  private busy = false;
  private cur: Pending | null = null;
  private lines = new Map<number, Line>();

  constructor() {
    this.worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    this.readyPromise = new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        if (typeof e.data !== "string") return;
        if (e.data === "uciok") {
          this.send("setoption name Threads value 1");
          this.send("setoption name Hash value 64");
          this.send("isready");
        }
        if (e.data === "readyok") {
          this.worker.removeEventListener("message", onMsg);
          this.attach();
          resolve();
        }
      };
      this.worker.addEventListener("message", onMsg);
      this.worker.addEventListener("error", () => reject(new Error("Engine failed to load")));
      setTimeout(() => reject(new Error("Engine init timeout")), 30000);
    });
    this.send("uci");
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private attach() {
    this.worker.addEventListener("message", (e: MessageEvent) => {
      if (typeof e.data !== "string" || !this.cur) return;
      const line: string = e.data;
      if (line.startsWith("info")) {
        const dM = /\bdepth (\d+)/.exec(line);
        const mpvM = /\bmultipv (\d+)/.exec(line);
        const sM = /score (cp|mate) (-?\d+)/.exec(line);
        const pvM = /\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?(?: )?)+)/.exec(line);
        if (!dM || !sM) return;
        const depth = Number(dM[1]);
        const mpv = mpvM ? Number(mpvM[1]) : 1;
        const pv = (pvM?.[1] ?? "").trim();
        if (!pv) return;
        const abs = Number(sM[2]);
        const rec: Line = {
          depth,
          uci: pv.split(" ")[0],
          pv,
          cp: sM[1] === "cp" ? abs : abs > 0 ? 100000 - abs * 100 : -100000 + abs * 100,
          mate: sM[1] === "mate" ? abs : null,
        };
        const prev = this.lines.get(mpv);
        if (!prev || depth >= prev.depth) this.lines.set(mpv, rec);
      } else if (line.startsWith("bestmove")) {
        const best = line.split(" ")[1] ?? "";
        const p = this.cur;
        const lines = this.lines;
        this.cur = null;
        this.lines = new Map();
        this.busy = false;
        const ranked = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
        const first = ranked[0];
        p.resolve({
          eval: {
            cp: first?.cp ?? 0,
            mate: first?.mate ?? null,
            bestMoveUci: first?.uci || best,
            pv: first?.pv ?? best,
            depth: first?.depth ?? 0,
          },
          multi: { moves: ranked.map((v) => ({ uci: v.uci, cp: v.cp, mate: v.mate })), depth: first?.depth ?? 0 },
        });
        this.next();
      }
    });
  }

  private next() {
    if (this.busy) return;
    const p = this.queue.shift();
    if (!p) return;
    this.busy = true;
    this.cur = p;
    this.lines = new Map();
    this.send("ucinewgame");
    if (p.multi > 1) this.send(`setoption name MultiPV value ${p.multi}`);
    this.send(`position fen ${p.fen}`);
    this.send(`go depth ${p.depth}`);
    if (p.multi > 1) this.send("setoption name MultiPV value 1");
  }

  async ready() {
    await this.readyPromise;
  }

  private request(fen: string, depth: number, multi = 1) {
    return new Promise<{ eval: EvalResult; multi: MultiResult }>((resolve, reject) => {
      this.queue.push({ fen, depth, multi, resolve, reject });
      this.next();
    });
  }

  async evaluate(fen: string, depth = 13): Promise<EvalResult> {
    return (await this.request(fen, depth, 1)).eval;
  }

  async evaluateMulti(fen: string, depth = 10, k = 4): Promise<MultiResult> {
    return (await this.request(fen, depth, Math.max(1, k))).multi;
  }

  quit() {
    try {
      this.send("quit");
      this.worker.terminate();
    } catch {
      /* noop */
    }
  }
}

let singleton: StockfishEngine | null = null;
export function getEngine(): StockfishEngine {
  if (!singleton) singleton = new StockfishEngine();
  return singleton;
}

// Convert a CP eval (POV side-to-move) into a display score for White.
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
