import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { api } from '@/lib/api';
import { getCurrentWebview } from '@tauri-apps/api/webview';

interface XTerminalProps {
  terminalId: string;
  active: boolean;
}

export function XTerminal({ terminalId, active }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pollSeqRef = useRef(-1);
  const pollIntervalRef = useRef<number | null>(null);
  const initialLoadDone = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const fitTimeoutRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /** Fallback clipboard copy for Tauri webview where navigator.clipboard may fail */
  const fallbackCopy = useCallback((text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }, []);

  /** Debounced fit — coalesces rapid resize events, syncs PTY size */
  const debouncedFit = useCallback(() => {
    if (fitTimeoutRef.current) cancelAnimationFrame(fitTimeoutRef.current);
    fitTimeoutRef.current = requestAnimationFrame(() => {
      const fit = fitRef.current;
      const term = termRef.current;
      if (!fit || !term) return;
      try {
        fit.fit();
        api.resizeTerminal(terminalId, term.cols, term.rows).catch(() => {});
      } catch {
        // Terminal might be disposed during rapid switching
      }
    });
  }, [terminalId]);

  const startPolling = useCallback((term: Terminal) => {
    if (pollIntervalRef.current) return;

    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const result = await api.pollTerminal(terminalId, pollSeqRef.current);
        if (result.chunks.length > 0) {
          for (const chunk of result.chunks) {
            term.write(chunk.data);
          }
          pollSeqRef.current = result.nextSeq - 1;
        }
      } catch {
        // Sidecar might be down
      }
    }, 100);
  }, [terminalId]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
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
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = '11';

    term.open(containerRef.current);

    // Use WebGL renderer for proper color rendering (DOM renderer can be broken by Tailwind CSS)
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available — fall back to default DOM renderer
    }

    termRef.current = term;
    fitRef.current = fitAddon;

    // Delay fit to ensure container has layout dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
      api.resizeTerminal(terminalId, term.cols, term.rows).catch(() => {});
    });

    // ResizeObserver — the real fix for tab switches, sidebar collapse, panel resize
    const observer = new ResizeObserver(() => {
      if (active) debouncedFit();
    });
    observer.observe(containerRef.current);
    resizeObserverRef.current = observer;

    // Send keystrokes to sidecar
    term.onData((data) => {
      api.writeTerminal(terminalId, data).catch(() => {});
    });

    // Copy selection to clipboard on select (with Tauri-safe fallback)
    term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection) {
        // navigator.clipboard can silently fail in Tauri webview — use fallback
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(selection).catch(() => {
            fallbackCopy(selection);
          });
        } else {
          fallbackCopy(selection);
        }
      }
    });

    // Key handler: copy/paste + Ctrl+C-with-selection guard
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      if (e.ctrlKey && !e.shiftKey) {
        // Ctrl+C — if text is selected, copy to clipboard instead of sending SIGINT
        if (e.key === 'C' || e.key === 'c') {
          const selection = term.getSelection();
          if (selection) {
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(selection).catch(() => fallbackCopy(selection));
            } else {
              fallbackCopy(selection);
            }
            return false; // Prevent SIGINT
          }
          return true; // No selection — let SIGINT through
        }
        // Ctrl+V — handle paste exactly once (WebKitGTK fires both a native paste
        // event AND xterm's built-in handler, causing double paste)
        if (e.key === 'V' || e.key === 'v') {
          navigator.clipboard?.readText?.().then((text) => {
            if (text) api.writeTerminal(terminalId, text).catch(() => {});
          }).catch(() => {});
          return false; // Prevent xterm's own paste handler
        }
      }

      if (e.ctrlKey && e.shiftKey) {
        // Ctrl+Shift+C → explicit copy
        if (e.key === 'C' || e.key === 'c') {
          const selection = term.getSelection();
          if (selection) {
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(selection).catch(() => fallbackCopy(selection));
            } else {
              fallbackCopy(selection);
            }
          }
          return false;
        }
        // Ctrl+Shift+V → paste
        if (e.key === 'V' || e.key === 'v') {
          navigator.clipboard?.readText?.().then((text) => {
            if (text) api.writeTerminal(terminalId, text).catch(() => {});
          }).catch(() => {});
          return false;
        }
      }

      return true;
    });

    // Right-click paste
    containerRef.current?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      navigator.clipboard?.readText?.().then((text) => {
        if (text) api.writeTerminal(terminalId, text).catch(() => {});
      }).catch(() => {});
    });

    // Notify sidecar of resize
    term.onResize(({ cols, rows }) => {
      api.resizeTerminal(terminalId, cols, rows).catch(() => {});
    });

    // Load initial output after fit
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      setTimeout(() => {
        api.getTerminalOutput(terminalId).then(({ output }) => {
          if (output) term.write(output);
          fitAddon.fit();
        }).catch(() => {});
      }, 200);
    }

    // Start polling for output
    startPolling(term);

    return () => {
      stopPolling();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (fitTimeoutRef.current) cancelAnimationFrame(fitTimeoutRef.current);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId, startPolling, stopPolling, debouncedFit]);

  // Re-fit on tab activation — use double rAF to wait for display:block layout
  useEffect(() => {
    if (!active || !fitRef.current || !termRef.current) return;
    // Double requestAnimationFrame ensures the browser has painted after display:block
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fit = fitRef.current;
        const term = termRef.current;
        if (!fit || !term) return;
        try {
          fit.fit();
          api.resizeTerminal(terminalId, term.cols, term.rows).catch(() => {});
        } catch { /* disposed */ }
      });
    });
  }, [active, terminalId]);

  // Re-fit on window resize
  useEffect(() => {
    const handleResize = () => {
      if (active) debouncedFit();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, debouncedFit]);

  // Tauri drag-drop: paste file/folder paths into terminal.
  // Uses the drop position to scope the event to THIS terminal's container only —
  // prevents all active terminals in a multi-session window from receiving the same drop.
  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | null = null;

    const isOverContainer = (pos: { x: number; y: number } | undefined): boolean => {
      if (!pos || !containerRef.current) return true; // fall back to allow if no position
      const rect = containerRef.current.getBoundingClientRect();
      return pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
    };

    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'enter') {
        if (isOverContainer((event.payload as any).position)) setDragOver(true);
      } else if (event.payload.type === 'leave') {
        setDragOver(false);
      } else if (event.payload.type === 'drop') {
        setDragOver(false);
        if (!isOverContainer((event.payload as any).position)) return;
        const paths = event.payload.paths;
        if (paths.length > 0) {
          const quoted = paths.map(p => p.includes(' ') ? `"${p}"` : p).join(' ');
          api.writeTerminal(terminalId, quoted).catch(() => {});
        }
      }
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [active, terminalId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: active ? 'block' : 'none' }}>
      <div
        ref={containerRef}
        className="w-full h-full"
      />
      {dragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(30, 30, 46, 0.8)',
            border: '3px dashed var(--accent)',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
            Drop to paste path
          </span>
        </div>
      )}
    </div>
  );
}
