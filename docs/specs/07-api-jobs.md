# SPEC-07 — API & Job Model

**Status:** draft  
**Phase:** 5  
**Related tasks:** T5.04–T5.07, H9, H10  

## 1. Purpose

Reliable scan execution with durable status and shareable results.

## 2. Endpoints (target)

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/scans` | Create scan job; returns `{ id, status }` |
| GET | `/api/scans/:id` | Status + result if complete |
| GET | `/api/scans/:id/events` | SSE or NDJSON progress (optional) |
| POST | `/api/scan` | **Legacy** sync stream; keep until clients migrate |
| GET | `/api/badge/:id` | SVG badge from score |

## 3. Status machine

```
queued → running → complete
                 ↘ failed
```

```ts
type ScanStatus = 'queued' | 'running' | 'complete' | 'failed';
```

## 4. Create scan request

```ts
// Zod
{
  url: string.url(),
  options?: {
    enabledSurfaces?: string[],
    profile?: 'quick' | 'deep'
  }
}
```

Response `202`:

```json
{ "id": "uuid", "status": "queued", "poll_url": "/api/scans/uuid" }
```

## 5. Persistence rules

- Insert row first with `status=queued`  
- Worker sets `running`, writes phase progress (optional table or jsonb)  
- On complete: score, checks, nodes, edges, `duration_ms`  
- On fail: `error` message (safe for user), no partial FK breaks  
- **Do not** hard-delete previous URL rows; mark `is_latest` or order by `created_at`  

## 6. Slug resolution

- On complete, set `company_slug = deriveCompanySlug(url)`  
- `getScanBySlug` queries `.eq('company_slug', slug).order('created_at', { ascending: false }).limit(1)`  
- No full table scan  

## 7. Rate limiting

- Prod: required (Upstash or equivalent)  
- Default: 5 scans / IP / hour (anonymous)  
- 429 with retry-after  

## 8. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-07.1 | Create returns id before crawl finishes |
| AC-07.2 | Failed job never leaves orphan edges without scan |
| AC-07.3 | Slug lookup O(1) indexed |
| AC-07.4 | History retained for same URL |
| AC-07.5 | Legacy `/api/scan` still works during migration |

## 9. Non-goals

- Multi-region job routing  
- User accounts (later)  
