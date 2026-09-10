import { NextResponse } from "next/server";
import { db } from "@/db";
import { exercises, mistakes } from "@/db/schema";
import { and, asc, eq, lte, sql } from "drizzle-orm";

export async function GET() {
  const now = new Date();
  const due = await db
    .select({
      id: exercises.id,
      kind: exercises.kind,
      fen: exercises.fen,
      prompt: exercises.prompt,
      solutionSan: exercises.solutionSan,
      box: exercises.box,
      attempts: exercises.attempts,
      mistakeId: exercises.mistakeId,
      pattern: mistakes.pattern,
      playedSan: mistakes.playedSan,
      explanation: mistakes.explanation,
      userReason: mistakes.userReason,
    })
    .from(exercises)
    .leftJoin(mistakes, eq(exercises.mistakeId, mistakes.id))
    .where(and(eq(exercises.active, 1), lte(exercises.dueAt, now)))
    .orderBy(asc(exercises.box), asc(exercises.dueAt))
    .limit(10);

  // occurrence counts per pattern (for "you've done this N times")
  const counts = await db.select({ pattern: mistakes.pattern, count: sql<number>`count(*)::int` }).from(mistakes).groupBy(mistakes.pattern);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(exercises).where(and(eq(exercises.active, 1), lte(exercises.dueAt, now)));
  return NextResponse.json({ due, totalDue: total[0]?.n ?? 0, patternCounts: counts });
}
