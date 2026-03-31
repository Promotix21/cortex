import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { api } from '@/lib/api';

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
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);

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

    // Copy selection to clipboard on select
    term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {});
      }
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: active ? 'block' : 'none' }}
    />
  );
}
