// Email. ZeptoMail (HTTP API) is the primary transport; SMTP through nodemailer is an optional alternative and loses
// if both are set. With neither, `enabled` is false and the admin page shows invite and reset links to copy.
import nodemailer from 'nodemailer';
import type { AppConfig } from './config.js';

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  // Built with linkEmail(), which escapes every value. Omit to send text only.
  html?: string;
}

export interface Mailer {
  enabled: boolean;
  kind: 'zeptomail' | 'smtp' | 'none';
  send(message: MailMessage): Promise<void>;
}

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// The plain-text and HTML forms of a short message with one link. Every interpolated value is escaped for HTML.
export function linkEmail(parts: { greeting?: string; intro: string; link: string; linkLabel: string; outro?: string }): { text: string; html: string } {
  const text = [parts.greeting, parts.intro, parts.link, parts.outro].filter(Boolean).join('\n\n');
  const safeLink = /^https?:\/\//i.test(parts.link) ? escapeHtml(parts.link) : '#';
  const p = (s?: string) => (s ? `<p style="margin:0 0 16px">${escapeHtml(s)}</p>` : '');
  const html = `<!doctype html><html lang="en-GB"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">${p(parts.greeting)}${p(parts.intro)}<p style="margin:0 0 16px"><a href="${safeLink}">${escapeHtml(parts.linkLabel)}</a></p><p style="margin:0 0 16px;font-size:13px;color:#555">If the button does not work, copy this address into your browser: ${escapeHtml(parts.link)}</p>${p(parts.outro)}</body></html>`;
  return { text, html };
}

const ZEPTO_URL = 'https://api.zeptomail.com/v1.1/email';

function createZeptoMailer(zepto: NonNullable<AppConfig['zepto']>, fetchImpl: typeof fetch): Mailer {
  const mask = (s: string) => s.split(zepto.apiKey).join('[hidden]');
  return {
    enabled: true,
    kind: 'zeptomail',
    async send(message) {
      let res: Response;
      try {
        res = await fetchImpl(ZEPTO_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-enczapikey ${zepto.apiKey}` },
          body: JSON.stringify({
            from: { address: zepto.from, name: zepto.fromName },
            to: [{ email_address: { address: message.to, name: message.toName ?? message.to } }],
            subject: message.subject,
            htmlbody: message.html ?? `<pre style="font-family:inherit">${escapeHtml(message.text)}</pre>`,
            textbody: message.text,
          }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        throw new Error(mask(`ZeptoMail could not be reached: ${(e as Error).message}`));
      }
      if (!res.ok) {
        const excerpt = mask((await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
        throw new Error(`ZeptoMail refused the message: HTTP ${res.status}${excerpt ? ` ${excerpt}` : ''}`);
      }
    },
  };
}

export function createMailer(config: AppConfig, fetchImpl: typeof fetch = fetch): Mailer {
  if (config.zepto) return createZeptoMailer(config.zepto, fetchImpl);
  if (config.smtp) {
    const { host, port, user, pass, from } = config.smtp;
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
    return {
      enabled: true,
      kind: 'smtp',
      async send(message) {
        await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
      },
    };
  }
  return { enabled: false, kind: 'none', async send() {} };
}

// For tests: records what would have been sent. `fail` makes every send throw.
export function createFakeMailer(enabled = true): Mailer & { sent: MailMessage[]; fail: boolean } {
  const sent: MailMessage[] = [];
  const mailer = {
    enabled, sent, fail: false, kind: (enabled ? 'smtp' : 'none') as Mailer['kind'],
    async send(message: MailMessage) {
      if (!enabled) return;
      if (mailer.fail) throw new Error('mail failed');
      sent.push(message);
    },
  };
  return mailer;
}
