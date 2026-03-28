import {
  LayoutDashboard,
  Terminal,
  GitBranch,
  FileText,
  Brain,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { useNavigationStore, type ActivityId } from '@/stores/navigation-store';
import { useState } from 'react';

interface ActivityItem {
  id: ActivityId;
  icon: React.ElementType;
  label: string;
}

const topActivities: ActivityItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'brain', icon: Brain, label: 'Intelligence' },
  { id: 'chat', icon: MessageSquare, label: 'AI Chat' },
];

const bottomActivities: ActivityItem[] = [
  { id: 'settings', icon: Settings, label: 'Settings' },
];

function ActivityIcon({ item, isActive }: { item: ActivityItem; isActive: boolean }) {
  const setActivity = useNavigationStore((s) => s.setActivity);
  const [showTooltip, setShowTooltip] = useState(false);
  const Icon = item.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setActivity(item.id)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="w-full flex items-center justify-center relative"
        style={{
          height: 48,
          color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          transition: 'color 0.15s ease, background 0.15s ease',
        }}
      >
        {/* Active left border indicator */}
        {isActive && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
            style={{
              width: 3,
              height: 24,
              background: 'var(--accent)',
            }}
          />
        )}
        <Icon size={22} />
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap z-50"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {item.label}
        </div>
      )}
    </div>
  );
}

export function ActivityBar() {
  const activeActivity = useNavigationStore((s) => s.activeActivity);

  return (
    <div
      className="flex flex-col h-full border-r shrink-0"
      style={{
        width: 52,
        minWidth: 52,
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center"
        style={{ height: 52 }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--accent-dim)' }}
        >
          <Brain size={18} style={{ color: 'var(--accent)' }} />
        </div>
      </div>

      {/* Top activities */}
      <div className="flex flex-col mt-1">
        {topActivities.map((item) => (
          <ActivityIcon
            key={item.id}
            item={item}
            isActive={activeActivity === item.id}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom activities */}
      <div className="flex flex-col mb-2">
        {bottomActivities.map((item) => (
          <ActivityIcon
            key={item.id}
            item={item}
            isActive={activeActivity === item.id}
          />
        ))}
      </div>
    </div>
  );
}
