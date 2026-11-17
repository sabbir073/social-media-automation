import { ActionButton } from "@/components/ActionButton";
import { SnippetForm } from "@/components/SimpleForms";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Templates" };

export default async function Templates() {
  const user = await requireUser();
  const snippets = await prisma.snippet.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">Templates</h1>
        <p className="muted mt-1">Save captions, sign-offs and hashtag groups you reuse. Insert them from the New post page.</p>
      </div>
      <SnippetForm />
      {snippets.length === 0 ? (
        <Empty title="No templates saved yet" />
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {snippets.map((s) => (
            <li key={s.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-slate-600">{s.body}</p>
              </div>
              <ActionButton method="DELETE" url={`/api/snippets/${s.id}`} className="btn-danger" confirm={`Delete "${s.name}"?`}>Delete</ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
