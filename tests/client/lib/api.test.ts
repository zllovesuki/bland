import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { createUser } from "@tests/client/util/fixtures";
import { SESSION_MODES } from "@/client/lib/constants";

let useAuthStore: typeof import("@/client/stores/auth-store").useAuthStore;
let selectHasLocalSession: typeof import("@/client/stores/auth-store").selectHasLocalSession;
let api: typeof import("@/client/lib/api").api;

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(async () => {
  installLocalStorageStub();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.resetModules();
  const authMod = await import("@/client/stores/auth-store");
  const apiMod = await import("@/client/lib/api");
  useAuthStore = authMod.useAuthStore;
  selectHasLocalSession = authMod.selectHasLocalSession;
  api = apiMod.api;
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("apiFetch auto-refresh", () => {
  const user = createUser();
  const refreshedUser = createUser({ name: "Refreshed" });

  it.each([
    ["401", 401, { error: "unauthorized", message: "expired" }],
    ["403 unauthorized", 403, { error: "unauthorized", message: "token invalid" }],
  ])("on %s, refreshes then retries the original request", async (_label, status, errBody) => {
    // Set up authenticated state
    useAuthStore.getState().setAuth("old-token", user);

    // Call 1: original request returns 401/403
    // Call 2: refresh succeeds
    // Call 3: retried request succeeds
    mockFetch
      .mockResolvedValueOnce(jsonResponse(status, errBody))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "new-token", user: refreshedUser }))
      .mockResolvedValueOnce(jsonResponse(200, { workspaces: [] }));

    const result = await api.workspaces.list();
    expect(result).toEqual([]);

    // Auth store should be updated with new token
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("new-token");
    expect(state.user).toEqual(refreshedUser);
    expect(state.sessionMode).toBe(SESSION_MODES.AUTHENTICATED);

    // The retry should use the new token
    const retryCall = mockFetch.mock.calls[2];
    expect((retryCall[1]?.headers as Record<string, string>)["Authorization"]).toBe("Bearer new-token");
  });

  it("marks session expired when refresh returns non-ok", async () => {
    useAuthStore.getState().setAuth("old-token", user);

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized", message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "invalid_refresh", message: "bad token" }));

    await expect(api.workspaces.list()).rejects.toEqual(expect.objectContaining({ error: "unauthorized" }));

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.user).toEqual(user);
    expect(state.sessionMode).toBe(SESSION_MODES.EXPIRED);
  });

  it("transitions to LOCAL_ONLY on network error during refresh", async () => {
    useAuthStore.getState().setAuth("old-token", user);

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized", message: "expired" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(api.workspaces.list()).rejects.toEqual(expect.objectContaining({ error: "unauthorized" }));

    const state = useAuthStore.getState();
    expect(state.sessionMode).toBe(SESSION_MODES.LOCAL_ONLY);
    expect(state.user).toEqual(user);
    expect(selectHasLocalSession(state)).toBe(true);
  });

  it("does not downgrade from LOCAL_ONLY on repeated network errors", async () => {
    useAuthStore.getState().setAuth("old-token", user);
    useAuthStore.getState().setSessionMode(SESSION_MODES.LOCAL_ONLY);

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized", message: "expired" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(api.workspaces.list()).rejects.toEqual(expect.objectContaining({ error: "unauthorized" }));

    // Should stay LOCAL_ONLY, not accidentally transition to something else
    expect(useAuthStore.getState().sessionMode).toBe(SESSION_MODES.LOCAL_ONLY);
  });

  it("does not attempt refresh for login endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized", message: "bad creds" }));

    await expect(
      api.auth.login({ email: "test@test.com", password: "password123", turnstileToken: "tok" }),
    ).rejects.toEqual(expect.objectContaining({ error: "unauthorized" }));

    // Only 1 fetch call — no refresh attempted
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not attempt refresh for the refresh endpoint itself", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized", message: "bad refresh" }));

    await expect(api.auth.refresh()).rejects.toEqual(expect.objectContaining({ error: "unauthorized" }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws retry error when refresh succeeds but retry fails for non-auth reason", async () => {
    useAuthStore.getState().setAuth("old-token", user);

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized", message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "new-token", user: refreshedUser }))
      .mockResolvedValueOnce(jsonResponse(404, { error: "not_found", message: "workspace gone" }));

    await expect(api.workspaces.list()).rejects.toEqual(expect.objectContaining({ error: "not_found" }));

    // Auth should still be updated from the successful refresh
    expect(useAuthStore.getState().accessToken).toBe("new-token");
  });

  it("propagates 403 errors that are not unauthorized", async () => {
    useAuthStore.getState().setAuth("tok", user);

    mockFetch.mockResolvedValueOnce(jsonResponse(403, { error: "forbidden", message: "no access" }));

    await expect(api.workspaces.list()).rejects.toEqual(expect.objectContaining({ error: "forbidden" }));

    // Only 1 call — no refresh attempted for non-unauthorized 403
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
