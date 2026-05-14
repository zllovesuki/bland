import { describe, expect, it } from "vitest";
import { shareResolveQueryKey, shareResolveQueryOptions } from "@/client/lib/queries/share-resolve";

describe("share resolve query options", () => {
  it("does not retain permission-sensitive share resolution between mounts", () => {
    const options = shareResolveQueryOptions("share-token", "authenticated", "user-1");

    expect(options.queryKey).toEqual(shareResolveQueryKey("share-token", "authenticated", "user-1"));
    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(0);
    expect(options.refetchOnMount).toBe("always");
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.retry).toBe(false);
  });
});
