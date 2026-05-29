import { MetadataRoute } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deriveCompany } from '@/lib/resolveSlug';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://scan.glintbase.xyz';

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];

  // Dynamic scan routes from Supabase (vanity URLs)
  let scanRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('public_scans')
      .select('url, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!error && data) {
      // Deduplicate by company name to index only the latest unique scan per company
      const uniqueScansMap = new Map<string, string>();
      
      for (const scan of data) {
        try {
          const company = deriveCompany(scan.url).toLowerCase();
          if (company && !uniqueScansMap.has(company)) {
            uniqueScansMap.set(company, scan.created_at);
          }
        } catch {}
      }

      scanRoutes = Array.from(uniqueScansMap.entries()).map(([company, createdAt]) => ({
        url: `${baseUrl}/${company}-scan`,
        lastModified: new Date(createdAt),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    }
  } catch (err) {
    console.error('Sitemap generation error:', err);
  }

  return [...staticRoutes, ...scanRoutes];
}
