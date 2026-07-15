# SPEC-00 — Scan Report & Stream Contract

**Status:** draft  
**Phase:** 0  
**Owners:** core + API  
**Related tasks:** T0.02, T5.05  

## 1. Purpose

Define the canonical shapes for:

1. NDJSON stream events during a scan  
2. Final `complete` payload  
3. Persisted `public_scans.checks` JSON  

All consumers (UI, API, CLI, badges) MUST use these types.

## 2. Stream events

```ts
type ProgressStatus = 'running' | 'done' | 'warn' | 'failed';

type ScanStreamEvent =
  | {
      type: 'progress';
      check: string; // e.g. discovery | classification | crawling | framework | graph | journey | scoring
      status: ProgressStatus;
      message?: string;
    }
  | {
      type: 'error';
      message: string;
      code?: 'INVALID_URL' | 'SSRF_BLOCKED' | 'UNREACHABLE' | 'TIMEOUT' | 'INTERNAL';
    }
  | {
      type: 'complete';
      id: string | null;
      score: number; // 0–100 integer
      score_version: string; // e.g. "ars-1.0.0" | "discovery-legacy"
      checks: ScanReportPayload;
    };
```

### Rules

- One JSON object per line (NDJSON).  
- `complete` is emitted at most once.  
- After `error` of terminal class, stream closes (no `complete`).  
- Progress `check` values are stable strings for UI grouping.

## 3. ScanReportPayload

```ts
interface ScanReportPayload {
  surfaces: DiscoveredSurface[];
  pages: StoredPage[];          // no raw HTML/MD body in DB
  framework: string;
  graph: ContextGraph | null;   // null when stored relationally
  journeys: JourneySimulation;
  dimensions?: ScoreDimension[];
  meta?: {
    duration_ms?: number;
    max_pages?: number;
    score_version: string;
  };
}

interface StoredPage {
  url: string;
  title: string;
  headings: string[];
  codeBlocks: { lang: string; code: string }[];
  wordCount: number;
  contentKind?: 'html' | 'markdown';
  fetchStatus?: FetchStatus;
}
```

### Persistence rules

- Strip raw page bodies before insert (`html` / markdown blob).  
- Graph nodes/edges MAY live in `scan_nodes` / `scan_edges`; `checks.graph` MAY be null.  
- Reconstruct graph for UI on read (see `getScanBySlug`).

## 4. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-00.1 | TypeScript types exist and are imported by `/api/scan` and ResultsReport |
| AC-00.2 | Stream parser on client ignores unknown `type` safely |
| AC-00.3 | DB insert never stores page HTML bodies |
| AC-00.4 | `score_version` always present on `complete` after Phase 4 |

## 5. Non-goals

- WebSocket protocol  
- Binary frames  
- Multipart uploads  
