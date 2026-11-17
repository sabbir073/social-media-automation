import nodemailer from "nodemailer";
import { env } from "./env";

export async function sendMail(to: string, subject: string, text: string) {
  if (!env.smtpUrl) {
    console.log(`[mail] SMTP_URL not set. To: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }
  const transport = nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({ from: env.mailFrom, to, subject, text });
}
