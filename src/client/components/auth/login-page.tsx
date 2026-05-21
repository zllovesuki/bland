import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LogIn, AlertCircle } from "lucide-react";
import {
  BUTTON_BASE_CLASSES,
  BUTTON_SIZE_CLASSES,
  BUTTON_VARIANT_CLASSES,
} from "@/client/components/ui/button-classes";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";

const ERROR_MESSAGES: Record<string, string> = {
  oidc_session_expired: "Your sign-in session expired. Please try again.",
  oidc_provider_error: "The identity provider returned an error. Please try again.",
  oidc_unverified_email: "Your tessera email is not verified yet. Verify it and retry.",
  oidc_post_callback_refresh_failed: "Sign-in completed but the session could not be confirmed. Please try again.",
  tessera_email_conflict: "That email is already used by another account.",
  identity_conflict: "This identity could not be linked. Contact support.",
};

function describeError(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}

function buildOidcStartUrl(returnTo: string | undefined): string {
  const target = returnTo && returnTo.startsWith("/") ? returnTo : "/";
  const params = new URLSearchParams({ return_to: target });
  return `/api/v1/oidc/start?${params.toString()}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo, error } = useSearch({ from: "/login" });
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  useDocumentTitle("Login");

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate({ to: redirectTo || "/" });
  }, [isAuthenticated, navigate, redirectTo]);

  const errorMessage = describeError(typeof error === "string" ? error : undefined);
  const oidcStartUrl = buildOidcStartUrl(typeof redirectTo === "string" ? redirectTo : undefined);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="animate-slide-up w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-100">Welcome back</h1>
          <p className="mt-2 text-sm text-zinc-400">Sign in to your bland account</p>
        </div>

        {errorMessage && (
          <div
            id="login-error"
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <a
          href={oidcStartUrl}
          className={`${BUTTON_BASE_CLASSES} ${BUTTON_SIZE_CLASSES.md} ${BUTTON_VARIANT_CLASSES.primary} w-full`}
        >
          <LogIn className="h-4 w-4" />
          Sign in with tessera
        </a>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Have an invite link? Paste it in your browser to join a workspace.
        </p>
      </div>
    </div>
  );
}
