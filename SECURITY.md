# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` / 0.1.x | Yes |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: **security@glintbase.dev** (or open a private security advisory on the repository if enabled).

Include:

- Description of the issue
- Steps to reproduce
- Impact assessment
- Whether you have a suggested fix

We aim to acknowledge reports within 72 hours.

## Scope of this scanner

Glintscanner **fetches public URLs** on behalf of users. We implement:

- **SSRF guards** — private IPs, loopback, link-local, cloud metadata hosts blocked (`src/lib/scanner/v2/urlPolicy.ts`)
- **Request validation** before scan start
- **Rate limiting** on `/api/scan` (Upstash Redis when configured; in-memory fallback otherwise)
- **Fetch size/time budgets** to limit resource abuse

### Known residual risks

- DNS rebinding after policy check is not fully mitigated without post-resolve IP recheck
- In-memory rate limits are per-process only (use Upstash in production multi-instance)
- Optional Firecrawl / third-party APIs process target URLs under their own policies

## Secure deployment checklist

1. Set `NODE_ENV=production` (HTTPS required for scan targets)
2. Configure `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
3. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser
4. Run `migration.sql` only via trusted Supabase admin access
5. Keep `ALLOW_HTTP=true` **off** in production unless intentionally scanning HTTP-only docs

## Score disputes

Incorrect readiness scores are **not** security issues — open a normal issue with URL, `score_version`, and expected behavior. See [docs/methodology/ars-1.0.md](./docs/methodology/ars-1.0.md).
