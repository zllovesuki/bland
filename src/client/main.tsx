import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { refreshSession } from "./lib/api";
import { getClientConfigErrorSnapshot, getClientConfigSnapshot } from "./lib/client-config";
import { getSessionBootstrapStrategy } from "./lib/session-bootstrap";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./route-tree";
import { primeClientErrorReporting, reportClientError } from "./lib/report-client-error";
import { isBenignBrowserError } from "./lib/benign-browser-errors";
import { removeStorageItem } from "./lib/storage";
import { STORAGE_KEYS } from "./lib/constants";
import { useAuthStore } from "./stores/auth-store";
import {
  installWorkspaceLocalOwnerAutoHydrator,
  rehydrateWorkspaceLocalOwner,
  waitForWorkspaceLocalHydration,
} from "./stores/bootstrap";
import { registerServiceWorker } from "./lib/pwa";
import { installManifestGate } from "./lib/install-gate";
import "./styles/app.css";

const router = createRouter({
  routeTree,
  defaultPreload: "render",
});

// Route-aware re-hydrate: users who bootstrapped on a non-local path
// (e.g., `/login` or `/s/$token`) and then navigate into a workspace or
// shared-with-me route need the projections hydrated without a full reload.
router.subscribe("onResolved", () => {
  rehydrateWorkspaceLocalOwner();
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

let listenersRegistered = false;

function registerGlobalErrorListeners() {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;

  window.addEventListener("error", (event) => {
    if (isBenignBrowserError(event)) {
      event.preventDefault();
      return;
    }
    reportClientError({
      source: "window.error",
      error: event.error ?? new Error(event.message),
      context: {
        filename: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError({
      source: "window.unhandledrejection",
      error: event.reason,
    });
  });
}

async function bootstrap() {
  const clientConfig = getClientConfigSnapshot();
  const clientConfigError = getClientConfigErrorSnapshot();

  void primeClientErrorReporting(clientConfig);
  if (clientConfigError) {
    reportClientError({
      source: "client-config.bootstrap",
      error: clientConfigError,
    });
  }

  const store = useAuthStore.getState();
  const bootstrapStrategy = getSessionBootstrapStrategy(window.location.pathname, !!store.user, document.cookie);

  if (bootstrapStrategy === "block") {
    await refreshSession();
  }

  // Evict the orphan v6 zustand persist blob from previous releases.
  removeStorageItem(STORAGE_KEYS.WORKSPACE);

  // Hydrate the local workspace replica before route loaders trust cached
  // data. Anonymous / share / login / invite paths schedule a no-op hydrate.
  // The auto-hydrator below handles later auth transitions; the router
  // subscription above re-schedules on route changes. Both paths flow
  // through `scheduleHydration`, which dedupes by (userId, needsLocal).
  rehydrateWorkspaceLocalOwner();
  await waitForWorkspaceLocalHydration();
  installWorkspaceLocalOwnerAutoHydrator();

  createRoot(document.getElementById("root")!, {
    onUncaughtError(error, errorInfo) {
      reportClientError({
        source: "react.root-uncaught",
        error,
        context: {
          componentStack: errorInfo.componentStack ?? null,
        },
      });
    },
    onCaughtError(error, errorInfo) {
      reportClientError({
        source: "react.root-caught",
        error,
        context: {
          componentStack: errorInfo.componentStack ?? null,
          errorBoundary: errorInfo.errorBoundary?.constructor?.name ?? null,
        },
      });
    },
    onRecoverableError(error, errorInfo) {
      reportClientError({
        source: "react.root-recoverable",
        error,
        context: {
          componentStack: errorInfo.componentStack ?? null,
        },
      });
    },
  }).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );

  if (bootstrapStrategy === "background") {
    void refreshSession();
  }

  installManifestGate();
  registerServiceWorker();
}

registerGlobalErrorListeners();
bootstrap();
