import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { getScanBySlug, deriveCompany } from "@/lib/resolveSlug";

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  if (params.slug.includes('.') || ['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg', 'leaderboard', 'api'].includes(params.slug)) {
    return {};
  }

  const data = await getScanBySlug(params.slug);
  if (!data) {
    return {};
  }

  const company = deriveCompany(data.url).toLowerCase();

  return {
    alternates: {
      canonical: `https://scan.glintbase.dev/scan/${company}`,
    },
  };
}

export default async function DynamicSlugScanPage({ params }: { params: { slug: string } }) {
  if (params.slug.includes('.') || ['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg', 'leaderboard', 'api'].includes(params.slug)) {
    notFound();
  }

  const data = await getScanBySlug(params.slug);

  if (!data) {
    notFound();
  }

  const company = deriveCompany(data.url).toLowerCase();
  permanentRedirect(`/scan/${company}`);
}

