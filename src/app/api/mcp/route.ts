import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { env } from "@/lib/env";
import { handler, HttpError } from "@/lib/http";
import { handleRpc } from "@/lib/mcp";
import { rateLimit } from "@/lib/redis";

export const maxDuration = 300;

/** MCP endpoint (Streamable HTTP). Authenticate with an API key as a Bearer token. */
export const POST = handler(
  async ({ req, user }) => {
    if (!req.headers.get("authorization")) throw new HttpError(401, "Send your API key as a Bearer token");
    await requireActiveSubscription(user.id);
    if (!(await rateLimit(`mcp:${user.id}`, 300, 3600))) throw new HttpError(429, "Rate limit reached");
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
    }
    const batch = Array.isArray(payload);
    const out = [];
    for (const msg of batch ? (payload as object[]).slice(0, 20) : [payload]) {
      const r = await handleRpc(user, msg as never, env.appName);
      if (r) out.push(r);
    }
    if (out.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(batch ? out : out[0]);
  },
  { apiKey: true },
);

/** This server does not push messages, so there is no event stream to open. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
