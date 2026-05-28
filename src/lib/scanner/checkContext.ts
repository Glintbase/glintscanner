import { CheckResult, CategoryResult } from './types';
import { FIX_PROMPTS } from '../prompts/fixPrompts';

export async function checkContext(url: string, markdown: string): Promise<CategoryResult> {
  const base = new URL(url).origin;
  const results: CheckResult[] = [];

  // 1. llms.txt Discovery (5 pts)
  const llms = await fetch(`${base}/llms.txt`).catch(() => null);
  const llmsPassed = llms?.status === 200;
  results.push({
    id: 'llms_txt',
    label: 'llms.txt Auto-Discovery',
    passed: llmsPassed,
    points: llmsPassed ? 5 : 0,
    maxPoints: 5,
    fix: llmsPassed ? null : FIX_PROMPTS.llms_txt
  });

  // 2. llms-full.txt Discovery (5 pts)
  const llmsFull = await fetch(`${base}/llms-full.txt`).catch(() => null);
  const llmsFullPassed = llmsFull?.status === 200;
  results.push({
    id: 'llms_full_txt',
    label: 'llms-full.txt Consolidated Docs',
    passed: llmsFullPassed,
    points: llmsFullPassed ? 5 : 0,
    maxPoints: 5,
    fix: llmsFullPassed ? null : FIX_PROMPTS.llms_full_txt
  });

  // 3. Markdown Content Negotiation (10 pts)
  const mdRes = await fetch(url, { 
    headers: { 'Accept': 'text/markdown, text/x-markdown' } 
  }).catch(() => null);
  
  let mdNegotiationPassed = false;
  if (mdRes && mdRes.status === 200) {
    const contentType = mdRes.headers.get('content-type') || '';
    const text = await mdRes.text().catch(() => '');
    mdNegotiationPassed = 
      contentType.includes('text/markdown') || 
      contentType.includes('text/x-markdown') || 
      (!text.includes('<html') && !text.includes('<body') && text.includes('#'));
  }

  results.push({
    id: 'content_negotiation',
    label: 'Markdown Content Negotiation (Accept: text/markdown)',
    passed: mdNegotiationPassed,
    points: mdNegotiationPassed ? 10 : 0,
    maxPoints: 10,
    fix: mdNegotiationPassed ? null : FIX_PROMPTS.token_bloat
  });

  // 4. DOM Noise Ratio (10 pts)
  const rawHtml = await fetch(url).then(r => r.text()).catch(() => '');
  const htmlLength = rawHtml.length;
  const mdLength = markdown.length;
  const ratio = htmlLength > 0 ? mdLength / htmlLength : 1;

  let domPoints = 0;
  if (ratio >= 0.35) {
    domPoints = 10;
  } else if (ratio >= 0.20) {
    domPoints = 7;
  } else if (ratio >= 0.10) {
    domPoints = 4;
  } else {
    domPoints = 1;
  }

  const domPassed = domPoints >= 7;
  results.push({
    id: 'dom_noise_ratio',
    label: `DOM Cleanliness Ratio (${Math.round(ratio * 100)}% markdown/HTML)`,
    passed: domPassed,
    points: domPoints,
    maxPoints: 10,
    fix: domPassed ? null : 'Reduce layout boilerplate (header, footers, scripts) or use Markdown Content Negotiation to strip DOM noise.'
  });

  const score = results.reduce((s, r) => s + r.points, 0);

  return {
    category: 'context',
    score,
    maxScore: 30,
    results,
    data: { ratio, htmlLength, mdLength }
  };
}
