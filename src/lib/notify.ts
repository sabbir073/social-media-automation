import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { assertPublicUrl } from "./ssrf";

/** Adds an entry to the user's in-app notification list. Never throws. */
export async function notifyInApp(userId: string, kind: "post_failed" | "account" | "feed" | "info", text: string, link = "") {
  await prisma.notification.create({ data: { userId, kind, text: text.slice(0, 500), link } }).catch(() => {});
}

type Recipient = { email: string; notifyFailures: boolean; webhookUrl: string | null; webhookSecret: string | null };

/** Emails the user about something that needs their attention. Never throws. */
export async function alertUser(user: Recipient, subject: string, text: string) {
  if (!user.notifyFailures) return;
  await sendMail(user.email, `${env.appName}: ${subject}`, `${text}\n\n${env.appUrl}/app/posts?tab=failed`).catch((e) =>
    console.error("[notify] mail failed:", (e as Error).message),
  );
}

/**
 * Delivers an event to the user's webhook. The body is signed with HMAC-SHA256 of the raw
 * JSON using their secret, sent as the X-Signature header. Never throws.
 */
export async function sendWebhook(user: Recipient, event: string, data: Record<string, unknown>) {
  if (!user.webhookUrl) return;
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data });
  try {
    const url = await assertPublicUrl(user.webhookUrl);
    await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `${env.appName}-webhook`,
        "X-Signature": createHmac("sha256", user.webhookSecret ?? "").update(body).digest("hex"),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn(`[notify] webhook ${event} failed: ${(e as Error).message}`);
  }
}
