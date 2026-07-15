# SPEC-01 — URL Policy (SSRF, Caps, Safety)

**Status:** draft  
**Phase:** 5 (partial guards earlier OK)  
**Related tasks:** T5.01, T5.02, T5.03, T5.09  

## 1. Purpose

Prevent the scanner from becoming an open proxy / SSRF gadget and bound resource use.

## 2. Allowed inputs

- Schemes: `https:` required in production; `http:` allowed only if `ALLOW_HTTP=true` (dev).  
- Must parse with WHATWG URL.  
- Hostname required; no credentials in URL (`user:pass@`).  

## 3. Blocked destinations (SSRF)

Reject before fetch if hostname resolves to or is:

| Category | Examples |
|----------|----------|
| Loopback | `127.0.0.0/8`, `::1` |
| Link-local | `169.254.0.0/16`, `fe80::/10` |
| Private | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` |
| CGNAT | `100.64.0.0/10` |
| Metadata | `169.254.169.254`, `metadata.google.internal` |
| Unspecified | `0.0.0.0`, `::` |

Also block:

- DNS rebinding: re-check IP after resolve when possible  
- Non-DNS hosts that are raw IPs in blocked ranges  
- Ports other than 80/443 unless allowlisted  

Return: `400` + stream error code `SSRF_BLOCKED`.

## 4. Resource caps (defaults)

| Cap | Quick profile | Deep profile (later) |
|-----|---------------|----------------------|
| maxPages | 15 | 50 |
| maxDurationMs | 45_000 | 180_000 |
| maxBytesPerResource | 2_000_000 | 5_000_000 |
| maxRedirects | 5 | 5 |
| concurrentFetches | 3 | 5 |

## 5. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-01.1 | `http://127.0.0.1/` rejected |
| AC-01.2 | `http://169.254.169.254/` rejected |
| AC-01.3 | Valid public https URL accepted |
| AC-01.4 | Oversized body aborted; page marked `too_large` |
| AC-01.5 | Zod schema rejects empty url, non-string, missing field |

## 6. Non-goals

- Full robots.txt legal compliance suite (basic respect is Phase 1+)  
- Authenticated crawl of private networks  
