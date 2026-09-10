import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { openingLines } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { REPERTOIRE } from "@/lib/openings/repertoire";

const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15];

export async function GET() {
  let rows = await db.select().from(openingLines).orderBy(asc(openingLines.color), asc(openingLines.id));
  if (rows.length === 0) {
    await db.insert(openingLines).values(REPERTOIRE.map((r) => ({ ...r, moves: r.moves })));
    rows = await db.select().from(openingLines).orderBy(asc(openingLines.color), asc(openingLines.id));
  }
  return NextResponse.json(rows);
}

// Body: { id, solved } — spaced-repetition for repertoire lines
export async function POST(req: NextRequest) {
  const { id, solved } = await req.json();
  const [line] = await db.select().from(openingLines).where(eq(openingLines.id, Number(id)));
  if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });
  const box = solved ? Math.min(5, line.box + 1) : 1;
  const [row] = await db
    .update(openingLines)
    .set({
      box,
      streak: solved ? line.streak + 1 : 0,
      attempts: line.attempts + 1,
      dueAt: new Date(Date.now() + INTERVAL_DAYS[box] * 86400000),
    })
    .where(eq(openingLines.id, line.id))
    .returning();
  return NextResponse.json(row);
}
