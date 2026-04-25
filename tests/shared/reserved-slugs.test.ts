import { describe, expect, it } from "vitest";

import { CreateWorkspaceRequest, UpdateWorkspaceRequest } from "@/shared/types";

const RESERVED = ["s", "login", "invite", "profile", "shared-with-me", "api", "uploads", "ws", "parties"];

describe("CreateWorkspaceRequest reserved slugs", () => {
  for (const slug of RESERVED) {
    it(`rejects "${slug}" as reserved`, () => {
      const result = CreateWorkspaceRequest.safeParse({ name: "Test", slug });
      expect(result.success).toBe(false);
      if (result.success) return;
      const slugIssue = result.error.issues.find((issue) => issue.path[0] === "slug");
      expect(slugIssue?.message).toBe("This slug is reserved");
    });
  }

  it("accepts a non-reserved slug like 'my-workspace'", () => {
    const result = CreateWorkspaceRequest.safeParse({ name: "Test", slug: "my-workspace" });
    expect(result.success).toBe(true);
  });
});

describe("UpdateWorkspaceRequest reserved slugs", () => {
  it("rejects renaming to 'parties'", () => {
    const result = UpdateWorkspaceRequest.safeParse({ slug: "parties" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const slugIssue = result.error.issues.find((issue) => issue.path[0] === "slug");
    expect(slugIssue?.message).toBe("This slug is reserved");
  });

  it("accepts renaming to a non-reserved slug", () => {
    const result = UpdateWorkspaceRequest.safeParse({ slug: "engineering" });
    expect(result.success).toBe(true);
  });
});
