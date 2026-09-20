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

  const frictionScore = telemetry.schemaFrictionScore ?? 0;
  const riskLevel = frictionScore > 50 ? 'HIGH' : frictionScore > 25 ? 'MEDIUM' : 'LOW';
  const riskColor = riskLevel === 'LOW' ? '#10B981' : riskLevel === 'MEDIUM' ? '#F59E0B' : '#EF4444';

  const tokensBurned = (telemetry.totalTokensBurned ?? 0).toLocaleString();
  const hopsCount = telemetry.steps?.length ?? 0;

  const displayTarget = truncate(target.replace(/^https?:\/\//i, '').replace(/\/$/, ''), 38);

  const rawSteps = telemetry.steps || [];
  const displaySteps = rawSteps.length <= 5
    ? rawSteps
    : [rawSteps[0], ...rawSteps.slice(Math.max(1, rawSteps.length - 4))];

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

    const actionBadge = truncate(step.action?.toUpperCase() || 'STEP', 12);
    const detailLabel = truncate(step.details || '', 22);
    const statusText = step.status === 'ok' ? '200 OK' : step.status?.toUpperCase() || 'FAIL';

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
    const rawRemediation = telemetry.suggestedRemediation || telemetry.failureDetails?.remediation || 'Generate required living artifacts to resolve friction.';
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
        <text x="36" y="26" fill="#10B981" font-family="-apple-system, sans-serif" font-size="11" font-weight="600">ZERO-FRICTION FLIGHT: <tspan fill="#A1A1AA" font-weight="400">Agent reached mission goal autonomously with optimal context efficiency.</tspan></text>
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
    <text x="14" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">TOKENS BURNED</text>
    <text x="14" y="41" fill="#FFFFFF" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${tokensBurned}</text>

    <rect x="204" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="218" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">SCHEMA FRICTION</text>
    <text x="218" y="41" fill="${riskColor}" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${frictionScore}<tspan fill="#71717A" font-size="12">/100</tspan></text>

    <rect x="408" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="422" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">NAVIGATION HOPS</text>
    <text x="422" y="41" fill="#FFFFFF" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${hopsCount} <tspan fill="#71717A" font-size="12">hops</tspan></text>

    <rect x="612" y="0" width="188" height="52" rx="8" fill="#141416" stroke="#27272A" stroke-width="1" />
    <text x="626" y="20" fill="#71717A" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">HALLUCINATION RISK</text>
    <text x="626" y="41" fill="${riskColor}" font-family="ui-monospace, monospace" font-size="17" font-weight="700">${riskLevel}</text>
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
