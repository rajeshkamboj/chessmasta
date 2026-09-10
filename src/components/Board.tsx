"use client";

import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { useMemo, useState, type CSSProperties } from "react";
import { START_FEN } from "@/lib/chess/analyze";

export type BoardProps = {
  fen: string;
  boardId: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  onMove?: (from: string, to: string) => boolean; // return true if accepted
  lastMove?: { from: string; to: string } | null;
  marks?: Record<string, CSSProperties>;
  arrows?: { startSquare: string; endSquare: string; color: string }[];
};

const LIGHT: CSSProperties = { backgroundColor: "#e8dcc2" };
const DARK: CSSProperties = { backgroundColor: "#76915f" };

export default function Board({ fen, boardId, orientation = "white", interactive = true, onMove, lastMove, marks = {}, arrows }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess(START_FEN);
    }
  }, [fen]);

  const targets = useMemo(() => {
    if (!selected) return [];
    try {
      return game.moves({ square: selected as Square, verbose: true });
    } catch {
      return [];
    }
  }, [game, selected]);

  const squareStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = { ...marks };
    if (lastMove) {
      s[lastMove.from] = { ...s[lastMove.from], backgroundColor: "rgba(224,176,76,0.35)" };
      s[lastMove.to] = { ...s[lastMove.to], backgroundColor: "rgba(224,176,76,0.5)" };
    }
    if (selected) s[selected] = { ...s[selected], backgroundColor: "rgba(111,191,115,0.55)" };
    if (game.inCheck()) {
      for (const row of game.board())
        for (const c of row)
          if (c && c.type === "k" && c.color === game.turn())
            s[c.square] = { ...s[c.square], background: "radial-gradient(circle, rgba(215,106,94,.85) 30%, transparent 75%)" };
    }
    for (const t of targets) {
      if (s[t.to]?.background) continue;
      s[t.to] = {
        ...s[t.to],
        background: t.captured
          ? "radial-gradient(circle, transparent 55%, rgba(224,176,76,.7) 56%, rgba(224,176,76,.7) 78%, transparent 79%)"
          : "radial-gradient(circle, rgba(26,20,8,.32) 22%, transparent 23%)",
      };
    }
    return s;
  }, [marks, lastMove, selected, targets, game]);

  function tryMove(from: string, to: string): boolean {
    setSelected(null);
    return onMove ? onMove(from, to) : true;
  }

  return (
    <Chessboard
      options={{
        id: boardId,
        position: fen,
        boardOrientation: orientation,
        lightSquareStyle: LIGHT,
        darkSquareStyle: DARK,
        squareStyles,
        arrows,
        showNotation: true,
        animationDurationInMs: 140,
        allowDragging: interactive,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!interactive || !targetSquare) return false;
          return tryMove(sourceSquare, targetSquare);
        },
        onSquareClick: ({ piece, square }) => {
          if (!interactive) return;
          if (selected) {
            const legal = targets.some((t) => t.to === square);
            if (legal) {
              tryMove(selected, square);
              return;
            }
            if (piece && piece.pieceType[0] === game.turn()) {
              setSelected(square);
              return;
            }
            setSelected(null);
            return;
          }
          if (piece && piece.pieceType[0] === game.turn()) setSelected(square);
        },
      }}
    />
  );
}

export function moveSquares(fenBefore: string, san: string): { from: string; to: string } | null {
  try {
    const g = new Chess(fenBefore);
    const m = g.moves({ verbose: true }).find((x) => x.san === san);
    return m ? { from: m.from, to: m.to } : null;
  } catch {
    return null;
  }
}
