import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hydrateRoot = vi.fn();

vi.mock("react-dom/client", () => ({
  hydrateRoot,
}));

describe("Sites entry bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    hydrateRoot.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("hydrates each known island host", async () => {
    document.body.innerHTML = `
      <div data-island="sites-image">
        <template data-island-props>${JSON.stringify({ src: "/_assets/1/x" })}</template>
        <div data-island-root></div>
      </div>
      <div data-island="copy-code">
        <template data-island-props>{}</template>
        <div data-island-root></div>
      </div>
      <div data-island="site-outline-controller">
        <template data-island-props>${JSON.stringify({ items: [] })}</template>
        <div data-island-root></div>
      </div>
    `;

    const { bootstrapIslands } = await import("@/client/sites/hydrate");
    await bootstrapIslands();

    expect(hydrateRoot).toHaveBeenCalledTimes(3);

    for (const host of document.querySelectorAll<HTMLElement>("[data-island]")) {
      expect(host.dataset.islandHydrated).toBe("true");
    }
  });

  it("skips hosts already marked as hydrated", async () => {
    document.body.innerHTML = `
      <div data-island="copy-code" data-island-hydrated="true">
        <template data-island-props>{}</template>
        <div data-island-root></div>
      </div>
    `;

    const { bootstrapIslands } = await import("@/client/sites/hydrate");
    await bootstrapIslands();

    expect(hydrateRoot).not.toHaveBeenCalled();
  });

  it("ignores unknown island names and malformed props without throwing", async () => {
    document.body.innerHTML = `
      <div data-island="not-an-island">
        <template data-island-props>{}</template>
        <div data-island-root></div>
      </div>
      <div data-island="sites-image">
        <template data-island-props>{not valid json}</template>
        <div data-island-root></div>
      </div>
    `;

    const { bootstrapIslands } = await import("@/client/sites/hydrate");
    await expect(bootstrapIslands()).resolves.toBeUndefined();
    expect(hydrateRoot).not.toHaveBeenCalled();
  });
});
