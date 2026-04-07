import { useState, type FormEvent } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LogIn, Mail, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useAuth } from "@/client/hooks/use-auth";
import { toApiError } from "@/client/lib/api";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { TurnstileWidget } from "./turnstile-widget";
import { TURNSTILE_SITE_KEY } from "@/client/lib/constants";

export function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = useSearch({ from: "/login" });
  const { login } = useAuth();
  useDocumentTitle("Login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!turnstileToken) {
      setError("Please complete the verification.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password, turnstileToken });
      navigate({ to: redirectTo || "/" });
    } catch (err) {
      setError(toApiError(err).message);
      setTurnstileResetKey((k) => k + 1);
      setTurnstileToken(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="animate-slide-up w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Welcome back</h1>
          <p className="mt-2 text-sm text-zinc-400">Sign in to your bland account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              id="login-error"
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={error ? "login-error" : undefined}
                className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/80 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={error ? "login-error" : undefined}
                className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/80 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
              />
            </div>
          </div>

          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            onTokenChange={setTurnstileToken}
            action="login"
            resetKey={turnstileResetKey}
          />

          <Button
            variant="primary"
            type="submit"
            disabled={isSubmitting}
            className="w-full"
            icon={
              isSubmitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <LogIn className="h-4 w-4" />
              )
            }
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Have an invite link? Paste it in your browser to join a workspace.
        </p>
      </div>
    </div>
  );
}
