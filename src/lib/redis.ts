import IORedis from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { __redis?: IORedis };

export function redis(): IORedis {
  if (!g.__redis) {
    g.__redis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
    g.__redis.on("error", (e) => console.error("[redis]", e.message));
  }
  return g.__redis;
}

/** Fixed-window limiter. Returns false once `limit` hits were made within `windowSec`. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const k = `rl:${key}`;
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, windowSec);
    return n <= limit;
  } catch {
    return true; // never lock users out because Redis is down
  }
}
