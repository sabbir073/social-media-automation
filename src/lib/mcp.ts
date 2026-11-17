/**
 * Model Context Protocol server (Streamable HTTP, stateless JSON responses), so customers can
 * manage their posts from Claude, ChatGPT or any MCP client:
 *   URL:    {APP_URL}/api/mcp
 *   Header: Authorization: Bearer <API key from Settings>
 */
import type { User } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "./db";
import { engagement, readMetrics } from "./metrics-format";
import { createPost } from "./posts";
import { importMedia } from "./sheets";
import { nextSlots } from "./slots";

type Tool = { name: string; description: string; inputSchema: object; run: (user: User, args: any) => Promise<unknown> };

const str = (description: string) => ({ type: "string", description });

export const TOOLS: Tool[] = [
  {
    name: "list_accounts",
    description: "List the user's connected social accounts with their ids, networks, status and whether they have weekly posting slots.",
    inputSchema: { type: "object", properties: {} },
    async run(user) {
      const accounts = await prisma.socialAccount.findMany({ where: { userId: user.id }, include: { _count: { select: { slots: true } } } });
      return accounts.map((a) => ({ id: a.id, network: a.platform.toLowerCase(), name: a.name, status: a.status.toLowerCase(), paused: a.paused, hasPostingSlots: a._count.slots > 0 }));
    },
  },
  {
    name: "create_post",
    description:
      "Schedule or publish a post to one or more accounts. Each target can have its own time. Use when=\"now\" to publish immediately, when=\"next_slot\" for the account's next free posting slot, or an ISO 8601 date-time. Instagram and Pinterest need media; YouTube needs one video and a title; Pinterest needs options.boardId.",
    inputSchema: {
      type: "object",
      required: ["caption", "targets"],
      properties: {
        caption: str("The post text"),
        title: str("Title (YouTube, Pinterest)"),
        link: str("Optional link to attach"),
        mediaUrls: { type: "array", items: { type: "string" }, description: "Direct public URLs of JPG/PNG/WEBP/MP4/MOV files" },
        targets: {
          type: "array",
          items: {
            type: "object",
            required: ["accountId"],
            properties: { accountId: str("Id from list_accounts"), when: str('"now", "next_slot" or ISO 8601 date-time. Default "now".'), caption: str("Different text for this account"), options: { type: "object" } },
          },
        },
      },
    },
    async run(user, args) {
      const targets = [];
      for (const t of args.targets ?? []) {
        let scheduledAt = new Date();
        if (t.when === "next_slot") {
          const account = await prisma.socialAccount.findFirst({ where: { id: t.accountId, userId: user.id }, include: { slots: true } });
          if (!account) throw new Error(`Unknown account ${t.accountId}`);
          if (!account.slots.length) throw new Error(`${account.name} has no posting slots; give a time instead`);
          const busy = await prisma.postTarget.findMany({ where: { accountId: account.id, status: { in: ["SCHEDULED", "QUEUED"] }, scheduledAt: { gt: new Date() } }, select: { scheduledAt: true } });
          scheduledAt = nextSlots(account.slots, user.timezone, new Set(busy.map((b) => b.scheduledAt.getTime())), new Date())[0];
        } else if (t.when && t.when !== "now") {
          const dt = DateTime.fromISO(t.when, { zone: user.timezone });
          if (!dt.isValid) throw new Error(`Cannot read the time "${t.when}"`);
          scheduledAt = dt.toJSDate();
        }
        targets.push({ accountId: String(t.accountId), scheduledAt, captionOverride: t.caption, options: t.options ?? {} });
      }
      const mediaIds = await importMedia(user.id, (args.mediaUrls ?? []).slice(0, 10));
      const post = await createPost(user.id, { caption: String(args.caption ?? ""), title: String(args.title ?? ""), link: String(args.link ?? ""), mediaIds, targets });
      return { postId: post.id, targets: post.targets.map((t) => ({ id: t.id, accountId: t.accountId, scheduledAt: t.scheduledAt })) };
    },
  },
  {
    name: "list_posts",
    description: "List the user's posts by status: upcoming (default), published or failed. Returns up to 25, with times, account, text, URL and error.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["upcoming", "published", "failed"] } } },
    async run(user, args) {
      const status = args.status === "published" ? ["PUBLISHED"] : args.status === "failed" ? ["FAILED"] : ["SCHEDULED", "QUEUED", "PUBLISHING"];
      const targets = await prisma.postTarget.findMany({
        where: { post: { userId: user.id }, status: { in: status as never } },
        orderBy: args.status === "published" || args.status === "failed" ? { updatedAt: "desc" } : { scheduledAt: "asc" },
        take: 25,
        include: { account: true, post: true },
      });
      return targets.map((t) => ({ targetId: t.id, account: t.account.name, network: t.account.platform.toLowerCase(), status: t.status.toLowerCase(), scheduledAt: t.scheduledAt, publishedAt: t.publishedAt, text: (t.captionOverride ?? t.post.caption).slice(0, 300), url: t.externalUrl, error: t.error }));
    },
  },
  {
    name: "cancel_post",
    description: "Cancel a scheduled post target (id from list_posts) that has not started publishing.",
    inputSchema: { type: "object", required: ["targetId"], properties: { targetId: str("Target id") } },
    async run(user, args) {
      const r = await prisma.postTarget.updateMany({ where: { id: String(args.targetId), status: "SCHEDULED", post: { userId: user.id } }, data: { status: "CANCELED" } });
      if (r.count === 0) throw new Error("That post was not found or can no longer be canceled");
      return { canceled: true };
    },
  },
  {
    name: "get_analytics",
    description: "Summary of the last N days (default 30): posts published, failures, engagement, views and the top posts.",
    inputSchema: { type: "object", properties: { days: { type: "number" } } },
    async run(user, args) {
      const days = Math.min(90, Math.max(1, Number(args.days) || 30));
      const since = new Date(Date.now() - days * 86_400_000);
      const [published, failed] = await Promise.all([
        prisma.postTarget.findMany({ where: { post: { userId: user.id }, status: "PUBLISHED", publishedAt: { gte: since } }, include: { post: true, account: true } }),
        prisma.postTarget.count({ where: { post: { userId: user.id }, status: "FAILED", updatedAt: { gte: since } } }),
      ]);
      const rows = published.map((t) => ({ t, m: readMetrics(t.metrics) }));
      return {
        days,
        published: published.length,
        failed,
        engagement: rows.reduce((a, r) => a + engagement(r.m), 0),
        views: rows.reduce((a, r) => a + r.m.views, 0),
        topPosts: [...rows].sort((a, b) => engagement(b.m) - engagement(a.m)).slice(0, 5).map((r) => ({ account: r.t.account.name, text: r.t.post.caption.slice(0, 120), ...r.m, url: r.t.externalUrl })),
      };
    },
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

/** Handles one JSON-RPC message. Returns null for notifications (no response body). */
export async function handleRpc(user: User, msg: Rpc, appName: string): Promise<object | null> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (msg.id === undefined) return null; // notifications/initialized and friends
  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: appName, version: "1.0.0" },
        instructions: "Schedule and review social media posts. Call list_accounts first to get account ids.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool ${msg.params?.name}`);
      try {
        const out = await tool.run(user, msg.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        // Tool failures are reported in-band so the model can read and react to them.
        return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method ${msg.method} not found`);
  }
}
