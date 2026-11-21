# Security

## Reporting a vulnerability

Please report security problems privately, through GitHub's private vulnerability reporting: open the repository's
**Security** tab and choose **Report a vulnerability**. Do not open a public issue, and do not include real keys, tokens
or personal data in a report.

Say what is affected, how to reproduce it, and what an attacker could do with it. We aim to acknowledge a report within
a week and to keep you informed until it is fixed.

## Scope

This project handles secrets (Buffer API keys, AI provider keys, S3 credentials, session secrets) and renders text that
may come from the web. Reports we especially want to hear about:

- a key or secret reaching a log, an error message, a response, a file or the browser;
- spec, batch or vault text escaping the render page's escaping, its Content-Security-Policy or its request blocking
  (`packages/engine/lib/design/`);
- authentication, authorisation or tenant problems in the web app (`apps/web`);
- server-side request forgery through the AI research fetcher (`packages/ai/src/safe-fetch.mjs`).

Known, documented trade-offs are described in [deploy/README.md](deploy/README.md) (Chromium runs without its own
sandbox inside the container; private files in a publicly readable bucket are protected by unguessable keys).

## Supported versions

Only the latest commit on the default branch is supported.
