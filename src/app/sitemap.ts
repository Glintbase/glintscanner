import { MetadataRoute } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

  // Dynamic scan routes from Supabase
  let scanRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('public_scans')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && data) {
      scanRoutes = data.map((scan) => ({
        url: `${baseUrl}/scan/${scan.id}`,
        lastModified: new Date(scan.created_at),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    }
  } catch (err) {
    console.error('Sitemap generation error:', err);
  }

  return [...staticRoutes, ...scanRoutes];
}
