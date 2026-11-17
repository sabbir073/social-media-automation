import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Media library" };
const PAGE = 48;

export default async function MediaLibrary({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [media, total, bytes] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { _count: { select: { posts: true } } },
    }),
    prisma.mediaAsset.count({ where: { userId: user.id } }),
    prisma.mediaAsset.aggregate({ where: { userId: user.id }, _sum: { size: true } }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Media library</h1>
        <p className="muted mt-1">
          Every image and video you have uploaded. {total.toLocaleString()} file{total === 1 ? "" : "s"},{" "}
          {((bytes._sum.size ?? 0) / 1048576).toFixed(1)} MB. Upload new files from the New post page.
        </p>
      </div>
      {media.length === 0 ? (
        <Empty title="No media yet"><Link href="/app/compose" className="text-brand-600 underline">Create a post to upload some</Link></Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {media.map((m) => (
            <li key={m.id} className="card space-y-2 p-2">
              <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
                {m.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/media/${m.key}`} alt={m.originalName} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <video src={`/media/${m.key}`} className="h-full w-full object-cover" muted preload="metadata" controls />
                )}
              </div>
              <p className="truncate text-xs font-medium" title={m.originalName}>{m.originalName}</p>
              <p className="muted text-xs">{(m.size / 1048576).toFixed(1)} MB · used in {m._count.posts} post{m._count.posts === 1 ? "" : "s"}</p>
              <div className="flex flex-wrap gap-1">
                <Link href={`/app/compose?media=${m.id}`} className="btn-secondary px-2 py-1 text-xs">Use</Link>
                {m._count.posts === 0 && (
                  <ActionButton method="DELETE" url={`/api/media/${m.id}`} className="btn-danger px-2 py-1 text-xs" confirm="Delete this file?">Delete</ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link className="btn-secondary" href={`/app/media?page=${page - 1}`}>Previous</Link> : <span />}
          <span className="muted">Page {page} of {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total ? <Link className="btn-secondary" href={`/app/media?page=${page + 1}`}>Next</Link> : <span />}
        </div>
      )}
    </div>
  );
}
