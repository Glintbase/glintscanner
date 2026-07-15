# SPEC-02 — Surface Discovery

**Status:** draft  
**Phase:** 0–1  
**Related tasks:** T1.13, T1.14, H3, H4, H7  

## 1. Purpose

Discover and classify product ecosystem surfaces with **validated** presence signals.

## 2. Surface types (canonical)

| type | Required? | Discovery method |
|------|-----------|------------------|
| landing | yes | origin / user URL host home |
| docs | yes | homepage links + user URL if docs-like |
| github | no | homepage / README links |
| api | no | /api-reference etc. |
| openapi | no | known paths + content parse |
| llms_txt | no | `/llms.txt`, `/.well-known/llms.txt` |
| llms_full_txt | no | `/llms-full.txt` |
| mcp | no | `/mcp.json`, well-known |
| sitemap | no | robots + `/sitemap.xml` |
| auth | no | login/signup links |
| dashboard | no | app/dashboard links |
| support | no | help/support |
| blog | no | /blog |
| changelog | no | /changelog, /releases |
| status | no | statuspage-like hosts/paths |
| sdk | no | /sdk, /libraries, /client |

## 3. Status model

```ts
type SurfaceStatus = 'verified' | 'detected' | 'missing' | 'skipped' | 'invalid';
```

| status | Meaning |
|--------|---------|
| verified | Fetched and content-validated |
| detected | Link found and reachable; light validation |
| missing | Not found or unreachable |
| skipped | User disabled in customizer |
| invalid | Found but failed content validation (e.g. empty llms, HTML soft-404) |

## 4. Content validation rules

### 4.1 llms.txt / llms-full.txt

- Must be `text/*` or unknown text-ish body  
- Body length ≥ 40 chars after trim  
- Prefer non-HTML (if body looks like full HTML error page → `invalid`)  
- Quality signals (for scoring, not found flag): outbound links count, headers  

### 4.2 OpenAPI

- JSON or YAML parse succeeds  
- Has `openapi` or `swagger` field  
- Has non-empty `paths` object  

### 4.3 MCP

- JSON parse succeeds  
- Object with recognizable MCP server shape OR non-empty tools/list key (document final shape in implementation)  

### 4.4 Existence probes

- Prefer **GET** over HEAD  
- Accept 200–399, 401, 403 as “exists” for human surfaces  
- Machine entrypoints require 200 + content validation  

## 5. User URL seeding

If input URL path or host matches docs patterns (`docs.`, `/docs`, mintlify, etc.):

- Always set `docs` surface candidate to input URL first  
- Always enqueue input URL in crawl seeds  

## 6. Enabled surfaces

`options.enabledSurfaces: string[]`  

- Empty/undefined → all enabled  
- Disabled → `status: skipped`, `found: false`  
- Scoring denominators exclude skipped (already partially true)  

## 7. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-02.1 | Empty llms body not `verified` |
| AC-02.2 | OpenAPI HTML 200 page not `verified` |
| AC-02.3 | User docs URL becomes docs seed |
| AC-02.4 | Skipped surfaces excluded from max score denominator |
| AC-02.5 | No UI row for surfaces never implemented OR implement landing/status/sdk |

## 8. Non-goals

- Full site map of every marketing page  
- Authenticated dashboard verification beyond HTTP reachability  
