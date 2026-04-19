import { useAuthStore } from "@/client/stores/auth-store";
import { SESSION_MODES, STORAGE_KEYS } from "@/client/lib/constants";
import { readStorageString, writeStorageString } from "@/client/lib/storage";
import { D1_BOOKMARK_HEADER } from "@/shared/bookmark";
import type {
  LoginRequest,
  User,
  Workspace,
  Page,
  GetPageResponse,
  WorkspaceMember,
  ApiError,
  InvitePreview,
  SearchResult,
  PageShare,
  SharedPageInfo,
  SharedWithMeItem,
  GetPageAncestorsResponse,
  PageSnapshotResponse,
  PageRouteBootstrapResponse,
  ResolvePageMentionsResponse,
} from "@/shared/types";

const API_BASE = "/api/v1";
const AUTH_REFRESH_PATH = "/auth/refresh";
let pendingSessionRefresh: Promise<
  { ok: true; data: { user: User; accessToken: string } } | { ok: false; reason: "rejected" | "network" }
> | null = null;

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

export function refreshSession(): Promise<
  { ok: true; data: { user: User; accessToken: string } } | { ok: false; reason: "rejected" | "network" }
> {
  if (pendingSessionRefresh) return pendingSessionRefresh;

  useAuthStore.getState().setRefreshState("refreshing");

  pendingSessionRefresh = (async () => {
    try {
      const res = await requestSessionRefresh();
      if (!res.ok) {
        const state = useAuthStore.getState();
        if (state.user) {
          state.markExpired();
        } else {
          useAuthStore.setState({
            accessToken: null,
            user: null,
            sessionMode: SESSION_MODES.ANONYMOUS,
          });
        }
        return { ok: false as const, reason: "rejected" as const };
      }

      const data = (await res.json()) as { user: User; accessToken: string };
      useAuthStore.getState().setAuth(data.accessToken, data.user);
      return { ok: true as const, data };
    } catch {
      const state = useAuthStore.getState();
      if (state.user) {
        state.markLocalOnly();
      }
      return { ok: false as const, reason: "network" as const };
    } finally {
      useAuthStore.getState().setRefreshState("idle");
      pendingSessionRefresh = null;
    }
  })();

  return pendingSessionRefresh;
}

function buildApiHeaders(options?: RequestInit, accessToken?: string | null): Headers {
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const bookmark = readStorageString(STORAGE_KEYS.D1_BOOKMARK);
  if (bookmark) {
    headers.set(D1_BOOKMARK_HEADER, bookmark);
  }
  return headers;
}

function persistBookmark(response: Response): void {
  const returnedBookmark = response.headers.get(D1_BOOKMARK_HEADER);
  if (returnedBookmark) {
    writeStorageString(STORAGE_KEYS.D1_BOOKMARK, returnedBookmark);
  }
}

async function parseApiError(response: Response): Promise<ApiError> {
  return (await response.json().catch(() => ({
    error: "request_failed",
    message: `Request failed with status ${response.status}`,
  }))) as ApiError;
}

async function sendApiRequest(path: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = buildApiHeaders(options, token);
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  persistBookmark(res);

  if (!res.ok) {
    const err = await parseApiError(res);

    // Auto-refresh on 401, or the local-dev 403 workaround for unauthorized responses.
    if (
      (res.status === 401 || (res.status === 403 && err.error === "unauthorized")) &&
      path !== AUTH_REFRESH_PATH &&
      path !== "/auth/login"
    ) {
      const refreshResult = await refreshSession();
      if (!refreshResult.ok) {
        throw err;
      }

      const retryHeaders = buildApiHeaders(options, refreshResult.data.accessToken);
      const retry = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: "include",
        headers: retryHeaders,
      });
      persistBookmark(retry);
      if (retry.ok) {
        return retry;
      }
      throw await parseApiError(retry);
    }
    throw err;
  }

  return res;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await sendApiRequest(path, options);

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
      const res = await apiFetch<GetPageResponse>(`/workspaces/${workspaceId}/pages/${pageId}${qs}`);
      return res;
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
      const res = await apiFetch<GetPageAncestorsResponse>(`/workspaces/${workspaceId}/pages/${pageId}/ancestors${qs}`);
      return res.ancestors;
    },
    snapshot: async (
      workspaceId: string,
      pageId: string,
      shareToken?: string,
      signal?: AbortSignal,
    ): Promise<PageSnapshotResponse> => {
      const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
      const res = await sendApiRequest(`/workspaces/${workspaceId}/pages/${pageId}/snapshot${qs}`, { signal });
      if (res.status === 204) {
        return { kind: "missing" };
      }
      return {
        kind: "found",
        snapshot: await res.arrayBuffer(),
      };
    },
    context: async (pageId: string) => {
      const res = await apiFetch<PageRouteBootstrapResponse>(`/pages/${pageId}/context`);
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
