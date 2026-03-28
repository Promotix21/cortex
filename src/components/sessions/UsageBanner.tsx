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
      className="rounded-xl"
      style={{ padding: '16px 20px', marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Today's Summary */}
      <div className="flex items-center" style={{ gap: 16, marginBottom: 12 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
          <span className="uppercase tracking-wider font-medium" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Today
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
          <Hash size={14} />
          <span>{usage.today.promptCount} prompts</span>
        </div>
        <div className="flex items-center" style={{ gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
          <Zap size={14} />
          <span>~{formatTokens(totalTokens)} tokens</span>
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
          {usage.today.sessionCount} session{usage.today.sessionCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Per-Project Breakdown */}
      {sortedProjects.length > 0 && totalTokens > 0 && (
        <div className="flex rounded-full overflow-hidden" style={{ gap: 4, height: 8, background: 'var(--bg-hover)' }}>
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
        <div className="flex flex-wrap" style={{ gap: 14, marginTop: 10 }}>
          {sortedProjects.slice(0, 5).map((p, i) => {
            const pct = totalTokens > 0 ? (p.tokenTotal / totalTokens) * 100 : 0;
            const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--error)', '#7F77DD'];
            return (
              <div key={p.projectId} className="flex items-center" style={{ gap: 6 }}>
                <div
                  className="rounded-full"
                  style={{ width: 8, height: 8, background: colors[i % colors.length] }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
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
