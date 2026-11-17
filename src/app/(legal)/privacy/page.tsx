import { env } from "@/lib/env";

export const metadata = { title: "Privacy Policy" };

/**
 * TEMPLATE. Replace the bracketed parts and have it reviewed before launch. Meta, Google and
 * Pinterest reviewers open this page and check that it matches what the app actually does.
 */
export default function Privacy() {
  const app = env.appName;
  return (
    <>
      <h1 className="h1">Privacy Policy</h1>
      <p className="muted">Last updated: [DATE]</p>
      <p>{app} is operated by [COMPANY NAME], [ADDRESS] (“we”). This policy explains what we collect when you use {app} and how we use it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, password (stored as a one-way hash) and timezone.</li>
        <li><strong>Connected social accounts:</strong> when you connect a Facebook Page, Instagram account, YouTube channel or Pinterest account, we receive its ID, name, username, profile picture and access tokens that let us publish on your behalf. Tokens are stored encrypted.</li>
        <li><strong>Your content:</strong> the text, links, images and videos you upload or schedule, and the Google Sheets you choose to connect.</li>
        <li><strong>Billing records:</strong> your plan, payment references and payment status. We do not store card numbers.</li>
        <li><strong>Technical logs:</strong> IP address and request logs, kept for security and troubleshooting.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To publish the posts you schedule to the accounts you selected, at the times you chose.</li>
        <li>To show you the status of your connections and posts.</li>
        <li>To manage your subscription and provide support.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or use it to train AI models. We only access your social accounts to perform actions you asked for.</p>

      <h2>Google user data</h2>
      <p>{app}’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. {app} uses YouTube API Services to upload videos you schedule to your channel. By using this feature you also agree to the <a className="text-brand-600 underline" href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and Google’s handling of your data is described in the <a className="text-brand-600 underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>. You can revoke {app}’s access at any time at <a className="text-brand-600 underline" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>

      <h2>Sharing</h2>
      <p>We share data only with the social networks you connect (to publish your posts), our hosting and email providers [LIST PROVIDERS], our payment processor, and authorities where the law requires it.</p>

      <h2>Retention and deletion</h2>
      <p>We keep your data while your account exists. Removing a connected account deletes its tokens immediately. Deleting your account removes your profile, tokens, scheduled posts and uploaded files. See <a className="text-brand-600 underline" href="/data-deletion">Data deletion</a>.</p>

      <h2>Contact</h2>
      <p>Questions or requests: [SUPPORT EMAIL].</p>
    </>
  );
}
