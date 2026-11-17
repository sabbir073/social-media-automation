import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await prisma.bioPage.findUnique({ where: { slug: (await params).slug } });
  return page ? { title: page.title, description: page.bio || undefined } : { title: "Not found" };
}

/** Public link-in-bio page. */
export default async function BioPublic({ params }: Props) {
  const page = await prisma.bioPage.findUnique({ where: { slug: (await params).slug } });
  if (!page) notFound();
  await prisma.bioPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } }).catch(() => {});
  const links = ((Array.isArray(page.links) ? page.links : []) as { label: string; url: string }[]).filter((l) => /^https?:\/\//i.test(l.url));
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-4 py-14">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-3xl font-semibold text-white" aria-hidden>
        {page.title.charAt(0).toUpperCase()}
      </div>
      <h1 className="mt-4 text-center text-xl font-semibold">{page.title}</h1>
      {page.bio && <p className="mt-2 text-center text-sm whitespace-pre-line text-slate-600">{page.bio}</p>}
      <ul className="mt-8 w-full space-y-3">
        {links.map((l, i) => (
          <li key={i}>
            <a
              href={l.url}
              rel="noopener noreferrer nofollow"
              className="block rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-center font-medium shadow-sm transition hover:border-brand-500 hover:text-brand-700"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="muted mt-auto pt-10 text-xs">Made with {env.appName}</p>
    </main>
  );
}
