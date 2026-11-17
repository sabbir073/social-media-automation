import { Queue } from "bullmq";
import { redis } from "./redis";

export const PUBLISH_QUEUE = "publish";

const g = globalThis as unknown as { __publishQueue?: Queue };

export function publishQueue(): Queue {
  if (!g.__publishQueue) {
    g.__publishQueue = new Queue(PUBLISH_QUEUE, {
      connection: redis(),
      defaultJobOptions: { attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }
  return g.__publishQueue;
}
