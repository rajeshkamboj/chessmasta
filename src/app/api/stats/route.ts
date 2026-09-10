import { NextResponse } from "next/server";
import { db } from "@/db";
import { games, mistakes, exercises, openingLines } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
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
    .select({ pattern: mistakes.pattern, count: sql<number>`count(*)::int`, solved: sql<number>`coalesce(sum(${mistakes.solvedCount}),0)::int` })
    .from(mistakes)
    .groupBy(mistakes.pattern)
    .orderBy(sql`count(*) desc`);

  // ACPL + blunder trend from analyzed games (client-computed per game, stored in analysis jsonb could be big; use games fields instead)
  const analyzedGames = await db
    .select({ id: games.id, createdAt: games.createdAt, analysis: games.analysis, result: games.result, userColor: games.userColor })
    .from(games)
    .where(sql`${games.analysis} is not null`)
    .orderBy(games.createdAt);
  let acplRecent = 0, acplOlder = 0, blRecent = 0, blOlder = 0;
  const per: { acpl: number; bl: number }[] = analyzedGames.map((ga) => {
    const ev = ((ga.analysis as any)?.evaluations ?? []) as any[];
    const mine = ev.filter((e) => e.color === ga.userColor);
    const acpl = mine.length ? mine.reduce((s, e) => s + Math.min(e.dropCp ?? 0, 300), 0) / mine.length : 0;
    const bl = mine.filter((e) => e.category === "blunder").length;
    return { acpl, bl };
  });
  const half = Math.floor(per.length / 2);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  if (per.length >= 4) {
    acplOlder = avg(per.slice(0, half).map((p) => p.acpl));
    acplRecent = avg(per.slice(half).map((p) => p.acpl));
    blOlder = avg(per.slice(0, half).map((p) => p.bl));
    blRecent = avg(per.slice(half).map((p) => p.bl));
  } else if (per.length > 0) {
    acplOlder = acplRecent = avg(per.map((p) => p.acpl));
    blOlder = blRecent = avg(per.map((p) => p.bl));
  }

  const [ex] = await db
    .select({
      due: sql<number>`count(*) filter (where ${exercises.active} = 1 and ${exercises.dueAt} <= now())::int`,
      attempts: sql<number>`coalesce(sum(${exercises.attempts}),0)::int`,
      solved: sql<number>`coalesce(sum(${exercises.solved}),0)::int`,
      mastered: sql<number>`count(*) filter (where ${exercises.box} >= 4)::int`,
    })
    .from(exercises);

  const [op] = await db
    .select({ lines: sql<number>`count(*)::int`, trainedDue: sql<number>`count(*) filter (where ${openingLines.dueAt} <= now())::int` })
    .from(openingLines);

  return NextResponse.json({
    games: g,
    errors: m,
    byPattern,
    trend: { recentAcpl: Math.round(acplRecent), olderAcpl: Math.round(acplOlder), blundersRecent: Math.round(blRecent * 10) / 10, blundersOlder: Math.round(blOlder * 10) / 10, analyzedCount: per.length },
    exercises: ex,
    openings: op,
  });
}
