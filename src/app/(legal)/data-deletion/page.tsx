import { env } from "@/lib/env";

export const metadata = { title: "Data deletion" };

/** Meta requires a public page with data deletion instructions; link it in the Meta app settings. */
export default function DataDeletion() {
  const app = env.appName;
  return (
    <>
      <h1 className="h1">How to delete your data</h1>
      <h2>Disconnect one social account</h2>
      <p>Sign in to {app}, open <strong>Accounts</strong> and choose <strong>Remove</strong> next to the account. Its access tokens and scheduled posts are deleted immediately. You can also revoke access from the platform itself: Facebook and Instagram under Settings → Business integrations, Google at myaccount.google.com/permissions, and Pinterest under Settings → Security → Apps.</p>
      <h2>Delete your whole account</h2>
      <p>Sign in, open <strong>Settings</strong> and choose <strong>Delete my account</strong>. This permanently removes your profile, every connected account and token, your scheduled posts and your uploaded files.</p>
      <h2>Cannot sign in?</h2>
      <p>Email [SUPPORT EMAIL] from the address on your account and we will delete your data within 30 days.</p>
      <p>Posts already published to a social network are stored by that network and must be deleted there.</p>
    </>
  );
}
