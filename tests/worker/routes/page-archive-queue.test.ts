import { describe, expect, it, vi } from "vitest";

import { enqueueIndexPageMessages } from "@/worker/routes/pages";

describe("enqueueIndexPageMessages", () => {
  it("sends every page id in bounded batches", async () => {
    const sendBatch = vi
      .fn<Queue["sendBatch"]>()
      .mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } });
    const pageIds = Array.from({ length: 205 }, (_, index) => `page-${index}`);

    await enqueueIndexPageMessages({ TASKS_QUEUE: { sendBatch } as unknown as Queue }, pageIds);

    expect(sendBatch).toHaveBeenCalledTimes(3);
    expect(sendBatch.mock.calls[0][0]).toHaveLength(100);
    expect(sendBatch.mock.calls[1][0]).toHaveLength(100);
    expect(sendBatch.mock.calls[2][0]).toHaveLength(5);
    expect(
      sendBatch.mock.calls.flatMap((call) => Array.from(call[0], (entry) => (entry.body as { pageId: string }).pageId)),
    ).toEqual(pageIds);
  });
});
