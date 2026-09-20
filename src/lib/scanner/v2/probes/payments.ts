/**
 * ARS 3.0 Layer 4 Probe: Payments & Machine Commerce (6 Checks | 10 Base Pts)
 * Evaluates Agentic Commerce Protocol (ACP), Universal Commerce Protocol (UCP),
 * Google Agent Payments (AP2), x402 Micropayments, and MPP.
 *
 * Subject to the Payments "OR-Scoring" Rule:
 * Supporting any 1 verified payment protocol grants full 10/10 points;
 * remaining protocols are marked 'na' (unscored), never failed.
 * Non-commerce sites mark Layer 4 as skipped ('skip').
 */

import { fetchResource } from '../fetchResource';
import { getChecksForLayer } from './registry';
import type { CheckResult } from './types';
import type { SiteArchetype } from '../archetype';

export interface PaymentsProbeResult {
  score: number;
  baseEarned: number;
  bonusEarned: number;
  isApplicable: boolean;
  checks: CheckResult[];
  details: string[];
  x402: {
    supported: boolean;
    headerPresent: boolean;
  };
  mpp: {
    supported: boolean;
  };
  ucp: {
    found: boolean;
    url?: string;
  };
  acp: {
    supported: boolean;
  };
}

export async function probePayments(
  baseUrl: string,
  archetype: SiteArchetype,
  localContext?: {
    hasCommerceRoutes?: boolean;
    hasStripeOrPayment?: boolean;
    hasX402Header?: boolean;
    hasUcpFile?: boolean;
    hasAcpFile?: boolean;
  }
): Promise<PaymentsProbeResult> {
  const details: string[] = [];
  const checkDefs = getChecksForLayer('payments');
  const results: CheckResult[] = [];

  const isApplicable = archetype === 'ecommerce' || Boolean(localContext?.hasCommerceRoutes) || Boolean(localContext?.hasStripeOrPayment);

  // If non-commerce, mark all 6 payment checks as 'skip'
  if (!isApplicable) {
    for (const def of checkDefs) {
      results.push({
        checkId: def.id,
        status: 'skip',
        earnedPoints: 0,
        maxPoints: def.points,
        isBonus: def.isBonus,
        message: `Skipped for ${archetype} archetype (non-commerce)`,
      });
    }
    details.push(`Payments layer excluded from active denominator (Archetype: ${archetype})`);
    return {
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      isApplicable: false,
      checks: results,
      details,
      x402: { supported: false, headerPresent: false },
      mpp: { supported: false },
      ucp: { found: false },
      acp: { supported: false },
    };
  }

  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    for (const def of checkDefs) {
      results.push({
        checkId: def.id,
        status: 'fail',
        earnedPoints: 0,
        maxPoints: def.points,
        isBonus: def.isBonus,
        message: 'Invalid target URL for payments probe',
      });
    }
    return {
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      isApplicable: true,
      checks: results,
      details: ['Invalid target URL for payments probe'],
      x402: { supported: false, headerPresent: false },
      mpp: { supported: false },
      ucp: { found: false },
      acp: { supported: false },
    };
  }

  const origin = u.origin;

  // 1. Probe UCP (/.well-known/ucp)
  let foundUcp = Boolean(localContext?.hasUcpFile);
  if (!foundUcp) {
    const ucpRes = await fetchResource(`${origin}/.well-known/ucp`, { timeoutMs: 2500 });
    if (ucpRes.ok && ucpRes.body && !ucpRes.body.includes('<html')) {
      foundUcp = true;
    }
  }

  // 2. Probe ACP (/checkout_sessions, /agentic_commerce/delegate_payment)
  let foundAcp = Boolean(localContext?.hasAcpFile);
  let foundAcpDelegate = false;
  if (!foundAcp) {
    const acpRes = await fetchResource(`${origin}/checkout_sessions`, {
      timeoutMs: 2500,
      headers: { Accept: 'application/json' },
    });
    if (acpRes.httpStatus === 200 || acpRes.httpStatus === 401 || acpRes.httpStatus === 400) {
      foundAcp = true;
    }
    const delRes = await fetchResource(`${origin}/agentic_commerce/delegate_payment`, {
      timeoutMs: 2000,
      headers: { Accept: 'application/json' },
    });
    if (delRes.httpStatus === 200 || delRes.httpStatus === 401 || delRes.httpStatus === 400) {
      foundAcpDelegate = true;
    }
  }

  // 3. Probe x402 (/api/payment)
  let supportedX402 = Boolean(localContext?.hasX402Header);
  if (!supportedX402) {
    const x402Res = await fetchResource(`${origin}/api/payment`, { timeoutMs: 2500 });
    if (x402Res.httpStatus === 402) {
      supportedX402 = true;
    }
  }

  // 4. Probe Google AP2 Mandates
  let supportedAp2 = false;
  const ap2Res = await fetchResource(`${origin}/.well-known/ap2`, { timeoutMs: 2000 });
  if (ap2Res.ok && ap2Res.body && !ap2Res.body.includes('<html')) {
    supportedAp2 = true;
  }

  // 5. Probe MPP
  const supportedMpp = false;

  // Apply Payments "OR-Scoring" Rule:
  // If ANY protocol passed, award 10 full points for Layer 4!
  const anyPassed = foundUcp || foundAcp || foundAcpDelegate || supportedX402 || supportedAp2 || supportedMpp;

  let verifiedProtocolName = '';
  if (foundUcp) verifiedProtocolName = 'Universal Commerce Protocol (UCP)';
  else if (foundAcp) verifiedProtocolName = 'Agentic Commerce Protocol (ACP)';
  else if (supportedX402) verifiedProtocolName = 'HTTP 402 Micropayments (x402)';
  else if (supportedAp2) verifiedProtocolName = 'Google Agent Payments Protocol (AP2)';
  else if (supportedMpp) verifiedProtocolName = 'Machine Payments Protocol (MPP)';

  // acp-support
  results.push({
    checkId: 'acp-support',
    status: foundAcp ? 'pass' : (anyPassed ? 'na' : 'warn'),
    earnedPoints: foundAcp ? 3 : 0,
    maxPoints: 3,
    isBonus: true,
    message: foundAcp ? 'ACP /checkout_sessions supported' : (anyPassed ? 'Omitted under OR-scoring' : 'ACP not detected'),
  });

  // acp-delegate-payment
  results.push({
    checkId: 'acp-delegate-payment',
    status: foundAcpDelegate ? 'pass' : (anyPassed ? 'na' : 'warn'),
    earnedPoints: foundAcpDelegate ? 3 : 0,
    maxPoints: 3,
    isBonus: true,
    message: foundAcpDelegate ? 'ACP delegated payment endpoint verified' : (anyPassed ? 'Omitted under OR-scoring' : 'ACP delegation not detected'),
  });

  // ucp-support
  results.push({
    checkId: 'ucp-support',
    status: foundUcp ? 'pass' : (anyPassed ? 'na' : 'warn'),
    earnedPoints: foundUcp ? 3 : 0,
    maxPoints: 3,
    isBonus: true,
    message: foundUcp ? 'UCP /.well-known/ucp profile verified' : (anyPassed ? 'Omitted under OR-scoring' : 'UCP not detected'),
  });

  // ap2-support
  results.push({
    checkId: 'ap2-support',
    status: supportedAp2 ? 'pass' : (anyPassed ? 'na' : 'warn'),
    earnedPoints: supportedAp2 ? 3 : 0,
    maxPoints: 3,
    isBonus: true,
    message: supportedAp2 ? 'Google AP2 authorization mandates supported' : (anyPassed ? 'Omitted under OR-scoring' : 'AP2 not detected'),
  });

  // x402-support
  results.push({
    checkId: 'x402-support',
    status: supportedX402 ? 'pass' : (anyPassed ? 'na' : 'warn'),
    earnedPoints: supportedX402 ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: supportedX402 ? 'HTTP 402 micropayments supported' : (anyPassed ? 'Omitted under OR-scoring' : 'x402 not detected'),
  });

  // mpp-support
  results.push({
    checkId: 'mpp-support',
    status: supportedMpp ? 'pass' : (anyPassed ? 'na' : 'warn'),
    earnedPoints: supportedMpp ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: supportedMpp ? 'Machine Payments Protocol verified' : (anyPassed ? 'Omitted under OR-scoring' : 'MPP not detected'),
  });

  let totalScore = 0;
  if (anyPassed) {
    totalScore = 10; // OR-Scoring: Full 10 pts for supporting any verified machine payment protocol
    details.push(`Payments full score awarded via verified protocol: ${verifiedProtocolName}`);
  } else {
    details.push('No autonomous machine payment protocols (x402, ACP, UCP, AP2) detected on e-commerce storefront');
  }

  return {
    score: totalScore,
    baseEarned: totalScore,
    bonusEarned: 0,
    isApplicable: true,
    checks: results,
    details,
    x402: { supported: supportedX402, headerPresent: supportedX402 },
    mpp: { supported: supportedMpp },
    ucp: { found: foundUcp },
    acp: { supported: foundAcp },
  };
}
