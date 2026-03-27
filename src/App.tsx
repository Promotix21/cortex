import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { StatusBar } from '@/components/StatusBar';
import { SessionDashboard } from '@/components/sessions/SessionDashboard';
import { TopBar } from '@/components/TopBar';

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar />
        <WorkspaceTabs />
      </div>
      <StatusBar />
      <SessionDashboard />
    </div>
  );
}
