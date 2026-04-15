type Awaitable<T> = T | Promise<T>;

export interface HttpEntryDeps<TEnv> {
  handlePartyRequest: (request: Request, env: TEnv) => Awaitable<Response | null>;
  handleAppRequest: (request: Request, env: TEnv, ctx: ExecutionContext) => Awaitable<Response>;
  handleAssetRequest: (request: Request, env: TEnv) => Awaitable<Response>;
  handleShellRequest: (request: Request, env: TEnv) => Awaitable<Response>;
}

export function isDirectAssetRequest(pathname: string): boolean {
  return /\.\w+$/.test(pathname) && !pathname.endsWith(".html");
}

export async function handleHttpRequest<TEnv>(
  request: Request,
  env: TEnv,
  ctx: ExecutionContext,
  deps: HttpEntryDeps<TEnv>,
): Promise<Response> {
  const { pathname } = new URL(request.url);
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
