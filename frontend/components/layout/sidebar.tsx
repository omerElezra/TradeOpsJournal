"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CandlestickChart,
  LineChart,
  NotebookPen,
  Sparkles,
  Settings,
  Receipt,
  Banknote,
  Landmark,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: CandlestickChart },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/cash", label: "Cash", icon: Banknote },
  { href: "/account-transactions", label: "Account Activity", icon: Landmark },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <img src="/logo.svg" alt="TradeOps" className="h-7 w-7 rounded-md" />
        <span className="text-sm font-semibold tracking-tight">TradeOps Journal</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
