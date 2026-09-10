import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, mistakes, exercises } from "@/db/schema";
import { eq } from "drizzle-orm";

// Body: { evaluations: MistakeLike[] } — client-side Stockfish analysis results.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = Number(id);
  const { evaluations } = await req.json();

  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.update(games).set({ analysis: { evaluations }, analyzedAt: new Date(), updatedAt: new Date() }).where(eq(games.id, gameId));

  // Replace mistakes for this game (re-analysis is idempotent).
  const old = await db.select({ id: mistakes.id }).from(mistakes).where(eq(mistakes.gameId, gameId));
  for (const o of old) await db.update(exercises).set({ mistakeId: null }).where(eq(exercises.mistakeId, o.id));
  await db.delete(mistakes).where(eq(mistakes.gameId, gameId));

  const errors = (evaluations as any[]).filter((e) => e.category && e.category !== "good" && e.color === game.userColor);
  const created: any[] = [];
  for (const e of errors) {
    const [m] = await db
      .insert(mistakes)
      .values({
        gameId,
        moveNumber: e.moveNumber,
        color: e.color,
        fen: e.fen,
        playedSan: e.san,
        bestSan: e.bestSan,
        evalBeforeCp: Math.round(e.evalBeforeCp),
        evalAfterCp: Math.round(e.evalAfterCp),
        dropCp: Math.round(e.dropCp),
        category: e.category,
        pattern: e.pattern,
        explanation: e.explanation ?? "",
        userReason: e.userReason ?? null,
      })
      .returning();
    created.push(m);

    // Generate a targeted exercise from each significant mistake.
    if (e.dropCp >= 120) {
      const kind =
        e.pattern === "opening"
          ? "opening"
          : e.pattern === "endgame"
            ? "endgame"
            : e.pattern === "overlooked_threat"
              ? "threat"
              : e.pattern === "missed_tactic" || e.pattern === "mate_missed" || e.pattern === "hanging_piece"
                ? "tactical"
                : "calculation";
      await db.insert(exercises).values({
        mistakeId: m.id,
        kind,
        fen: e.fen,
        prompt: e.exercisePrompt ?? `Find the best move for ${e.color}.`,
        solutionSan: e.bestSan,
      });
    }
  }
  return NextResponse.json({ mistakesCreated: created.length });
}
