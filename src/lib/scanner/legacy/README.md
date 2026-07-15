# Legacy V1 scanners (quarantined)

These modules are **not** used by `/api/scan` (V2 pipeline):

- `../checkCode.ts`
- `../checkContext.ts`
- `../checkMachine.ts`
- `../checkTooling.ts`
- `../types.ts` (V1 check result shapes)
- `../../prompts/fixPrompts.ts`

They remain only for historical reference / possible future reintroduction of LLM code audits.

**Do not import them from the V2 API path.** Prefer deleting in a later cleanup once ARS 1.0 ships.
