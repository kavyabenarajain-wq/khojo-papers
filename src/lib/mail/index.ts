import "server-only";
import { env, integrations } from "../env";

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured on this server.");
  }
}

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Sends transactional email through Resend. In development without a key, the message is
 * printed to the server console so flows can be exercised; in production it fails loudly.
 */
export async function sendMail(mail: Mail): Promise<{ delivered: boolean; via: "resend" | "console" }> {
  if (!integrations.mail) {
    if (env.NODE_ENV !== "production") {
      console.info(`\n[mail:dev] To: ${mail.to}\n[mail:dev] Subject: ${mail.subject}\n${mail.text}\n`);
      return { delivered: false, via: "console" };
    }
    throw new MailNotConfiguredError();
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
  return { delivered: true, via: "resend" };
}

export function mailAvailable(): "configured" | "dev_console" | "unavailable" {
  if (integrations.mail) return "configured";
  return env.NODE_ENV !== "production" ? "dev_console" : "unavailable";
}
