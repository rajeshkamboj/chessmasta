"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlusCircle, Trash2, LineChart } from "lucide-react";
import { sansFromPgn, replaySans, finalFen } from "@/lib/chess/analyze";

type Game = { id: number; title: string; whiteName: string; blackName: string; result: string; source: string; analyzedAt: string | null; createdAt: string };

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [pgn, setPgn] = useState("");
  const [title, setTitle] = useState("");
  const [userColor, setUserColor] = useState("white");
  const [result, setResult] = useState("*");
  const [msg, setMsg] = useState("");

  async function load() {
    setGames(await (await fetch("/api/games")).json());
  }
  useEffect(() => { load(); }, []);

  async function importPgn() {
    const sans = sansFromPgn(pgn);
    if (!sans.length) { setMsg("Could not parse PGN."); return; }
    const moves = replaySans(sans);
    await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Imported game", pgn, moves, fen: finalFen(moves), userColor, result, source: "online" }),
    });
    setPgn(""); setShowImport(false); load();
  }

  async function del(id: number) {
    await fetch(`/api/games/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Game archive</h1>
          <p className="text-sm text-muted">Every game you log is fuel. Analysis finds the moments that matter.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setShowImport((s) => !s)}><PlusCircle size={15} /> Import PGN</button>
          <Link href="/otb" className="btn btn-gold"><PlusCircle size={15} /> Log OTB game</Link>
        </div>
      </div>

      {showImport && (
        <div className="panel space-y-2 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="input sm:col-span-1" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select className="input" value={userColor} onChange={(e) => setUserColor(e.target.value)}><option value="white">I was White</option><option value="black">I was Black</option></select>
            <select className="input" value={result} onChange={(e) => setResult(e.target.value)}><option value="*">Unfinished</option><option value="1-0">White won</option><option value="0-1">Black won</option><option value="1/2-1/2">Draw</option></select>
          </div>
          <textarea className="input mono h-32 text-xs" placeholder="Paste PGN here" value={pgn} onChange={(e) => setPgn(e.target.value)} />
          <button className="btn btn-gold" onClick={importPgn}>Import</button>
          {msg && <p className="text-sm text-bad">{msg}</p>}
        </div>
      )}

      {games.length === 0 ? (
        <div className="panel p-8 text-center text-muted">No games yet. Log your OTB game with your father — that is where the gold is.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <div key={g.id} className="panel card-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/games/${g.id}`} className="font-semibold hover:text-gold">{g.title}</Link>
                  <p className="truncate text-xs text-muted">{g.whiteName} vs {g.blackName} · {new Date(g.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`pill ${g.result === "*" ? "bg-panel2 text-muted" : "bg-felt text-cream"}`}>{g.result}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`pill ${g.analyzedAt ? "bg-felt text-good" : "bg-panel2 text-warn"}`}>{g.analyzedAt ? "analyzed" : "not analyzed"}</span>
                <div className="flex gap-1">
                  <Link href={`/games/${g.id}`} className="btn btn-ghost !px-2.5 !py-1.5" title="Open & analyze"><LineChart size={14} /></Link>
                  <button className="btn btn-danger !px-2.5 !py-1.5" onClick={() => del(g.id)} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
