/**
 * Structured scan logs (Phase 5).
 */

export type ScanLogLevel = 'info' | 'warn' | 'error';

export function scanLog(
  level: ScanLogLevel,
  message: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: 'glintscanner',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
