import { describe, expect, it } from "vitest";
import { classifyFailure, type FailureKind } from "@/client/lib/classify-failure";

function classify(err: unknown, online = true): FailureKind {
  return classifyFailure(err, { online });
}

describe("classifyFailure", () => {
  describe("offline context", () => {
    it("returns network regardless of error shape", () => {
      expect(classify({ error: "forbidden", message: "Forbidden" }, false)).toBe("network");
      expect(classify({ error: "unauthorized", message: "x" }, false)).toBe("network");
      expect(classify(new Error("anything"), false)).toBe("network");
    });
  });

  describe("structured error codes", () => {
    it("unauthorized maps to auth-ambiguous", () => {
      expect(classify({ error: "unauthorized", message: "Token expired" })).toBe("auth-ambiguous");
    });

    it("forbidden maps to forbidden", () => {
      expect(classify({ error: "forbidden", message: "Access denied" })).toBe("forbidden");
    });

    it("not_found maps to not-found", () => {
      expect(classify({ error: "not_found", message: "Not found" })).toBe("not-found");
    });

    it("internal_error maps to server", () => {
      expect(classify({ error: "internal_error", message: "Server error" })).toBe("server");
    });

    it("request_failed maps to network (transport failure)", () => {
      expect(classify({ error: "request_failed", message: "Request failed with status 500" })).toBe("network");
    });
  });

  describe("non-API errors", () => {
    it("TypeError maps to network", () => {
      expect(classify(new TypeError("Failed to fetch"))).toBe("network");
    });

    it("unknown error shape maps to unknown", () => {
      expect(classify(new Error("something unexpected"))).toBe("unknown");
    });

    it("string error maps to unknown", () => {
      expect(classify("some string error")).toBe("unknown");
    });

    it("null/undefined maps to unknown", () => {
      expect(classify(null)).toBe("unknown");
      expect(classify(undefined)).toBe("unknown");
    });
  });

  describe("does not parse message strings", () => {
    it("does not classify based on status in message", () => {
      // A request_failed with a 403 in the message is still "network", not "forbidden"
      expect(classify({ error: "request_failed", message: "Request failed with status 403" })).toBe("network");
    });

    it("does not use message.includes for classification", () => {
      // An unknown error code with "403" in message is unknown, not forbidden
      expect(classify({ error: "some_other_code", message: "got a 403 response" })).toBe("unknown");
    });
  });

  describe("expected API error codes", () => {
    it("validation_error maps to unknown (not special-cased)", () => {
      expect(classify({ error: "validation_error", message: "Bad input" })).toBe("unknown");
    });

    it("bad_request maps to unknown", () => {
      expect(classify({ error: "bad_request", message: "Invalid" })).toBe("unknown");
    });

    it("turnstile_failed maps to unknown", () => {
      expect(classify({ error: "turnstile_failed", message: "Turnstile check failed" })).toBe("unknown");
    });
  });
});
