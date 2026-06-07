"use client";

import { cn } from "@/lib/utils";
import { useRange } from "@/components/range-context";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Range } from "@/types";

const RANGES: Range[] = ["7d", "30d", "90d", "ytd", "all"];

export function Topbar() {
  const { range, setRange } = useRange();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Dashboard
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium uppercase transition-colors",
                range === r
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={signOut}
          className="h-7 w-7 rounded-full bg-secondary text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Sign out"
          title="Sign out"
        />
      </div>
    </header>
  );
}
