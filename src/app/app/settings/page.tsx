import { ActionButton } from "@/components/ActionButton";
import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/SettingsForms";
import { ApiKeyForm, IntegrationsForm } from "@/components/SimpleForms";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const user = await requireUser();
  const keys = await prisma.apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(user.timezone)) zones.unshift(user.timezone);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="h1">Settings</h1>
      <ProfileForm name={user.name} timezone={user.timezone} zones={zones} />
      <IntegrationsForm
        initial={{
          notifyFailures: user.notifyFailures,
          weeklyReport: user.weeklyReport,
          brandVoice: user.brandVoice,
          utmEnabled: user.utmEnabled,
          utmCampaign: user.utmCampaign,
          shortLinks: user.shortLinks,
          webhookUrl: user.webhookUrl ?? "",
          webhookSecret: user.webhookUrl ? user.webhookSecret : null,
        }}
      />
      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">API keys</h2>
          <p className="muted mt-1 text-xs">
            Create posts from your own tools. Send the key as <code className="rounded bg-slate-100 px-1">Authorization: Bearer &lt;key&gt;</code> to{" "}
            <code className="rounded bg-slate-100 px-1 break-all">{env.appUrl}/api/v1/posts</code>. See docs/API.md in the project.
          </p>
        </div>
        <p className="muted text-xs">
          <strong className="text-slate-700">Use it from Claude or ChatGPT:</strong> add a remote MCP server with the address{" "}
          <code className="rounded bg-slate-100 px-1 break-all">{env.appUrl}/api/mcp</code> and the same Authorization header. You can then say
          “schedule this to my Facebook Page tomorrow at 9” in the chat.
        </p>
        <ApiKeyForm />
        {keys.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.name} <code className="muted font-mono text-xs">{k.prefix}…</code></p>
                  <p className="muted text-xs">{k.lastUsedAt ? `Last used ${formatInZone(k.lastUsedAt, user.timezone)}` : "Never used"}</p>
                </div>
                <ActionButton method="DELETE" url={`/api/keys/${k.id}`} className="btn-danger" confirm={`Revoke the key "${k.name}"? Anything using it stops working.`}>Revoke</ActionButton>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PasswordForm />
      <DeleteAccountForm />
    </div>
  );
}
