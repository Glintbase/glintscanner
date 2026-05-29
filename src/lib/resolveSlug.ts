import { createServerSupabaseClient } from "@/lib/supabase/server";

export function deriveCompany(rawUrl: string): string {
  let hostname = rawUrl;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    hostname = rawUrl.replace(/^https?:\/\//i, '').split('/')[0];
  }
  hostname = hostname.toLowerCase().replace(/^www\./i, '');
  let company = hostname.split('.')[0];
  if (['docs', 'www', 'developer', 'dev', 'api'].includes(company)) {
    company = hostname.split('.')[1] || company;
  }
  return company.charAt(0).toUpperCase() + company.slice(1);
}

export async function getScanBySlug(slug: string) {
  // Extract company name from slug, e.g. "stripe-scan" -> "stripe", "stripe" -> "stripe"
  let companyName = slug.toLowerCase();
  if (companyName.endsWith('-scan')) {
    companyName = companyName.slice(0, -5);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('public_scans')
    .select('*')
    .order('score', { ascending: false });

  if (error || !data || data.length === 0) return null;

  // Find the highest scoring scan that matches this company name
  const match = data.find(item => {
    const derived = deriveCompany(item.url).toLowerCase();
    return derived === companyName;
  });

  return match || null;
}
