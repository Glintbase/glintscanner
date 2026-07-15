-- Glintscanner Relational Graph Migration Script
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Create scan_nodes table (scoped per scan)
CREATE TABLE IF NOT EXISTS scan_nodes (
    scan_id UUID REFERENCES public_scans(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    type TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_strategy TEXT NOT NULL,
    title TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_hash TEXT,
    confidence DOUBLE PRECISION DEFAULT 1.0,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (scan_id, node_id)
);

-- Indexing for fast search and joins
CREATE INDEX IF NOT EXISTS idx_scan_nodes_scan_id ON scan_nodes(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_nodes_type ON scan_nodes(type);

-- Create scan_edges table (scoped per scan)
CREATE TABLE IF NOT EXISTS scan_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID REFERENCES public_scans(id) ON DELETE CASCADE,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    source_url TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    FOREIGN KEY (scan_id, from_id) REFERENCES scan_nodes(scan_id, node_id) ON DELETE CASCADE,
    FOREIGN KEY (scan_id, to_id) REFERENCES scan_nodes(scan_id, node_id) ON DELETE CASCADE
);

-- Indexing for joins and traversals
CREATE INDEX IF NOT EXISTS idx_scan_edges_scan_id ON scan_edges(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_edges_from_to ON scan_edges(scan_id, from_id, to_id);

-- Enable Row Level Security (RLS)
ALTER TABLE scan_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_edges ENABLE ROW LEVEL SECURITY;

-- Allow public read access to scan results
CREATE POLICY "Allow public read access on scan_nodes" ON scan_nodes FOR SELECT USING (true);
CREATE POLICY "Allow public read access on scan_edges" ON scan_edges FOR SELECT USING (true);

-- Phase 2: evidence + synthetic flags (also stored in properties JSONB for compatibility)
ALTER TABLE scan_nodes ADD COLUMN IF NOT EXISTS synthetic BOOLEAN DEFAULT false;
ALTER TABLE scan_nodes ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_scan_nodes_synthetic ON scan_nodes(scan_id, synthetic)
  WHERE synthetic = true;

-- Phase 4: ARS score versioning on public_scans
ALTER TABLE public_scans ADD COLUMN IF NOT EXISTS score_version TEXT DEFAULT 'ars-1.0.0';
ALTER TABLE public_scans ADD COLUMN IF NOT EXISTS dimension_scores JSONB DEFAULT NULL;
ALTER TABLE public_scans ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_public_scans_score_version ON public_scans(score_version);
CREATE INDEX IF NOT EXISTS idx_public_scans_score ON public_scans(score DESC);

-- Phase 5: slug index, soft history, status
ALTER TABLE public_scans ADD COLUMN IF NOT EXISTS company_slug TEXT;
ALTER TABLE public_scans ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;
ALTER TABLE public_scans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'complete';

CREATE INDEX IF NOT EXISTS idx_public_scans_company_slug ON public_scans(company_slug);
CREATE INDEX IF NOT EXISTS idx_public_scans_company_slug_latest
  ON public_scans(company_slug, created_at DESC)
  WHERE is_latest = true;

-- Backfill company_slug from url host (best-effort; re-scan preferred)
-- UPDATE public_scans SET company_slug = lower(split_part(regexp_replace(regexp_replace(url, '^https?://(www\.)?', ''), '/.*$', ''), '.', 1))
-- WHERE company_slug IS NULL;

