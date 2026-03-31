import { useEffect, useState, useCallback } from 'react';
import { Toaster } from 'sonner';
import { ActivityBar } from '@/components/ActivityBar';
import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { StatusBar } from '@/components/StatusBar';
import { SessionDashboard } from '@/components/sessions/SessionDashboard';
import { SetupWizard } from '@/components/SetupWizard';
import { BudgetGuard } from '@/components/budget/BudgetGuard';
import { CommandPalette } from '@/components/CommandPalette';
import { useSettingsStore } from '@/stores/settings-store';
import { useSessionStore } from '@/stores/session-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { useProjectStore } from '@/stores/project-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { api } from '@/lib/api';

export default function App() {
  const { claudeStatus, checkClaudeStatus } = useSettingsStore();
  const fetchSessions = useSessionStore(s => s.fetchSessions);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sidecarReady, setSidecarReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Wait for sidecar to be available (retries on connection refused)
  const waitForSidecar = useCallback(async () => {
    for (let i = 0; i < 30; i++) {
      try {
        await api.health();
        setSidecarReady(true);
        return;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    // After 15s of retries, show the app anyway (sidecar may be started manually)
    setSidecarReady(true);
  }, []);

  useEffect(() => {
    waitForSidecar().then(() => {
      checkClaudeStatus().finally(() => setChecking(false));
      fetchSessions();
    });
  }, [waitForSidecar, checkClaudeStatus, fetchSessions]);

  useEffect(() => {
    if (!sidecarReady) return;
    const interval = setInterval(() => fetchSessions(), 5000);
    return () => clearInterval(interval);
  }, [sidecarReady, fetchSessions]);

  // Tab index → activity mapping for Ctrl+1-9
  const tabActivities: import('@/stores/navigation-store').ActivityId[] = [
    'dashboard', 'terminal', 'sessions', 'git', 'notes', 'brain', 'chat', 'documents', 'studio',
  ];

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          return;
        }
        // Let Ctrl+K and Ctrl+S work even in inputs
        if (!(e.ctrlKey && (e.key === 'k' || e.key === 's'))) return;
      }

      const nav = useNavigationStore.getState();
      const projStore = useProjectStore.getState();
      const termStore = useTerminalStore.getState();

      // Ctrl+Shift combinations
      if (e.ctrlKey && e.shiftKey && !e.altKey) {
        switch (e.key) {
          case 'N':
            e.preventDefault();
            // New terminal (Ctrl+Shift+N)
            nav.setActivity('terminal');
            { const p = projStore.activeProject();
              if (p) termStore.spawnTerminal(p.id, `shell-${Date.now().toString(36)}`, 'shell');
            }
            return;
          case 'P':
            e.preventDefault();
            // Focus project search (Ctrl+Shift+P)
            document.querySelector<HTMLInputElement>('[placeholder="Search projects..."]')?.focus();
            return;
        }
        // Ctrl+Shift+Tab — previous terminal tab
        if (e.key === 'Tab') {
          e.preventDefault();
          cycleTerminalTab(-1);
          return;
        }
      }

      // Ctrl+Tab — next terminal tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        cycleTerminalTab(1);
        return;
      }

      // Ctrl + number (1-9) — switch workspace tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && num <= tabActivities.length) {
          e.preventDefault();
          nav.setActivity(tabActivities[num - 1]);
          return;
        }

        switch (e.key) {
          case 'k':
            e.preventDefault();
            setPaletteOpen(prev => !prev);
            break;
          case 'n':
            e.preventDefault();
            // New session (Ctrl+N)
            { const p = projStore.activeProject();
              if (p) {
                const name = `session-${Date.now().toString(36)}`;
                useSessionStore.getState().spawnSession(p.id, name).then(session => {
                  nav.viewSession(session.id);
                });
              }
            }
            break;
          case 't':
            e.preventDefault();
            // New terminal (Ctrl+T)
            nav.setActivity('terminal');
            { const p = projStore.activeProject();
              if (p) termStore.spawnTerminal(p.id, `shell-${Date.now().toString(36)}`, 'shell');
            }
            break;
          case 'd':
            e.preventDefault();
            nav.setActivity('dashboard');
            break;
          case 'b':
            e.preventDefault();
            nav.setActivity('brain');
            break;
          case ',':
            e.preventDefault();
            // Settings (Ctrl+,)
            nav.setActivity('settings');
            break;
          case 'w':
            e.preventDefault();
            // Kill active terminal (Ctrl+W)
            if (nav.activeActivity === 'terminal' && termStore.activeTerminalId) {
              termStore.killTerminal(termStore.activeTerminalId);
            }
            break;
          case 's':
            e.preventDefault();
            // Save is handled by NotesPanel via its own listener — prevent browser save dialog
            break;
        }
      }
    };

    /** Cycle through terminal tabs: direction = 1 (next) or -1 (prev) */
    function cycleTerminalTab(direction: number) {
      const { terminals, activeTerminalId, setActiveTerminal } = useTerminalStore.getState();
      const project = useProjectStore.getState().activeProject();
      if (!project) return;
      const projectTerminals = terminals.filter(t => t.projectId === project.id);
      if (projectTerminals.length <= 1) return;
      const idx = projectTerminals.findIndex(t => t.id === activeTerminalId);
      const next = (idx + direction + projectTerminals.length) % projectTerminals.length;
      setActiveTerminal(projectTerminals[next].id);
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Sidecar loading screen
  if (!sidecarReady) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen w-screen"
        style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Cortex</div>
        <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Starting sidecar…</div>
      </div>
    );
  }

  const showSetup = !checking && !setupDismissed && (!claudeStatus.installed || !claudeStatus.authenticated);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Budget alerts banner */}
      <BudgetGuard />
      {/* Main layout: ActivityBar | Sidebar | Workspace */}
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        <ProjectSidebar />
        <WorkspaceTabs />
      </div>
      <StatusBar />
      <SessionDashboard />

      {/* Setup wizard overlay */}
      {showSetup && <SetupWizard onComplete={() => setSetupDismissed(true)} />}

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
          },
        }}
        richColors
      />
    </div>
  );
}
