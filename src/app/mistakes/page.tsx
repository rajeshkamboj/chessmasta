import { db } from "@/db";
import { mistakes, games } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { PATTERN_LABELS } from "@/lib/chess/analyze";
import { Flame, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const byPattern = await db
    .select({ pattern: mistakes.pattern, count: sql<number>`count(*)::int`, solved: sql<number>`coalesce(sum(${mistakes.solvedCount}),0)::int`, failed: sql<number>`coalesce(sum(${mistakes.failedCount}),0)::int` })
    .from(mistakes)
    .groupBy(mistakes.pattern)
    .orderBy(sql`count(*) desc`);
  const recent = await db
    .select({ m: mistakes, gameTitle: games.title })
    .from(mistakes)
    .leftJoin(games, eq(mistakes.gameId, games.id))
    .orderBy(desc(mistakes.createdAt))
    .limit(40);
  const total = byPattern.reduce((s, p) => s + p.count, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Mistake memory</h1>
        <p className="text-sm text-muted">Permanent record. {total} logged mistake{total === 1 ? "" : "s"} — the coach never forgets, so you don't repeat.</p>
      </div>

      {byPattern.length === 0 ? (
        <div className="panel p-8 text-center text-muted">Analyze a game and your personal pattern profile appears here.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byPattern.map((p) => {
              const attempts = p.solved + p.failed;
              const pct = attempts ? Math.round((p.solved / attempts) * 100) : null;
              return (
                <div key={p.pattern} className="panel card-hover p-4">
                  <div className="flex items-center gap-2">
                    <Flame size={16} className={p.count >= 4 ? "text-bad" : "text-muted"} />
                    <p className="font-semibold">{PATTERN_LABELS[p.pattern] ?? p.pattern}</p>
                  </div>
                  <p className="coach-quote mt-2 text-lg text-gold">“You have made this mistake {p.count} time{p.count === 1 ? "" : "s"}.”</p>
                  <p className="mt-1 text-xs text-muted">
                    {attempts === 0 ? "Exercises queued — not yet drilled." : `Drill success ${pct}% (${p.solved}/${attempts})`}
                    {pct !== null && pct >= 70 ? " — pattern is dying." : ""}
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-panel2">
                    <div className="h-full rounded-full bg-good" style={{ width: `${pct ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <section className="panel p-5">
            <h2 className="font-display mb-3 text-xl font-semibold">Recent mistakes</h2>
            <div className="space-y-2">
              {recent.map(({ m, gameTitle }) => (
                <Link key={m.id} href={`/games/${m.gameId}`} className="panel2 flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:border-gold/40">
                  <span className={`pill ${m.category === "blunder" ? "bg-bad/20 text-bad" : m.category === "mistake" ? "bg-warn/20 text-warn" : "bg-panel text-muted"}`}>{m.category}</span>
                  <span className="text-sm">move {m.moveNumber}: <span className="text-bad line-through">{m.playedSan}</span> → <span className="text-good">{m.bestSan}</span></span>
                  <span className="text-xs text-muted">{PATTERN_LABELS[m.pattern] ?? m.pattern}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                    {m.solvedCount > 0 && <span className="flex items-center gap-1 text-good"><CheckCircle2 size={12} />{m.solvedCount}</span>}
                    {gameTitle ?? ""}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
