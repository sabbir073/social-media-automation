import { ActionButton } from "@/components/ActionButton";
import { BioForm } from "@/components/SimpleForms";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const metadata = { title: "Link in bio" };

export default async function Bio() {
  const user = await requireUser();
  const page = await prisma.bioPage.findUnique({ where: { userId: user.id } });
  const links = (Array.isArray(page?.links) ? page!.links : []) as { label: string; url: string }[];
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">Link in bio</h1>
        <p className="muted mt-1">
          One public page with all your links, for the single link Instagram and other profiles allow.
        </p>
      </div>
      {page && (
        <div className="card flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <a href={`/b/${page.slug}`} target="_blank" rel="noopener noreferrer" className="font-medium break-all text-brand-700 hover:underline">
              {env.appUrl}/b/{page.slug}
            </a>
            <p className="muted text-xs">{page.views.toLocaleString()} page view{page.views === 1 ? "" : "s"}</p>
          </div>
          <ActionButton method="DELETE" url="/api/bio" className="btn-danger" confirm="Take your link-in-bio page offline?">Delete page</ActionButton>
        </div>
      )}
      <BioForm baseUrl={env.appUrl} initial={page ? { slug: page.slug, title: page.title, bio: page.bio, links } : null} />
    </div>
  );
}
