import { useAuthStore } from "@/client/stores/auth-store";
import { SESSION_MODES, STORAGE_KEYS } from "@/client/lib/constants";
import { D1_BOOKMARK_HEADER } from "@/shared/bookmark";
import type {
  LoginRequest,
  User,
  Workspace,
  Page,
  WorkspaceMember,
  ApiError,
  InvitePreview,
  SearchResult,
  PageShare,
  SharedPageInfo,
  SharedWithMeItem,
  AncestorInfo,
  PageRouteBootstrap,
  ResolvePageMentionsResponse,
} from "@/shared/types";

const API_BASE = "/api/v1";
const AUTH_REFRESH_PATH = "/auth/refresh";

export function toApiError(err: unknown): ApiError {
  if (err && typeof err === "object" && "message" in err) {
    return err as ApiError;
  }
  return { error: "unknown", message: err instanceof Error ? err.message : "An unexpected error occurred" };
}

export function requestSessionRefresh(): Promise<Response> {
  return fetch(`${API_BASE}${AUTH_REFRESH_PATH}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
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
      path !== AUTH_REFRESH_PATH &&
      path !== "/auth/login"
    ) {
      // Phase 1: Refresh — clear auth only if this fails
      let refreshData: { user: User; accessToken: string };
      try {
        const refreshRes = await requestSessionRefresh();
        if (!refreshRes.ok) {
          useAuthStore.getState().markExpired();
          throw err;
        }
        refreshData = (await refreshRes.json()) as { user: User; accessToken: string };
        useAuthStore.getState().setAuth(refreshData.accessToken, refreshData.user);
      } catch (e) {
        if (e === err) throw e; // re-thrown from !refreshRes.ok
        // Network/transport error during refresh — don't assume session is dead.
        // Transition to local-only so cached content stays accessible.
        const s = useAuthStore.getState();
        if (s.sessionMode === SESSION_MODES.AUTHENTICATED) {
          s.setSessionMode(SESSION_MODES.LOCAL_ONLY);
        }
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
      const res = await apiFetch<{ user: User; accessToken: string }>(AUTH_REFRESH_PATH, {
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
    updateMemberRole: async (workspaceId: string, userId: string, role: string) => {
      return apiFetch<{ ok: boolean }>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    },
    removeMember: async (workspaceId: string, userId: string) => {
      return apiFetch<{ ok: boolean }>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
      });
    },
  },

  pages: {
    list: async (workspaceId: string) => {
      const res = await apiFetch<{ pages: Page[] }>(`/workspaces/${workspaceId}/pages`);
      return res.pages;
    },
    get: async (workspaceId: string, pageId: string, shareToken?: string) => {
      const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await apiFetch<{ page: Page; can_edit?: boolean }>(`/workspaces/${workspaceId}/pages/${pageId}${qs}`);
      return { ...res.page, can_edit: res.can_edit ?? true };
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
    children: async (workspaceId: string, pageId: string, shareToken?: string) => {
      const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await apiFetch<{ pages: Page[] }>(`/workspaces/${workspaceId}/pages/${pageId}/children${qs}`);
      return res.pages;
    },
    ancestors: async (workspaceId: string, pageId: string, shareToken?: string) => {
      const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await apiFetch<{ ancestors: AncestorInfo[] }>(
        `/workspaces/${workspaceId}/pages/${pageId}/ancestors${qs}`,
      );
      return res.ancestors;
    },
    context: async (pageId: string) => {
      const res = await apiFetch<PageRouteBootstrap>(`/pages/${pageId}/context`);
      return res;
    },
  },

  uploads: {
    presign: async (
      workspaceId: string,
      data: { filename: string; content_type: string; size_bytes: number; page_id?: string | null },
      shareToken?: string,
    ) => {
      const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await apiFetch<{ upload: { id: string; upload_url: string; url: string } }>(
        `/workspaces/${workspaceId}/uploads/presign${qs}`,
        { method: "POST", body: JSON.stringify(data) },
      );
      return res.upload;
    },
    uploadData: async (uploadUrl: string, file: File, shareToken?: string) => {
      const url = shareToken ? `${uploadUrl}?share=${encodeURIComponent(shareToken)}` : uploadUrl;
      const token = useAuthStore.getState().accessToken;
      const res = await fetch(url, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": file.type,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      if (!res.ok) throw await res.json().catch(() => ({ error: "upload_failed", message: "Upload failed" }));
      return res.json();
    },
  },

  search: async (workspaceId: string, query: string) => {
    const res = await apiFetch<{ results: SearchResult[] }>(
      `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`,
    );
    return res.results;
  },

  pageMentions: {
    resolve: async (workspaceId: string, pageIds: string[], shareToken?: string) => {
      const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      return apiFetch<ResolvePageMentionsResponse>(`/workspaces/${workspaceId}/page-mentions/resolve${qs}`, {
        method: "POST",
        body: JSON.stringify({ page_ids: pageIds }),
      });
    },
  },

  shares: {
    list: async (pageId: string) => {
      const res = await apiFetch<{ shares: PageShare[] }>(`/pages/${pageId}/share`);
      return res.shares;
    },
    create: async (
      pageId: string,
      data: { grantee_type: "user" | "link"; grantee_id?: string; grantee_email?: string; permission: "view" | "edit" },
    ) => {
      const res = await apiFetch<{ share: PageShare }>(`/pages/${pageId}/share`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.share;
    },
    delete: (pageId: string, shareId: string) =>
      apiFetch<{ ok: boolean }>(`/pages/${pageId}/share/${shareId}`, { method: "DELETE" }),
    resolve: async (token: string) => {
      const res = await apiFetch<SharedPageInfo>(`/share/${token}`);
      return res;
    },
    sharedWithMe: async () => {
      const res = await apiFetch<{ items: SharedWithMeItem[] }>("/me/shared-pages");
      return res.items;
    },
  },

  profile: {
    update: async (data: { name?: string; avatar_url?: string | null }) => {
      const res = await apiFetch<{ user: User }>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return res.user;
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
