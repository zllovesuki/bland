import { Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { SharedActivePageBoundary } from "@/client/components/active-page/shared";
import { ShareViewProvider } from "@/client/components/share/view-provider";
import { useShareView } from "@/client/components/share/use-share-view";
import { ShareHeader } from "@/client/components/share/header";
import { ShareSidebar } from "@/client/components/sidebar/share-sidebar";
import { Footer } from "@/client/components/footer";
import { useMobileDrawer } from "@/client/hooks/use-mobile-drawer";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { Skeleton } from "@/client/components/ui/skeleton";

function ShareLoadingShell() {
  return (
    <>
      <header className="z-50 shrink-0 border-b border-zinc-800/60 bg-zinc-900/95 backdrop-blur-sm">
        <div className="flex items-center px-4 py-3 sm:px-6">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="ml-3 hidden space-y-1.5 sm:block">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav
          className="hidden w-[260px] shrink-0 border-r border-zinc-800/60 bg-zinc-900 px-2 py-4 md:block"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-3/4" />
        </nav>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8" aria-busy="true">
            <PageLoadingSkeleton />
          </div>
        </main>
      </div>
      <Footer expanded={true} />
    </>
  );
}

function ShareReadyShell() {
  const { open: mobileDrawerOpen, close: closeMobileDrawer, toggle: toggleMobileDrawer } = useMobileDrawer();

  return (
    <SharedActivePageBoundary>
      <ShareHeader onToggleMobileSidebar={toggleMobileDrawer} />
      <div className="flex flex-1 overflow-hidden">
        <ShareSidebar mobileOpen={mobileDrawerOpen} onMobileClose={closeMobileDrawer} />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <Outlet />
        </main>
      </div>
      <Footer expanded={true} />
    </SharedActivePageBoundary>
  );
}

function ShareLayoutInner() {
  const { status, error } = useShareView();

  if (status === "loading") {
    return <ShareLoadingShell />;
  }

  if (status === "error") {
    return (
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
        <PageErrorState
          message={error ?? "This link's either wrong or done. Ask whoever sent it for a new one."}
          className="h-full"
          action={{
            label: "Go home",
            onClick: () => {
              window.location.href = "/";
            },
          }}
        />
      </main>
    );
  }

  return <ShareReadyShell />;
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
