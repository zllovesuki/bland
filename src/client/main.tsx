import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { requestSessionRefresh } from "./lib/api";
import { routeTree } from "./route-tree";
import { SESSION_MODES } from "./lib/constants";
import { useAuthStore } from "./stores/auth-store";
import { useWorkspaceStore } from "./stores/workspace-store";
import "./styles/app.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function bootstrap() {
  const store = useAuthStore.getState();
  store.setSessionMode(SESSION_MODES.RESTORING);

  try {
    const res = await requestSessionRefresh();
    if (res.ok) {
      const data = (await res.json()) as { accessToken: string; user: import("@/shared/types").User };
      useAuthStore.getState().setAuth(data.accessToken, data.user);
    } else {
      // Server reachable, explicit auth rejection
      const s = useAuthStore.getState();
      if (s.user) {
        s.markExpired();
      } else {
        s.setSessionMode(SESSION_MODES.ANONYMOUS);
      }
    }
  } catch {
    // Network error / timeout / server unreachable
    const s = useAuthStore.getState();
    if (s.user) {
      s.setSessionMode(SESSION_MODES.LOCAL_ONLY);
    } else {
      s.setSessionMode(SESSION_MODES.ANONYMOUS);
    }
  } finally {
    // Validate cache ownership before route loaders trust persisted data
    const currentUser = useAuthStore.getState().user;
    useWorkspaceStore.getState().validateCacheOwner(currentUser?.id ?? null);
    useAuthStore.getState().setBootstrapped();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

bootstrap();
