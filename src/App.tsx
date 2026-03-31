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

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Only intercept Escape in inputs
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          return;
        }
        // Let Ctrl+K work even in inputs (command palette)
        if (!(e.ctrlKey && e.key === 'k')) return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        switch (e.key) {
          case 'k':
            e.preventDefault();
            setPaletteOpen(prev => !prev);
            break;
          case 'n':
            e.preventDefault();
            // New session — spawn for active project
            const activeProject = useProjectStore.getState().activeProject();
            if (activeProject) {
              const name = `session-${Date.now().toString(36)}`;
              useSessionStore.getState().spawnSession(activeProject.id, name).then(session => {
                useNavigationStore.getState().viewSession(session.id);
              });
            }
            break;
          case 't':
            e.preventDefault();
            // New terminal
            useNavigationStore.getState().setActivity('terminal');
            const proj = useProjectStore.getState().activeProject();
            if (proj) {
              useTerminalStore.getState().spawnTerminal(proj.id, `shell-${Date.now().toString(36)}`, 'shell');
            }
            break;
          case 'd':
            e.preventDefault();
            useNavigationStore.getState().setActivity('dashboard');
            break;
          case 'b':
            e.preventDefault();
            useNavigationStore.getState().setActivity('brain');
            break;
        }
      }
    };

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
