import { matchSiteHost } from "@/worker/lib/host-match";

type Awaitable<T> = T | Promise<T>;

export interface HttpEntryDeps<TEnv> {
  handlePartyRequest: (request: Request, env: TEnv) => Awaitable<Response | null>;
  handleAppRequest: (request: Request, env: TEnv, ctx: ExecutionContext) => Awaitable<Response>;
  handleAssetRequest: (request: Request, env: TEnv) => Awaitable<Response>;
  handleShellRequest: (request: Request, env: TEnv) => Awaitable<Response>;
  handleSiteRequest: (request: Request, env: TEnv, ctx: ExecutionContext) => Awaitable<Response>;
}

export function isDirectAssetRequest(pathname: string): boolean {
  return /\.\w+$/.test(pathname) && !pathname.endsWith(".html");
}

export function isViteDevRuntimeAssetRequest(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  const { pathname } = new URL(request.url);
  return pathname.startsWith("/@") || pathname.startsWith("/src/") || pathname.startsWith("/node_modules/");
}

export async function handleHttpRequest<TEnv extends Pick<Env, "PUBLISHED_SITE_DOMAIN">>(
  request: Request,
  env: TEnv,
  ctx: ExecutionContext,
  deps: HttpEntryDeps<TEnv>,
): Promise<Response> {
  const url = new URL(request.url);

  if (import.meta.env.DEV && isViteDevRuntimeAssetRequest(request)) {
    return deps.handleAssetRequest(request, env);
  }

  // Site host dispatch runs BEFORE any path-prefix branch so a published
  // subdomain or apex request never falls through to /api, /uploads, the
  // SPA shell, or the static asset binding. The Sites surface owns every
  // path under its host (Class A page/asset OR Class B robots/apex).
  const siteMatch = matchSiteHost(url, env);
  if (siteMatch.kind !== "none") {
    return deps.handleSiteRequest(request, env, ctx);
  }

  const { pathname } = url;
  const isReadRequest = request.method === "GET" || request.method === "HEAD";

  if (pathname.startsWith("/parties/")) {
    return (await deps.handlePartyRequest(request, env)) ?? deps.handleAppRequest(request, env, ctx);
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
    return deps.handleAppRequest(request, env, ctx);
  }

  if (isReadRequest && isDirectAssetRequest(pathname)) {
    return deps.handleAssetRequest(request, env);
  }

  if (request.method === "GET") {
    return deps.handleShellRequest(request, env);
  }

  if (request.method === "HEAD") {
    return deps.handleAssetRequest(request, env);
  }

  return deps.handleAppRequest(request, env, ctx);
}
