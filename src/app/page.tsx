import { db } from "@/db";
import { games, mistakes, exercises, openingLines } from "@/db/schema";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { Swords, Dumbbell, BookOpen, ClipboardList, TrendingDown, TrendingUp, Minus, Flame } from "lucide-react";
import { PATTERN_LABELS } from "@/lib/chess/analyze";
import { progressVerdict } from "@/lib/chess/coach";

export const dynamic = "force-dynamic";

async function getStats() {
  const [g] = await db
    .select({
      total: sql<number>`count(*)::int`,
      analyzed: sql<number>`count(*) filter (where ${games.analysis} is not null)::int`,
      wins: sql<number>`count(*) filter (where (${games.result} = '1-0' and ${games.userColor} = 'white') or (${games.result} = '0-1' and ${games.userColor} = 'black'))::int`,
      losses: sql<number>`count(*) filter (where (${games.result} = '0-1' and ${games.userColor} = 'white') or (${games.result} = '1-0' and ${games.userColor} = 'black'))::int`,
      draws: sql<number>`count(*) filter (where ${games.result} = '1/2-1/2')::int`,
    })
    .from(games);
  const [m] = await db
    .select({
      blunders: sql<number>`count(*) filter (where ${mistakes.category} = 'blunder')::int`,
      mistakes: sql<number>`count(*) filter (where ${mistakes.category} = 'mistake')::int`,
      inaccuracies: sql<number>`count(*) filter (where ${mistakes.category} = 'inaccuracy')::int`,
    })
    .from(mistakes);
  const byPattern = await db
    .select({ pattern: mistakes.pattern, count: sql<number>`count(*)::int`, solved: sql<number>`coalesce(sum(${mistakes.solvedCount}),0)::int`, failed: sql<number>`coalesce(sum(${mistakes.failedCount}),0)::int` })
    .from(mistakes)
    .groupBy(mistakes.pattern)
    .orderBy(sql`count(*) desc`);
  const analyzedGames = await db
    .select({ analysis: games.analysis, userColor: games.userColor })
    .from(games)
    .where(sql`${games.analysis} is not null`)
    .orderBy(games.createdAt);
  const per = analyzedGames.map((ga) => {
    const ev = ((ga.analysis as any)?.evaluations ?? []) as any[];
    const mine = ev.filter((e) => e.color === ga.userColor);
    const acpl = mine.length ? mine.reduce((s, e) => s + Math.min(e.dropCp ?? 0, 300), 0) / mine.length : 0;
    const bl = mine.filter((e) => e.category === "blunder").length;
    return { acpl, bl };
  });
  const half = Math.floor(per.length / 2);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const trend = {
    recentAcpl: Math.round(avg(per.slice(half).map((p) => p.acpl)) || avg(per.map((p) => p.acpl))),
    olderAcpl: Math.round(avg(per.slice(0, half).map((p) => p.acpl)) || avg(per.map((p) => p.acpl))),
    blundersRecent: Math.round((avg(per.slice(half).map((p) => p.bl)) || avg(per.map((p) => p.bl))) * 10) / 10,
    blundersOlder: Math.round((avg(per.slice(0, half).map((p) => p.bl)) || avg(per.map((p) => p.bl))) * 10) / 10,
  };
  const [ex] = await db
    .select({ due: sql<number>`count(*) filter (where ${exercises.active} = 1 and ${exercises.dueAt} <= now())::int`, solved: sql<number>`coalesce(sum(${exercises.solved}),0)::int`, attempts: sql<number>`coalesce(sum(${exercises.attempts}),0)::int` })
    .from(exercises);
  const [op] = await db.select({ due: sql<number>`count(*) filter (where ${openingLines.dueAt} <= now())::int` }).from(openingLines);
  // rough practical estimate: start ~650, blunders/game vs baseline, training solved
  const est = Math.max(400, Math.min(1500, Math.round(650 + per.length * 4 + (ex.solved - ex.attempts * 0.2) * 2 + (trend.olderAcpl - trend.recentAcpl))));
  return { g, m, byPattern, trend, ex, op, gameCount: per.length, est };
}

export default async function Dashboard() {
  const s = await getStats();
  const top = s.byPattern[0];
  const improving = s.trend.recentAcpl < s.trend.olderAcpl - 10 && s.gameCount >= 4;
  const flat = Math.abs(s.trend.recentAcpl - s.trend.olderAcpl) <= 10 || s.gameCount < 4;

  return (
    <div className="space-y-6">
      {/* Coach banner */}
      <section className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-felt2/60 via-transparent to-transparent" />
        <div className="relative max-w-3xl">
          <p className="label mb-2">Coach's board</p>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {s.g.total === 0 ? (
              <>You beat 1600-rated bots but lose to your father. There's a reason — and it's trainable.</>
            ) : top ? (
              <>
                Your #1 leak: <span className="text-gold">{PATTERN_LABELS[top.pattern] ?? top.pattern}</span> — {top.count} times so far.{" "}
                {top.solved > 0 ? `${top.solved} drilled.` : "We have not drilled it yet."}
              </>
            ) : (
              "Games logged. Now let's look at what actually happened."
            )}
          </h1>
          <p className="coach-quote mt-3 text-lg text-muted">
            {s.g.total === 0
              ? "Bots let you think. Humans make you think under pressure. Log your next OTB game and I'll show you the three things that keep costing you — then we train exactly those."
              : progressVerdict(s.trend)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/otb" className="btn btn-gold"><Swords size={15} /> Log / train a game</Link>
            <Link href="/train" className="btn btn-ghost"><Dumbbell size={15} /> Train weaknesses{s.ex.due > 0 ? ` (${s.ex.due} due)` : ""}</Link>
            <Link href="/openings" className="btn btn-ghost"><BookOpen size={15} /> Repertoire{s.op.due > 0 ? ` (${s.op.due} due)` : ""}</Link>
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Games" value={String(s.g.total)} sub={`${s.g.analyzed} analyzed`} />
        <Stat label="W–D–L" value={`${s.g.wins}–${s.g.draws}–${s.g.losses}`} sub="your results" />
        <Stat label="Blunders" value={String(s.m.blunders)} sub={`${s.m.mistakes} mistakes · ${s.m.inaccuracies} inacc.`} danger={s.m.blunders > 0} />
        <Stat
          label="ACPL trend"
          value={s.gameCount ? `${s.trend.recentAcpl}` : "—"}
          sub={s.gameCount >= 4 ? `was ${s.trend.olderAcpl}` : "need more games"}
          icon={flat ? <Minus size={14} /> : improving ? <TrendingDown size={14} className="text-good" /> : <TrendingUp size={14} className="text-bad" />}
          good={improving}
        />
        <Stat label="Training" value={`${s.ex.solved}`} sub={`exercises solved`} />
        <Stat label="Est. practical" value={`~${s.est}`} sub="rough, moves with work" gold />
      </section>

      {/* Pattern table + next actions */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="panel p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Your mistake memory</h2>
            <Link href="/mistakes" className="text-sm text-gold hover:underline">details</Link>
          </div>
          {s.byPattern.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Analyze a game and your recurring patterns will appear here — permanently.</p>
          ) : (
            <ul className="space-y-2">
              {s.byPattern.slice(0, 6).map((p) => {
                const pct = p.solved + p.failed > 0 ? Math.round((p.solved / (p.solved + p.failed)) * 100) : null;
                return (
                  <li key={p.pattern} className="panel2 flex items-center gap-3 px-3 py-2.5">
                    <Flame size={15} className={p.count >= 4 ? "text-bad" : "text-muted"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{PATTERN_LABELS[p.pattern] ?? p.pattern}</p>
                      <p className="text-xs text-muted">You have made this mistake {p.count} time{p.count === 1 ? "" : "s"}.</p>
                    </div>
                    {pct !== null && <span className={`pill ${pct >= 60 ? "bg-felt text-good" : "bg-panel text-warn"}`}>{pct}% drilled</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="panel p-5 lg:col-span-2">
          <h2 className="font-display mb-3 text-xl font-semibold">Before your next game vs your father</h2>
          <ol className="space-y-2.5 text-sm text-cream/85">
            <Todo n={1} href="/train" done={s.ex.due === 0 && s.ex.attempts > 0}>Clear your due exercises ({s.ex.due} waiting).</Todo>
            <Todo n={2} href="/openings">Run one White line and your Caro-Kann line once.</Todo>
            <Todo n={3} href="/mistakes">Re-read your top pattern's coach note.</Todo>
          </ol>
          <div className="mt-4 rounded-xl border border-line bg-felt2/40 p-3">
            <p className="label mb-1">The one habit</p>
            <p className="text-sm text-cream/90">After every move he plays, ask out loud: <em className="coach-quote">“What does that move threaten?”</em> Then Checks → Captures → Threats. Nothing else matters more right now.</p>
          </div>
        </div>
      </section>

      {s.g.total === 0 && (
        <section className="panel p-5">
          <h2 className="font-display mb-2 text-xl font-semibold">How this works</h2>
          <div className="grid gap-3 text-sm text-muted sm:grid-cols-3">
            <p><strong className="text-cream">1. Log games.</strong> Play over the board, enter the moves here afterwards (or train live against the engine).</p>
            <p><strong className="text-cream">2. Analyze.</strong> Stockfish finds your critical moments; the coach explains them in plain words and files every mistake by pattern.</p>
            <p><strong className="text-cream">3. Train.</strong> Your own mistakes come back as exercises on a spaced-repetition schedule until the pattern is dead.</p>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, icon, good, danger, gold }: { label: string; value: string; sub: string; icon?: React.ReactNode; good?: boolean; danger?: boolean; gold?: boolean }) {
  return (
    <div className="panel card-hover p-4">
      <p className="label">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 font-display text-2xl font-semibold ${gold ? "text-gold" : good ? "text-good" : danger ? "text-bad" : ""}`}>
        {value} {icon}
      </p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function Todo({ n, href, done, children }: { n: number; href: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className={`flex items-start gap-2.5 rounded-lg border border-line px-3 py-2 transition-colors hover:border-gold/50 ${done ? "opacity-50" : ""}`}>
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${done ? "bg-felt text-good" : "bg-panel2 text-gold"}`}>{done ? "✓" : n}</span>
        <span>{children}</span>
      </Link>
    </li>
  );
}
