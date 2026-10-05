# Security Policy

## Supported versions

Security fixes go into the latest 1.x release. Upgrading within 1.x is safe by design (see
[Upgrades](README.md#upgrades-and-the-10-promise)), so the fix for a problem in 1.2 is to upgrade
to the newest 1.x, not a patched 1.2.

| Version | Supported |
|---|---|
| 1.x (latest) | Yes |
| 0.x | No. Upgrade to 1.x; your data migrates automatically. |

## Reporting a vulnerability

Please report it privately through GitHub: on the repository's **Security** tab, choose
**Report a vulnerability**. That opens a private advisory only the maintainer can see.

Please don't open a public issue for a security problem. Include what you found, how to reproduce
it, and the version (shown in the footer of every page). You'll get an acknowledgment within a week.
Once a fix is released, the advisory is published with credit to you unless you'd rather not be
named.

## What's in scope

RaptorTracker is a single-owner app that people run on their own servers, often a Raspberry Pi on
a home network and sometimes on the internet behind a reverse proxy. Reports that matter most:

- Reading or changing data without signing in
- Reaching files outside the data directory (uploads, backups, restores, imports)
- Running code on the server, including through a crafted backup, import, or upload
- Getting around the sign-in rate limit, or session problems that outlive a sign-out
- Anything that sends the owner's records somewhere other than what the README's
  [What leaves your server](README.md#what-leaves-your-server) table lists

Out of scope: problems that need the owner's password, attacks that need someone already on the
server, and denial of service from an authenticated session (the only signed-in user is the
owner).

## Known advisories that don't affect the app

`npm audit` reports these, and they've been reviewed:

| Package | Where it runs | Why it doesn't apply |
|---|---|---|
| `braces`, `micromatch`, `fast-glob`, `chokidar` (via Tailwind CSS 3) | Building the client | The denial-of-service needs attacker-supplied glob patterns. The only patterns are in this project's own `tailwind.config.js`. Nothing from Tailwind's build tooling ships to the server or the browser. |
| `braces` (via `nodemon`) | Development only | `nodemon` is a dev dependency for `npm run dev` and isn't installed in production (`npm ci --omit=dev`, the Docker image, or `install.sh`). |

`npm audit --omit=dev` on the server reports no vulnerabilities.

## How the app protects itself

The README's [Security](README.md#security) section covers what an owner should configure. The
code-level defenses, each with tests in `test/security.js`, include: archive extraction that
refuses path traversal, symlinks, and decompression bombs; an allowlist of upload file types;
attachment deletes confined to the uploads directory; uploaded files served only to a signed-in
session; security headers including a content security policy; and a production start that
refuses placeholder secrets.
