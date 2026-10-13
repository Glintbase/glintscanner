import Link from "next/link";
import { History } from "lucide-react";
import {
  groupHistoryByVersion,
  layoutHistoryChart,
  type ScanHistoryEntry,
} from "@/lib/scanHistory";

interface ScoreHistoryProps {
  slug: string;
  entries: ScanHistoryEntry[];
  /** Scan currently shown on the page. */
  currentScanId?: string;
}

/** Current version first (brand orange), then older versions. */
const VERSION_COLORS = ["#FF3300", "#22D3EE", "#A78BFA", "#F59E0B", "#94A3B8", "#F472B6"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Compact score history for a company's scorecard page. Scores from different
 * ARS versions are coloured separately and never joined by a line.
 */
export default function ScoreHistory({ slug, entries, currentScanId }: ScoreHistoryProps) {
  if (!entries || entries.length < 2) return null;

  const groups = groupHistoryByVersion(entries);
  // Current version always gets the brand colour; the rest follow recency.
  const ordered = [...groups.filter((g) => g.isCurrent), ...groups.filter((g) => !g.isCurrent)];
  const colorOf = new Map(ordered.map((g, i) => [g.key, VERSION_COLORS[i % VERSION_COLORS.length]]));
  const labelOf = new Map(groups.map((g) => [g.key, g.label]));
  const groupKeyOf = (e: ScanHistoryEntry) => e.scoreVersion || "unknown";

  const chart = layoutHistoryChart(groups, { width: 600, height: 150 });
  const oldest = entries[entries.length - 1];
  const newest = entries[0];
  const scanHref = (id: string) => `/scan/${slug}?id=${encodeURIComponent(id)}`;

  return (
    <section className="w-full max-w-3xl mx-auto mb-8 px-4 sm:px-0" aria-labelledby="score-history-heading">
      <div className="glint-card relative rounded-2xl border border-white/10 overflow-hidden p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2
            id="score-history-heading"
            className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-[0.35em]"
          >
            <History size={12} className="text-[#FF3300]" />
            Score history
          </h2>
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">
            {entries.length} scans
          </span>
        </div>

        {/* Legend */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
          {ordered.map((g) => (
            <li key={g.key} className="flex items-center gap-1.5 text-[11px] font-mono text-white/60">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorOf.get(g.key) }} />
              {g.label}
              {g.isCurrent && <span className="text-white/30">(current)</span>}
              <span className="text-white/30">· {g.entries.length}</span>
            </li>
          ))}
        </ul>

        {/* Chart */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            className="w-full h-auto block"
            role="img"
            aria-label={`Score history for ${slug}: ${entries.length} scans across ${groups.length} scoring versions`}
          >
            {[0, 50, 100].map((v) => {
              const y = chart.padY + (chart.height - chart.padY * 2) * (1 - v / 100);
              return (
                <g key={v}>
                  <line x1={chart.padX} x2={chart.width - chart.padX} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" />
                  <text x={chart.padX - 4} y={y + 3} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">
                    {v}
                  </text>
                </g>
              );
            })}
            {chart.series.map((s) =>
              s.segments
                .filter((seg) => seg.length > 1)
                .map((seg, i) => (
                  <polyline
                    key={`${s.groupKey}-${i}`}
                    points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={colorOf.get(s.groupKey)}
                    strokeOpacity={0.7}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))
            )}
            {chart.series.map((s) =>
              s.points.map((p) => {
                const isCurrent = p.entry.id === currentScanId;
                const color = colorOf.get(s.groupKey);
                return (
                  <a key={p.entry.id} href={scanHref(p.entry.id)}>
                    <title>{`${formatDate(p.entry.createdAt)} · ${p.entry.score}/100 · ${labelOf.get(s.groupKey)}${isCurrent ? " (viewing)" : ""}`}</title>
                    {isCurrent && <circle cx={p.x} cy={p.y} r={8} fill="none" stroke="#fff" strokeWidth={1.5} />}
                    <circle cx={p.x} cy={p.y} r={isCurrent ? 5 : 3.5} fill={color} stroke="#000" strokeWidth={1} />
                  </a>
                );
              })
            )}
          </svg>
          <div className="flex justify-between px-1 pt-1 text-[10px] font-mono text-white/30">
            <span>{formatDate(oldest.createdAt)}</span>
            <span>{formatDate(newest.createdAt)}</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-white/50 leading-relaxed">
          Scores from different ARS versions aren&apos;t comparable — each version uses different scoring rules, so lines only connect scans of the same version.{" "}
          <a
            href="https://glintbase.dev/methodology"
            target="_blank"
            rel="noreferrer"
            className="text-[#FF3300] hover:underline whitespace-nowrap"
          >
            Read the methodology
          </a>
        </p>

        {/* Table */}
        <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs font-mono">
            <thead className="sticky top-0 bg-[#0B0B0D] text-[10px] uppercase tracking-[0.2em] text-white/30">
              <tr>
                <th className="px-2 sm:px-3 py-2 font-normal">Date</th>
                <th className="px-2 sm:px-3 py-2 font-normal text-right">Score</th>
                <th className="px-2 sm:px-3 py-2 font-normal text-center">Grade</th>
                <th className="px-2 sm:px-3 py-2 font-normal">Version</th>
                <th className="px-2 sm:px-3 py-2 font-normal text-right"><span className="sr-only">Link</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isCurrent = e.id === currentScanId;
                const key = groupKeyOf(e);
                return (
                  <tr
                    key={e.id}
                    className={`border-t border-white/[0.06] ${isCurrent ? "bg-[#FF3300]/10" : "hover:bg-white/[0.03]"}`}
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    <td className="px-2 sm:px-3 py-2 text-white/70 whitespace-nowrap">{formatDate(e.createdAt)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right text-white font-bold">{e.score}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-white/70">{e.grade ?? "—"}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-white/60">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorOf.get(key) }} />
                        {labelOf.get(key)}
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">
                      {isCurrent ? (
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF3300]">Viewing</span>
                      ) : (
                        <Link href={scanHref(e.id)} className="text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white">
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
