import {
  LayoutDashboard,
  Terminal,
  GitBranch,
  FileText,
  Brain,
  MessageSquare,
  Settings,
  Video,
  FolderOpen,
  Zap,
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
  { id: 'sessions', icon: Zap, label: 'Sessions (Ctrl+N)' },
  { id: 'terminal', icon: Terminal, label: 'Terminal (Ctrl+T)' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'brain', icon: Brain, label: 'Intelligence (Ctrl+B)' },
  { id: 'chat', icon: MessageSquare, label: 'AI Chat' },
  { id: 'documents', icon: FolderOpen, label: 'Documents' },
  { id: 'studio', icon: Video, label: 'Remotion Studio' },
];

const bottomActivities: ActivityItem[] = [
  { id: 'settings', icon: Settings, label: 'Settings' },
];

function ActivityIcon({ item, isActive }: { item: ActivityItem; isActive: boolean }) {
  const setActivity = useNavigationStore((s) => s.setActivity);
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setActivity(item.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-full flex items-center justify-center relative"
        style={{
          height: 56,
          color: isActive ? 'var(--accent)' : hovered ? 'var(--text-secondary)' : 'var(--text-tertiary)',
          background: isActive ? 'var(--accent-dim)' : hovered ? 'var(--bg-hover)' : 'transparent',
          transition: 'all 0.15s ease',
        }}
      >
        {isActive && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
            style={{
              width: 3,
              height: 28,
              background: 'var(--accent)',
            }}
          />
        )}
        <Icon size={24} strokeWidth={isActive ? 2.2 : 1.8} />
      </button>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute left-full top-1/2 -translate-y-1/2 whitespace-nowrap z-50"
          style={{
            marginLeft: 10,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-active)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
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
        width: 60,
        minWidth: 60,
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center"
        style={{ height: 62, borderBottom: '1px solid var(--border)' }}
      >
        <img
          src="/logo.png"
          alt="Cortex"
          style={{
            width: 36,
            height: 36,
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 6px rgba(0, 180, 100, 0.3))',
          }}
        />
      </div>

      {/* Top activities */}
      <div className="flex flex-col" style={{ paddingTop: 8 }}>
        {topActivities.map((item) => (
          <ActivityIcon
            key={item.id}
            item={item}
            isActive={activeActivity === item.id}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Bottom activities */}
      <div className="flex flex-col" style={{ paddingBottom: 8 }}>
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
