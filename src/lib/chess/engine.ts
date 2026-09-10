"use client";

export type EvalResult = {
  cp: number; // centipawns, POV of side to move in the evaluated FEN
  mate: number | null; // mate-in-N (signed, POV side to move) or null
  bestMoveUci: string;
  pv: string; // uci pv
  depth: number;
};

type Pending = {
  fen: string;
  depth: number;
  resolve: (r: EvalResult) => void;
  reject: (e: Error) => void;
};

export class StockfishEngine {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private queue: Pending[] = [];
  private busy = false;
  private cur: Pending | null = null;
  private bestInfo: Partial<EvalResult> = {};

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
        const sM = /score (cp|mate) (-?\d+)/.exec(line);
        const pvM = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)*)?/.exec(line);
        if (dM && sM) {
          const depth = Number(dM[1]);
          const cur = this.bestInfo.depth ?? -1;
          if (depth >= cur) {
            this.bestInfo.depth = depth;
            if (sM[1] === "cp") {
              this.bestInfo.cp = Number(sM[2]);
              this.bestInfo.mate = null;
            } else {
              this.bestInfo.mate = Number(sM[2]);
              this.bestInfo.cp = Number(sM[2]) > 0 ? 100000 - Math.abs(Number(sM[2])) * 100 : -100000 + Math.abs(Number(sM[2])) * 100;
            }
            if (pvM) this.bestInfo.pv = (pvM[1] ?? "").trim();
          }
        }
        if (line.includes("currmove") && this.cur) this.cur.fen, void 0; // keep alive / progress noop
      } else if (line.startsWith("bestmove")) {
        const best = line.split(" ")[1] ?? "";
        const info = this.bestInfo;
        const p = this.cur;
        this.cur = null;
        this.bestInfo = {};
        this.busy = false;
        p.resolve({
          cp: info.cp ?? 0,
          mate: info.mate ?? null,
          bestMoveUci: best,
          pv: info.pv ?? "",
          depth: info.depth ?? 0,
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
    this.bestInfo = {};
    this.send(`position fen ${p.fen}`);
    this.send(`go depth ${p.depth}`);
  }

  async ready() {
    await this.readyPromise;
  }

  evaluate(fen: string, depth = 13): Promise<EvalResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, depth, resolve, reject });
      this.next();
    });
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
