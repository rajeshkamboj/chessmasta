import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exercises, mistakes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15]; // Leitner boxes 1..5

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { solved } = await req.json();
  const [ex] = await db.select().from(exercises).where(eq(exercises.id, Number(id)));
  if (!ex) return NextResponse.json({ error: "not found" }, { status: 404 });

  const box = solved ? Math.min(5, ex.box + 1) : 1;
  const dueAt = new Date(Date.now() + INTERVAL_DAYS[box] * 86400000);
  const deactivate = solved && box === 5; // mastered: retire
  const [row] = await db
    .update(exercises)
    .set({
      box,
      dueAt,
      attempts: ex.attempts + 1,
      solved: ex.solved + (solved ? 1 : 0),
      active: deactivate ? 0 : 1,
    })
    .where(eq(exercises.id, ex.id))
    .returning();

  if (ex.mistakeId) {
    await db
      .update(mistakes)
      .set({ solvedCount: sql`${mistakes.solvedCount} + ${solved ? 1 : 0}`, failedCount: sql`${mistakes.failedCount} + ${solved ? 0 : 1}` })
      .where(eq(mistakes.id, ex.mistakeId));
  }
  return NextResponse.json(row);
}
