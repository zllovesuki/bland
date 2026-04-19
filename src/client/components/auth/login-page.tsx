import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LogIn, Mail, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { useAuth } from "@/client/hooks/use-auth";
import { toApiError } from "@/client/lib/api";
import { getClientConfigErrorSnapshot, getClientConfigSnapshot } from "@/client/lib/client-config";
import { SECURITY_VERIFICATION_UNAVAILABLE_MESSAGE } from "@/client/lib/constants";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { TurnstileWidget } from "./turnstile-widget";

export function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = useSearch({ from: "/login" });
  const { login } = useAuth();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  useDocumentTitle("Login");
  const config = getClientConfigSnapshot();
  const configError = getClientConfigErrorSnapshot();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const showVerificationUnavailable = !!configError || !config || turnstileUnavailable;

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate({ to: redirectTo || "/" });
  }, [isAuthenticated, navigate, redirectTo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (showVerificationUnavailable) {
      setError(SECURITY_VERIFICATION_UNAVAILABLE_MESSAGE);
      return;
    }
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
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-100">Welcome back</h1>
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

          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="h-4 w-4" />}
            label="Email"
          />

          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            label="Password"
          />

          {showVerificationUnavailable ? (
            <div
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-400"
            >
              <p>{SECURITY_VERIFICATION_UNAVAILABLE_MESSAGE}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          ) : (
            <TurnstileWidget
              siteKey={config.turnstile_site_key}
              onTokenChange={setTurnstileToken}
              onUnavailable={() => setTurnstileUnavailable(true)}
              action="login"
              resetKey={turnstileResetKey}
            />
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={isSubmitting || showVerificationUnavailable || !turnstileToken}
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
