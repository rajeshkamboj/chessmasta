import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { LayoutDashboard, Swords, Dumbbell, BookOpen, AlertTriangle, Crown, ClipboardList } from "lucide-react";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", style: ["normal", "italic"] });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: "Second Board — personal chess trainer",
  description: "A demanding but encouraging chess coach: records your games, remembers your mistakes, and trains your weaknesses.",
};

const NAV = [
  { href: "/", label: "Coach", icon: LayoutDashboard },
  { href: "/otb", label: "OTB trainer", icon: Swords },
  { href: "/games", label: "Games", icon: ClipboardList },
  { href: "/train", label: "Training", icon: Dumbbell },
  { href: "/openings", label: "Repertoire", icon: BookOpen },
  { href: "/mistakes", label: "Mistakes", icon: AlertTriangle },
  { href: "/play", label: "Board", icon: Crown },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${space.variable} min-h-screen`}>
        <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-felt text-cream">
                <Crown size={16} />
              </span>
              <span className="font-display text-lg font-semibold tracking-tight">Second Board</span>
              <span className="hidden text-xs text-muted sm:block">your coach, off the clock</span>
            </Link>
            <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-panel hover:text-cream"
                >
                  <n.icon size={14} />
                  <span className="hidden md:inline">{n.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
