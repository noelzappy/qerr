import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { brandInfo } from './brand.js';
import { escapeHtml, createMailer, linkEmail } from './mail.js';
import { createTestApp, testConfig, type TestApp } from './testing.js';

const KEY = 'zepto-key-ABCDEF123456';
const zeptoConfig = (extra: Record<string, string> = {}) => testConfig({ ZEPTOMAIL_API_KEY: KEY, MAIL_FROM: 'noreply@acmesavings.example', ...extra });

function fakeFetch(status = 200, body = '{"message":"OK"}') {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('transport selection', () => {
  it('uses ZeptoMail when its key is set, even if SMTP is set too', () => {
    expect(createMailer(zeptoConfig({ SMTP_HOST: 'smtp.example.test' })).kind).toBe('zeptomail');
  });
  it('uses SMTP when only SMTP is set', () => {
    expect(createMailer(testConfig({ SMTP_HOST: 'smtp.example.test' })).kind).toBe('smtp');
  });
  it('is off when nothing is set', () => {
    const m = createMailer(testConfig());
    expect(m).toMatchObject({ kind: 'none', enabled: false });
  });
  it('needs MAIL_FROM with a ZeptoMail key', () => {
    expect(() => testConfig({ ZEPTOMAIL_API_KEY: KEY })).toThrow(/MAIL_FROM/);
  });
});

describe('ZeptoMail request', () => {
  it('accepts the key with the "Zoho-enczapikey" prefix pasted in and sends it once', async () => {
    const f = fakeFetch();
    await createMailer(zeptoConfig({ ZEPTOMAIL_API_KEY: `Zoho-enczapikey ${KEY}` }), f.impl).send({ to: 'ama@example.test', subject: 'Hi', text: 'plain' });
    expect(f.calls[0]!.init.headers).toMatchObject({ Authorization: `Zoho-enczapikey ${KEY}` });
  });

  it('posts the documented shape with the auth header', async () => {
    const f = fakeFetch();
    await createMailer(zeptoConfig({ MAIL_FROM_NAME: 'Acme Savings desk' }), f.impl).send({ to: 'ama@example.test', toName: 'Ama', subject: 'Hello', text: 'plain', html: '<p>rich</p>' });
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://api.zeptomail.com/v1.1/email');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-enczapikey ${KEY}` });
    expect(JSON.parse(String(init.body))).toEqual({
      from: { address: 'noreply@acmesavings.example', name: 'Acme Savings desk' },
      to: [{ email_address: { address: 'ama@example.test', name: 'Ama' } }],
      subject: 'Hello', htmlbody: '<p>rich</p>', textbody: 'plain',
    });
  });

  it('defaults the sender name to the brand\'s name and builds HTML from text when none is given', async () => {
    const f = fakeFetch();
    await createMailer(zeptoConfig(), f.impl).send({ to: 'a@example.test', subject: 's', text: 'a <b> & c' });
    const body = JSON.parse(String(f.calls[0]!.init.body));
    expect(body.from.name).toBe(brandInfo().name);
    expect(body.htmlbody).toContain('a &lt;b&gt; &amp; c');
  });

  it('throws the status and a short excerpt on a non-2xx answer, without the key', async () => {
    const f = fakeFetch(401, `{"error":{"message":"Invalid key ${KEY}"}}${' x'.repeat(500)}`);
    const err = await createMailer(zeptoConfig(), f.impl).send({ to: 'a@example.test', subject: 's', text: 't' }).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('HTTP 401');
    expect(err!.message).not.toContain(KEY);
    expect(err!.message.length).toBeLessThan(300);
  });

  it('masks the key when the network itself fails', async () => {
    const impl = (async () => { throw new Error(`connect failed for ${KEY}`); }) as unknown as typeof fetch;
    const err = await createMailer(zeptoConfig(), impl).send({ to: 'a@example.test', subject: 's', text: 't' }).then(() => null, (e: Error) => e);
    expect(err!.message).not.toContain(KEY);
  });
});

describe('HTML escaping', () => {
  it('escapes names, links and emails', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
    const { html, text } = linkEmail({ greeting: 'Hello <script>alert(1)</script>,', intro: 'Intro <b>', link: 'https://x.test/a?b=1&c="2"', linkLabel: '<i>go</i>' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('b=1&amp;c=&quot;2&quot;');
    expect(text).toContain('<script>'); // text parts are not HTML
  });

  it('does not make a clickable link from a non-http address', () => {
    expect(linkEmail({ intro: 'x', link: 'javascript:alert(1)', linkLabel: 'go' }).html).toContain('href="#"');
  });
});

describe('invites and resets when the send fails', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(); });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  it('still returns the link and says the email was not sent', async () => {
    t.mailer.fail = true;
    try {
      const admin = await t.createUser('admin');
      const editor = await t.createUser('editor', { name: '<script>alert(1)</script>' });
      const a = t.api(await t.signIn(admin));
      const inv = await a.post('/api/users/invites', { email: 'new@example.test', role: 'editor' });
      expect(inv.status).toBe(201);
      expect(inv.body).toMatchObject({ emailed: false, emailFailed: true });
      expect(inv.body.link).toContain('token=');
      expect(await t.prisma.invite.count()).toBe(1);
      const reset = await a.post(`/api/users/${editor.id}/reset-link`, { send: true });
      expect(reset.status).toBe(200);
      expect(reset.body).toMatchObject({ emailed: false, emailFailed: true });
      expect(reset.body.link).toContain('token=');
    } finally {
      t.mailer.fail = false;
    }
  });

  it('puts escaped HTML in the invite and reset emails', async () => {
    const admin = await t.createUser('admin');
    const editor = await t.createUser('editor', { name: '<script>alert(1)</script>' });
    const a = t.api(await t.signIn(admin));
    await a.post('/api/users/invites', { email: 'new@example.test', role: 'editor' });
    await a.post(`/api/users/${editor.id}/reset-link`, { send: true });
    expect(t.mailer.sent).toHaveLength(2);
    for (const m of t.mailer.sent) expect(m.html).toBeTruthy();
    expect(t.mailer.sent[1]!.html).toContain('&lt;script&gt;');
    expect(t.mailer.sent[1]!.html).not.toContain('<script>');
  });
});
