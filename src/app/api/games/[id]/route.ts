import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(games).where(eq(games.id, Number(id)));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const allowed = ["title", "whiteName", "blackName", "result", "userColor", "source", "pgn", "fen", "moves", "reflections", "analysis", "analyzedAt"] as const;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) if (k in b) patch[k] = b[k];
  if ("analysis" in b && !("analyzedAt" in b)) patch.analyzedAt = new Date();
  const [row] = await db.update(games).set(patch).where(eq(games.id, Number(id))).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(games).where(eq(games.id, Number(id)));
  return NextResponse.json({ ok: true });
}
