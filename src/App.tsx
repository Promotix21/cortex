import { useEffect, useState } from 'react';
import { ActivityBar } from '@/components/ActivityBar';
import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { StatusBar } from '@/components/StatusBar';
import { SessionDashboard } from '@/components/sessions/SessionDashboard';
import { SetupWizard } from '@/components/SetupWizard';
import { BudgetGuard } from '@/components/budget/BudgetGuard';
import { useSettingsStore } from '@/stores/settings-store';
import { useSessionStore } from '@/stores/session-store';

export default function App() {
  const { claudeStatus, checkClaudeStatus } = useSettingsStore();
  const fetchSessions = useSessionStore(s => s.fetchSessions);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkClaudeStatus().finally(() => setChecking(false));
    // Fetch all sessions on app start so green dots work immediately
    fetchSessions();
    const interval = setInterval(() => fetchSessions(), 5000);
    return () => clearInterval(interval);
  }, [checkClaudeStatus, fetchSessions]);

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
    </div>
  );
}
