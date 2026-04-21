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
import { useAuthStore } from "./stores/auth-store";
import { useWorkspaceStore } from "./stores/workspace-store";
import "./styles/app.css";

const router = createRouter({
  routeTree,
  defaultPreload: "render",
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

  // Validate cache ownership before route loaders trust persisted data
  const currentUser = useAuthStore.getState().user;
  useWorkspaceStore.getState().validateCacheOwner(currentUser?.id ?? null);

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
}

registerGlobalErrorListeners();
bootstrap();
