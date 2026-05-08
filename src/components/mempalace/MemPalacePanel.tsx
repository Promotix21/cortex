import { useState, useEffect } from 'react';
import { api, type MemPalaceOverview, type MemPalaceFact, type MemPalaceInsight, type MemPalacePattern } from '@/lib/api';
import {
  Brain, RefreshCw, Search, Building2, Layers, GitBranch,
  Database, Shield, Globe, Code2, Zap, Tag,
  ArrowRight, Sparkles,
} from 'lucide-react';

type Tab = 'overview' | 'facts' | 'companies' | 'patterns';

const ROOM_ICONS: Record<string, React.ElementType> = {
  auth: Shield, database: Database, ui: Layers, api: Globe,
  testing: Code2, deploy: GitBranch, config: Zap, state: Layers,
  build: Code2, intelligence: Brain,
};

const ROOM_COLORS: Record<string, string> = {
  auth: '#f87171', database: '#22d3ee', ui: '#a78bfa', api: '#34d399',
  testing: '#fbbf24', deploy: '#f97316', config: '#ec4899', state: '#8b5cf6',
  build: '#eab308', intelligence: '#22d3ee',
};

export function MemPalacePanel() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<MemPalaceOverview | null>(null);
  const [facts, setFacts] = useState<MemPalaceFact[]>([]);
  const [factsTotal, setFactsTotal] = useState(0);
  const [insights, setInsights] = useState<MemPalaceInsight[]>([]);
  const [patterns, setPatterns] = useState<MemPalacePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRoom, setFilterRoom] = useState('');

  const loadOverview = async () => {
    try {
      const data = await api.mempalaceOverview();
      setOverview(data);
    } catch { /* */ }
  };

  const loadFacts = async () => {
    try {
      const data = await api.mempalaceFacts({
        company: filterCompany || undefined,
        room: filterRoom || undefined,
        search: search || undefined,
        limit: 100,
      });
      setFacts(data.facts);
      setFactsTotal(data.total);
    } catch { /* */ }
  };

  const loadInsights = async () => {
    try {
      const data = await api.mempalaceCompanies(filterCompany || undefined);
      setInsights(data.insights);
    } catch { /* */ }
  };

  const loadPatterns = async () => {
    try {
      const data = await api.mempalacePatterns();
      setPatterns(data.patterns);
    } catch { /* */ }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOverview(), loadFacts(), loadInsights(), loadPatterns()])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFacts(); }, [filterCompany, filterRoom, search]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.mempalaceSync();
      setSyncMessage(`Synced: ${result.factsCreated} facts, ${result.patternsFound} patterns, ${result.insightsGenerated} insights`);
      // Reload everything
      await Promise.all([loadOverview(), loadFacts(), loadInsights(), loadPatterns()]);
      setTimeout(() => setSyncMessage(''), 5000);
    } catch {
      setSyncMessage('Sync failed');
      setTimeout(() => setSyncMessage(''), 3000);
    }
    setSyncing(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
        <div className="flex items-center" style={{ gap: 16 }}>
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{
              width: 52, height: 52,
              background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(167,139,250,0.15))',
              border: '1px solid rgba(34,211,238,0.15)',
            }}
          >
            <Brain size={26} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Central MemPalace
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Cross-project intelligence across all your projects
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center rounded-xl transition-all"
          style={{
            gap: 8, padding: '12px 22px', fontSize: 14, fontWeight: 600,
            background: syncing ? 'var(--bg-hover)' : 'var(--accent)',
            color: syncing ? 'var(--text-tertiary)' : 'var(--bg-primary)',
            border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : syncMessage || 'Sync All Projects'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ gap: 4, marginBottom: 24 }}>
        {(['overview', 'facts', 'companies', 'patterns'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-lg capitalize transition-all"
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              background: tab === t ? 'var(--accent-dim)' : 'var(--bg-surface)',
              color: tab === t ? 'var(--accent)' : 'var(--text-tertiary)',
              border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center" style={{ padding: 48, color: 'var(--text-tertiary)' }}>
          Loading MemPalace...
        </div>
      ) : tab === 'overview' ? (
        <OverviewTab overview={overview} />
      ) : tab === 'facts' ? (
        <FactsTab
          facts={facts} total={factsTotal}
          search={search} onSearch={setSearch}
          filterCompany={filterCompany} onFilterCompany={setFilterCompany}
          filterRoom={filterRoom} onFilterRoom={setFilterRoom}
          companies={overview?.factsByCompany.map(c => c.company) || []}
          rooms={overview?.factsByRoom.map(r => r.room) || []}
        />
      ) : tab === 'companies' ? (
        <CompaniesTab insights={insights} />
      ) : (
        <PatternsTab patterns={patterns} />
      )}
    </div>
  );
}

// ── Overview Tab ──
function OverviewTab({ overview }: { overview: MemPalaceOverview | null }) {
  if (!overview) return <div style={{ color: 'var(--text-tertiary)' }}>No data yet. Click "Sync All Projects" to build the global memory.</div>;

  return (
    <div>
      {/* Stat Cards */}
      <div className="grid grid-cols-4" style={{ gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Facts" value={overview.totalFacts} accent="var(--accent)" />
        <StatCard label="Projects" value={overview.totalProjects} accent="var(--accent-purple)" />
        <StatCard label="Companies" value={overview.totalCompanies} accent="var(--success)" />
        <StatCard label="Cross Patterns" value={overview.crossProjectPatterns} accent="var(--warning)" />
      </div>

      {/* Facts by Company */}
      <div className="grid grid-cols-2" style={{ gap: 16, marginBottom: 24 }}>
        <div className="rounded-xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, color: 'var(--text-tertiary)' }}>
            Facts by Company
          </h3>
          {overview.factsByCompany.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No data</p>
          ) : (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {overview.factsByCompany.map(c => (
                <div key={c.company} className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <Building2 size={14} style={{ color: 'var(--accent-purple)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.company}</span>
                  </div>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <div style={{
                      width: Math.max(20, (c.count / Math.max(1, overview.factsByCompany[0]?.count)) * 120),
                      height: 6, borderRadius: 3,
                      background: 'var(--accent-purple)',
                      opacity: 0.6,
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>{c.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Facts by Room */}
        <div className="rounded-xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, color: 'var(--text-tertiary)' }}>
            Knowledge Rooms
          </h3>
          {overview.factsByRoom.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No data</p>
          ) : (
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {overview.factsByRoom.map(r => {
                const Icon = ROOM_ICONS[r.room] || Tag;
                const color = ROOM_COLORS[r.room] || 'var(--text-tertiary)';
                return (
                  <span key={r.room} className="flex items-center rounded-lg" style={{
                    gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                    background: `${color}15`, color, border: `1px solid ${color}30`,
                  }}>
                    <Icon size={13} />
                    {r.room} ({r.count})
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Subjects */}
      <div className="rounded-xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, color: 'var(--text-tertiary)' }}>
          Top Knowledge Subjects
        </h3>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {overview.topSubjects.map(s => (
            <span key={s.subject} className="rounded-lg" style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 600,
              background: 'var(--bg-hover)', color: 'var(--accent)', border: '1px solid var(--border)',
            }}>
              {s.subject} <span style={{ opacity: 0.5 }}>({s.count})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Facts Browser Tab ──
function FactsTab({ facts, total, search, onSearch, filterCompany, onFilterCompany, filterRoom, onFilterRoom, companies, rooms }: {
  facts: MemPalaceFact[]; total: number;
  search: string; onSearch: (v: string) => void;
  filterCompany: string; onFilterCompany: (v: string) => void;
  filterRoom: string; onFilterRoom: (v: string) => void;
  companies: string[]; rooms: string[];
}) {
  return (
    <div>
      {/* Filters */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
        <div className="flex-1 relative">
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search all knowledge..."
            className="w-full rounded-lg outline-none"
            style={{ padding: '10px 14px 10px 36px', fontSize: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={filterCompany}
          onChange={(e) => onFilterCompany(e.target.value)}
          className="rounded-lg outline-none"
          style={{ padding: '10px 14px', fontSize: 13, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All Companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterRoom}
          onChange={(e) => onFilterRoom(e.target.value)}
          className="rounded-lg outline-none"
          style={{ padding: '10px 14px', fontSize: 13, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All Rooms</option>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>{total} facts</div>

      {/* Facts List */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        {facts.length === 0 ? (
          <div className="text-center rounded-xl" style={{ padding: 40, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Brain size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>No facts found</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Click "Sync All Projects" to build the global memory</p>
          </div>
        ) : (
          facts.map(fact => (
            <div
              key={fact.id}
              className="rounded-lg"
              style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                <span className="rounded" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {fact.subject}
                </span>
                <ArrowRight size={12} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-purple)' }}>{fact.predicate}</span>
                <ArrowRight size={12} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{fact.object}</span>
              </div>
              <div className="flex items-center" style={{ gap: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                {fact.projectName && <span>{fact.projectName}</span>}
                {fact.company && <span style={{ color: 'var(--accent-purple)' }}>{fact.company}</span>}
                {fact.roomTag && <span style={{ color: ROOM_COLORS[fact.roomTag] || 'var(--text-tertiary)' }}>{fact.roomTag}</span>}
                <span>{fact.confidence}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Companies Tab ──
function CompaniesTab({ insights }: { insights: MemPalaceInsight[] }) {
  // Group by company
  const grouped = new Map<string, MemPalaceInsight[]>();
  for (const i of insights) {
    if (!grouped.has(i.company)) grouped.set(i.company, []);
    grouped.get(i.company)!.push(i);
  }

  if (grouped.size === 0) {
    return (
      <div className="text-center rounded-xl" style={{ padding: 40, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <Building2 size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>No company insights yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Sync projects to generate company-level intelligence</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {Array.from(grouped).map(([company, companyInsights]) => (
        <div key={company} className="rounded-xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
            <Building2 size={18} style={{ color: 'var(--accent-purple)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{company}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{companyInsights.length} insights</span>
          </div>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {companyInsights.map(insight => {
              const typeColor = insight.insightType === 'tech_stack' ? 'var(--accent)'
                : insight.insightType === 'convention' ? 'var(--warning)'
                : insight.insightType === 'summary' ? 'var(--accent-purple)'
                : 'var(--success)';
              return (
                <div key={insight.id} className="rounded-lg" style={{ padding: '12px 16px', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                    <span className="rounded" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: `${typeColor}20`, color: typeColor }}>
                      {insight.insightType.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{insight.title}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{insight.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Patterns Tab ──
function PatternsTab({ patterns }: { patterns: MemPalacePattern[] }) {
  if (patterns.length === 0) {
    return (
      <div className="text-center rounded-xl" style={{ padding: 40, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <Sparkles size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>No cross-project patterns yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Patterns appear when multiple projects share technologies or issues</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {patterns.map(p => {
        const typeColor = p.patternType === 'shared_tech' ? 'var(--accent)'
          : p.patternType === 'recurring_issue' ? 'var(--error)'
          : p.patternType === 'common_convention' ? 'var(--warning)'
          : 'var(--success)';
        return (
          <div key={p.id} className="rounded-xl" style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
              <span className="rounded" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: `${typeColor}20`, color: typeColor }}>
                {p.patternType.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{p.title}</span>
              <span className="rounded-full" style={{
                padding: '2px 10px', fontSize: 11, fontWeight: 700,
                background: 'var(--accent-dim)', color: 'var(--accent)',
              }}>
                {p.occurrenceCount} projects
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>{p.description}</p>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {p.projectNames.map(name => (
                <span key={name} className="rounded" style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                }}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl" style={{ padding: '18px 22px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent }}>
        {value}
      </div>
    </div>
  );
}
