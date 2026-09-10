import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(games).orderBy(desc(games.createdAt)).limit(100);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const [row] = await db
    .insert(games)
    .values({
      title: b.title ?? "OTB game",
      whiteName: b.whiteName ?? "White",
      blackName: b.blackName ?? "Black",
      result: b.result ?? "*",
      userColor: b.userColor ?? "white",
      source: b.source ?? "otb",
      pgn: b.pgn ?? "",
      fen: b.fen ?? "",
      moves: b.moves ?? [],
      reflections: b.reflections ?? {},
    })
    .returning();
  return NextResponse.json(row);
}
