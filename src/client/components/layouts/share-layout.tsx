import { Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { ShareViewProvider } from "@/client/components/share/view-provider";
import { useShareView } from "@/client/components/share/use-share-view";
import { ShareHeader } from "@/client/components/share/header";
import { ShareSidebar } from "@/client/components/sidebar/share-sidebar";
import { Footer } from "@/client/components/footer";
import { useMobileDrawer } from "@/client/hooks/use-mobile-drawer";

function ShareLayoutInner() {
  const { status } = useShareView();
  const { open: mobileDrawerOpen, close: closeMobileDrawer, toggle: toggleMobileDrawer } = useMobileDrawer();

  if (status === "error") {
    return (
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
        <Outlet />
      </main>
    );
  }

  return (
    <>
      <ShareHeader onToggleMobileSidebar={toggleMobileDrawer} />
      <div className="flex flex-1 overflow-hidden">
        <ShareSidebar mobileOpen={mobileDrawerOpen} onMobileClose={closeMobileDrawer} />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <Outlet />
        </main>
      </div>
      <Footer expanded={false} />
    </>
  );
}

export function ShareLayout() {
  const { token } = useParams({ strict: false }) as { token: string };
  const activePage = useRouterState({
    select: (s) => (s.location.search as { page?: string }).page,
  });

  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-800 focus:px-4 focus:py-2 focus:text-accent-400 focus:ring-2 focus:ring-accent-500/50"
      >
        Skip to content
      </a>
      <ShareViewProvider key={token} token={token} activePage={activePage}>
        <ShareLayoutInner />
      </ShareViewProvider>
    </div>
  );
}
