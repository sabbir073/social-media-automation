import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ActionButton } from "@/components/ActionButton";
import { Reschedule } from "@/components/Reschedule";
import { Empty, PlatformBadge, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readMetrics } from "@/lib/metrics-format";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Posts" };

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
  { id: "canceled", label: "Canceled" },
] as const;
const PAGE = 30;

export default async function Posts({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const user = await requireUser();
  const q = await searchParams;
  const tab = TABS.find((t) => t.id === q.tab)?.id ?? "upcoming";
  const page = Math.max(1, Number(q.page) || 1);
  const status: Prisma.PostTargetWhereInput["status"] =
    tab === "upcoming" ? { in: ["SCHEDULED", "QUEUED", "PUBLISHING"] } : tab === "published" ? "PUBLISHED" : tab === "failed" ? "FAILED" : "CANCELED";
  const where = { post: { userId: user.id }, status };
  const [targets, total] = await Promise.all([
    prisma.postTarget.findMany({
      where,
      orderBy: tab === "upcoming" ? { scheduledAt: "asc" } : { updatedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { account: true, post: { include: { media: { take: 1, orderBy: { position: "asc" }, include: { media: true } } } } },
    }),
    prisma.postTarget.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Posts</h1>
        <Link href="/app/compose" className="btn">New post</Link>
      </div>
      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Post status">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/app/posts?tab=${t.id}`}
            role="tab"
            aria-selected={t.id === tab}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.id === tab ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {targets.length === 0 ? (
        <Empty title={tab === "upcoming" ? "Nothing waiting to publish" : `No ${tab} posts`} />
      ) : (
        <ul className="space-y-3">
          {targets.map((t) => {
            const thumb = t.post.media[0]?.media;
            const text = t.captionOverride || t.post.caption;
            return (
              <li key={t.id} className="card flex flex-col gap-3 p-4 sm:flex-row">
                {thumb && thumb.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/media/${thumb.key}`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                    {thumb ? "Video" : "Text"}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge platform={t.account.platform} />
                    <span className="truncate font-medium">{t.account.name}</span>
                    <StatusBadge status={t.status} />
                    {t.post.source === "sheet" && <span className="badge bg-slate-100 text-slate-600">From sheet</span>}
                  </div>
                  {t.post.title && <p className="truncate text-sm font-medium">{t.post.title}</p>}
                  <p className="line-clamp-2 text-sm whitespace-pre-line text-slate-700">{text || "(no text)"}</p>
                  <p className="muted text-xs">
                    {t.status === "PUBLISHED" && t.publishedAt
                      ? `Published ${formatInZone(t.publishedAt, user.timezone)}`
                      : `Scheduled for ${formatInZone(t.scheduledAt, user.timezone)}`}
                    {typeof (t.options as any)?.boardName === "string" && ` · Board: ${(t.options as any).boardName}`}
                  </p>
                  {t.repeatEveryDays && (t.repeatRemaining ?? 0) > 0 && (
                    <p className="muted text-xs">Repeats every {t.repeatEveryDays} day{t.repeatEveryDays === 1 ? "" : "s"}, {t.repeatRemaining} more time{t.repeatRemaining === 1 ? "" : "s"}</p>
                  )}
                  {t.status === "PUBLISHED" && t.metricsAt && (
                    <p className="text-xs text-slate-600">
                      {Object.entries(readMetrics(t.metrics)).filter(([, v]) => v > 0).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(" · ") || "No engagement yet"}
                    </p>
                  )}
                  {t.error && t.status !== "PUBLISHED" && (
                    <p className="text-sm text-red-700">
                      {t.status === "SCHEDULED" ? `Will retry. Last error: ${t.error}` : t.error}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2 sm:flex-col sm:items-end">
                  {t.externalUrl && (
                    <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">View post</a>
                  )}
                  {t.status === "SCHEDULED" && (
                    <>
                      <Reschedule id={t.id} current={t.scheduledAt.toISOString()} timezone={user.timezone} />
                      <ActionButton method="PATCH" url={`/api/targets/${t.id}`} body={{ action: "cancel" }}>Cancel</ActionButton>
                    </>
                  )}
                  {(t.status === "FAILED" || t.status === "CANCELED") && (
                    <ActionButton method="PATCH" url={`/api/targets/${t.id}`} body={{ action: "retry" }}>
                      {t.status === "FAILED" ? "Retry now" : "Schedule again"}
                    </ActionButton>
                  )}
                  <Link href={`/app/compose?from=${t.postId}`} className="btn-secondary">Duplicate</Link>
                  {t.status !== "QUEUED" && t.status !== "PUBLISHING" && (
                    <ActionButton
                      method="DELETE"
                      url={`/api/targets/${t.id}`}
                      className="btn-danger"
                      confirm={t.status === "PUBLISHED" ? "Remove this from your history? The live post stays on the network." : "Delete this scheduled post?"}
                    >
                      Delete
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link className="btn-secondary" href={`/app/posts?tab=${tab}&page=${page - 1}`}>Previous</Link> : <span />}
          <span className="muted">Page {page} of {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total ? <Link className="btn-secondary" href={`/app/posts?tab=${tab}&page=${page + 1}`}>Next</Link> : <span />}
        </div>
      )}
    </div>
  );
}
