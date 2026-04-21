import { describe, expect, it } from "vitest";
import { localWinsVersionTiebreak } from "@/client/components/canvas/tiebreak";

describe("localWinsVersionTiebreak", () => {
  it("wins when remote is missing (first-insert path)", () => {
    expect(localWinsVersionTiebreak({ version: 1, versionNonce: 1 }, null)).toBe(true);
  });

  it("wins when local version is strictly higher", () => {
    expect(localWinsVersionTiebreak({ version: 5, versionNonce: 9999 }, { version: 4, versionNonce: 1 })).toBe(true);
  });

  it("loses when remote version is strictly higher", () => {
    expect(localWinsVersionTiebreak({ version: 4, versionNonce: 1 }, { version: 5, versionNonce: 9999 })).toBe(false);
  });

  it("wins on version tie when local versionNonce sorts first", () => {
    expect(localWinsVersionTiebreak({ version: 7, versionNonce: 10 }, { version: 7, versionNonce: 20 })).toBe(true);
  });

  it("loses on version tie when remote versionNonce sorts first", () => {
    expect(localWinsVersionTiebreak({ version: 7, versionNonce: 20 }, { version: 7, versionNonce: 10 })).toBe(false);
  });

  it("loses on full tie (both version and nonce equal) — remote is the tie-break winner", () => {
    expect(localWinsVersionTiebreak({ version: 7, versionNonce: 10 }, { version: 7, versionNonce: 10 })).toBe(false);
  });
});
