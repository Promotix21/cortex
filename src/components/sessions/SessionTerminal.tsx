import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigation-store';
import { useSessionStore } from '@/stores/session-store';
import { ArrowLeft, Square, Zap } from 'lucide-react';

interface SessionTerminalProps {
  sessionId: string;
}

export function SessionTerminal({ sessionId }: SessionTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pollRef = useRef<number | null>(null);
  const lastLenRef = useRef(0);

  const clearSessionView = useNavigationStore(s => s.clearSessionView);
  const { stopSession } = useSessionStore();
  const session = useSessionStore(s => s.sessions.find(sess => sess.id === sessionId));

  const startPolling = useCallback((term: Terminal) => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const { output } = await api.getSessionOutput(sessionId);
        if (output && output.length > lastLenRef.current) {
          const newContent = output.slice(lastLenRef.current);
          term.write(newContent);
          lastLenRef.current = output.length;
        }
      } catch { /* sidecar down */ }
    }, 200);
  }, [sessionId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineHeight: 1.3,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b7066',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fitAddon;

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // Send keystrokes to the session
    term.onData((data) => {
      api.sendInput(sessionId, data).catch(() => {});
    });

    // Notify sidecar of resize
    term.onResize(() => {
      // Sessions don't have a resize endpoint yet
    });

    // Load initial output
    api.getSessionOutput(sessionId).then(({ output }) => {
      if (output) {
        term.write(output);
        lastLenRef.current = output.length;
      }
      fitAddon.fit();
    }).catch(() => {});

    startPolling(term);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      term.dispose();
    };
  }, [sessionId, startPolling]);

  // Refit on window resize
  useEffect(() => {
    const handleResize = () => fitRef.current?.fit();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isRunning = session?.status === 'running' || session?.status === 'idle';

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

        <Zap size={16} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {session?.name || 'Session'}
        </span>

        {isRunning && (
          <span
            className="rounded-lg"
            style={{
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--success-dim)',
              color: 'var(--success)',
            }}
          >
            Running
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center" style={{ gap: 8, fontSize: 13, color: 'var(--text-tertiary)' }}>
          <span># {session?.promptCount || 0} prompts</span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span>PID {session?.pid || '?'}</span>
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

      {/* Terminal output */}
      <div ref={containerRef} className="flex-1" style={{ background: '#1e1e2e' }} />
    </div>
  );
}
