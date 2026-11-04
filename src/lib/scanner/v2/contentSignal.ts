/**
 * Content Signals (contentsignals.org): `Content-Signal: search=yes, ai-input=yes, ai-train=no`,
 * declared per user-agent group in robots.txt and, by some CDNs (e.g. Cloudflare's Markdown for
 * Agents), as an HTTP response header. ARS 3.4 S1 compares the two (content-signal-consistency).
 */

/** robots.txt lines without '#' comments, lowercased (same rule as probes/discovery). */
function robotsDirectiveLines(body: string): string[] {
  return body
    .toLowerCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

export type SignalValues = Record<string, 'yes' | 'no'>;

export interface ContentSignalGroup {
  userAgents: string[];
  values: SignalValues;
}

/** `search=yes, ai-train=no` → { search: 'yes', 'ai-train': 'no' }. Unknown values are dropped. */
export function parseSignalValues(value?: string | null): SignalValues {
  const out: SignalValues = {};
  for (const part of (value || '').split(/[,;]/)) {
    const m = part.trim().toLowerCase().match(/^([a-z0-9-]+)\s*=\s*(yes|no)$/);
    if (m) out[m[1]] = m[2] as 'yes' | 'no';
  }
  return out;
}

/** `Content-Signal` directives in robots.txt, with the user-agent group each one belongs to. */
export function parseContentSignal(robotsBody: string): ContentSignalGroup[] {
  const groups: ContentSignalGroup[] = [];
  let agents: string[] = [];
  let inDirectives = false;
  for (const line of robotsDirectiveLines(robotsBody)) {
    if (line.startsWith('user-agent:')) {
      if (inDirectives) {
        agents = [];
        inDirectives = false;
      }
      agents.push(line.slice(11).trim());
      continue;
    }
    inDirectives = true;
    if (!line.startsWith('content-signal:')) continue;
    const values = parseSignalValues(line.slice(15));
    if (!Object.keys(values).length) continue;
    // A Content-Signal before any User-agent line applies to everyone.
    groups.push({ userAgents: agents.length ? [...agents] : ['*'], values });
  }
  return groups;
}

/** The robots.txt signals that apply to an unnamed agent: the `*` group's, merged in file order. */
export function robotsSignalsForAnyAgent(groups: ContentSignalGroup[]): SignalValues | undefined {
  const star = groups.filter((g) => g.userAgents.includes('*'));
  if (!star.length) return undefined;
  return Object.assign({}, ...star.map((g) => g.values));
}

export type SignalConsistency = 'agree' | 'conflict' | 'header-only' | 'robots-only' | 'none';

export interface SignalComparison {
  verdict: SignalConsistency;
  /** `surface: key=a vs other: key=b` for each disagreement. */
  conflicts: string[];
}

/**
 * Compares signal sets from several surfaces (robots.txt, the HTML response header, the Markdown
 * response header). Two surfaces conflict when they give different values for the same key;
 * a key only one surface declares is not a conflict.
 */
export function compareSignals(surfaces: Array<{ name: string; values?: SignalValues }>): SignalComparison {
  const declared = surfaces.filter((s) => s.values && Object.keys(s.values).length > 0) as Array<{ name: string; values: SignalValues }>;
  const conflicts: string[] = [];
  for (let i = 0; i < declared.length; i++) {
    for (let j = i + 1; j < declared.length; j++) {
      const a = declared[i];
      const b = declared[j];
      for (const key of Object.keys(a.values)) {
        if (b.values[key] && b.values[key] !== a.values[key]) {
          conflicts.push(`${a.name}: ${key}=${a.values[key]} vs ${b.name}: ${key}=${b.values[key]}`);
        }
      }
    }
  }
  const robots = declared.some((s) => s.name === 'robots.txt');
  const headers = declared.some((s) => s.name !== 'robots.txt');
  const verdict: SignalConsistency = conflicts.length
    ? 'conflict'
    : robots && headers
    ? 'agree'
    : headers
    ? 'header-only'
    : robots
    ? 'robots-only'
    : 'none';
  return { verdict, conflicts };
}
