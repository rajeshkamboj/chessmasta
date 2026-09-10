export type OpeningSeed = {
  color: "white" | "black";
  name: string;
  against: string;
  moves: string[]; // SAN, alternating from startBy
  startBy: "white" | "black";
  plan: string;
  traps: string;
  deviation: string;
};

// Deliberately small & robust repertoire. Goal: playable positions you cannot easily mess up.
export const REPERTOIRE: OpeningSeed[] = [
  {
    color: "white",
    name: "Italian Game (Gioco Piano)",
    against: "1...e5, 3...Bc5",
    startBy: "white",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6", "O-O"],
    plan: "Castle first, then prepare d4 with c3. Keep the bishop on the a2–g8 diagonal (b3 if pushed). Typical setup: Re1, Nbd2–f1–g3, h3 to stop ...Bg4. Only push d4 when your king is safe.",
    traps: "After ...Bg4?? hitting your knight, h3 Nxf2 tricks: often simply Bxf2+ is fine. If ...Nd4 jumps in, cxd4 or Be2 and trade — don't get greedy.",
    deviation: "Opponent plays something strange? Don't panic. Rule: occupy the center, develop a piece, castle. You are never 'out of book' — you are just back to principles.",
  },
  {
    color: "white",
    name: "Italian vs Two Knights",
    against: "1...e5, 3...Nf6",
    startBy: "white",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5", "c3", "a6", "O-O"],
    plan: "Against ...Nf6 stay solid with d3 (avoid the sharp Ng5 lines). Build the c3+d4 center, castle, then Re1 and Nbd2–f1. Slow but very hard to mess up.",
    traps: "If ...Ng4 goes after f2, you are already castled — it's nothing. Just play Be3 or Re1 and continue the plan.",
    deviation: "...d5 early? Take on d5 with the pawn only if it doesn't cost your center; otherwise Nc3, castle, and keep developing.",
  },
  {
    color: "white",
    name: "Alapin vs the Sicilian",
    against: "1...c5",
    startBy: "white",
    moves: ["e4", "c5", "c3", "d5", "exd5", "Qxd5", "d4", "Nf6", "Nf3"],
    plan: "The Alapin dodges all the heavy Sicilian theory. You get an isolated queens pawn or a healthy center — either way your plan is Nf3, Bd3, O-O, and use the c- and e-files. Black players under 1200 often have no real answer to 2.c3.",
    traps: "Don't hang the d4 pawn when it's isolated. If he plays ...cxd4 early just recapture quickly and develop.",
    deviation: "2...Nf6? 3.e5 Nd5 4.d4 and you've gained time. 2...e6 or ...d6? Just d4 and develop — your structure is healthier than his.",
  },
  {
    color: "white",
    name: "Exchange vs the Caro-Kann",
    against: "1...c6",
    startBy: "white",
    moves: ["e4", "c6", "d4", "d5", "exd5", "cxd5", "Bd3", "Nc6", "c3", "Nf6", "Bf4"],
    plan: "Exchange, then the 'Caro ladder': Bd3, c3 (solid b2+d4 chain), Bf4, Nf3, O-O. Symmetrical and calm — exactly what you want. Later plan: minority-free middlegame, pressure the e5 square, expand on the kingside with h3 and Re1.",
    traps: "After ...Bg4?? you can often play Bxh7+? No — don't. Just Nf3 and continue. ...Qb6 hits b2: defend with Qc2 or b3.",
    deviation: "...Bf5 before ...e6? Take it: Bxf5 gives you a grip on e6 ideas, or just develop and it's fine.",
  },
  {
    color: "white",
    name: "Exchange vs the French",
    against: "1...e6",
    startBy: "white",
    moves: ["e4", "e6", "d4", "d5", "exd5", "exd5", "Bd3", "Bd6", "Nf3", "Nf6", "O-O"],
    plan: "The Exchange French is fully symmetrical and removes the French's whole point (the locked center). Follow with O-O, Re1, Nf3-e5 ideas and Ng5 only with something concrete. Club players hate the simplicity.",
    traps: "If he keeps symmetry forever, don't get bored and lash out — use Re1 and c4 to unbalance gently.",
    deviation: "3...dxe4? Nc3 and recapture; you're ahead in development with zero risk.",
  },
  {
    color: "white",
    name: "vs the Scandinavian",
    against: "1...d5",
    startBy: "white",
    moves: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "c6", "Bc4"],
    plan: "Free development: Nc3 gains a tempo on the queen, then d4, Nf3, Bc4, O-O. You're basically a move up for nothing. Play fast, natural moves and use the lead.",
    traps: "Don't chase the queen endlessly — one tempo is enough. Build the position instead.",
    deviation: "...Qd6 or ...Qe5+? Same answer: develop with tempo when possible, castle, centralize rooks.",
  },
  {
    color: "black",
    name: "Caro-Kann: main response",
    against: "1.e4 (as Black)",
    startBy: "white",
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6", "Nf3", "Nd7", "Bd3", "e6"],
    plan: "Your house as Black. The c6+d5 duo, the light-squared bishop OUTSIDE the pawn chain (Bf5 before ...e6), knights to d7 and f6, then ...e6, ...Be7, castle. Trade pieces when offered — Caro endgames are your friend.",
    traps: "If Bd3 offers the bishop trade, usually take it. Watch the Nf3–e5 invasions: meet them with ...Nd7 challenging or ...f6 only when castled.",
    deviation: "Anything weird by White (2.Nc3, 2.f4)? Same setup every time: ...d5, ...Bf5, ...e6, knights out, castle. Your structure doesn't care what he does.",
  },
  {
    color: "black",
    name: "Caro-Kann: vs the Advance",
    against: "1.e4 c6 2.d4 d5 3.e5",
    startBy: "white",
    moves: ["e4", "c6", "d4", "d5", "e5", "Bf5", "Nf3", "e6", "Be2", "c5"],
    plan: "Against the Advance: bishop out first (3...Bf5), then ...e6, and immediately challenge the base with ...c5. If he defends with c3, hit with ...Qb6 attacking b2 and pressure d4. You strike the pawn chain at its base — textbook.",
    traps: "Don't play ...e6 before ...Bf5, or your bishop is buried. ...c5 is planned anyway, so the move order is ...Bf5, ...e6, ...c5.",
    deviation: "If he refuses to defend d4 and gambits it — take it only when you can't be punished (castle first).",
  },
  {
    color: "black",
    name: "Solid ...d5 vs 1.d4",
    against: "1.d4 (Queen's Gambit & co)",
    startBy: "white",
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O", "Nf3", "h6"],
    plan: "Classical and bulletproof: ...d5, ...e6, ...Nf6, ...Be7, castle. Then free yourself with ...c5 (or ...b6 and ...Bb7 if cramped). You concede a little space for a rock-solid structure that is very hard to attack.",
    traps: "The ...Be7 before ...Nbd7 move order avoids the worst pins. If Bxf6 trades, recapture with the bishop. ...h6 asks the question of the g5 bishop when you're ready.",
    deviation: "2.Bf4 (London)? ...Nf6, ...e6, ...c5 challenging the center immediately, ...Nc6, ...Bd6 trading bishops. 2.Nf3? Same thing — your setup is universal.",
  },
  {
    color: "black",
    name: "Universal vs everything else",
    against: "1.c4, 1.Nf3, 1.g3, 1.b3, gambits",
    startBy: "white",
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O", "Be7", "d3", "O-O"],
    plan: "The anti-theory setup: ...d5, ...Nf6, ...e6, ...Be7, castle. It is not necessarily the objectively 'best' against everything — it is the setup you will never blunder in, and that is worth more at your level. After castling, choose ...c5 or ...b6+...Bb7 based on what White does.",
    traps: "Against flank openings, do NOT grab the center with both ...d5 and ...e5 pawns early — overextending against a fianchetto is how club players lose in 20 moves.",
    deviation: "King's Gambit (2.f4 after e4 e5)? Take it and return it: ...exf4, develop fast, castle — don't cling to the pawn. Danish/Smith-Morra? Same: take, develop, castle, return material for safety if needed.",
  },
  {
    color: "white",
    name: "Anti-...d5 as White (rare replies)",
    against: "1...Nf6, 1...g6, 1...d6, 1...e6waiting",
    startBy: "white",
    moves: ["e4", "Nf6", "e5", "Nd5", "d4", "d6", "Nf3"],
    plan: "If Black answers 1.e4 with anything that isn't ...e5, ...c5, ...c6 or ...e6, build a big center (d4+e4), develop Nf3, Bc4 or Bd3, castle — and don't overpush. A space advantage that is solid is worth a pawn; a space advantage that breaks is worth nothing.",
    traps: "Pirc/Modern (1...d6/1...g6) players *want* you to overextend. Build the center, castle, and only attack when developed.",
    deviation: "They fianchetto and wait? You have the center — you don't need to 'refute' anything. Develop, castle, and wait for their mistake. It's coming.",
  },
];
