import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Notifications</h1>
        <div className="flex gap-2">
          {unread > 0 && <ActionButton method="POST" url="/api/notifications">Mark all as read</ActionButton>}
          {items.length > 0 && <ActionButton method="DELETE" url="/api/notifications" className="btn-danger" confirm="Clear all notifications?">Clear all</ActionButton>}
        </div>
      </div>
      {items.length === 0 ? (
        <Empty title="You're all caught up">Failed posts and account problems show up here.</Empty>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 p-4">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-slate-200" : "bg-brand-600"}`} aria-label={n.readAt ? "read" : "unread"} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.readAt ? "text-slate-600" : "font-medium text-slate-900"}`}>{n.text}</p>
                <p className="muted text-xs">{formatInZone(n.createdAt, user.timezone)}</p>
              </div>
              {n.link && <Link href={n.link} className="btn-secondary">Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
