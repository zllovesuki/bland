import { app } from "@/worker/router";

// Stub DocSync DO for M1 (real implementation in M2)
export class DocSync {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}
  async fetch() {
    return new Response("DocSync not yet implemented", { status: 501 });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch, env: Env) {
    // M1 stub - search indexer implemented in M4
  },
} satisfies ExportedHandler<Env>;
