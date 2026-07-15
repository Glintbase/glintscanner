# SPEC-08 — UI Integrity Rules

**Status:** draft  
**Phase:** 0  
**Related tasks:** T0.03, T0.10, T0.11, T0.20, C1, C5  

## 1. Purpose

Ensure every user-visible claim is backed by pipeline data. Credibility is a product feature.

## 2. Rules

### R1 — Journey checklist

Any UI section titled or implying agent journeys / simulated actions MUST:

```ts
journeys.traces.map(t => ({
  label: t.label,
  passed: t.success,
  status: t.status,
  hops: t.hopCount,
  pressure: t.hallucinationPressure,
  fix: t.recommendedFix,
}))
```

**Forbidden:** deriving pass/fail from `surfaces[].found` for journey rows.

### R2 — Single score band

Import `scoreBand(score)` from shared module only.  
Forbidden: local threshold tables in page/report/OG.

### R3 — Graph display

Node colors/types MUST use `node.type` from graph payload without remapping that drops types.

### R4 — Missing data

If `journeys` absent (legacy scan): show empty state, not fake passes.

### R5 — Copy honesty

Prefer: “Deterministic agent pathfinder”  
Avoid: “AI reasoned over your docs” unless LLM probe enabled.

### R6 — Encoding

No mojibake; use Lucide icons or valid UTF-8.

### R7 — Share surfaces

Tweet/OG score MUST equal report score for same scan id.

## 3. Components in scope

| Component | Obligations |
|-----------|-------------|
| `ResultsReport.tsx` | R1–R7 |
| `JourneyPanel.tsx` | R1, R5 |
| `ObsidianGraph3D.tsx` | R3 |
| `page.tsx` home | R2 |
| badge + OG routes | R2, R7 |

## 4. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-08.1 | Manual QA: fail journey shows fail in both panels |
| AC-08.2 | Unit/render test optional: mock traces drive checklist |
| AC-08.3 | scoreBand(74) identical from all imports |
| AC-08.4 | No `` sequences in UI strings |

## 5. Non-goals

- Full design system refactor  
- i18n  
