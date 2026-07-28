"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowRight, Lock } from "lucide-react";

interface EmailGateModalProps {
  open: boolean;
  /** Context of the just-completed scan, linked to the lead server-side. */
  scanId?: string | null;
  companySlug?: string | null;
  url?: string | null;
  score?: number | null;
  /** Called with the normalized email after a successful submit. */
  onUnlocked: (email: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Hard email gate shown once per browser after a user's own scan completes.
 * No close / skip affordance by design — the report unlocks on submit.
 */
export default function EmailGateModal({
  open,
  scanId,
  companySlug,
  url,
  score,
  onUnlocked,
}: EmailGateModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalized,
          scanId: scanId || undefined,
          companySlug: companySlug || undefined,
          url: url || undefined,
          score: typeof score === "number" ? score : undefined,
        }),
      });
    } catch {
      // Persistence failures never trap the user — unlock regardless.
    }
    setSubmitting(false);
    onUnlocked(normalized);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="glint-card relative w-full max-w-md rounded-2xl border border-white/10 bg-black p-8"
          >
            {/* Accent glow */}
            <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(255,51,0,0.10),transparent_60%)] pointer-events-none" />

            <div className="relative space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-mono text-[#FF3300] uppercase tracking-[0.4em]">
                <Lock size={12} />
                Report Ready
              </div>

              <h2 className="text-2xl font-black uppercase tracking-tighter text-white leading-tight">
                Your Agent Readiness Report is ready
              </h2>
              <p className="text-sm text-white/40 leading-relaxed">
                Enter your email to unlock the full breakdown
                {typeof score === "number" ? (
                  <>
                    {" "}
                    — including how a score of{" "}
                    <span className="text-white font-bold">{score}/100</span> stacks up.
                  </>
                ) : (
                  "."
                )}
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                  />
                  <input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="you@company.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white placeholder:text-white/25 font-mono focus:outline-none focus:border-[#FF3300]/60 focus:ring-1 focus:ring-[#FF3300]/40 transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-xs font-mono text-[#FF3300]">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#FF3300] text-white font-black text-xs uppercase tracking-[0.25em] px-6 py-4 rounded-xl shadow-[0_0_40px_rgba(255,51,0,0.35)] hover:bg-[#FF3300]/90 hover:shadow-[0_0_50px_rgba(255,51,0,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Unlocking…" : "View my report"}
                  {!submitting && <ArrowRight size={14} />}
                </button>
              </form>

              <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest text-center">
                No spam — product updates only
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
