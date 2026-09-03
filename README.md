# LearnLogos WebMCP Learning Assistant

Ask a natural-language training question and receive a cited result with an
authorized, captioned video excerpt. The same search is exposed as the versioned
`learnlogos.search_training.v1` browser WebMCP tool so a compatible agent can
discover and invoke it.

This repository is a deliberately isolated challenge application. It contains two
exact-digest contest excerpts and the minimum source needed to search and play
them. It contains no production routes, customer data, paid content, production
credentials, or production service adapters.

## What is included

- A Next.js 16 page at `/webmcp-challenge`.
- A browser WebMCP tool and matching HTTP search endpoint.
- Short-lived, session-bound media and caption grants.
- Exact-digest verification before media is served.
- Dedicated Redis-backed sessions and layered request budgets.
- Tests for tool registration, policy, isolation, grants, API boundaries, and the
  live public surface.

## Run locally

Use Node.js 20 and pnpm 10.23.0.

```bash
pnpm install --frozen-lockfile
cp environment.example .env.local
```

Replace every placeholder in `.env.local`. Generate independent random values for
the client-hash and media-grant secrets; do not reuse application, authentication,
or Redis credentials. `WEBMCP_CONTEST_MEDIA_ROOT` must be the normalized absolute
path to this repository's `media` directory.

The application deliberately requires an authenticated TLS Redis URL. For any
internet-accessible instance, use a Redis deployment dedicated to this contest app
and configure the trusted reverse proxy to remove incoming copies of
`WEBMCP_CONTEST_CLIENT_IP_HEADER` and set that header itself.

Then run:

```bash
pnpm dev
```

Open `http://localhost:3000/webmcp-challenge` while using a matching local value for
`WEBMCP_CONTEST_HOST`. Useful demonstration questions are:

- `How do I set an exact program scaling percentage?`
- `How do I jump to my next reading and mark it done?`

## Verify the candidate

```bash
pnpm lint
pnpm test
NODE_ENV=production pnpm build
NODE_ENV=production pnpm start
```

The start command copies the generated static assets into Next.js's local
standalone runtime tree before launching it. Build the runtime on the authorized
host; do not publish or copy that generated tree to the public repository.

The live-browser test is intentionally separate because it must target the final
credential-free HTTPS origin:

```bash
WEBMCP_LIVE_ORIGIN=https://challenge.example.com/ pnpm test:live-browser
```

Before enabling a public origin, verify TLS, host routing, trusted-proxy header
replacement, origin-denial behavior, Redis isolation, logs, media playback,
captions, WebMCP registration in a supported browser, and a fresh dependency and
secret scan. Do not publish `.env.local`, build output, a standalone server bundle,
or a container image from this candidate.

## Security and scope

All WebMCP flags default off in code. Contest requests are accepted only when the
configured deployment mode and host match. Content is an approved exact-digest
allowlist; client input cannot select a filesystem path. Playback URLs are
short-lived, scoped to a session and asset version, and checked again at the media
boundary. Search, media, and caption requests share abuse budgets.

These controls reduce risk but do not make a deployment risk-free. Treat any
material security or privacy finding as a stop-ship issue. This source package is
not authorization to deploy against LearnLogos production systems or to reuse any
production database, Redis instance, secrets, host, or customer information.

## License boundary

Eligible LearnLogos source code is licensed under Apache-2.0 in `LICENSE`.
Only the exact-digest LearnLogos-owned contest media and captions identified in
`CONTENT-LICENSE.md` are offered under CC BY 4.0. Dependencies retain their own
licenses in `THIRD-PARTY-NOTICES.md`; unlisted material and third-party names,
marks, interfaces, and content are not relicensed.

Suggested content credit: LearnLogos, “The Ultimate Logos Shortcut List” contest
excerpts (2026), CC BY 4.0. Identify any changes.

LearnLogos is an independent training provider. It is not owned, operated,
sponsored, or endorsed by Logos.
