import { useAuthStore } from "@/client/stores/auth-store";
import { D1_BOOKMARK_HEADER } from "@/shared/bookmark";
import { STORAGE_KEYS } from "@/client/lib/constants";
import type { LoginRequest, User, Workspace, Page, WorkspaceMember, ApiError, InvitePreview } from "@/shared/types";

const API_BASE = "/api/v1";

export function toApiError(err: unknown): ApiError {
  if (err && typeof err === "object" && "message" in err) {
    return err as ApiError;
  }
  return { error: "unknown", message: err instanceof Error ? err.message : "An unexpected error occurred" };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const bookmark = localStorage.getItem(STORAGE_KEYS.D1_BOOKMARK);
  if (bookmark) {
    headers[D1_BOOKMARK_HEADER] = bookmark;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });

  const returnedBookmark = res.headers.get(D1_BOOKMARK_HEADER);
  if (returnedBookmark) {
    localStorage.setItem(STORAGE_KEYS.D1_BOOKMARK, returnedBookmark);
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({
      error: "request_failed",
      message: `Request failed with status ${res.status}`,
    }))) as ApiError;

    // Auto-refresh on 401, or the local-dev 403 workaround for unauthorized responses.
    if (
      (res.status === 401 || (res.status === 403 && err.error === "unauthorized")) &&
      path !== "/auth/refresh" &&
      path !== "/auth/login"
    ) {
      // Phase 1: Refresh — clear auth only if this fails
      let refreshData: { user: User; accessToken: string };
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!refreshRes.ok) {
          useAuthStore.getState().clearAuth();
          throw err;
        }
        refreshData = (await refreshRes.json()) as { user: User; accessToken: string };
        useAuthStore.getState().setAuth(refreshData.accessToken, refreshData.user);
      } catch (e) {
        if (e === err) throw e; // re-thrown from !refreshRes.ok
        useAuthStore.getState().clearAuth();
        throw err;
      }

      // Phase 2: Retry — refresh succeeded, never clear auth here
      headers["Authorization"] = `Bearer ${refreshData.accessToken}`;
      const retry = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: "include",
        headers: { ...headers, ...(options?.headers as Record<string, string>) },
      });
      const retryBookmark = retry.headers.get(D1_BOOKMARK_HEADER);
      if (retryBookmark) localStorage.setItem(STORAGE_KEYS.D1_BOOKMARK, retryBookmark);
      if (retry.ok) {
        if (retry.status === 204) return undefined as T;
        return retry.json();
      }
      // Retry failed for non-auth reason — throw the retry error
      throw (await retry.json().catch(() => ({
        error: "request_failed",
        message: `Request failed with status ${retry.status}`,
      }))) as ApiError;
    }
    throw err;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export const api = {
  auth: {
    login: async (data: LoginRequest) => {
      const res = await apiFetch<{ user: User; accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res;
    },
    refresh: async () => {
      const res = await apiFetch<{ user: User; accessToken: string }>("/auth/refresh", {
        method: "POST",
      });
      return res;
    },
    logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    me: async () => {
      const res = await apiFetch<{ user: User }>("/auth/me");
      return res.user;
    },
  },

  workspaces: {
    list: async () => {
      const res = await apiFetch<{ workspaces: (Workspace & { role: string })[] }>("/workspaces");
      return res.workspaces;
    },
    create: async (data: { name: string; slug: string; icon?: string }) => {
      const res = await apiFetch<{ workspace: Workspace }>("/workspaces", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.workspace;
    },
    update: async (id: string, data: Partial<{ name: string; icon: string | null }>) => {
      const res = await apiFetch<{ workspace: Workspace }>(`/workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return res.workspace;
    },
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/workspaces/${id}`, { method: "DELETE" }),
    members: async (id: string) => {
      const res = await apiFetch<{ members: WorkspaceMember[] }>(`/workspaces/${id}/members`);
      return res.members;
    },
  },

  pages: {
    list: async (workspaceId: string) => {
      const res = await apiFetch<{ pages: Page[] }>(`/workspaces/${workspaceId}/pages`);
      return res.pages;
    },
    get: async (workspaceId: string, pageId: string) => {
      const res = await apiFetch<{ page: Page }>(`/workspaces/${workspaceId}/pages/${pageId}`);
      return res.page;
    },
    create: async (workspaceId: string, data: { title?: string; parent_id?: string; icon?: string }) => {
      const res = await apiFetch<{ page: Page }>(`/workspaces/${workspaceId}/pages`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.page;
    },
    update: async (
      workspaceId: string,
      pageId: string,
      data: Partial<{ icon: string | null; parent_id: string | null; position: number; cover_url: string | null }>,
    ) => {
      const res = await apiFetch<{ page: Page }>(`/workspaces/${workspaceId}/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return res.page;
    },
    delete: (workspaceId: string, pageId: string) =>
      apiFetch<{ ok: boolean }>(`/workspaces/${workspaceId}/pages/${pageId}`, { method: "DELETE" }),
    children: async (workspaceId: string, pageId: string) => {
      const res = await apiFetch<{ pages: Page[] }>(`/workspaces/${workspaceId}/pages/${pageId}/children`);
      return res.pages;
    },
  },

  invites: {
    get: async (token: string) => {
      const res = await apiFetch<{ invite: InvitePreview }>(`/invite/${token}`);
      return res.invite;
    },
    accept: async (
      token: string,
      data: { turnstileToken: string; name?: string; email?: string; password?: string },
    ) => {
      const res = await apiFetch<{ user: User; workspace_id: string; accessToken: string }>(`/invite/${token}/accept`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res;
    },
    create: async (workspaceId: string, data: { email?: string; role?: "admin" | "member" | "guest" }) => {
      const res = await apiFetch<{
        invite: {
          id: string;
          token: string;
          role: string;
          email: string | null;
          expires_at: string;
          invite_link: string;
        };
      }>(`/workspaces/${workspaceId}/invite`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.invite;
    },
  },
};
