import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigation-store';
import { useSessionStore } from '@/stores/session-store';
import { XTerminal } from '@/components/terminal/XTerminal';
import { ArrowLeft, Square, Zap, Clock, MessageSquare, FileText, CheckCircle } from 'lucide-react';

interface SessionTerminalProps {
  sessionId: string;
}

export function SessionTerminal({ sessionId }: SessionTerminalProps) {
  const clearSessionView = useNavigationStore(s => s.clearSessionView);
  const { stopSession } = useSessionStore();
  const session = useSessionStore(s => s.sessions.find(sess => sess.id === sessionId));

  const isRunning = session?.status === 'running' || session?.status === 'idle';
  const terminalId = (session as any)?.terminalId;

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div
        className="flex items-center shrink-0"
        style={{
          gap: 12,
          padding: '10px 16px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={clearSessionView}
          className="flex items-center rounded-lg transition-colors"
          style={{
            gap: 6,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        <Zap size={16} style={{ color: isRunning ? 'var(--accent)' : 'var(--text-tertiary)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {session?.name || 'Session'}
        </span>

        <span
          className="rounded-lg"
          style={{
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 700,
            background: isRunning ? 'var(--success-dim)' : 'var(--bg-hover)',
            color: isRunning ? 'var(--success)' : 'var(--text-tertiary)',
          }}
        >
          {isRunning ? 'Running' : session?.status === 'completed' ? 'Completed' : session?.status || 'Unknown'}
        </span>

        <div className="flex-1" />

        <div className="flex items-center" style={{ gap: 8, fontSize: 13, color: 'var(--text-tertiary)' }}>
          <span># {session?.promptCount || 0} prompts</span>
          {isRunning && session?.pid && (
            <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span>PID {session.pid}</span>
            </>
          )}
        </div>

        {isRunning && (
          <button
            onClick={() => { stopSession(sessionId); clearSessionView(); }}
            className="flex items-center rounded-lg transition-all"
            style={{
              gap: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--error-dim)',
              color: 'var(--error)',
              border: '1px solid rgba(243,139,168,0.25)',
            }}
          >
            <Square size={13} />
            Stop Session
          </button>
        )}
      </div>

      {/* Content */}
      {isRunning && terminalId ? (
        // Use the SAME XTerminal component that works for regular terminals
        <XTerminal terminalId={terminalId} active={true} />
      ) : isRunning ? (
        // Fallback: session is running but no terminal ID (old session)
        <div className="flex-1 flex items-center justify-center" style={{ background: '#1e1e2e' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
            Session started before terminal linking was available. Stop and start a new session.
          </p>
        </div>
      ) : (
        // Completed session — show history
        <CompletedSessionView sessionId={sessionId} session={session} />
      )}
    </div>
  );
}

// ============================================================
// COMPLETED SESSION VIEW
// ============================================================

function CompletedSessionView({ sessionId, session }: { sessionId: string; session: any }) {
  const [history, setHistory] = useState<any[]>([]);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'handoff'>('history');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getSessionHistory(sessionId).catch(() => ({ history: [] })),
      api.getSessionHandoff(sessionId).catch(() => ({ handoff: null })),
    ]).then(([histData, handoffData]) => {
      if (cancelled) return;
      setHistory(histData.history || []);
      setHandoff(handoffData.handoff);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading session data...</span>
      </div>
    );
  }

  const startTime = session?.startedAt ? new Date(session.startedAt).toLocaleString() : '?';
  const endTime = session?.lastActive ? new Date(session.lastActive).toLocaleString() : '?';

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-primary)', padding: '24px 32px' }}>
      {/* Session Summary Card */}
      <div className="rounded-xl" style={{ padding: '20px 24px', marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center" style={{ gap: 16, marginBottom: 16 }}>
          <div className="rounded-lg flex items-center justify-center" style={{ width: 40, height: 40, background: 'var(--success-dim)' }}>
            <CheckCircle size={22} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Session Completed</h3>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{session?.name || 'Session'}</span>
          </div>
        </div>
        <div className="grid grid-cols-4" style={{ gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Started</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{startTime}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Ended</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{endTime}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Prompts</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{session?.promptCount || 0}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Tokens</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>~{(session?.tokenUsageInput || 0) + (session?.tokenUsageOutput || 0)}</div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex" style={{ gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('history')}
          className="flex items-center rounded-lg"
          style={{
            gap: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600,
            background: activeTab === 'history' ? 'var(--accent-dim)' : 'var(--bg-surface)',
            color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-tertiary)',
            border: `1px solid ${activeTab === 'history' ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          <MessageSquare size={16} />
          Prompt History ({history.length})
        </button>
        <button
          onClick={() => setActiveTab('handoff')}
          className="flex items-center rounded-lg"
          style={{
            gap: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600,
            background: activeTab === 'handoff' ? 'var(--accent-dim)' : 'var(--bg-surface)',
            color: activeTab === 'handoff' ? 'var(--accent)' : 'var(--text-tertiary)',
            border: `1px solid ${activeTab === 'handoff' ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          <FileText size={16} />
          Handoff Document
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'history' && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {history.length === 0 ? (
            <div className="rounded-xl text-center" style={{ padding: 40, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <MessageSquare size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>No prompt history recorded</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>Prompts are logged when you send input in the session terminal</p>
            </div>
          ) : (
            history.map((entry: any, i: number) => (
              <div key={entry.id || i} className="rounded-xl" style={{ padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>PROMPT #{i + 1}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <pre style={{
                  fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  margin: 0,
                }}>
                  {entry.prompt_text || entry.promptText || '(empty)'}
                </pre>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'handoff' && (
        <div className="rounded-xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {handoff ? (
            <pre style={{
              fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)',
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: 0,
            }}>
              {handoff}
            </pre>
          ) : (
            <div className="text-center" style={{ padding: 40 }}>
              <FileText size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>No handoff document generated</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Handoff is auto-generated when a session ends gracefully
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
