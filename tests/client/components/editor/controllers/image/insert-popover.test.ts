import { describe, expect, it } from "vitest";
import { validateImageUrl } from "@/client/components/editor/controllers/image/insert-popover";

describe("validateImageUrl", () => {
  it("rejects insecure http image embeds before any network checks", async () => {
    await expect(validateImageUrl("http://example.com/image.png")).rejects.toThrow(
      "Image URLs must start with https://",
    );
  });
});
