"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Mode = "password" | "magic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    callbackError ? "Magic link expired or already used." : null,
  );
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setMagicSent(true);
    setLoading(false);
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">TradeOps Journal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {mode === "password" && (
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputClass}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No password?{" "}
              <button
                type="button"
                onClick={() => { setMode("magic"); setError(null); }}
                className="underline hover:text-foreground"
              >
                Send a magic link
              </button>
            </p>
          </form>
        )}

        {mode === "magic" && !magicSent && (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send magic link"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Have a password?{" "}
              <button
                type="button"
                onClick={() => { setMode("password"); setError(null); }}
                className="underline hover:text-foreground"
              >
                Sign in with password
              </button>
            </p>
          </form>
        )}

        {mode === "magic" && magicSent && (
          <p className="text-sm text-muted-foreground">
            Check your inbox — magic link sent to{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
