import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { FileText, LogOut, User as UserIcon, Maximize2, Minimize2, Menu, Inbox } from "lucide-react";
import { Avatar } from "@/client/components/ui/avatar";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { useAuthStore, selectHasLocalSession } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuth } from "@/client/hooks/use-auth";
import { useSharedInboxNavigation } from "@/client/hooks/use-shared-inbox-navigation";
import { useScrollVisibility } from "@/client/hooks/use-scroll-visibility";

const MENU_ITEM_CLASS =
  "group flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-zinc-300 transition-[background-color,color] hover:bg-zinc-700 hover:text-zinc-100 focus-visible:bg-zinc-700 focus-visible:text-zinc-100 focus-visible:outline-none";
const MENU_ICON_CLASS =
  "flex w-4 shrink-0 items-center justify-center text-zinc-400 transition-colors group-hover:text-current group-focus-visible:text-current";

interface HeaderProps {
  expanded: boolean;
  onToggleLayout: () => void;
  onToggleMobileSidebar?: () => void;
}

export function Header({ expanded, onToggleLayout, onToggleMobileSidebar }: HeaderProps) {
  const hasLocalSession = useAuthStore(selectHasLocalSession);
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const visible = useScrollVisibility("main-content");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const isLoginPage = location.pathname === "/login";
  const homeSlug = useWorkspaceStore((s) => {
    if (!hasLocalSession) return null;
    const lastId = s.lastVisitedWorkspaceId;
    if (lastId) {
      const match = s.memberWorkspaces.find((w) => w.id === lastId);
      if (match) return match.slug;
    }
    return s.memberWorkspaces[0]?.slug ?? null;
  });
  const { canLeaveSharedInbox, isSharedInbox, toggleSharedInbox } = useSharedInboxNavigation();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleLogout = useCallback(async () => {
    setMenuOpen(false);
    await logout();
    navigate({ to: "/login", search: { redirect: undefined } });
  }, [logout, navigate]);

  return (
    <header
      className={`relative z-50 shrink-0 border-b border-zinc-800/60 bg-zinc-900/95 backdrop-blur-sm transition-[margin-top] duration-300 ease-out ${visible ? "mt-0" : "-mt-[61px]"}`}
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
        <Link
          to={homeSlug ? "/$workspaceSlug" : "/"}
          params={homeSlug ? { workspaceSlug: homeSlug } : undefined}
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-accent-500">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <span className="hidden sm:block">
            <strong className="block text-sm font-semibold text-zinc-100">bland</strong>
            <small className="block text-xs text-zinc-400">Docs on Cloudflare</small>
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
            <button
              onClick={toggleSharedInbox}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                isSharedInbox
                  ? "bg-accent-500/10 text-accent-400"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
              aria-label={isSharedInbox && canLeaveSharedInbox ? "Back to previous view" : "Shared with me"}
              title={isSharedInbox && canLeaveSharedInbox ? "Back to previous view" : "Shared with me"}
            >
              <Inbox className="h-4 w-4" />
            </button>
          )}

          {hasLocalSession ? (
            <>
              <button
                ref={menuTriggerRef}
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 transition-colors hover:border-zinc-600"
                aria-label="User menu"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {user?.name ? (
                  <Avatar
                    name={user.name}
                    avatarUrl={user.avatar_url}
                    className="h-full w-full text-sm hover:text-zinc-100"
                  />
                ) : (
                  <UserIcon className="h-4 w-4 text-zinc-300" />
                )}
              </button>
              {menuOpen && (
                <DropdownPortal
                  triggerRef={menuTriggerRef}
                  width={208}
                  className="p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                  onClose={closeMenu}
                >
                  <div role="menu" aria-label="User menu">
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[13px] font-medium text-zinc-200">{user?.name}</p>
                      <p className="truncate text-xs text-zinc-400">{user?.email}</p>
                    </div>
                    <div className="my-1 h-px bg-zinc-800" role="separator" />
                    <Link to="/profile" onClick={closeMenu} role="menuitem" className={MENU_ITEM_CLASS}>
                      <span className={MENU_ICON_CLASS}>
                        <UserIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1">Profile</span>
                    </Link>
                    <button onClick={handleLogout} role="menuitem" className={MENU_ITEM_CLASS}>
                      <span className={MENU_ICON_CLASS}>
                        <LogOut className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1">Sign out</span>
                    </button>
                  </div>
                </DropdownPortal>
              )}
            </>
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
