"use client";

const CAT_COLOR: Record<string, string> = {
  blunder: "#d76a5e",
  mistake: "#d8a23a",
  inaccuracy: "#93a094",
  checkmate: "#6fbf73",
};

export default function MoveList({
  sans,
  currentPly,
  onSelect,
  categories,
}: {
  sans: string[];
  currentPly: number; // 0 = start position, N = after N half-moves
  onSelect: (ply: number) => void;
  categories?: (string | null)[];
}) {
  const pairs: { n: number; w?: string; b?: string }[] = [];
  for (let i = 0; i < sans.length; i += 2) pairs.push({ n: i / 2 + 1, w: sans[i], b: sans[i + 1] });

  const cell = (ply: number, san?: string) => {
    if (!san) return <span className="inline-block w-16" />;
    const cat = categories?.[ply - 1];
    return (
      <button
        key={ply}
        onClick={() => onSelect(ply)}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-medium transition-colors ${
          currentPly === ply ? "bg-felt text-cream" : "text-cream/85 hover:bg-panel2"
        }`}
      >
        {cat && CAT_COLOR[cat] ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[cat] }} /> : null}
        {san}
      </button>
    );
  };

  return (
    <div className="scroll-thin max-h-105 overflow-y-auto pr-1">
      <button
        onClick={() => onSelect(0)}
        className={`mb-1 rounded px-1.5 py-0.5 text-[13px] ${currentPly === 0 ? "bg-felt text-cream" : "text-muted hover:bg-panel2"}`}
      >
        Start
      </button>
      <div className="grid grid-cols-[2.2rem_1fr_1fr] gap-y-0.5">
        {pairs.map((p) => (
          <div key={p.n} className="contents">
            <span className="px-1 py-0.5 text-[13px] text-muted">{p.n}.</span>
            <span>{cell(p.n * 2 - 1, p.w)}</span>
            <span>{cell(p.n * 2, p.b)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
