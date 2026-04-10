import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { FileText, LogOut, User as UserIcon, Maximize2, Minimize2, Menu, Inbox } from "lucide-react";
import { useAuthStore } from "@/client/stores/auth-store";
import { useAuth } from "@/client/hooks/use-auth";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useScrollVisibility } from "@/client/hooks/use-scroll-visibility";

interface HeaderProps {
  expanded: boolean;
  onToggleLayout: () => void;
  onToggleMobileSidebar?: () => void;
}

export function Header({ expanded, onToggleLayout, onToggleMobileSidebar }: HeaderProps) {
  const hasLocalSession = useAuthStore((s) => s.hasLocalSession);
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const visible = useScrollVisibility("main-content");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoginPage = location.pathname === "/login";
  const isSharedWithMePage = location.pathname === "/shared-with-me";

  useClickOutside(
    menuRef,
    useCallback(() => setMenuOpen(false), []),
    menuOpen,
  );

  const handleLogout = useCallback(async () => {
    setMenuOpen(false);
    await logout();
    navigate({ to: "/login", search: { redirect: undefined } });
  }, [logout, navigate]);

  return (
    <header
      className={`relative z-50 shrink-0 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur-sm transition-[margin-top] duration-300 ease-out ${visible ? "mt-0" : "-mt-[61px]"}`}
    >
      <div className={`flex items-center px-4 py-3 sm:px-6 ${expanded ? "" : "mx-auto max-w-7xl"}`}>
        {hasLocalSession && onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            className="mr-2 flex items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 md:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
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
          {hasLocalSession && (
            <button
              onClick={onToggleLayout}
              className="hidden items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 lg:flex"
              aria-label={expanded ? "Center layout" : "Expand layout"}
              title={expanded ? "Center layout" : "Expand layout"}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          {hasLocalSession && (
            <Link
              to="/shared-with-me"
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                isSharedWithMePage
                  ? "bg-accent-500/10 text-accent-400"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
              aria-label="Shared with me"
              title="Shared with me"
            >
              <Inbox className="h-4 w-4" />
            </Link>
          )}

          {hasLocalSession ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                aria-label="User menu"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{user?.name?.charAt(0).toUpperCase() ?? <UserIcon className="h-4 w-4" />}</span>
                )}
              </button>

              {menuOpen && (
                <div className="animate-scale-fade origin-top-right absolute right-0 top-full mt-2 w-48 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-lg">
                  <div className="border-b border-zinc-800 px-3 py-2">
                    <p className="truncate text-sm font-medium text-zinc-200">{user?.name}</p>
                    <p className="truncate text-xs text-zinc-500">{user?.email}</p>
                  </div>
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <UserIcon className="h-3.5 w-3.5" />
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
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
                search={{ redirect: undefined }}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
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
