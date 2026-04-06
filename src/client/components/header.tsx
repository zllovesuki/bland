import { useCallback, useRef, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { FileText, LogOut, User as UserIcon, UserPlus, Check, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuth } from "@/client/hooks/use-auth";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { api } from "@/client/lib/api";

interface HeaderProps {
  expanded: boolean;
  onToggleLayout: () => void;
}

export function Header({ expanded, onToggleLayout }: HeaderProps) {
  const { isAuthenticated, user } = useAuthStore();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const lastScrollY = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoginPage = location.pathname === "/login";

  useEffect(() => {
    function onScroll() {
      const currentY = window.scrollY;
      if (currentY < 10) {
        setVisible(true);
      } else if (currentY > lastScrollY.current + 5) {
        setVisible(false);
        setMenuOpen(false);
      } else if (currentY < lastScrollY.current - 5) {
        setVisible(true);
      }
      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useClickOutside(
    menuRef,
    useCallback(() => setMenuOpen(false), []),
    menuOpen,
  );

  const handleLogout = useCallback(async () => {
    setMenuOpen(false);
    await logout();
    navigate({ to: "/login" });
  }, [logout, navigate]);

  const handleInvite = useCallback(async () => {
    if (!currentWorkspace || inviteLoading) return;
    setInviteLoading(true);
    try {
      const invite = await api.invites.create(currentWorkspace.id, {});
      const link = `${window.location.origin}/invite/${invite.token}`;
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // Silently fail
    } finally {
      setInviteLoading(false);
    }
  }, [currentWorkspace, inviteLoading]);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-sm transition-transform duration-200 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className={`flex items-center px-4 py-3 sm:px-6 ${expanded ? "" : "mx-auto max-w-7xl"}`}>
        <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 shadow-sm shadow-accent-500/10">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <span className="hidden sm:block">
            <strong className="block text-sm font-semibold text-zinc-100">bland</strong>
            <small className="block text-xs text-zinc-500">Docs on Cloudflare</small>
          </span>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <button
              onClick={onToggleLayout}
              className="hidden items-center justify-center rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 lg:flex"
              aria-label={expanded ? "Center layout" : "Expand layout"}
              title={expanded ? "Center layout" : "Expand layout"}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          {isAuthenticated ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
                aria-label="User menu"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{user?.name?.charAt(0).toUpperCase() ?? <UserIcon className="h-4 w-4" />}</span>
                )}
              </button>

              {menuOpen && (
                <div className="animate-fade-in absolute right-0 top-full mt-2 w-48 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                  <div className="border-b border-zinc-800 px-3 py-2">
                    <p className="truncate text-sm font-medium text-zinc-200">{user?.name}</p>
                    <p className="truncate text-xs text-zinc-500">{user?.email}</p>
                  </div>
                  {currentWorkspace && (
                    <button
                      onClick={handleInvite}
                      disabled={inviteLoading}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {inviteLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : inviteCopied ? (
                        <Check className="h-3.5 w-3.5 text-accent-400" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      {inviteCopied ? "Link copied!" : "Invite to workspace"}
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            !isLoginPage && (
              <Link
                to="/login"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
              >
                Sign in
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
