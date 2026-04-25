import { exports } from "cloudflare:workers";
import { D1_BOOKMARK_HEADER } from "@/shared/bookmark";
import { bearerFor } from "@tests/worker/helpers/auth";

type JsonBody = Record<string, unknown> | unknown[] | null;

export const LOOPBACK_ORIGIN = "http://127.0.0.1";
export const PROD_ORIGIN = "https://bland.test";

export interface ApiRequestOptions {
  method?: string;
  body?: JsonBody | FormData | ArrayBuffer | Blob;
  headers?: Record<string, string>;
  userId?: string;
  shareToken?: string;
  origin?: string;
  bookmark?: string;
  cookie?: string;
  search?: Record<string, string>;
}

/**
 * Dispatches a request at the worker's default-export fetch. Defaults to
 * `LOOPBACK_ORIGIN`, which `src/worker/http.ts#isLocalRequestUrl` recognizes
 * and which triggers the rate-limit and turnstile middleware bypasses plus
 * the router's 401->403 rewrite. Pass `origin: PROD_ORIGIN` when asserting
 * 401 (not 403) or any behavior gated on a non-loopback hostname.
 */
export async function apiRequest(path: string, opts: ApiRequestOptions = {}): Promise<Response> {
  const origin = opts.origin ?? LOOPBACK_ORIGIN;
  const url = new URL(path, origin);
  if (opts.shareToken) {
    url.searchParams.set("share", opts.shareToken);
  }
  if (opts.search) {
    for (const [k, v] of Object.entries(opts.search)) {
      url.searchParams.set(k, v);
    }
  }

  const headers = new Headers(opts.headers ?? {});
  if (opts.userId && !headers.has("authorization")) {
    headers.set("authorization", await bearerFor(opts.userId));
  }
  if (opts.bookmark) {
    headers.set(D1_BOOKMARK_HEADER, opts.bookmark);
  }
  if (opts.cookie) {
    headers.set("cookie", opts.cookie);
  }

  let body: BodyInit | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    if (opts.body instanceof FormData || opts.body instanceof ArrayBuffer || opts.body instanceof Blob) {
      body = opts.body;
    } else {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      body = JSON.stringify(opts.body);
    }
  }

  const method = opts.method ?? (body ? "POST" : "GET");

  return exports.default.fetch(new Request(url.toString(), { method, headers, body }));
}

export async function expectJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`expected JSON, got: ${text}`);
  }
}
