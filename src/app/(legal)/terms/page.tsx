import { env } from "@/lib/env";

export const metadata = { title: "Terms of Service" };

/** TEMPLATE. Replace the bracketed parts and have it reviewed before launch. */
export default function Terms() {
  const app = env.appName;
  return (
    <>
      <h1 className="h1">Terms of Service</h1>
      <p className="muted">Last updated: [DATE]</p>
      <p>These terms govern your use of {app}, operated by [COMPANY NAME]. By creating an account you agree to them.</p>

      <h2>The service</h2>
      <p>{app} lets you schedule and publish content to social media accounts you own or are authorised to manage. Publishing depends on third-party platforms; we cannot guarantee that a platform will accept or keep any post.</p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You must have the right to publish everything you schedule, and it must follow each platform’s rules, including the Meta Platform Terms, the YouTube Terms of Service and the Pinterest Community Guidelines.</li>
        <li>Do not use {app} for spam, misleading content or anything unlawful.</li>
        <li>Keep your password safe. You are responsible for activity on your account.</li>
      </ul>

      <h2>Subscriptions</h2>
      <p>Plans are billed monthly in advance. A plan’s limits (connected accounts, posts per month) are shown on the pricing page. If a subscription ends, scheduled posts are not published until it is renewed. [REFUND POLICY].</p>

      <h2>Termination</h2>
      <p>You can delete your account at any time in Settings. We may suspend accounts that break these terms or a platform’s rules.</p>

      <h2>Liability</h2>
      <p>The service is provided “as is”. To the extent the law allows, [COMPANY NAME] is not liable for indirect losses, or for posts that fail, are delayed or are removed by a platform.</p>

      <h2>Contact</h2>
      <p>[SUPPORT EMAIL]</p>
    </>
  );
}
