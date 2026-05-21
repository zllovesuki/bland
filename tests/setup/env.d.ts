declare namespace Cloudflare {
  interface Env {
    // Defined in tests/vitest/cloudflare.ts.
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
