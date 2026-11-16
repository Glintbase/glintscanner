/**
 * Glintbase Simulate: navigation probe.
 *
 * What this is: a planner walks the target site the way a given harness tends to look for docs.
 * Every step is a real HTTP request (from an E2B sandbox when E2B_API_KEY is set, otherwise from
 * this server). The planner (a free-tier LLM via InferenceRouter, or a fixed path list when none
 * answers) sees only URLs and status codes, never page content, so a run shows how navigable the
 * site is. It does NOT show whether a real agent could complete the intent; real harness runs
 * live in the private Sim Service.
 *
 * Nothing here is invented: statuses, sizes and times are measured; tokens are estimated from
 * response size (TOKEN_BASIS) and labelled as estimates.
 */

import {
  AgentFileCheck,
  CanvasCoord,
  HarnessType,
  JourneyExecutionResult,
  JourneyIconType,
  JourneyInsight,
  JourneyInsightRemediation,
  JourneyKPIMetrics,
  JourneyPillNode,
  ProceduralLine,
  RunMode,
  SimulationOptions,
  TOKEN_BASIS,
  estimateTokensFromBytes,
} from './types';
import { InferenceRouter } from './inferenceRouter';
import { currentScannerUserAgent, fetchResource } from '../v2/fetchResource';

interface DiscoveredSiteMeta {
  title: string;
  description: string;
  discoveredLinks: string[];
}

interface ProbeExecutionResult {
  url: string;
  /** HTTP status, or 0 when the request failed at the network level. */
  status: number;
  ms: number;
  bytes: number;
  snippet?: string;
  error?: string;
}

const MAX_AGENT_STEPS = 4;
const START: CanvasCoord = { x: 85, y: 135 };
const COL_SPACING = 145;
const ROW_SPACING = 115;

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
    ],
  },
};

const VALID_ICONS: JourneyIconType[] = ['docs', 'api', 'openapi', 'auth', 'llms', 'sparkles'];

const isReachable = (status: number) => status >= 200 && status < 400;
const formatKb = (bytes: number) => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`);
const seconds = (startMs: number) => Number(((Date.now() - startMs) / 1000).toFixed(1));

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
out = {"url": u, "status": 0, "bytes": 0, "snippet": ""}
try:
    req = urllib.request.Request(u, headers={'User-Agent': ua, 'Accept': 'text/html,text/plain,application/json;q=0.9,*/*;q=0.8'})
    with urllib.request.urlopen(req, timeout=6) as resp:
        body = resp.read(2000000)
        out.update(status=resp.status, bytes=len(body), snippet=body[:120].decode('utf-8', errors='ignore').strip())
except urllib.error.HTTPError as e:
    out.update(status=e.code)
except Exception as e:
    out.update(error=str(e)[:160])
out["ms"] = int((time.time() - start) * 1000)
print("PROBE_RESULT:" + json.dumps(out))
`;
        const execResult = await sbx.runCode(probeScript);
        const outputText = execResult.logs?.stdout?.join('') || execResult.text || '';
        const match = outputText.match(/PROBE_RESULT:(.*)/);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch {}
        }
        return { url, status: 0, ms: 0, bytes: 0, error: 'sandbox probe produced no result' };
      };

      return await this.executeNavigationLoop({
        target,
        intent,
        harness,
        mode: 'e2b',
        bootMs,
        probeExecutor,
        startTime,
        onProgress,
      });
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
      snippet: (res?.body || '').slice(0, 120).trim(),
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
    emitLog(`[glintbase] The planner sees URLs and status codes only, not page content.\n`);

    onProgress?.({ type: 'agent_spawn', harness, startCoord: START, timestamp: Date.now() });
    onProgress?.({ type: 'ticker_update', text: '● Starting run...', subText: '1 step' });

    // Step 1: homepage (agent request) + link discovery and agent-file checks (Glintbase requests).
    const [apexProbe, siteMeta, agentFileChecks] = await Promise.all([
      probeExecutor(target),
      this.extractSiteMetadata(target),
      this.checkAgentFiles(baseUrl),
    ]);
    const apexOk = isReachable(apexProbe.status);
    emitLog(
      `[${harness}@step-1] GET / -> ${apexProbe.status ? `HTTP ${apexProbe.status}` : `network error${apexProbe.error ? ` (${apexProbe.error})` : ''}`} (${apexProbe.ms}ms, ${formatKb(apexProbe.bytes)})`
    );
    emitLog(`[glintbase] Homepage links found: ${siteMeta.discoveredLinks.length}`);
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
        ? `Opened the ${domain} homepage (HTTP ${apexProbe.status}, ${formatKb(apexProbe.bytes)}); found ${siteMeta.discoveredLinks.length} same-site links.`
        : `The ${domain} homepage did not answer (${apexProbe.status ? `HTTP ${apexProbe.status}` : 'network error'}).`,
      isDeadEnd: !apexOk,
      decidedBy: 'standard_check',
    };

    const nodes: JourneyPillNode[] = [rootNode];
    const lines: ProceduralLine[] = [];
    let runningTokens = rootNode.tokens;
    let llmSteps = 0;
    const planners = new Set<string>();

    onProgress?.({ type: 'node_materialized', node: rootNode });
    onProgress?.({ type: 'agent_reaction', reaction: apexOk ? 'nod' : 'nope', thought: rootNode.thought, targetNodeId: rootNode.id });
    onProgress?.(apexOk
      ? { type: 'agent_nod', targetNodeId: rootNode.id, message: `Reached ${domain}` }
      : { type: 'agent_nope', targetNodeId: rootNode.id, message: `${domain} did not answer` });
    onProgress?.({ type: 'telemetry_tick', stepsCount: 1, durationSeconds: seconds(startTime), tokensBurned: runningTokens, reasoningStepsCount: 0 });
    await pause(250);

    const visitedPaths: Array<{ path: string; status: number; ms: number }> = [{ path: '/', status: apexProbe.status, ms: apexProbe.ms }];
    const candidateLinks = siteMeta.discoveredLinks.filter((l) => l.startsWith('/')).slice(0, 15);
    let hub = rootNode;

    if (apexOk) {
      for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
        onProgress?.({ type: 'ticker_update', text: '● Choosing next page...', subText: `${step + 1} steps` });
        onProgress?.({ type: 'agent_reaction', reaction: 'thinking', thought: `Choosing the next page (${style.label} style)...` });

        const decision = await this.decideNextStep({ harness, domain, target, intent, step, visitedPaths, candidateLinks });
        let cleanPath = this.sanitizeNextPath(decision.nextPath, domain);

        // Never re-request a page: take the next unvisited fallback or homepage link instead.
        if (visitedPaths.some((v) => v.path === cleanPath)) {
          const alt = [...style.fallback.map((f) => f.path), ...candidateLinks].find(
            (p) => !visitedPaths.some((v) => v.path === this.sanitizeNextPath(p, domain))
          );
          if (!alt) break;
          cleanPath = this.sanitizeNextPath(alt, domain);
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
        visitedPaths.push({ path: cleanPath, status: probeRes.status, ms: probeRes.ms });

        const isPass = isReachable(probeRes.status);
        const isLinked = candidateLinks.includes(cleanPath);
        const statusText = probeRes.status ? `HTTP ${probeRes.status}` : 'network error';
        const origin = isLinked ? 'linked from the homepage' : 'guessed path, not linked from the homepage';

        emitLog(
          `[${harness}@step-${step + 1}] GET ${cleanPath} -> ${statusText} (${probeRes.ms}ms, ${formatKb(probeRes.bytes)}) [${decision.decidedBy === 'llm' ? 'planner' : 'fallback list'}; ${origin}]`
        );

        const row = isPass ? 0 : 1;
        const coord: CanvasCoord = { x: START.x + step * COL_SPACING, y: START.y + row * ROW_SPACING };

        let remediation: JourneyPillNode['remediation'];
        if (!isPass && isLinked) {
          remediation = {
            title: `Fix the broken homepage link to ${cleanPath}`,
            manualInstruction: `Your homepage links to ${cleanPath}, which answered ${statusText}. Fix or redirect that page so agents following your own links don't hit a dead end.`,
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
          thought: `${decision.thought} ${statusText}, ${formatKb(probeRes.bytes)} (${origin}).`,
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

        if (isPass) {
          onProgress?.({ type: 'agent_reaction', reaction: 'nod', thought: node.thought, targetNodeId: node.id });
          onProgress?.({ type: 'agent_nod', targetNodeId: node.id, message: `${cleanPath}: ${statusText}` });
          hub = node;
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

    const planner = planners.size > 0 ? [...planners].join(' + ') : 'none (homepage unreachable)';
    emitLog(`\n[glintbase] Run finished in ${seconds(startTime)}s. Planner: ${planner}.`);

    onProgress?.({ type: 'agent_reaction', reaction: apexOk ? 'success' : 'nope', thought: 'Run finished.' });
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
      homepageLinks: siteMeta.discoveredLinks.length,
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

    const [apex, siteMeta, agentFileChecks] = await Promise.all([
      this.fetchProbe(target, 5000),
      this.extractSiteMetadata(target),
      this.checkAgentFiles(baseUrl),
    ]);
    const apexOk = isReachable(apex.status);

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
          ? `Homepage answered HTTP ${apex.status} (${formatKb(apex.bytes)}); ${siteMeta.discoveredLinks.length} same-site links.`
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
        coord: { x: START.x + col * COL_SPACING, y: START.y },
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
      homepageLinks: siteMeta.discoveredLinks.length,
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
  }): JourneyExecutionResult {
    const { nodes, agentFileChecks } = p;
    const domain = p.target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    // KPIs count pages the run requested as navigation steps; in preview, the checks are the steps.
    const stepNodes = nodes;
    const reached = stepNodes.filter((n) => isReachable(n.httpStatus || 0) && n.status === 'pass').length;
    const kpis: JourneyKPIMetrics = {
      pagesReachedPct: stepNodes.length ? Math.round((reached / stepNodes.length) * 100) : 0,
      deadEnds: stepNodes.filter((n) => n.status === 'fail').length,
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
  }): JourneyInsight {
    const { domain, mode, nodes, agentFileChecks, kpis } = p;
    const style = HARNESS_STYLE[p.harness] || HARNESS_STYLE['claude-code'];
    const where = mode === 'e2b' ? 'from an E2B sandbox' : mode === 'in_process' ? 'from the Glintbase server' : '';
    const homepage = nodes[0];

    let summary: string;
    if (homepage?.status !== 'pass') {
      summary = `The ${domain} homepage did not answer (${homepage?.httpStatus ? `HTTP ${homepage.httpStatus}` : 'network error'}), so nothing else could be explored.`;
    } else if (mode === 'preview') {
      summary = `Preview of ${domain}: Glintbase fetched the homepage and checked ${kpis.agentFilesChecked} standard agent files (${kpis.agentFilesFound} found). No agent ran.`;
    } else {
      summary =
        `${style.label}-style navigation of ${domain}: ${nodes.length} pages requested ${where}, ` +
        `${nodes.length - kpis.deadEnds} reachable and ${kpis.deadEnds} dead end${kpis.deadEnds === 1 ? "" : "s"}. ` +
        `Pages were chosen by ${p.planner}, which sees only URLs and status codes, not page content. ` +
        `This shows how navigable the site is; it does not show whether an agent could complete "${p.intent}".`;
    }

    const bullets: string[] = [];
    for (const c of agentFileChecks) bullets.push(`${c.path}: ${c.note}.`);
    if (homepage?.status === 'pass') bullets.push(`Homepage: ${p.homepageLinks} same-site links found.`);
    for (const n of nodes.slice(1)) {
      if (n.status === 'fail' && n.decidedBy !== 'standard_check') {
        bullets.push(`Dead end: ${n.url?.replace(/^https?:\/\/[^/]+/, '') || n.label} answered ${n.httpStatus ? `HTTP ${n.httpStatus}` : 'with a network error'}.`);
      }
    }
    bullets.push(`Tokens (${p.tokensBurned.toLocaleString()}) are estimates: response bytes ÷ 4. Times and statuses are measured.`);

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

  private static async decideNextStep(params: {
    harness: HarnessType;
    domain: string;
    target: string;
    intent: string;
    step: number;
    visitedPaths: Array<{ path: string; status: number; ms: number }>;
    candidateLinks: string[];
  }): Promise<{ nextPath: string; label: string; iconType: JourneyIconType; thought: string; decidedBy: 'llm' | 'fallback_list'; planner?: string }> {
    const { harness, domain, target, intent, step, visitedPaths, candidateLinks } = params;
    const style = HARNESS_STYLE[harness] || HARNESS_STYLE['claude-code'];

    const systemPrompt = `You plan the next page to open on ${target}, imitating how a ${style.label}-style agent searches: it favours ${style.focus}.
Goal: "${intent}".

Already requested (do not repeat):
${visitedPaths.map((v) => `  - ${v.path} [${v.status ? `HTTP ${v.status}` : 'network error'}]`).join('\n')}

Links found on the homepage: ${candidateLinks.join(', ') || '(none)'}

Pick ONE path on this site to open next. Prefer homepage links when relevant.
Return ONLY JSON:
{"nextPath": "/docs", "label": "docs", "iconType": "docs", "thought": "one short sentence on why"}
iconType is one of: docs, api, openapi, auth, llms, sparkles. label is 1-2 words.`;

    try {
      const res = await InferenceRouter.chatCompletions(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Step ${step + 1} on ${domain}. Next path?` },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
        { timeoutMs: 8000 }
      );
      if (res.provider !== 'local_fallback') {
        const text = res?.message?.content || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed?.nextPath && typeof parsed.nextPath === 'string') {
            return {
              nextPath: parsed.nextPath,
              label: String(parsed.label || '').slice(0, 14),
              iconType: VALID_ICONS.includes(parsed.iconType) ? parsed.iconType : 'docs',
              thought: String(parsed.thought || 'Planner chose this page.').slice(0, 240),
              decidedBy: 'llm',
              planner: `${res.model} (${res.provider})`,
            };
          }
        }
      }
    } catch {}

    const choice = style.fallback[step - 1] || { path: '/docs', label: 'docs', icon: 'docs' as JourneyIconType };
    return {
      nextPath: choice.path,
      label: choice.label,
      iconType: choice.icon,
      thought: `No planner model answered; using the fixed ${style.label} path list (${choice.path}).`,
      decidedBy: 'fallback_list',
    };
  }

  /**
   * Reads the homepage (Glintbase request) for its title, description and same-site links.
   */
  private static async extractSiteMetadata(target: string): Promise<DiscoveredSiteMeta> {
    try {
      const pageRes = await fetchResource(target, { timeoutMs: 5000 });
      if (!pageRes || !pageRes.body) {
        return { title: target, description: '', discoveredLinks: [] };
      }

      const html = pageRes.body;
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : target;

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const description = descMatch ? descMatch[1].trim() : '';

      const host = new URL(target).hostname;
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
      const linksSet = new Set<string>();
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(html)) !== null) {
        let href = match[1].trim();
        if (/^https?:\/\//i.test(href)) {
          try {
            const u = new URL(href);
            if (u.hostname !== host) continue;
            href = u.pathname;
          } catch {
            continue;
          }
        }
        if (href.startsWith('/') && !href.startsWith('//') && !/\.(css|js|png|jpe?g|svg|ico|woff2?|webp|gif)$/i.test(href)) {
          const cleanPath = href.split('?')[0].split('#')[0];
          if (cleanPath.length > 1 && cleanPath.length < 60) {
            linksSet.add(cleanPath);
          }
        }
      }

      return { title, description, discoveredLinks: Array.from(linksSet).slice(0, 20) };
    } catch {
      return { title: target, description: '', discoveredLinks: [] };
    }
  }
}
