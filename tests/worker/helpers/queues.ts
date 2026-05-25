import { afterEach, beforeEach, vi } from "vitest";

const QUEUE_SEND_RESPONSE = {
  metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
} satisfies QueueSendResponse & QueueSendBatchResponse;

export function installNoopTasksQueue(env: Pick<Env, "TASKS_QUEUE">): void {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    const send = vi.spyOn(env.TASKS_QUEUE, "send").mockResolvedValue(QUEUE_SEND_RESPONSE);
    const sendBatch = vi.spyOn(env.TASKS_QUEUE, "sendBatch").mockResolvedValue(QUEUE_SEND_RESPONSE);
    restore = () => {
      send.mockRestore();
      sendBatch.mockRestore();
    };
  });

  afterEach(() => {
    restore?.();
    restore = null;
  });
}
