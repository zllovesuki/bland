import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { api, toApiError } from "@/client/lib/api";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { TurnstileWidget } from "./turnstile-widget";
import { TURNSTILE_SITE_KEY } from "@/client/lib/constants";
import type { InvitePreview } from "@/shared/types";

export function InvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      useWorkspaceStore.getState().setWorkspaces(workspaceData);
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
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
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
          <h1 className="text-2xl font-bold text-zinc-100">You&apos;re invited</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Join <span className="font-medium text-zinc-200">{invite?.workspace_name}</span> as a {invite?.role}
          </p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isAuthenticated && (
            <>
              <div>
                <label htmlFor="invite-name" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="invite-name"
                    type="text"
                    required
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-600 transition focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="invite-email" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="invite-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={!!invite?.email}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-600 transition read-only:opacity-60 focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="invite-password" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="invite-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="Create a password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-600 transition focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                  />
                </div>
              </div>
            </>
          )}

          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            onTokenChange={setTurnstileToken}
            action="accept_invite"
            resetKey={turnstileResetKey}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isSubmitting ? "Joining..." : isAuthenticated ? "Accept invite" : "Create account & join"}
          </button>
        </form>
      </div>
    </div>
  );
}
