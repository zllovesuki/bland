import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Skeleton } from "@/client/components/ui/skeleton";
import { api, toApiError } from "@/client/lib/api";
import { getClientConfigErrorSnapshot, getClientConfigSnapshot } from "@/client/lib/client-config";
import { SECURITY_VERIFICATION_UNAVAILABLE_MESSAGE } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { TurnstileWidget } from "./turnstile-widget";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import type { InvitePreview } from "@/shared/types";

export function InvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  useDocumentTitle("Accept Invite");
  const { isAuthenticated } = useAuthStore();
  const config = getClientConfigSnapshot();
  const configError = getClientConfigErrorSnapshot();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const showVerificationUnavailable = !!configError || !config || turnstileUnavailable;

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      try {
        const data = await api.invites.get(token);
        if (!cancelled) {
          setInvite(data);
          if (data.email) setEmail(data.email);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(toApiError(err).message);
        }
      } finally {
        if (!cancelled) setIsLoadingInvite(false);
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept(e: FormEvent) {
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
      const body: {
        turnstileToken: string;
        name?: string;
        email?: string;
        password?: string;
      } = { turnstileToken };

      if (!isAuthenticated) {
        body.name = name;
        body.email = email;
        body.password = password;
      }

      const result = await api.invites.accept(token, body);
      useAuthStore.getState().setAuth(result.accessToken, result.user);

      // Fetch workspaces and navigate to the joined workspace
      const workspaceData = await api.workspaces.list();
      useWorkspaceStore.getState().setMemberWorkspaces(workspaceData);
      const joined = workspaceData.find((w) => w.id === result.workspace_id);
      if (joined) {
        navigate({ to: "/$workspaceSlug", params: { workspaceSlug: joined.slug } });
      } else {
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(toApiError(err).message);
      setTurnstileResetKey((k) => k + 1);
      setTurnstileToken(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingInvite) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="w-full max-w-sm space-y-4 px-4">
          <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto h-4 w-64" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="animate-slide-up text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Invalid Invite</h1>
          <p className="mt-2 text-sm text-zinc-400">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="animate-slide-up w-full max-w-sm">
        <div className="mb-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-accent-500" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-100">You&apos;re invited</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Join <span className="font-medium text-zinc-200">{invite?.workspace_name}</span> as a {invite?.role}
          </p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          {error && (
            <div
              id="invite-error"
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isAuthenticated && (
            <>
              <Input
                id="invite-name"
                type="text"
                required
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={<User className="h-4 w-4" />}
                label="Name"
              />

              <Input
                id="invite-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!invite?.email}
                icon={<Mail className="h-4 w-4" />}
                label="Email"
              />

              <Input
                id="invite-password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Create a password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="h-4 w-4" />}
                label="Password"
              />
            </>
          )}

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
              action="accept_invite"
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
                <UserPlus className="h-4 w-4" />
              )
            }
          >
            {isSubmitting ? "Joining..." : isAuthenticated ? "Accept invite" : "Create account & join"}
          </Button>
        </form>
      </div>
    </div>
  );
}
