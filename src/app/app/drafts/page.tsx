import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { IdeaForm } from "@/components/SimpleForms";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Drafts & ideas" };

export default async function Drafts() {
  const user = await requireUser();
  const drafts = await prisma.draft.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">Drafts & ideas</h1>
        <p className="muted mt-1">Jot ideas down now and turn them into posts later. “Save as draft” on the New post page also lands here.</p>
      </div>
      <IdeaForm />
      {drafts.length === 0 ? (
        <Empty title="No drafts yet" />
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                {d.title && <p className="truncate text-sm font-medium">{d.title}</p>}
                <p className="line-clamp-3 text-sm whitespace-pre-line text-slate-700">{d.caption || "(no text)"}</p>
                <p className="muted mt-1 text-xs">
                  Edited {formatInZone(d.updatedAt, user.timezone)}
                  {d.mediaIds.length > 0 && ` · ${d.mediaIds.length} file${d.mediaIds.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <Link href={`/app/compose?draft=${d.id}`} className="btn-secondary">Finish and schedule</Link>
              <ActionButton method="DELETE" url={`/api/drafts/${d.id}`} className="btn-danger" confirm="Delete this draft?">Delete</ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
