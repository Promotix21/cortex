import type { UsageSummary } from '@/types/session';
import { BarChart3, Zap, Hash } from 'lucide-react';

interface UsageBannerProps {
  usage: UsageSummary;
  getProjectName: (id: string) => string;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function UsageBanner({ usage, getProjectName }: UsageBannerProps) {
  const totalTokens = usage.today.tokenTotal;
  const sortedProjects = [...usage.byProject].sort((a, b) => b.tokenTotal - a.tokenTotal);

  return (
    <div
      className="rounded-lg px-4 py-3 mb-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Today's Summary */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={12} style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>
            Today
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Hash size={11} />
          <span>{usage.today.promptCount} prompts</span>
        </div>
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Zap size={11} />
          <span>~{formatTokens(totalTokens)} tokens</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {usage.today.sessionCount} session{usage.today.sessionCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Per-Project Breakdown */}
      {sortedProjects.length > 0 && totalTokens > 0 && (
        <div className="flex gap-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
          {sortedProjects.map((p, i) => {
            const pct = totalTokens > 0 ? (p.tokenTotal / totalTokens) * 100 : 0;
            if (pct < 1) return null;
            const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--error)', '#7F77DD'];
            return (
              <div
                key={p.projectId}
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: colors[i % colors.length],
                }}
                title={`${getProjectName(p.projectId)}: ${Math.round(pct)}%`}
              />
            );
          })}
        </div>
      )}

      {/* Legend */}
      {sortedProjects.length > 0 && totalTokens > 0 && (
        <div className="flex gap-3 mt-2 flex-wrap">
          {sortedProjects.slice(0, 5).map((p, i) => {
            const pct = totalTokens > 0 ? (p.tokenTotal / totalTokens) * 100 : 0;
            const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--error)', '#7F77DD'];
            return (
              <div key={p.projectId} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: colors[i % colors.length] }}
                />
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {getProjectName(p.projectId)} {Math.round(pct)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
