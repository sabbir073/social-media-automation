import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/SettingsForms";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const user = await requireUser();
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(user.timezone)) zones.unshift(user.timezone);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="h1">Settings</h1>
      <ProfileForm name={user.name} timezone={user.timezone} zones={zones} />
      <PasswordForm />
      <DeleteAccountForm />
    </div>
  );
}
