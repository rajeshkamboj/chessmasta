import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Untitled game"),
  whiteName: text("white_name").notNull().default("White"),
  blackName: text("black_name").notNull().default("Black"),
  result: text("result").notNull().default("*"), // "1-0" | "0-1" | "1/2-1/2" | "*"
  userColor: text("user_color").notNull().default("white"),
  source: text("source").notNull().default("otb"), // otb | online | practice
  pgn: text("pgn").notNull().default(""),
  fen: text("fen").notNull().default(""),
  moves: jsonb("moves").notNull().default([]), // [{san, fen}]
  reflections: jsonb("reflections").notNull().default({}), // moveIndex -> {threat, reason, candidate}
  analysis: jsonb("analysis"), // MoveEval[] once analyzed
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mistakes = pgTable(
  "mistakes",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id").references(() => games.id, { onDelete: "cascade" }),
    moveNumber: integer("move_number").notNull(),
    color: text("color").notNull(), // side that erred
    fen: text("fen").notNull(), // position BEFORE the bad move
    playedSan: text("played_san").notNull(),
    bestSan: text("best_san").notNull(),
    evalBeforeCp: integer("eval_before_cp").notNull(),
    evalAfterCp: integer("eval_after_cp").notNull(),
    dropCp: integer("drop_cp").notNull(),
    category: text("category").notNull(), // inaccuracy | mistake | blunder
    pattern: text("pattern").notNull(), // hanging_piece | fork | pin | mate_missed | overlooked_threat | opening | planning | calculation | endgame | other
    explanation: text("explanation").notNull().default(""),
    userReason: text("user_reason"),
    solvedCount: integer("solved_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("mistakes_pattern_idx").on(t.pattern), index("mistakes_game_idx").on(t.gameId)]
);

export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    mistakeId: integer("mistake_id").references(() => mistakes.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // tactical | calculation | threat | opening | endgame
    fen: text("fen").notNull(),
    prompt: text("prompt").notNull(),
    solutionSan: text("solution_san").notNull(),
    box: integer("box").notNull().default(1), // Leitner 1..5
    dueAt: timestamp("due_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    solved: integer("solved").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("exercises_due_idx").on(t.dueAt)]
);

export const openingLines = pgTable("opening_lines", {
  id: serial("id").primaryKey(),
  color: text("color").notNull(), // white | black
  name: text("name").notNull(),
  against: text("against").notNull().default(""), // e.g. "1.e4" or "Sicilian 1...c5"
  moves: jsonb("moves").notNull().default([]), // alternating SAN, starting side = `startBy`
  startBy: text("start_by").notNull().default("white"),
  plan: text("plan").notNull().default(""),
  traps: text("traps").notNull().default(""),
  deviation: text("deviation").notNull().default(""), // what to do when opponent leaves theory
  box: integer("box").notNull().default(1),
  dueAt: timestamp("due_at").notNull().defaultNow(),
  streak: integer("streak").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
