import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./route-tree";
import { useAuthStore } from "./stores/auth-store";
import "./styles/app.css";
import "./styles/custom.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function bootstrap() {
  // Try to restore session from refresh cookie before rendering
  try {
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as { accessToken: string; user: import("@/shared/types").User };
      useAuthStore.getState().setAuth(data.accessToken, data.user);
    }
  } catch {
    // No valid session - that's fine
  } finally {
    useAuthStore.getState().setBootstrapped();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

bootstrap();
