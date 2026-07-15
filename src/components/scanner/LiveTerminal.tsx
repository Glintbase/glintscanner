"use client";

import { useEffect, useRef } from 'react';
import { Terminal, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Log {
  id: string;
  type: 'progress' | 'check' | 'error' | 'warning' | 'complete';
  message?: string;
  status?: string;
  check?: string;
  category?: string;
  score?: number;
  [key: string]: any;
}

export default function LiveTerminal({ logs, isComplete }: { logs: Log[], isComplete: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full max-w-3xl mx-auto rounded-lg border border-surface-800 bg-surface-950 overflow-hidden shadow-2xl font-mono text-sm">
      <div className="bg-surface-900 border-b border-surface-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-surface-400">
          <Terminal size={16} />
          <span>scan_execution.log</span>
        </div>
        {!isComplete && (
          <div className="flex items-center gap-2 text-brand">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs font-semibold tracking-wider uppercase">Running Analysis</span>
          </div>
        )}
      </div>
      
      <div 
        ref={scrollRef}
        className="h-80 overflow-y-auto p-4 space-y-2"
      >
        <AnimatePresence>
          {logs.filter(log => log.type !== 'warning').map((log) => {
            let icon = <span className="text-surface-500 w-6">[ LOG ]</span>;
            let textClass = "text-surface-300";

            if (log.type === 'progress') {
              icon = <span className="text-accent w-6">[ {log.status === 'running' ? 'SCAN' : ' OK '} ]</span>;
              textClass = "text-accent";
            } else if (log.type === 'check') {
              if (log.score === log.maxScore) {
                icon = <span className="text-success w-6">[  OK  ]</span>;
                textClass = "text-success";
              } else if (log.score && log.score > 0) {
                icon = <span className="text-warning w-6">[ WARN ]</span>;
                textClass = "text-warning";
              } else {
                icon = <span className="text-danger w-6">[ FAIL ]</span>;
                textClass = "text-danger";
              }
            } else if (log.type === 'error') {
              icon = <span className="text-danger w-6">[ ERR  ]</span>;
              textClass = "text-danger";
            }

            const getMessage = (l: Log) => {
              if (l.type === 'error') {
                const msg = (l.message || '').toLowerCase();
                if (msg && (msg.includes('unreachable') || msg.includes('invalid') || msg.includes('exist') || msg.includes('url') || msg.includes('domain'))) {
                  return l.message;
                }
                return 'An issue occurred during analysis. Please try again.';
              }
              if (l.message) return l.message;
              if (l.type === 'progress') {
              const stepName = 
                  l.check === 'validation' ? 'DNS & Reachability Check' : 
                  l.check === 'discovery' ? 'Ecosystem Surface Discovery' : 
                  l.check === 'classification' ? 'Surface Metadata Classification' :
                  l.check === 'framework' ? 'Ecosystem Framework Detection' :
                  l.check === 'crawling' ? 'High-Value Page Crawl & Extraction' :
                  l.check === 'graph' ? 'Ecosystem Context Graph Construction' :
                  l.check === 'journey' ? 'Agent Journey Pathfinder' :
                  l.check === 'scoring' ? 'Readiness Index Synthesis' : 
                  l.check;
                return `${stepName} ${l.status}...`;
              }
              if (l.type === 'check') {
                const categoryNames: Record<string, string> = {
                  context: 'Context Optimization & Token Efficiency',
                  code: 'Code Block Execution & Syntactical Integrity',
                  machine: 'Machine Readability & API Autocomplete',
                  agent: 'Agent Tooling & Dynamic Interfaces'
                };
                const name = categoryNames[l.category || ''] || l.category;
                return `Analyzed ${name} — Score: ${l.score}/${l.maxScore}`;
              }
              return 'Processing...';
            };

            return (
              <motion.div 
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3"
              >
                <div className="flex-shrink-0 font-bold whitespace-pre">{icon}</div>
                <div className={textClass}>{getMessage(log)}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {!isComplete && (
          <div className="flex items-start gap-3 animate-pulse">
            <div className="text-brand font-bold w-6">[ ...]</div>
            <div className="text-surface-500 w-2 h-4 bg-brand mt-0.5"></div>
          </div>
        )}
      </div>
    </div>
  );
}
