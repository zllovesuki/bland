import { describe, expect, it, vi } from "vitest";
import { handleHttpRequest, isDirectAssetRequest, isViteDevRuntimeAssetRequest } from "@/worker/lib/http-entry";

const ctx = {} as ExecutionContext;

function createResponse(label: string) {
  return new Response(label);
}

describe("isDirectAssetRequest", () => {
  it("matches non-html static asset paths", () => {
    expect(isDirectAssetRequest("/favicon.svg")).toBe(true);
    expect(isDirectAssetRequest("/app-assets/app-123.js")).toBe(true);
    expect(isDirectAssetRequest("/manifest.webmanifest")).toBe(true);
  });

  it("excludes html documents and route-like paths", () => {
    expect(isDirectAssetRequest("/index.html")).toBe(false);
    expect(isDirectAssetRequest("/workspace/page")).toBe(false);
  });
});

describe("isViteDevRuntimeAssetRequest", () => {
  it("matches Vite runtime source requests", () => {
    expect(isViteDevRuntimeAssetRequest(new Request("http://localhost:5173/@vite/client"))).toBe(true);
    expect(
      isViteDevRuntimeAssetRequest(
        new Request("http://acme.bland.localhost:5173/src/client/sites/entrypoints/browser.ts"),
      ),
    ).toBe(true);
    expect(
      isViteDevRuntimeAssetRequest(new Request("http://acme.bland.localhost:5173/node_modules/react/index.js")),
    ).toBe(true);
  });

  it("does not route non-read requests through the asset handler", () => {
    expect(
      isViteDevRuntimeAssetRequest(
        new Request("http://localhost:5173/src/client/sites/entrypoints/browser.ts", { method: "POST" }),
      ),
    ).toBe(false);
  });

  it("ignores ordinary document and asset paths", () => {
    expect(isViteDevRuntimeAssetRequest(new Request("http://localhost:5173/workspace/page"))).toBe(false);
    expect(isViteDevRuntimeAssetRequest(new Request("http://localhost:5173/favicon.svg"))).toBe(false);
  });
});

describe("handleHttpRequest", () => {
  it("routes API and upload requests to the app handler", async () => {
    const handlePartyRequest = vi.fn().mockResolvedValue(null);
    const handleAppRequest = vi.fn().mockImplementation(() => Promise.resolve(createResponse("app")));
    const handleAssetRequest = vi.fn().mockResolvedValue(createResponse("asset"));
    const handleShellRequest = vi.fn().mockResolvedValue(createResponse("shell"));
    const handleSiteRequest = vi.fn().mockResolvedValue(createResponse("site"));

    const apiResponse = await handleHttpRequest(new Request("https://bland.tools/api/v1/workspaces"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
      handleSiteRequest,
    });
    const uploadResponse = await handleHttpRequest(new Request("https://bland.tools/uploads/file-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
      handleSiteRequest,
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
    const handleSiteRequest = vi.fn().mockResolvedValue(createResponse("site"));

    const response = await handleHttpRequest(new Request("https://bland.tools/favicon.svg"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
      handleSiteRequest,
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
    const handleSiteRequest = vi.fn().mockResolvedValue(createResponse("site"));

    const response = await handleHttpRequest(new Request("https://bland.tools/acme/page-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
      handleSiteRequest,
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
    const handleSiteRequest = vi.fn().mockResolvedValue(createResponse("site"));

    const response = await handleHttpRequest(
      new Request("https://bland.tools/acme/page-1", { method: "HEAD" }),
      {},
      ctx,
      { handlePartyRequest, handleAppRequest, handleAssetRequest, handleShellRequest, handleSiteRequest },
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
    const handleSiteRequest = vi.fn().mockResolvedValue(createResponse("site"));

    const response = await handleHttpRequest(new Request("https://bland.tools/parties/page-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
      handleSiteRequest,
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
    const handleSiteRequest = vi.fn().mockResolvedValue(createResponse("site"));

    const response = await handleHttpRequest(new Request("https://bland.tools/parties/page-1"), {}, ctx, {
      handlePartyRequest,
      handleAppRequest,
      handleAssetRequest,
      handleShellRequest,
      handleSiteRequest,
    });

    expect(await response.text()).toBe("app");
    expect(handlePartyRequest).toHaveBeenCalledTimes(1);
    expect(handleAppRequest).toHaveBeenCalledTimes(1);
  });
});
