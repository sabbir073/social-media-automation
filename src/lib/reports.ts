import { engagement, readMetrics } from "./metrics-format";
import { prisma } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";

const WEEK = 7 * 86_400_000;

/** Emails each opted-in user a summary of the last 7 days, at most once a week. */
export async function sendWeeklyReports(): Promise<number> {
  const due = await prisma.user.findMany({
    where: {
      weeklyReport: true,
      createdAt: { lt: new Date(Date.now() - WEEK) },
      OR: [{ lastReportAt: null }, { lastReportAt: { lt: new Date(Date.now() - WEEK) } }],
    },
    take: 200,
  });
  let sent = 0;
  for (const user of due) {
    const since = new Date(Date.now() - WEEK);
    const mine = { post: { userId: user.id } };
    const [published, failed, upcoming] = await Promise.all([
      prisma.postTarget.findMany({ where: { ...mine, status: "PUBLISHED", publishedAt: { gte: since } }, include: { post: true, account: true } }),
      prisma.postTarget.count({ where: { ...mine, status: "FAILED", updatedAt: { gte: since } } }),
      prisma.postTarget.count({ where: { ...mine, status: "SCHEDULED", scheduledAt: { lte: new Date(Date.now() + WEEK) } } }),
    ]);
    await prisma.user.update({ where: { id: user.id }, data: { lastReportAt: new Date() } });
    if (published.length === 0 && failed === 0 && upcoming === 0) continue; // nothing worth an email
    const rows = published.map((t) => ({ t, e: engagement(readMetrics(t.metrics)), v: readMetrics(t.metrics).views }));
    const best = [...rows].sort((a, b) => b.e - a.e)[0];
    const lines = [
      `Hi ${user.name.split(" ")[0]}, here is your week on ${env.appName}.`,
      "",
      `Published: ${published.length}`,
      `Failed: ${failed}`,
      `Engagement: ${rows.reduce((a, r) => a + r.e, 0).toLocaleString()}`,
      `Views: ${rows.reduce((a, r) => a + r.v, 0).toLocaleString()}`,
      `Scheduled for the next 7 days: ${upcoming}`,
      best && best.e > 0 ? `\nTop post (${best.t.account.name}, ${best.e.toLocaleString()} engagement): ${(best.t.post.title || best.t.post.caption).slice(0, 100)}` : "",
      upcoming === 0 ? "\nNothing is scheduled for next week yet." : "",
      "",
      `${env.appUrl}/app/analytics?days=7`,
      "",
      "Turn this email off under Settings.",
    ];
    await sendMail(user.email, `${env.appName}: your weekly report`, lines.filter((l) => l !== "").join("\n").replace(/\n(?=Published)/, "\n\n")).catch((e) =>
      console.error("[report] mail failed:", (e as Error).message),
    );
    sent++;
  }
  return sent;
}
