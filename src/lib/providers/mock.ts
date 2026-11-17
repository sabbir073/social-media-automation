import { env } from "../env";
import { randomToken } from "../crypto";
import { type Provider, ProviderError, sleep } from "./types";

/**
 * Fake network for development and demos (ENABLE_MOCK_PROVIDER=true). Lets you exercise
 * connect -> schedule -> publish end to end before any real platform has approved your app.
 * A caption containing "[fail]" fails permanently; "[retry]" fails with a retryable error.
 */
export const mock: Provider = {
  platform: "MOCK",
  label: "Test network",
  hint: "Development only. Nothing is posted anywhere.",
  isConfigured: () => env.mockProvider,
  authUrl: (state, redirectUri) => `${redirectUri}?${new URLSearchParams({ code: "mock", state })}`,
  async connect() {
    const id = randomToken(6);
    return [{ externalId: id, name: `Test account ${id.slice(0, 4)}`, username: `test_${id.slice(0, 4)}`, accessToken: "mock-token" }];
  },
  async check() {},
  validate(d) {
    return d.caption.trim() || d.media.length ? [] : ["Add text or media."];
  },
  async publish(_a, input) {
    await sleep(300);
    if (input.caption.includes("[fail]")) throw new ProviderError("Simulated permanent failure");
    if (input.caption.includes("[retry]")) throw new ProviderError("Simulated temporary failure", { retryable: true });
    const id = randomToken(8);
    return { externalId: id, url: `https://example.com/mock/${id}` };
  },
  async metrics(_a, id) {
    // Stable fake numbers derived from the post id, so analytics pages have something to show.
    const n = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    return { views: 200 + (n % 900), likes: 10 + (n % 90), comments: n % 12, shares: n % 7 };
  },
};
