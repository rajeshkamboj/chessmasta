import { NextResponse } from "next/server";
import { db } from "@/db";
import { mistakes } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(mistakes).orderBy(desc(mistakes.createdAt)).limit(300);
  const grouped = await db
    .select({ pattern: mistakes.pattern, count: sql<number>`count(*)::int`, solved: sql<number>`coalesce(sum(${mistakes.solvedCount}),0)::int`, failed: sql<number>`coalesce(sum(${mistakes.failedCount}),0)::int` })
    .from(mistakes)
    .groupBy(mistakes.pattern);
  return NextResponse.json({ mistakes: rows, byPattern: grouped });
}
