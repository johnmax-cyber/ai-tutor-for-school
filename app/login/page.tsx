"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Alert, Icon } from "@/components/ui";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    const supabase = createClient();
    e.preventDefault();
    setLoading(true);
    setError(null);

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
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (signUpError) throw signUpError;

        // If sign up returns no session, show check-email state instead of redirecting
        if (!signUpError && !signUpData.session) {
          setMode("signup"); // Stay in signup mode
          setEmail(trimmedEmail); // Preserve email
          setError("A confirmation email has been sent. Please check your inbox.");
          return;
        }

        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4 text-on-surface font-sans">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-surface-container-low border border-surface-container-high p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
            <Icon name="psychology" size="lg" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Cognita<span className="text-primary font-bold">.ai</span>
          </h1>
          <p className="text-xs text-on-surface-variant max-w-xs">
            Academic workspace for grounded study synthesis, spaced retrieval, and OCR analysis.
          </p>
        </div>

        <div className="inline-flex rounded-lg bg-surface-container p-1 border border-outline-variant/20 text-xs font-semibold" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            onClick={() => setMode("signin")}
            className={
              mode === "signin"
                ? "flex-1 py-1.5 rounded-md text-on-surface bg-surface-container-high shadow-sm border border-outline-variant/30"
                : "flex-1 py-1.5 rounded-md text-on-surface-variant hover:text-on-surface"
            }
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => setMode("signup")}
            className={
              mode === "signup"
                ? "flex-1 py-1.5 rounded-md text-on-surface bg-surface-container-high shadow-sm border border-outline-variant/30"
                : "flex-1 py-1.5 rounded-md text-on-surface-variant hover:text-on-surface"
            }
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email Address">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="academic@institution.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Password">
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && (
            <Alert variant="error" icon={false}>
              {error}
            </Alert>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {loading
              ? "Authenticating..."
              : mode === "signin"
                ? "Sign In to Workspace"
                : "Create Academic Account"}
          </Button>
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