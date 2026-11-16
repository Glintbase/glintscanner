/**
 * Glintbase Visual Journey Tree SVG Generator (Web & Hosted MCP)
 * Renders a crisp dark-mode vector graphic representing the
 * multi-agent flight simulation journey, telemetry KPIs, and decision nodes.
 */

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(val: any, maxLen: number): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object'
    ? (val.description || val.message || val.command || val.remediation || JSON.stringify(val))
    : String(val);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/** Status label from the measured HTTP status; never assumes 200. */
function httpStatusText(step: any): string {
  if (typeof step.httpStatus === 'number') {
    return step.httpStatus > 0 ? `HTTP ${step.httpStatus}` : 'NETWORK ERROR';
  }
  return step.status === 'ok' ? 'OK' : String(step.status || 'FAIL').toUpperCase();
}

export function generateJourneyTreeSvg(
  telemetry: any,
  persona: string,
  target: string,
  replayUrl?: string
): string {
  const width = 880;
  const height = 460;

  const isSuccess = telemetry.outcome === 'completed';
  const outcomeColor = isSuccess ? '#10B981' : telemetry.outcome === 'partial' ? '#F59E0B' : '#EF4444';
  const outcomeLabel = (telemetry.outcome || 'FAILED').toUpperCase();

  const filesFound = telemetry.agentFilesFound;
  const filesChecked = telemetry.agentFilesChecked;
  const filesText = typeof filesFound === 'number' && typeof filesChecked === 'number' ? `${filesFound}/${filesChecked}` : 'n/a';
  const deadEnds = (telemetry.steps || []).filter((s: any) => s.status !== 'ok').length;
  const filesColor = typeof filesFound === 'number' && filesFound > 0 ? '#10B981' : '#F59E0B';
  const deadEndColor = deadEnds > 0 ? '#EF4444' : '#10B981';

  const tokensBurned = (telemetry.totalTokensBurned ?? 0).toLocaleString();
  const hopsCount = telemetry.steps?.length ?? 0;

  const displayTarget = truncate(target.replace(/^https?:\/\//i, '').replace(/\/$/, ''), 38);

  const rawSteps = telemetry.steps || [];
  const displaySteps = rawSteps.length <= 8
    ? rawSteps
    : [rawSteps[0], ...rawSteps.slice(1, 4), ...rawSteps.slice(rawSteps.length - 3)];

  const startX = 60;
  const endX = 820;
  const nodeY = 250;
  const stepCount = Math.max(1, displaySteps.length);
  const stepSpacing = (endX - startX) / Math.max(1, stepCount - 1);

  let nodesMarkup = '';
  let connectorsMarkup = '';

  displaySteps.forEach((step: any, idx: number) => {
    const cx = Math.round(startX + idx * stepSpacing);
    const cy = nodeY + (idx % 2 === 1 ? 15 : -15);

    const isStepSuccess = step.status === 'ok';
    const isStepAuth = step.action?.toLowerCase().includes('auth') || step.details?.toLowerCase().includes('auth');
    const stepColor = isStepSuccess
      ? (idx === displaySteps.length - 1 && isSuccess ? '#10B981' : '#FF3300')
      : isStepAuth
      ? '#EF4444'
      : '#F59E0B';

    if (idx < displaySteps.length - 1) {
      const nextX = Math.round(startX + (idx + 1) * stepSpacing);
      const nextY = nodeY + ((idx + 1) % 2 === 1 ? 15 : -15);
      const midX = Math.round((cx + nextX) / 2);

      connectorsMarkup += `
        <path d="M ${cx} ${cy} C ${midX} ${cy}, ${midX} ${nextY}, ${nextX} ${nextY}"
              fill="none" stroke="${stepColor}" stroke-width="2.5" stroke-opacity="0.4"
              stroke-dasharray="4 2" />
      `;
    }

    const rawAction = (step.action || '').toUpperCase();
    const sanitizedAction = ['SPARKLES', 'READY', 'SUCCESS'].includes(rawAction)
      ? (idx === displaySteps.length - 1 && isSuccess ? 'GOAL' : 'READY')
      : rawAction === 'HOME'
      ? 'INDEX'
      : rawAction;
    const actionBadge = truncate(sanitizedAction || 'STEP', 12);
    const detailLabel = truncate(step.details || '', 22);
    const statusText = httpStatusText(step);

    nodesMarkup += `
      <g transform="translate(${cx}, ${cy})">
        <circle r="22" fill="${stepColor}" fill-opacity="0.12" />
        <circle r="14" fill="#121214" stroke="${stepColor}" stroke-width="2.5" />
        <text y="4" text-anchor="middle" fill="#FFFFFF" font-family="ui-monospace, monospace" font-size="11" font-weight="700">${idx + 1}</text>
        <rect x="-42" y="-38" width="84" height="18" rx="4" fill="#18181B" stroke="${stepColor}" stroke-opacity="0.5" stroke-width="1" />
        <text y="-25" text-anchor="middle" fill="${stepColor}" font-family="ui-monospace, monospace" font-size="9" font-weight="600">${escapeXml(actionBadge)}</text>
        <text y="32" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="500">${escapeXml(detailLabel)}</text>
        <text y="45" text-anchor="middle" fill="${isStepSuccess ? '#10B981' : '#EF4444'}" font-family="ui-monospace, monospace" font-size="9">${escapeXml(statusText)}</text>
      </g>
    `;
  });

  let calloutMarkup = '';
  if (!isSuccess && (telemetry.failureBottleneck || telemetry.failureMode || telemetry.failureDetails)) {
    const rawBottleneck = telemetry.failureBottleneck || telemetry.failureDetails?.message || telemetry.failureMode || 'Agent halted at boundary';
    const bottleneckText = truncate(rawBottleneck, 75);
    const rawRemediation = telemetry.suggestedRemediation || telemetry.failureDetails?.remediation || 'Check that the homepage is reachable.';
    const remediationText = truncate(rawRemediation, 75);
    calloutMarkup = `
      <g transform="translate(40, 365)">
        <rect width="800" height="46" rx="8" fill="#18181B" stroke="#EF4444" stroke-opacity="0.4" stroke-width="1.2" />
        <circle cx="20" cy="23" r="8" fill="#EF4444" fill-opacity="0.2" />
        <text x="20" y="27" text-anchor="middle" fill="#EF4444" font-family="-apple-system, sans-serif" font-size="11" font-weight="700">!</text>
        <text x="36" y="18" fill="#EF4444" font-family="-apple-system, sans-serif" font-size="10" font-weight="700">BOTTLENECK: <tspan fill="#E4E4E7" font-weight="400">${escapeXml(bottleneckText)}</tspan></text>
        <text x="36" y="34" fill="#10B981" font-family="-apple-system, sans-serif" font-size="10" font-weight="700">SUGGESTED FIX: <tspan fill="#A1A1AA" font-weight="400">${escapeXml(remediationText)}</tspan></text>
      </g>
    `;
  } else if (isSuccess) {
    calloutMarkup = `
      <g transform="translate(40, 365)">
        <rect width="800" height="46" rx="8" fill="#18181B" stroke="#10B981" stroke-opacity="0.4" stroke-width="1.2" />
        <circle cx="20" cy="23" r="8" fill="#10B981" fill-opacity="0.2" />
        <text x="20" y="27" text-anchor="middle" fill="#10B981" font-family="-apple-system, sans-serif" font-size="11" font-weight="700">✓</text>
        <text x="36" y="26" fill="#10B981" font-family="-apple-system, sans-serif" font-size="11" font-weight="600">HOMEPAGE REACHABLE: <tspan fill="#A1A1AA" font-weight="400">${escapeXml(truncate(telemetry.summary || `${deadEnds} of ${hopsCount} requests were dead ends.`, 90))}</tspan></text>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121214" />
      <stop offset="100%" stop-color="#0A0A0B" />
    </linearGradient>
    <radialGradient id="glintGlow" cx="50%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#FF3300" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#FF3300" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" rx="16" fill="url(#bgGrad)" stroke="#27272A" stroke-width="1.5" />
  <rect width="${width}" height="${height}" rx="16" fill="url(#glintGlow)" />

  <g transform="translate(40, 38)">
    <rect x="0" y="-8" width="76" height="20" rx="4" fill="#FF3300" fill-opacity="0.15" stroke="#FF3300" stroke-opacity="0.4" stroke-width="1" />
    <text x="38" y="6" text-anchor="middle" fill="#FF3300" font-family="ui-monospace, monospace" font-size="10" font-weight="700" letter-spacing="1">GLINTBASE</text>
    <text x="88" y="6" fill="#71717A" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12">Flight Simulator —</text>
    <text x="195" y="6" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600">${escapeXml(persona)}</text>

    <rect x="0" y="24" width="380" height="24" rx="6" fill="#18181B" stroke="#27272A" stroke-width="1" />
    <text x="12" y="40" fill="#A1A1AA" font-family="ui-monospace, monospace" font-size="11">Target: <tspan fill="#FFFFFF" font-weight="600">${escapeXml(displayTarget)}</tspan></text>

    <g transform="translate(700, 4)">
      <rect x="-60" y="-6" width="120" height="26" rx="13" fill="${outcomeColor}" fill-opacity="0.15" stroke="${outcomeColor}" stroke-width="1.2" />
      <circle cx="-42" cy="7" r="4" fill="${outcomeColor}" />
      <text x="-30" y="11" fill="${outcomeColor}" font-family="ui-monospace, monospace" font-size="11" font-weight="700" letter-spacing="0.5">${escapeXml(outcomeLabel)}</text>
    </g>
  </g>

  <g transform="translate(40, 115)">
    <rect x="0" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="14" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">EST. TOKENS (BYTES ÷ 4)</text>
    <text x="14" y="41" fill="#FFFFFF" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${tokensBurned}</text>

    <rect x="204" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="218" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">AGENT FILES FOUND</text>
    <text x="218" y="41" fill="${filesColor}" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${escapeXml(filesText)}</text>

    <rect x="408" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="422" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">REQUESTS</text>
    <text x="422" y="41" fill="#FFFFFF" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${hopsCount}</text>

    <rect x="612" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="626" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">DEAD ENDS</text>
    <text x="626" y="41" fill="${deadEndColor}" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${deadEnds}</text>
  </g>

  <g>
    ${connectorsMarkup}
    ${nodesMarkup}
  </g>

  ${calloutMarkup}

  <text x="40" y="438" fill="#52525B" font-family="ui-monospace, monospace" font-size="9">ARS 3.0 SPECIFICATION • TRACK 3 AGENT FLIGHT REPLAY</text>
  <text x="840" y="438" text-anchor="end" fill="#71717A" font-family="ui-monospace, monospace" font-size="9">scan.glintbase.dev</text>
</svg>`;
}

export function svgToBase64(svg: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(svg, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(svg)));
}

/**
 * Generates an interactive Mermaid flowchart diagram representing
 * the agent's flight trajectory. Rendered natively in Claude Desktop and Claude Web.
 */
export function generateJourneyMermaid(
  telemetry: any,
  persona: string,
  target: string
): string {
  const steps = telemetry.steps || [];
  if (steps.length === 0) {
    return '```mermaid\nflowchart LR\n  Start["No steps recorded"]\n```';
  }

  const isCompleted = telemetry.outcome === 'completed';

  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');
  lines.push('  %% Glintbase Agent Flight Trajectory');
  lines.push('  classDef pass fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ffffff;');
  lines.push('  classDef warn fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#ffffff;');
  lines.push('  classDef fail fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#ffffff;');
  lines.push('  classDef goal fill:#042f2e,stroke:#14b8a6,stroke-width:2px,color:#ffffff;');

  steps.forEach((step: any, idx: number) => {
    const stepNum = idx + 1;
    const isLast = idx === steps.length - 1;
    const rawAction = (step.action || '').toUpperCase();
    const action = ['SPARKLES', 'READY', 'SUCCESS'].includes(rawAction)
      ? (isLast && isCompleted ? 'GOAL' : 'READY')
      : rawAction === 'HOME'
      ? 'INDEX'
      : rawAction || `STEP ${stepNum}`;

    const detail = (step.details || '').replace(/["[\]()]/g, ' ');
    const shortDetail = detail.length > 22 ? detail.slice(0, 21) + '…' : detail;
    const isPass = step.status === 'ok' || step.status === 'pass';
    const isWarn = step.status === 'warn';
    const statusText = typeof step.httpStatus === 'number' ? httpStatusText(step) : isPass ? 'OK' : isWarn ? 'WARN' : 'FAIL';
    const nodeClass = isLast && isCompleted ? 'goal' : isPass ? 'pass' : isWarn ? 'warn' : 'fail';

    const nodeLabel = `"${stepNum}. ${escapeXml(action)}<br/>${escapeXml(shortDetail)}<br/>${statusText}"`;
    lines.push(`  N${stepNum}[${nodeLabel}]:::${nodeClass}`);
  });

  for (let i = 1; i < steps.length; i++) {
    lines.push(`  N${i} --> N${i + 1}`);
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Generates a clean Flight Telemetry HUD Markdown Card with KPI table.
 */
export function generateFlightHud(
  telemetry: any,
  persona: string,
  target: string,
  replayUrl?: string
): string {
  const isCompleted = telemetry.outcome === 'completed';
  const outcomeBadge = isCompleted ? '🟢 HOMEPAGE REACHABLE' : '🔴 HOMEPAGE UNREACHABLE';
  const steps: any[] = telemetry.steps || [];
  const tokens = (telemetry.totalTokensBurned || 0).toLocaleString();
  const files =
    typeof telemetry.agentFilesFound === 'number' ? `${telemetry.agentFilesFound}/${telemetry.agentFilesChecked}` : 'n/a';
  const modeLabel = telemetry.mode === 'preview' ? 'Preview (no agent run)' : telemetry.mode || 'unknown';

  let md = `### Glintbase Simulate: ${modeLabel}\n\n`;
  md += `| Target | Result | Requests | Agent files found | Est. tokens |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;
  md += `| \`${target}\` | **${outcomeBadge}** | **${steps.length}** | **${files}** | ${tokens} |\n\n`;

  if (steps.length > 0) {
    md += `| Request | Status | Size | Time |\n| :--- | :--- | :--- | :--- |\n`;
    for (const s of steps) {
      const path = (s.url || '').replace(/^https?:\/\/[^/]+/, '') || '/';
      md += `| \`${path}\` | ${httpStatusText(s)} | ${typeof s.bytes === 'number' ? `${s.bytes} B` : '–'} | ${typeof s.durationMs === 'number' ? `${s.durationMs} ms` : '–'} |\n`;
    }
    md += `\n`;
  }

  if (telemetry.summary) md += `${telemetry.summary}\n\n`;
  md += `_Statuses, sizes and times are measured. Tokens are estimated as bytes ÷ 4. Persona "${persona}" is a label only in preview mode._\n\n`;

  if (replayUrl) {
    md += `[Open the replay](${replayUrl})\n\n`;
  }

  if (telemetry.suggestedRemediation) {
    md += `> **Suggested fix**: ${telemetry.suggestedRemediation}\n\n`;
  }

  return md;
}

