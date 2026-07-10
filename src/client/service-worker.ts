/// <reference lib="webworker" />

import type { PrecacheEntry, RouteMatchCallbackOptions, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  PrecacheFallbackPlugin,
  Serwist,
} from "serwist";

declare const self: ServiceWorkerGlobalScope &
  SerwistGlobalConfig & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

const SHELL_PRECACHE_URL = "/__pwa-shell";
const UPLOAD_CACHE_NAME = "bland-uploads-v1";
const APP_SHELL_EXCLUDED_PATH_PREFIXES = ["/api/", "/uploads/", "/parties/"];

function isAppShellExcludedPath(pathname: string): boolean {
  return APP_SHELL_EXCLUDED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAppNavigation({ url, request, sameOrigin }: RouteMatchCallbackOptions): boolean {
  if (!sameOrigin) return false;
  if (request.mode !== "navigate") return false;
  return !isAppShellExcludedPath(url.pathname);
}

function isNetworkOnlyNavigation({ url, request, sameOrigin }: RouteMatchCallbackOptions): boolean {
  return sameOrigin && request.mode === "navigate" && isAppShellExcludedPath(url.pathname);
}

function isCacheableUpload({ url, request, sameOrigin }: RouteMatchCallbackOptions): boolean {
  return (
    sameOrigin && url.pathname.startsWith("/uploads/") && request.method === "GET" && !url.pathname.endsWith("/data")
  );
}

const serwist = new Serwist({
  cacheId: "bland",
  clientsClaim: true,
  navigationPreload: true,
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
});

// Same-origin app navigations only. API, uploads, and parties are excluded so
// direct browser navigation to those paths cannot receive the app shell.
serwist.registerCapture(
  isAppNavigation,
  new NetworkOnly({
    plugins: [new PrecacheFallbackPlugin({ fallbackUrls: [SHELL_PRECACHE_URL], serwist })],
  }),
);

serwist.registerCapture(
  isCacheableUpload,
  new NetworkFirst({
    cacheName: UPLOAD_CACHE_NAME,
    networkTimeoutSeconds: 3,
    plugins: [
      // TTL intentionally matches the Worker's `Cache-Control: private,
      // max-age=300, must-revalidate` on page-scoped uploads
      // (`src/worker/routes/uploads.ts`) so share-link revocation takes effect
      // within the same window for SW-cached media.
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  }),
);

// Navigation preload starts before Serwist chooses a route. Handle excluded
// navigations explicitly so Serwist consumes that response instead of letting
// the browser issue a second request. Keep this after the upload route so
// cacheable upload GETs continue to use NetworkFirst.
serwist.registerCapture(isNetworkOnlyNavigation, new NetworkOnly());

serwist.addEventListeners();
