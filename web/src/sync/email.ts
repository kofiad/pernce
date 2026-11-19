import { SyncHttpError } from "./errors";

export type EmailMessage = { subject: string; text: string };
export type Mailer = (to: string, message: EmailMessage) => Promise<void>;

/** What the SMTP mailer reads from the environment. */
export type MailEnv = {
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  /** Any SMTP server; defaults to Gmail. */
  SMTP_HOST?: string;
  /** Defaults to 465 (implicit TLS); 587 and other ports use STARTTLS. */
  SMTP_PORT?: string;
  NODE_ENV?: string;
};

/** Sends through an SMTP server (Gmail unless SMTP_HOST says otherwise) with an app password
 * (https://support.google.com/accounts/answer/185833), which needs 2-step
 * verification on the Google account. Gmail allows about 500 emails a day,
 * plenty for a few people. Without SMTP_USER and SMTP_PASSWORD, development
 * (NODE_ENV=development, which `pnpm run dev` sets) prints the email to the
 * server log instead, and everything else refuses (503) rather than pretend
 * a code was sent. nodemailer is loaded on first send, so hosts that never
 * mail don't pay for it at start-up. On Workers the SMTP connection is
 * untested (docs/web-deployment.md, "Email on Workers"). */
export function smtpMailer(env: MailEnv): Mailer {
  return async (to, { subject, text }) => {
    const user = env.SMTP_USER;
    const pass = env.SMTP_PASSWORD;
    if (!user || !pass) {
      if (env.NODE_ENV === "development") {
        console.info(`[sync email] to ${to}: ${subject}\n${text}`);
        return;
      }
      throw new SyncHttpError(503, "email_unavailable", "Email isn't set up on this server yet.");
    }
    try {
      const { createTransport } = await import("nodemailer");
      const port = Number(env.SMTP_PORT) || 465;
      const transport = createTransport({
        host: env.SMTP_HOST || "smtp.gmail.com",
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      // Gmail rewrites any other From address to the account's own.
      await transport.sendMail({ from: `Pernce <${user}>`, to, subject, text });
    } catch (err) {
      console.error("SMTP send failed:", err);
      throw new SyncHttpError(503, "email_unavailable", "Couldn't send the email. Try again shortly.");
    }
  };
}

export function verifyEmailMessage(code: string): EmailMessage {
  return {
    subject: `${code} is your Pernce code`,
    text: `Enter this code in the Pernce app to finish turning on sync:\n\n${code}\n\nIt expires in 15 minutes. If you didn't sign up, ignore this email.`,
  };
}

export function resetEmailMessage(code: string): EmailMessage {
  return {
    subject: `${code} is your Pernce password reset code`,
    text:
      `Enter this code in the Pernce app to choose a new sync password:\n\n${code}\n\n` +
      `It expires in 15 minutes. Your synced data is encrypted with a key only your devices hold: ` +
      `after a reset you'll need your recovery key, or a device that's still signed in, to read it again.\n\n` +
      `If you didn't ask for this, ignore this email; your password hasn't changed.`,
  };
}

export function alreadyRegisteredMessage(): EmailMessage {
  return {
    subject: "You already have a Pernce sync account",
    text: "Someone tried to sign up for Pernce sync with this email, but it already has an account. Sign in instead, or reset your password from the sign-in screen. If this wasn't you, ignore this email.",
  };
}
