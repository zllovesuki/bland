export type TasksQueueMessage =
  | { type: "index-page"; pageId: string }
  | { type: "page-projection"; pageId: string }
  | { type: "workspace-sites-cleanup"; workspaceId: string };

export type TasksQueueResult = { kind: "ok" } | { kind: "retry"; delaySeconds: number };
