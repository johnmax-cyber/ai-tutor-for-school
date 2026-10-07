"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Trim whitespace from email and password
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (signUpError) throw signUpError;
      }
      router.push("/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4 text-on-surface font-sans">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-surface-container-low border border-surface-container-high p-8 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
            <span className="material-symbols-outlined text-[28px]">
              psychology
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Cognita<span className="text-primary font-bold">.ai</span>
          </h1>
          <p className="text-xs text-on-surface-variant max-w-xs">
            Academic workspace for grounded study synthesis, spaced retrieval, and OCR analysis.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-lg bg-surface-container p-1 border border-outline-variant/20 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              mode === "signin"
                ? "bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              mode === "signup"
                ? "bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-outline uppercase tracking-wider mb-1.5"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="academic@institution.edu"
              className="w-full rounded-lg border border-surface-container-high bg-surface-container px-3.5 py-2.5 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-outline uppercase tracking-wider mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              className="w-full rounded-lg border border-surface-container-high bg-surface-container px-3.5 py-2.5 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-error-container/20 border border-error-crimson/30 text-error-crimson text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">
                error
              </span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 px-4 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">
              {loading ? "progress_activity" : "login"}
            </span>
            <span>
              {loading
                ? "Authenticating..."
                : mode === "signin"
                ? "Sign In to Workspace"
                : "Create Academic Account"}
            </span>
          </button>
        </form>

        <div className="text-center pt-2 border-t border-surface-container-high">
          <p className="text-xs text-outline font-mono">
            Encrypted Session • Supabase Authentication
          </p>
        </div>
      </div>
    </main>
  );
}
