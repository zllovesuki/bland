import { describe, expect, it, vi } from "vitest";
import { handleHttpRequest, isDirectAssetRequest } from "@/worker/lib/http-entry";

const ctx = {} as ExecutionContext;

function createResponse(label: string) {
  return new Response(label);
}

describe("isDirectAssetRequest", () => {
  it("matches non-html static asset paths", () => {
    expect(isDirectAssetRequest("/favicon.svg")).toBe(true);
    expect(isDirectAssetRequest("/assets/app-123.js")).toBe(true);
    expect(isDirectAssetRequest("/manifest.webmanifest")).toBe(true);
  });

  it("excludes html documents and route-like paths", () => {
    expect(isDirectAssetRequest("/index.html")).toBe(false);
    expect(isDirectAssetRequest("/workspace/page")).toBe(false);
  });
});

describe("handleHttpRequest", () => {
  it("routes API and upload requests to the app handler", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(null);
    const handleAppRequest = vi.fn().mockImplementation(() => Promise.resolve(createResponse("app")));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));

    const apiResponse = await handleHttpRequest(new Request("https://bland.tools/api/v1/workspaces"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
    });
    const uploadResponse = await handleHttpRequest(new Request("https://bland.tools/uploads/file-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
    });

    expect(await apiResponse.text()).toBe("app");
    expect(await uploadResponse.text()).toBe("app");
    expect(handleAppRequest).toHaveBeenCalledTimes(2);
    expect(handleAssetRequest).not.toHaveBeenCalled();
    expect(handleShellRequest).not.toHaveBeenCalled();
  });

  it("routes direct asset GET requests to the asset handler", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(null);
    const handleAppRequest = vi.fn().mockResolvedValue(createResponse("app"));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));

    const response = await handleHttpRequest(new Request("https://bland.tools/favicon.svg"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
    });

    expect(await response.text()).toBe("asset");
    expect(handleAssetRequest).toHaveBeenCalledTimes(1);
    expect(handleAppRequest).not.toHaveBeenCalled();
    expect(handleShellRequest).not.toHaveBeenCalled();
  });

  it("routes GET document requests to the shell handler", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(null);
    const handleAppRequest = vi.fn().mockResolvedValue(createResponse("app"));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));

    const response = await handleHttpRequest(new Request("https://bland.tools/acme/page-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
    });

    expect(await response.text()).toBe("shell");
    expect(handleShellRequest).toHaveBeenCalledTimes(1);
    expect(handleAssetRequest).not.toHaveBeenCalled();
    expect(handleAppRequest).not.toHaveBeenCalled();
  });

  it("routes HEAD document requests to the asset handler", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(null);
    const handleAppRequest = vi.fn().mockResolvedValue(createResponse("app"));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));

    const response = await handleHttpRequest(
      new Request("https://bland.tools/acme/page-1", { method: "HEAD" }),
      {},
      ctx,
      { handlePartyRequest, handleAppRequest, handleAssetRequest, handleShellRequest },
    );

    expect(await response.text()).toBe("asset");
    expect(handleAssetRequest).toHaveBeenCalledTimes(1);
    expect(handleShellRequest).not.toHaveBeenCalled();
  });

  it("returns the party handler response for /parties/*", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(createResponse("party"));
    const handleAppRequest = vi.fn().mockResolvedValue(createResponse("app"));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));

    const response = await handleHttpRequest(new Request("https://bland.tools/parties/page-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
    });

    expect(await response.text()).toBe("party");
    expect(handlePartyRequest).toHaveBeenCalledTimes(1);
    expect(handleAppRequest).not.toHaveBeenCalled();
  });

  it("falls back to the app handler when /parties/* is not handled", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(null);
    const handleAppRequest = vi.fn().mockResolvedValue(createResponse("app"));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));

    const response = await handleHttpRequest(new Request("https://bland.tools/parties/page-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
    });

    expect(await response.text()).toBe("app");
    expect(handlePartyRequest).toHaveBeenCalledTimes(1);
    expect(handleAppRequest).toHaveBeenCalledTimes(1);
  });
});
