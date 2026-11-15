/**
 * Glintbase Simulate: navigation probe.
 *
 * A planner walks the target site the way a given harness tends to look for docs. Every step is a
 * real HTTP request (from an E2B sandbox when E2B_API_KEY is set, otherwise from this server).
 * The planner (a free-tier LLM via InferenceRouter, or a fixed path list when none answers) reads
 * each page's title, headings and same-site links, and picks the next page from them.
 * At the end, a model answers the intent from the fetched text and quotes its source; the quote is
 * then checked word for word against what was actually fetched.
 *
 * This is a lightweight stand-in for an agent, not a real harness run (those live in the private
 * Sim Service). Nothing is invented: statuses, sizes, times and model usage are measured; page
 * tokens are estimated from response size (TOKEN_BASIS) and labelled as estimates.
 */

import {
  AgentFileCheck,
  AnswerCheck,
  CanvasCoord,
  HarnessType,
  JourneyExecutionResult,
  JourneyIconType,
  JourneyInsight,
  JourneyInsightRemediation,
  JourneyKPIMetrics,
  JourneyPillNode,
  PlannerUsage,
  ProceduralLine,
  RunMode,
  SimulationOptions,
  TOKEN_BASIS,
  estimateTokensFromBytes,
} from './types';
import { InferenceRouter } from './inferenceRouter';
import { currentScannerUserAgent, fetchResource } from '../v2/fetchResource';
import { PageOutline, outlinePage, quoteAppearsIn, relevantPassages } from './pageOutline';

interface ProbeExecutionResult {
  url: string;
  /** HTTP status, or 0 when the request failed at the network level. */
  status: number;
  ms: number;
  bytes: number;
  /** Response body (capped), used to read the page. Never returned to clients. */
  body?: string;
  error?: string;
}

interface ReadPage {
  path: string;
  url: string;
  outline: PageOutline;
}

const MAX_AGENT_STEPS = 5;
const START: CanvasCoord = { x: 85, y: 135 };
const COL_SPACING = 125;
const ROW_SPACING = 115;
const ANSWER_BUDGET_CHARS = 7000;

const STANDARD_FILES: Array<{ path: string; label: string; iconType: JourneyIconType; expectsText: boolean }> = [
  { path: '/llms.txt', label: 'llms.txt', iconType: 'llms', expectsText: true },
  { path: '/openapi.json', label: 'openapi.json', iconType: 'openapi', expectsText: true },
  { path: '/robots.txt', label: 'robots.txt', iconType: 'docs', expectsText: true },
  { path: '/auth.md', label: 'auth.md', iconType: 'auth', expectsText: true },
];

const HARNESS_STYLE: Record<HarnessType, { label: string; focus: string; fallback: Array<{ path: string; label: string; icon: JourneyIconType }> }> = {
  'claude-code': {
    label: 'Claude Code',
    focus: 'developer guides, quickstarts, setup instructions and llms.txt',
    fallback: [
      { path: '/docs', label: 'docs', icon: 'docs' },
      { path: '/llms.txt', label: 'llms.txt', icon: 'llms' },
      { path: '/docs/quickstart', label: 'quickstart', icon: 'docs' },
      { path: '/docs/authentication', label: 'auth', icon: 'auth' },
      { path: '/docs/api', label: 'api-docs', icon: 'docs' },
    ],
  },
  cursor: {
    label: 'Cursor',
    focus: 'API reference, OpenAPI schemas and type definitions',
    fallback: [
      { path: '/docs', label: 'docs', icon: 'docs' },
      { path: '/openapi.json', label: 'openapi', icon: 'openapi' },
      { path: '/api', label: 'api', icon: 'api' },
      { path: '/docs/api', label: 'api-docs', icon: 'docs' },
      { path: '/reference', label: 'reference', icon: 'docs' },
    ],
  },
  perplexity: {
    label: 'Perplexity',
    focus: 'long-form guides, FAQs and overview pages',
    fallback: [
      { path: '/docs', label: 'docs', icon: 'docs' },
      { path: '/guides', label: 'guides', icon: 'docs' },
      { path: '/faq', label: 'faq', icon: 'docs' },
      { path: '/llms.txt', label: 'llms.txt', icon: 'llms' },
      { path: '/about', label: 'about', icon: 'docs' },
    ],
  },
  openclaw: {
    label: 'OpenClaw',
    focus: 'navigation links, onboarding, pricing and product pages',
    fallback: [
      { path: '/pricing', label: 'pricing', icon: 'sparkles' },
      { path: '/docs', label: 'docs', icon: 'docs' },
      { path: '/getting-started', label: 'onboarding', icon: 'docs' },
      { path: '/about', label: 'about', icon: 'docs' },
      { path: '/faq', label: 'faq', icon: 'docs' },
    ],
  },
  hermes: {
    label: 'Hermes Agent',
    focus: 'machine-readable files: openapi.json, .well-known files, llms.txt',
    fallback: [
      { path: '/openapi.json', label: 'openapi', icon: 'openapi' },
      { path: '/.well-known/ard.json', label: 'ard.json', icon: 'openapi' },
      { path: '/llms.txt', label: 'llms.txt', icon: 'llms' },
      { path: '/docs/api', label: 'api-docs', icon: 'docs' },
      { path: '/docs', label: 'docs', icon: 'docs' },
    ],
  },
  opencode: {
    label: 'OpenCode',
    focus: 'REST endpoints, curl examples, auth headers and SDK samples',
    fallback: [
      { path: '/api', label: 'api', icon: 'api' },
      { path: '/docs/authentication', label: 'auth', icon: 'auth' },
      { path: '/developers', label: 'developers', icon: 'docs' },
      { path: '/docs', label: 'docs', icon: 'docs' },
      { path: '/docs/api', label: 'api-docs', icon: 'docs' },
    ],
  },
};

const VALID_ICONS: JourneyIconType[] = ['docs', 'api', 'openapi', 'auth', 'llms', 'sparkles'];

const isReachable = (status: number) => status >= 200 && status < 400;
const formatKb = (bytes: number) => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`);
const seconds = (startMs: number) => Number(((Date.now() - startMs) / 1000).toFixed(1));
const pathOf = (url: string) => {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return url;
  }
};

function parseJsonObject(text: string): any | null {
  const m = (text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export class E2BRunner {
  /**
   * Normalises user input into an absolute URL ("stripe" -> "https://stripe.com"),
   * stripping localhost and repeated schemes.
   */
  static async resolveTargetUrl(input: string): Promise<string> {
    let raw = (input || '').trim();
    if (!raw) return 'https://stripe.com';

    let scheme = 'https://';
    if (/^http:\/\//i.test(raw)) scheme = 'http://';

    raw = raw.replace(/^(https?:\/\/)+/gi, '');
    raw = raw.replace(/^localhost(:\d+)?\/?/i, '');
    raw = raw.replace(/^127\.0\.0\.1(:\d+)?\/?/i, '');

    if (!raw.includes('.') && !raw.includes('/')) {
      raw = `${raw}.com`;
    }

    raw = raw.replace(/\/+$/, '');
    return `${scheme}${raw}`;
  }

  /**
   * Turns a planner-chosen path into a clean relative pathname so the host can never change.
   */
  static sanitizeNextPath(rawPath: string, domain: string): string {
    let p = (rawPath || '').trim();

    if (/^https?:\/\//i.test(p)) {
      try {
        const u = new URL(p);
        p = u.pathname + u.search;
      } catch {
        p = p.replace(/^https?:\/\/[^/]+/i, '');
      }
    }

    p = p.replace(/^https?:\/\/localhost(:\d+)?/i, '');
    p = p.replace(/^localhost(:\d+)?/i, '');
    p = p.replace(/^https?:\/\/127\.0\.0\.1(:\d+)?/i, '');
    p = p.replace(/^127\.0\.0\.1(:\d+)?/i, '');

    if (domain) {
      const escapedDomain = domain.replace(/\./g, '\\.');
      p = p.replace(new RegExp(`^\\/?${escapedDomain}`, 'i'), '');
    }

    p = p.replace(/^\/?[a-zA-Z0-9-]+\.(com|org|io|net|dev|app|ai|co|xyz|so)/i, '');

    if (!p.startsWith('/')) {
      p = '/' + p;
    }

    p = p.replace(/\/+/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');

    return p || '/';
  }

  /**
   * Runs one probe. mode 'deterministic' = preview (no agent). Otherwise E2B when configured,
   * falling back to server-side fetches; the result's `mode` says which actually ran.
   */
  static async runMission(
    options: SimulationOptions,
    onProgress?: (event: any) => void
  ): Promise<JourneyExecutionResult> {
    const target = await this.resolveTargetUrl(options.target);
    const domain = target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const intent = options.intent || `Find the API docs and how to authenticate for ${domain}`;
    const harness = (options.harness || options.agent || 'claude-code') as HarnessType;

    if (options.mode === 'deterministic') {
      return await this.runPreview(target, intent, harness, onProgress);
    }

    const e2bKey = process.env.E2B_API_KEY;
    if (e2bKey) {
      try {
        return await this.runInE2B(target, intent, harness, e2bKey, onProgress);
      } catch (err: any) {
        console.warn('[E2BRunner] E2B run failed, falling back to server-side fetches:', err?.message || err);
        onProgress?.({ type: 'terminal_log', log: `[glintbase] E2B sandbox unavailable (${err?.message || 'error'}); continuing with server-side fetches.` });
      }
    }

    return await this.runInProcess(target, intent, harness, onProgress);
  }

  // ─── Execution backends ────────────────────────────────────────────────────

  private static async runInE2B(
    target: string,
    intent: string,
    harness: HarnessType,
    e2bKey: string,
    onProgress?: (event: any) => void
  ): Promise<JourneyExecutionResult> {
    const { Sandbox } = await import('@e2b/code-interpreter');
    const startTime = Date.now();
    let sbx: any = null;
    try {
      sbx = await Sandbox.create({ apiKey: e2bKey, timeoutMs: 120000 });
      const bootMs = Date.now() - startTime;
      const userAgent = currentScannerUserAgent();

      const probeExecutor = async (url: string): Promise<ProbeExecutionResult> => {
        // The URL is planner-chosen (untrusted): pass it base64-encoded so it can't break out of the string.
        const urlB64 = Buffer.from(String(url), 'utf-8').toString('base64');
        const uaB64 = Buffer.from(userAgent, 'utf-8').toString('base64');
        const probeScript = `
import base64, json, time, urllib.request, urllib.error
u = base64.b64decode("${urlB64}").decode('utf-8')
ua = base64.b64decode("${uaB64}").decode('utf-8')
start = time.time()
out = {"url": u, "status": 0, "bytes": 0, "body": ""}
try:
    req = urllib.request.Request(u, headers={'User-Agent': ua, 'Accept': 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.8'})
    with urllib.request.urlopen(req, timeout=6) as resp:
        raw = resp.read(2000000)
        out.update(status=resp.status, bytes=len(raw), body=raw[:300000].decode('utf-8', errors='ignore'))
except urllib.error.HTTPError as e:
    out.update(status=e.code)
except Exception as e:
    out.update(error=str(e)[:160])
out["ms"] = int((time.time() - start) * 1000)
print("PROBE_RESULT:" + json.dumps(out))
`;
        const execResult = await sbx.runCode(probeScript);
        const outputText = execResult.logs?.stdout?.join('') || execResult.text || '';
        const idx = outputText.indexOf('PROBE_RESULT:');
        if (idx >= 0) {
          try {
            return JSON.parse(outputText.slice(idx + 'PROBE_RESULT:'.length).trim().split('\n')[0]);
          } catch {}
        }
        return { url, status: 0, ms: 0, bytes: 0, error: 'sandbox probe produced no result' };
      };

      return await this.executeNavigationLoop({ target, intent, harness, mode: 'e2b', bootMs, probeExecutor, startTime, onProgress });
    } finally {
      if (sbx) {
        try {
          await sbx.kill();
        } catch {}
      }
    }
  }

  private static async runInProcess(
    target: string,
    intent: string,
    harness: HarnessType,
    onProgress?: (event: any) => void
  ): Promise<JourneyExecutionResult> {
    return await this.executeNavigationLoop({
      target,
      intent,
      harness,
      mode: 'in_process',
      bootMs: 0,
      probeExecutor: (url) => this.fetchProbe(url, 6000),
      startTime: Date.now(),
      onProgress,
    });
  }

  /** Server-side probe through fetchResource (URL policy, honest user agent, redirect checks). */
  private static async fetchProbe(url: string, timeoutMs: number): Promise<ProbeExecutionResult> {
    const start = Date.now();
    const res = await fetchResource(url, { timeoutMs }).catch((e: any) => ({ httpStatus: 0, error: String(e?.message || e) }) as any);
    return {
      url,
      status: res?.httpStatus || 0,
      ms: Date.now() - start,
      bytes: res?.bytes ?? (res?.body ? Buffer.byteLength(res.body) : 0),
      body: res?.body,
      error: res?.httpStatus ? undefined : res?.error || res?.status,
    };
  }

  // ─── Standard agent-file checks (made by Glintbase, not by the agent) ─────

  static async checkAgentFiles(baseUrl: string): Promise<AgentFileCheck[]> {
    return await Promise.all(
      STANDARD_FILES.map(async (f) => {
        const url = `${baseUrl}${f.path}`;
        const start = Date.now();
        const res: any = await fetchResource(url, { timeoutMs: 5000 }).catch(() => null);
        const httpStatus = res?.httpStatus || 0;
        const bytes = res?.bytes ?? (res?.body ? Buffer.byteLength(res.body) : 0);
        const isHtml = /text\/html/i.test(res?.contentType || '') || /^\s*<(!doctype|html)/i.test(res?.body || '');
        let found = false;
        let note: string;
        if (!res || !httpStatus) {
          note = 'unreachable (network error)';
        } else if (res.status === 'soft_404') {
          note = `returned a "not found" page with HTTP ${httpStatus}`;
        } else if (!res.ok) {
          note = `not found (HTTP ${httpStatus})`;
        } else if (f.expectsText && isHtml) {
          note = `returned an HTML page (HTTP ${httpStatus}), not the file`;
        } else {
          found = true;
          note = `found (HTTP ${httpStatus}, ${formatKb(bytes)})`;
        }
        return { path: f.path, url, httpStatus, found, bytes, ms: Date.now() - start, note };
      })
    );
  }

  // ─── Navigation loop ────────────────────────────────────────────────────────

  private static async executeNavigationLoop(params: {
    target: string;
    intent: string;
    harness: HarnessType;
    mode: RunMode;
    bootMs: number;
    probeExecutor: (url: string) => Promise<ProbeExecutionResult>;
    startTime: number;
    onProgress?: (event: any) => void;
  }): Promise<JourneyExecutionResult> {
    const { target, intent, harness, mode, bootMs, probeExecutor, startTime, onProgress } = params;
    const baseUrl = target.replace(/\/$/, '');
    const domain = target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const style = HARNESS_STYLE[harness] || HARNESS_STYLE['claude-code'];
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, isTest ? 1 : ms));
    const usage: PlannerUsage = { calls: 0, totalTokens: 0 };

    const terminalLogs: string[] = [];
    const emitLog = (log: string) => {
      terminalLogs.push(log);
      onProgress?.({ type: 'terminal_log', log });
    };

    emitLog(
      mode === 'e2b'
        ? `[glintbase] E2B sandbox ready in ${bootMs}ms; agent steps are fetched from inside it.`
        : `[glintbase] No sandbox configured; agent steps are fetched by the Glintbase server.`
    );
    emitLog(`[glintbase] Navigation style: ${style.label} (${style.focus})`);
    emitLog(`[glintbase] Target: ${target}`);
    emitLog(`[glintbase] Intent: "${intent}"`);
    emitLog(`[glintbase] The planner reads each page's title, headings and links, then picks the next page.\n`);

    onProgress?.({ type: 'agent_spawn', harness, startCoord: START, timestamp: Date.now() });
    onProgress?.({ type: 'ticker_update', text: '● Starting run...', subText: '1 step' });

    // Step 1: homepage (agent request) + agent-file checks (Glintbase requests).
    const [apexProbe, agentFileChecks] = await Promise.all([probeExecutor(target), this.checkAgentFiles(baseUrl)]);
    const apexOk = isReachable(apexProbe.status);
    const homeOutline = outlinePage(apexOk ? apexProbe.body || '' : '', target);
    emitLog(
      `[${harness}@step-1] GET / -> ${apexProbe.status ? `HTTP ${apexProbe.status}` : `network error${apexProbe.error ? ` (${apexProbe.error})` : ''}`} (${apexProbe.ms}ms, ${formatKb(apexProbe.bytes)}, ${homeOutline.links.length} same-site links)`
    );
    for (const c of agentFileChecks) emitLog(`[glintbase] Check ${c.path}: ${c.note}`);

    const rootNode: JourneyPillNode = {
      id: 'node_0',
      label: 'home',
      iconType: 'home',
      status: apexOk ? 'pass' : 'fail',
      httpStatus: apexProbe.status,
      bytes: apexProbe.bytes,
      tokens: estimateTokensFromBytes(apexProbe.bytes),
      latencyMs: apexProbe.ms,
      url: target,
      row: 0,
      col: 0,
      coord: { ...START },
      thought: apexOk
        ? `Opened the ${domain} homepage${homeOutline.title ? ` ("${homeOutline.title.slice(0, 60)}")` : ''}: HTTP ${apexProbe.status}, ${formatKb(apexProbe.bytes)}, ${homeOutline.links.length} same-site links.`
        : `The ${domain} homepage did not answer (${apexProbe.status ? `HTTP ${apexProbe.status}` : 'network error'}).`,
      isDeadEnd: !apexOk,
      decidedBy: 'standard_check',
    };

    const nodes: JourneyPillNode[] = [rootNode];
    const lines: ProceduralLine[] = [];
    let runningTokens = rootNode.tokens;
    let llmSteps = 0;
    const planners = new Set<string>();
    const pagesRead: ReadPage[] = [];
    if (apexOk) pagesRead.push({ path: '/', url: target, outline: homeOutline });

    // Where each link was first seen, so a dead end can be traced to the page that links to it.
    const linkSource = new Map<string, string>();
    const registerLinks = (outline: PageOutline, sourcePath: string) => {
      for (const l of outline.links) if (!linkSource.has(l.path) && l.path !== sourcePath) linkSource.set(l.path, sourcePath);
    };
    registerLinks(homeOutline, '/');

    onProgress?.({ type: 'node_materialized', node: rootNode });
    onProgress?.({ type: 'agent_reaction', reaction: apexOk ? 'nod' : 'nope', thought: rootNode.thought, targetNodeId: rootNode.id });
    onProgress?.(apexOk
      ? { type: 'agent_nod', targetNodeId: rootNode.id, message: `Reached ${domain}` }
      : { type: 'agent_nope', targetNodeId: rootNode.id, message: `${domain} did not answer` });
    onProgress?.({ type: 'telemetry_tick', stepsCount: 1, durationSeconds: seconds(startTime), tokensBurned: runningTokens, reasoningStepsCount: 0 });
    await pause(250);

    const visitedPaths: Array<{ path: string; status: number }> = [{ path: '/', status: apexProbe.status }];
    let hub = rootNode;
    let hubPage: ReadPage = { path: '/', url: target, outline: homeOutline };

    if (apexOk) {
      for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
        onProgress?.({ type: 'ticker_update', text: '● Reading the page and choosing the next one...', subText: `${step + 1} steps` });
        onProgress?.({ type: 'agent_reaction', reaction: 'thinking', thought: `Reading ${hubPage.path} and choosing the next page (${style.label} style)...`, targetNodeId: hub.id });

        const decision = await this.decideNextStep({ harness, domain, target, intent, step, visitedPaths, hubPage, homeOutline, usage });

        if (decision.action === 'stop') {
          if (decision.planner) planners.add(decision.planner);
          llmSteps++;
          emitLog(`[${harness}@step-${step + 1}] Planner stopped: ${decision.thought}`);
          break;
        }

        let cleanPath = this.sanitizeNextPath(decision.nextPath, domain);

        // Never re-request a page: take the next unvisited fallback or page link instead.
        if (visitedPaths.some((v) => v.path === cleanPath)) {
          const alt = [...style.fallback.map((f) => f.path), ...hubPage.outline.links.map((l) => l.path), ...homeOutline.links.map((l) => l.path)]
            .map((p) => this.sanitizeNextPath(p, domain))
            .find((p) => !visitedPaths.some((v) => v.path === p));
          if (!alt) break;
          cleanPath = alt;
          decision.decidedBy = 'fallback_list';
          decision.label = cleanPath.replace(/^\//, '').slice(0, 14) || 'page';
          decision.thought = `Planner repeated a visited page; trying ${cleanPath} instead.`;
        }

        if (decision.decidedBy === 'llm') {
          llmSteps++;
          if (decision.planner) planners.add(decision.planner);
        } else {
          planners.add('fixed path list');
        }

        onProgress?.({ type: 'ticker_update', text: `● Fetching ${cleanPath}`, subText: `${step + 1} steps` });

        const probeUrl = `${baseUrl}${cleanPath}`;
        const probeRes = await probeExecutor(probeUrl);
        visitedPaths.push({ path: cleanPath, status: probeRes.status });

        const isPass = isReachable(probeRes.status);
        const source = linkSource.get(cleanPath);
        const statusText = probeRes.status ? `HTTP ${probeRes.status}` : 'network error';
        const origin = source ? `linked from ${source}` : 'guessed path, not linked from any page opened';
        const outline = isPass ? outlinePage(probeRes.body || '', probeUrl) : null;
        if (outline) {
          registerLinks(outline, cleanPath);
          pagesRead.push({ path: cleanPath, url: probeUrl, outline });
        }

        emitLog(
          `[${harness}@step-${step + 1}] GET ${cleanPath} -> ${statusText} (${probeRes.ms}ms, ${formatKb(probeRes.bytes)}${outline ? `, ${outline.links.length} links` : ''}) [${decision.decidedBy === 'llm' ? 'planner' : 'fallback list'}; ${origin}]`
        );

        const row = isPass ? 0 : 1;
        const coord: CanvasCoord = { x: START.x + step * COL_SPACING, y: START.y + row * ROW_SPACING };

        let remediation: JourneyPillNode['remediation'];
        if (!isPass && source) {
          remediation = {
            title: `Fix the broken link to ${cleanPath}`,
            manualInstruction: `Your page ${source} links to ${cleanPath}, which answered ${statusText}. Fix or redirect it so agents following your own links don't hit a dead end.`,
          };
        }

        const node: JourneyPillNode = {
          id: `node_${step}`,
          parentId: hub.id,
          label: (decision.label || cleanPath.replace(/^\//, '')).slice(0, 14) || 'page',
          iconType: isPass ? decision.iconType : 'error',
          status: isPass ? 'pass' : 'fail',
          httpStatus: probeRes.status,
          bytes: probeRes.bytes,
          tokens: estimateTokensFromBytes(probeRes.bytes),
          latencyMs: probeRes.ms,
          url: probeUrl,
          row,
          col: step,
          coord,
          thought: `${decision.thought} ${statusText}, ${formatKb(probeRes.bytes)}${outline?.title ? `, "${outline.title.slice(0, 60)}"` : ''} (${origin}).`,
          isDeadEnd: !isPass,
          backtrackToId: isPass ? undefined : hub.id,
          decidedBy: decision.decidedBy,
          remediation,
        };
        nodes.push(node);
        runningTokens += node.tokens;

        const line: ProceduralLine = {
          id: `line_${hub.id}_${node.id}`,
          fromId: hub.id,
          toId: node.id,
          fromCoord: hub.coord || START,
          toCoord: coord,
          status: node.status,
          lineType: isPass ? 'solid' : 'dead_end',
          isDrawn: true,
        };
        lines.push(line);

        onProgress?.({ type: 'node_materialized', node });
        onProgress?.({ type: 'line_connected', line });
        onProgress?.({ type: 'agent_navigate', fromCoord: hub.coord || START, toCoord: coord, targetNodeId: node.id, action: `Opening ${cleanPath}`, durationMs: 400 });
        await pause(350);

        if (isPass && outline) {
          onProgress?.({ type: 'agent_reaction', reaction: 'nod', thought: node.thought, targetNodeId: node.id });
          onProgress?.({ type: 'agent_nod', targetNodeId: node.id, message: `${cleanPath}: ${statusText}` });
          hub = node;
          hubPage = { path: cleanPath, url: probeUrl, outline };
        } else {
          emitLog(`[${harness}@backtrack] ${cleanPath} was a dead end (${statusText}); going back to ${hub.label}.`);
          onProgress?.({ type: 'agent_reaction', reaction: 'nope', thought: node.thought, targetNodeId: node.id });
          onProgress?.({ type: 'agent_nope', targetNodeId: node.id, message: `${cleanPath}: ${statusText}` });
          await pause(300);
          onProgress?.({ type: 'ticker_update', text: '● Going back...', subText: `${step + 1} steps` });
          onProgress?.({ type: 'agent_backtrack', fromNodeId: node.id, toNodeId: hub.id, fromCoord: coord, toCoord: hub.coord || START });
        }
        await pause(300);

        onProgress?.({
          type: 'telemetry_tick',
          stepsCount: nodes.length,
          durationSeconds: seconds(startTime),
          tokensBurned: runningTokens,
          reasoningStepsCount: llmSteps,
        });
      }
    }

    // Answer step: can the pages the run opened answer the intent? Checked against fetched text.
    let answerCheck: AnswerCheck | undefined;
    if (apexOk) {
      onProgress?.({ type: 'ticker_update', text: '● Checking whether the pages answer the intent...', subText: `${nodes.length} steps` });
      onProgress?.({ type: 'agent_reaction', reaction: 'thinking', thought: 'Checking the opened pages for an answer...', targetNodeId: hub.id });
      answerCheck = await this.checkAnswer(intent, domain, pagesRead, usage);
      emitLog(`[glintbase] Answer check: ${answerCheck.verdict} (${answerCheck.note})`);
    }

    const planner = planners.size > 0 ? [...planners].join(' + ') : apexOk ? 'none' : 'none (homepage unreachable)';
    emitLog(`\n[glintbase] Run finished in ${seconds(startTime)}s. Planner: ${planner}. Model calls: ${usage.calls}, ${usage.totalTokens.toLocaleString()} tokens (provider-reported).`);

    const goodEnd = answerCheck?.verdict === 'found_with_evidence';
    onProgress?.({ type: 'agent_reaction', reaction: !apexOk ? 'nope' : goodEnd ? 'success' : 'friction', thought: 'Run finished.' });
    onProgress?.({ type: 'ticker_update', text: '● Finished', subText: `${nodes.length} steps` });

    return this.buildResult({
      target,
      intent,
      harness,
      mode,
      planner,
      nodes,
      lines,
      agentFileChecks,
      llmSteps,
      startTime,
      terminalLogs,
      homepageLinks: homeOutline.links.length,
      answerCheck,
      plannerUsage: usage,
    });
  }

  // ─── Preview (no agent) ─────────────────────────────────────────────────────

  /**
   * Preview: fetches the homepage and the standard agent files. No planner, no agent.
   * Used by the hosted MCP tool and for instant runs.
   */
  private static async runPreview(
    target: string,
    intent: string,
    harness: HarnessType,
    onProgress?: (event: any) => void
  ): Promise<JourneyExecutionResult> {
    const startTime = Date.now();
    const baseUrl = target.replace(/\/$/, '');
    const terminalLogs: string[] = [
      `[glintbase] Preview: homepage + standard agent files. No agent runs in preview mode.`,
      `[glintbase] Target: ${target}`,
    ];

    const [apex, agentFileChecks] = await Promise.all([this.fetchProbe(target, 5000), this.checkAgentFiles(baseUrl)]);
    const apexOk = isReachable(apex.status);
    const homeOutline = outlinePage(apexOk ? apex.body || '' : '', target);

    const nodes: JourneyPillNode[] = [
      {
        id: 'node_0',
        label: 'home',
        iconType: 'home',
        status: apexOk ? 'pass' : 'fail',
        httpStatus: apex.status,
        bytes: apex.bytes,
        tokens: estimateTokensFromBytes(apex.bytes),
        latencyMs: apex.ms,
        url: target,
        row: 0,
        col: 0,
        coord: { ...START },
        thought: apexOk
          ? `Homepage answered HTTP ${apex.status} (${formatKb(apex.bytes)}); ${homeOutline.links.length} same-site links.`
          : `Homepage did not answer (${apex.status ? `HTTP ${apex.status}` : 'network error'}).`,
        isDeadEnd: !apexOk,
        decidedBy: 'standard_check',
      },
    ];
    terminalLogs.push(`[glintbase] GET / -> ${apex.status ? `HTTP ${apex.status}` : 'network error'} (${apex.ms}ms, ${formatKb(apex.bytes)})`);

    agentFileChecks.forEach((c, i) => {
      const f = STANDARD_FILES[i];
      const col = i + 1;
      nodes.push({
        id: `node_${col}`,
        parentId: nodes[col - 1].id,
        label: f.label,
        iconType: c.found ? f.iconType : 'error',
        status: c.found ? 'pass' : 'fail',
        httpStatus: c.httpStatus,
        bytes: c.found ? c.bytes : 0,
        tokens: c.found ? estimateTokensFromBytes(c.bytes) : 0,
        latencyMs: c.ms,
        url: c.url,
        row: 0,
        col,
        coord: { x: START.x + col * 145, y: START.y },
        thought: `Checked ${c.path}: ${c.note}.`,
        isDeadEnd: !c.found,
        decidedBy: 'standard_check',
      });
      terminalLogs.push(`[glintbase] Check ${c.path}: ${c.note}`);
    });

    const lines: ProceduralLine[] = nodes.slice(1).map((n, i) => ({
      id: `line_${nodes[i].id}_${n.id}`,
      fromId: nodes[i].id,
      toId: n.id,
      fromCoord: nodes[i].coord!,
      toCoord: n.coord!,
      status: n.status,
      lineType: n.status === 'pass' ? 'solid' : 'dead_end',
      isDrawn: true,
    }));

    if (onProgress) {
      onProgress({ type: 'agent_spawn', harness, startCoord: START, timestamp: Date.now() });
      let tokens = 0;
      nodes.forEach((node, i) => {
        tokens += node.tokens;
        onProgress({ type: 'node_materialized', node });
        const line = lines.find((l) => l.toId === node.id);
        if (line) onProgress({ type: 'line_connected', line });
        onProgress({ type: 'agent_navigate', fromCoord: line?.fromCoord || START, toCoord: node.coord!, targetNodeId: node.id, action: `Checking ${node.label}`, durationMs: 10 });
        onProgress({ type: 'agent_reaction', reaction: node.status === 'pass' ? 'nod' : 'nope', thought: node.thought, targetNodeId: node.id });
        onProgress({ type: 'telemetry_tick', stepsCount: i + 1, durationSeconds: seconds(startTime), tokensBurned: tokens, reasoningStepsCount: 0 });
      });
      onProgress({ type: 'ticker_update', text: '● Finished', subText: `${nodes.length} checks` });
    }

    return this.buildResult({
      target,
      intent,
      harness,
      mode: 'preview',
      planner: 'none (preview: fixed checks only)',
      nodes,
      lines,
      agentFileChecks,
      llmSteps: 0,
      startTime,
      terminalLogs,
      homepageLinks: homeOutline.links.length,
    });
  }

  // ─── Result, KPIs and insight (facts only) ─────────────────────────────────

  private static buildResult(p: {
    target: string;
    intent: string;
    harness: HarnessType;
    mode: RunMode;
    planner: string;
    nodes: JourneyPillNode[];
    lines: ProceduralLine[];
    agentFileChecks: AgentFileCheck[];
    llmSteps: number;
    startTime: number;
    terminalLogs: string[];
    homepageLinks: number;
    answerCheck?: AnswerCheck;
    plannerUsage?: PlannerUsage;
  }): JourneyExecutionResult {
    const { nodes, agentFileChecks } = p;
    const domain = p.target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const reached = nodes.filter((n) => n.status === 'pass').length;
    const kpis: JourneyKPIMetrics = {
      pagesReachedPct: nodes.length ? Math.round((reached / nodes.length) * 100) : 0,
      deadEnds: nodes.filter((n) => n.status === 'fail').length,
      agentFilesFound: agentFileChecks.filter((c) => c.found).length,
      agentFilesChecked: agentFileChecks.length,
    };
    const tokensBurned = nodes.reduce((s, n) => s + n.tokens, 0);
    const homepageOk = nodes[0]?.status === 'pass';

    return {
      target: p.target,
      intent: p.intent,
      harness: p.harness,
      status: homepageOk ? 'success' : 'failed',
      mode: p.mode,
      planner: p.planner,
      tokenBasis: TOKEN_BASIS,
      telemetry: {
        stepsCount: nodes.length,
        reasoningStepsCount: p.llmSteps,
        durationSeconds: seconds(p.startTime),
        tokensBurned,
      },
      nodes,
      lines: p.lines,
      kpis,
      agentFileChecks,
      answerCheck: p.answerCheck,
      plannerUsage: p.plannerUsage,
      insight: this.buildInsight({ ...p, domain, kpis, tokensBurned }),
      terminalLogs: p.terminalLogs,
    };
  }

  private static buildInsight(p: {
    domain: string;
    intent: string;
    harness: HarnessType;
    mode: RunMode;
    planner: string;
    nodes: JourneyPillNode[];
    agentFileChecks: AgentFileCheck[];
    kpis: JourneyKPIMetrics;
    tokensBurned: number;
    homepageLinks: number;
    answerCheck?: AnswerCheck;
    plannerUsage?: PlannerUsage;
  }): JourneyInsight {
    const { domain, mode, nodes, agentFileChecks, kpis, answerCheck } = p;
    const style = HARNESS_STYLE[p.harness] || HARNESS_STYLE['claude-code'];
    const where = mode === 'e2b' ? 'from an E2B sandbox' : 'from the Glintbase server';
    const homepage = nodes[0];
    const deadEndWord = kpis.deadEnds === 1 ? 'dead end' : 'dead ends';

    const answerSentence: Record<AnswerCheck['verdict'], string> = {
      found_with_evidence: 'The pages it opened answer the intent, and the supporting quote was found word for word in a fetched page.',
      claimed_unsupported: 'A model claimed an answer, but its quote does not appear in any fetched page, so the answer is unsupported.',
      not_found: 'The pages it opened do not answer the intent.',
      not_checked: 'Whether the pages answer the intent was not checked (no model available).',
    };

    let summary: string;
    if (homepage?.status !== 'pass') {
      summary = `The ${domain} homepage did not answer (${homepage?.httpStatus ? `HTTP ${homepage.httpStatus}` : 'network error'}), so nothing else could be explored.`;
    } else if (mode === 'preview') {
      summary = `Preview of ${domain}: Glintbase fetched the homepage and checked ${kpis.agentFilesChecked} standard agent files (${kpis.agentFilesFound} found). No agent ran.`;
    } else {
      summary =
        `${style.label}-style navigation of ${domain}: ${nodes.length} pages requested ${where}, ` +
        `${nodes.length - kpis.deadEnds} reachable and ${kpis.deadEnds} ${deadEndWord}. ` +
        `Pages were chosen by ${p.planner}, reading each page's title, headings and links. ` +
        (answerCheck ? answerSentence[answerCheck.verdict] + ' ' : '') +
        `This is a lightweight stand-in for an agent, not a real ${style.label} run.`;
    }

    const bullets: string[] = [];
    if (answerCheck) {
      if (answerCheck.verdict === 'found_with_evidence') {
        bullets.push(`Answer: ${answerCheck.answer} (quote verified on ${pathOf(answerCheck.sourceUrl || '')}).`);
      } else {
        bullets.push(`Answer check: ${answerCheck.note}`);
      }
    }
    for (const c of agentFileChecks) bullets.push(`${c.path}: ${c.note}.`);
    if (homepage?.status === 'pass') bullets.push(`Homepage: ${p.homepageLinks} same-site links found.`);
    for (const n of nodes.slice(1)) {
      if (n.status === 'fail' && n.decidedBy !== 'standard_check') {
        bullets.push(`Dead end: ${n.url ? pathOf(n.url) : n.label} answered ${n.httpStatus ? `HTTP ${n.httpStatus}` : 'with a network error'}.`);
      }
    }
    if (p.plannerUsage && p.plannerUsage.calls > 0) {
      bullets.push(`Model usage: ${p.plannerUsage.calls} calls, ${p.plannerUsage.totalTokens.toLocaleString()} tokens (reported by the provider).`);
    }
    bullets.push(`Page tokens (${p.tokensBurned.toLocaleString()}) are estimates: response bytes ÷ 4. Times and statuses are measured.`);

    const remediations: JourneyInsightRemediation[] = [];
    const llms = agentFileChecks.find((c) => c.path === '/llms.txt');
    if (llms && !llms.found && homepage?.status === 'pass') {
      remediations.push({
        id: 'rem-llms',
        title: 'Publish /llms.txt',
        targetFile: '/llms.txt',
        description: `No usable /llms.txt: it ${llms.note}.`,
        manualInstruction:
          'Add a plain-text /llms.txt at your site root: an H1 with your product name, a one-paragraph summary, then a list of your key docs pages with one-line descriptions. Agents that look for it get a short map of your docs instead of crawling HTML.',
      });
    }
    const openapi = agentFileChecks.find((c) => c.path === '/openapi.json');
    if (openapi && !openapi.found && homepage?.status === 'pass' && /\b(api|endpoint|schema|openapi|sdk|integrat)/i.test(p.intent)) {
      remediations.push({
        id: 'rem-openapi',
        title: 'Publish your OpenAPI spec (if you have a public API)',
        targetFile: '/openapi.json',
        description: `/openapi.json ${openapi.note}.`,
        manualInstruction:
          'If you offer a public API, serve its OpenAPI document at /openapi.json (or link it from llms.txt) so tool-calling agents can read endpoints and parameters directly.',
      });
    }
    nodes.forEach((n, i) => {
      if (n.remediation) {
        remediations.push({
          id: `rem-${i}-${n.id}`,
          title: n.remediation.title,
          description: n.thought || '',
          manualInstruction: n.remediation.manualInstruction,
        });
      }
    });

    return { summary, bulletPoints: bullets, remediations };
  }

  // ─── Planner ───────────────────────────────────────────────────────────────

  private static recordUsage(usage: PlannerUsage, res: any) {
    usage.calls++;
    usage.totalTokens += Number(res?.usage?.total_tokens) || 0;
  }

  private static async decideNextStep(params: {
    harness: HarnessType;
    domain: string;
    target: string;
    intent: string;
    step: number;
    visitedPaths: Array<{ path: string; status: number }>;
    hubPage: ReadPage;
    homeOutline: PageOutline;
    usage: PlannerUsage;
  }): Promise<{
    action: 'open' | 'stop';
    nextPath: string;
    label: string;
    iconType: JourneyIconType;
    thought: string;
    decidedBy: 'llm' | 'fallback_list';
    planner?: string;
  }> {
    const { harness, domain, target, intent, step, visitedPaths, hubPage, homeOutline, usage } = params;
    const style = HARNESS_STYLE[harness] || HARNESS_STYLE['claude-code'];
    const visited = new Set(visitedPaths.map((v) => v.path));
    const pageLinks = hubPage.outline.links.filter((l) => !visited.has(l.path)).slice(0, 40);
    const pageLinkSet = new Set(pageLinks.map((l) => l.path));
    const homeExtra = hubPage.path === '/' ? [] : homeOutline.links.filter((l) => !visited.has(l.path) && !pageLinkSet.has(l.path)).slice(0, 20);

    const systemPrompt = `You plan navigation on ${target}, imitating how a ${style.label}-style agent searches: it favours ${style.focus}.
Goal: "${intent}"

Pages opened so far (do not repeat):
${visitedPaths.map((v) => `  - ${v.path} [${v.status ? `HTTP ${v.status}` : 'network error'}]`).join('\n')}

You are on ${hubPage.path}${hubPage.outline.title ? ` — "${hubPage.outline.title.slice(0, 100)}"` : ''}
Headings: ${hubPage.outline.headings.slice(0, 12).join(' | ') || '(none)'}
Links on this page:
${pageLinks.map((l) => `  - ${l.path}${l.text ? ` — ${l.text}` : ''}`).join('\n') || '  (none)'}
${homeExtra.length ? `Also linked from the homepage: ${homeExtra.map((l) => l.path).join(', ')}` : ''}

Prefer links that appear above. Reply with JSON only, one of:
{"action": "open", "nextPath": "/docs", "label": "docs", "iconType": "docs", "thought": "one short sentence on why"}
{"action": "stop", "thought": "why the pages already opened should answer the goal"}
iconType is one of: docs, api, openapi, auth, llms, sparkles. label is 1-2 words.`;

    try {
      const res = await InferenceRouter.chatCompletions(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Step ${step + 1} on ${domain}. What next?` },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
        { timeoutMs: 8000 }
      );
      if (res.provider !== 'local_fallback') {
        this.recordUsage(usage, res);
        const parsed = parseJsonObject(res?.message?.content || '');
        const planner = `${res.model} (${res.provider})`;
        if (parsed?.action === 'stop' && step >= 2) {
          return { action: 'stop', nextPath: '', label: '', iconType: 'docs', thought: String(parsed.thought || 'Enough pages opened.').slice(0, 240), decidedBy: 'llm', planner };
        }
        if (parsed?.nextPath && typeof parsed.nextPath === 'string') {
          return {
            action: 'open',
            nextPath: parsed.nextPath,
            label: String(parsed.label || '').slice(0, 14),
            iconType: VALID_ICONS.includes(parsed.iconType) ? parsed.iconType : 'docs',
            thought: String(parsed.thought || 'Planner chose this page.').slice(0, 240),
            decidedBy: 'llm',
            planner,
          };
        }
      }
    } catch {}

    const choice = style.fallback[step - 1] || { path: '/docs', label: 'docs', icon: 'docs' as JourneyIconType };
    return {
      action: 'open',
      nextPath: choice.path,
      label: choice.label,
      iconType: choice.icon,
      thought: `No planner model answered; using the fixed ${style.label} path list (${choice.path}).`,
      decidedBy: 'fallback_list',
    };
  }

  // ─── Answer check ──────────────────────────────────────────────────────────

  /**
   * Asks a model to answer the intent from the opened pages and quote its source, then verifies
   * the quote word for word against the fetched text. The verdict never relies on the model alone.
   */
  private static async checkAnswer(intent: string, domain: string, pages: ReadPage[], usage: PlannerUsage): Promise<AnswerCheck> {
    const readable = pages.filter((p) => p.outline.text.length > 0);
    if (readable.length === 0) {
      return { verdict: 'not_checked', note: 'No readable page text was fetched.' };
    }

    let budget = ANSWER_BUDGET_CHARS;
    const blocks: string[] = [];
    readable.forEach((p, i) => {
      if (budget <= 0) return;
      const passages = relevantPassages(p.outline.text, intent, 2, 600).map((s) => s.slice(0, Math.max(0, budget)));
      const block = `[${i + 1}] ${p.url}\n${passages.join('\n…\n')}`;
      budget -= block.length;
      blocks.push(block);
    });

    const prompt = `Goal: "${intent}"
Below are passages from pages opened on ${domain}. Using ONLY these passages, answer the goal.
Return JSON only:
{"found": true, "answer": "short answer", "quote": "one exact sentence copied character for character from a passage that supports the answer", "sourceUrl": "the URL of that passage"}
If the passages do not answer the goal, return {"found": false, "answer": "", "quote": "", "sourceUrl": ""}.

${blocks.join('\n\n')}`;

    let res: any;
    try {
      res = await InferenceRouter.chatCompletions(
        { messages: [{ role: 'user', content: prompt }], max_tokens: 300, temperature: 0 },
        { timeoutMs: 12000 }
      );
    } catch {
      return { verdict: 'not_checked', note: 'No model was available to read the pages.' };
    }
    if (!res || res.provider === 'local_fallback') {
      return { verdict: 'not_checked', note: 'No model was available to read the pages.' };
    }
    this.recordUsage(usage, res);
    const model = `${res.model} (${res.provider})`;
    const parsed = parseJsonObject(res?.message?.content || '');
    if (!parsed) {
      return { verdict: 'not_checked', model, note: 'The model did not return a readable answer.' };
    }
    if (!parsed.found) {
      return { verdict: 'not_found', model, note: 'The model found no answer in the pages the run opened.' };
    }

    const answer = String(parsed.answer || '').slice(0, 400);
    const quote = String(parsed.quote || '').slice(0, 600);
    const cited = String(parsed.sourceUrl || '');
    const ordered = [...readable].sort((a, b) => (a.url === cited ? -1 : b.url === cited ? 1 : 0));
    const verifiedOn = ordered.find((p) => quoteAppearsIn(quote, p.outline.text));
    if (verifiedOn) {
      return {
        verdict: 'found_with_evidence',
        answer,
        quote,
        sourceUrl: verifiedOn.url,
        model,
        note: `Quote found word for word on ${verifiedOn.path}.`,
      };
    }
    return {
      verdict: 'claimed_unsupported',
      answer,
      quote,
      sourceUrl: cited || undefined,
      model,
      note: 'The model gave an answer, but its quote does not appear in any page the run fetched.',
    };
  }
}
