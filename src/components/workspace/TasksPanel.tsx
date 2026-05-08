import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { api } from '@/lib/api';
import { ListTodo, Plus, Trash2, Check, Circle, Loader, AlertTriangle, Zap, Radio } from 'lucide-react';

type TaskStatus = 'pending' | 'doing' | 'done' | 'blocked';

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
}

interface LiveTodo { id?: string; content: string; status: string; priority?: string }
interface LiveGroup {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  lastActive: string;
  todos: LiveTodo[];
}

const statusConfig: Record<TaskStatus, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Circle, color: 'var(--text-tertiary)', label: 'Pending' },
  doing: { icon: Loader, color: 'var(--accent)', label: 'Doing' },
  done: { icon: Check, color: 'var(--success)', label: 'Done' },
  blocked: { icon: AlertTriangle, color: 'var(--error)', label: 'Blocked' },
};

const statusCycle: TaskStatus[] = ['pending', 'doing', 'done', 'blocked'];

export function TasksPanel() {
  const project = useProjectStore(s => s.activeProject());
  const viewSession = useNavigationStore(s => s.viewSession);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [liveGroups, setLiveGroups] = useState<LiveGroup[]>([]);
  const [newTitle, setNewTitle] = useState('');

  const fetchTasks = async () => {
    if (!project) return;
    try {
      const { tasks: t } = await api.getTasks(project.id);
      setTasks(t);
    } catch { /* silent */ }
  };

  const fetchLive = async () => {
    if (!project) return;
    try {
      const { groups } = await api.getLiveTasks(project.id);
      setLiveGroups(groups);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!project) { setTasks([]); setLiveGroups([]); return; }
    fetchTasks();
    fetchLive();
    const interval = setInterval(fetchLive, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const addTask = async () => {
    if (!project || !newTitle.trim()) return;
    try {
      await api.createTask(project.id, newTitle.trim());
      setNewTitle('');
      fetchTasks();
    } catch { /* silent */ }
  };

  const cycleStatus = async (task: Task) => {
    const idx = statusCycle.indexOf(task.status);
    const next = statusCycle[(idx + 1) % statusCycle.length];
    try {
      await api.updateTask(task.id, { status: next });
      fetchTasks();
    } catch { /* silent */ }
  };

  const deleteTask = async (id: string) => {
    try {
      await api.deleteTask(id);
      fetchTasks();
    } catch { /* silent */ }
  };

  if (!project) return null;

  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');
  const hasLive = liveGroups.some(g => g.todos.length > 0);
  const totalAnything = tasks.length + liveGroups.reduce((n, g) => n + g.todos.length, 0);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
        <ListTodo size={18} style={{ color: 'var(--accent)' }} />
        <h3 className="font-medium" style={{ fontSize: 16, color: 'var(--text-primary)' }}>Tasks</h3>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {active.length} active · {done.length} done
        </span>
      </div>

      {/* Add Task */}
      <div className="flex" style={{ gap: 12, marginBottom: 24 }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Add a task..."
          className="flex-1 rounded-xl outline-none"
          style={{ padding: '12px 16px', fontSize: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={addTask}
          disabled={!newTitle.trim()}
          className="rounded-xl disabled:opacity-30"
          style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Live Session Todos (from Claude Code TodoWrite) */}
      {hasLive && (
        <div style={{ marginBottom: 32 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
            <Radio size={14} style={{ color: 'var(--accent)' }} />
            <p className="uppercase tracking-wider font-semibold" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Live from Claude Sessions
            </p>
          </div>
          {liveGroups.map(group => (
            <div
              key={group.sessionId}
              style={{
                marginBottom: 14,
                padding: '12px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
            >
              <button
                onClick={() => viewSession(group.sessionId)}
                className="flex items-center w-full"
                style={{ gap: 8, marginBottom: 10 }}
                title="Open this session"
              >
                <Zap
                  size={13}
                  style={{
                    color: group.sessionStatus === 'running' ? 'var(--success)' : 'var(--text-tertiary)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {group.sessionName}
                </span>
                <span
                  className="rounded-full"
                  style={{
                    padding: '1px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    background: group.sessionStatus === 'running' ? 'var(--success-dim)' : 'var(--bg-hover)',
                    color: group.sessionStatus === 'running' ? 'var(--success)' : 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                  }}
                >
                  {group.sessionStatus}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {group.todos.length} task{group.todos.length === 1 ? '' : 's'}
                </span>
              </button>
              {group.todos.map((t, i) => {
                const normalized =
                  t.status === 'completed' ? 'done'
                  : t.status === 'in_progress' ? 'doing'
                  : 'pending';
                const cfg = statusConfig[normalized as TaskStatus];
                const Icon = cfg.icon;
                return (
                  <div
                    key={t.id ?? `${group.sessionId}-${i}`}
                    className="flex items-center"
                    style={{ gap: 10, padding: '6px 0' }}
                  >
                    <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                    <span
                      className="flex-1"
                      style={{
                        fontSize: 13,
                        color: normalized === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        textDecoration: normalized === 'done' ? 'line-through' : 'none',
                      }}
                    >
                      {t.content}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Active Tasks */}
      {active.map(task => {
        const cfg = statusConfig[task.status];
        const Icon = cfg.icon;
        return (
          <div
            key={task.id}
            className="flex items-center group"
            style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}
          >
            <button onClick={() => cycleStatus(task)} className="shrink-0" title={`Status: ${cfg.label} (click to cycle)`}>
              <Icon size={16} style={{ color: cfg.color }} />
            </button>
            <span className="flex-1" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              {task.title}
            </span>
            <span
              className="rounded-lg"
              style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-surface)', color: cfg.color }}
            >
              {cfg.label}
            </span>
            <button
              onClick={() => deleteTask(task.id)}
              className="opacity-0 group-hover:opacity-100 rounded hover:bg-[var(--bg-hover)] transition-opacity"
              style={{ padding: 4 }}
            >
              <Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
        );
      })}

      {/* Done Tasks */}
      {done.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-tertiary)' }}>
            Completed ({done.length})
          </p>
          {done.slice(0, 10).map(task => (
            <div
              key={task.id}
              className="flex items-center group"
              style={{ gap: 12, padding: '10px 0' }}
            >
              <Check size={16} style={{ color: 'var(--success)' }} />
              <span className="flex-1 line-through" style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                {task.title}
              </span>
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 rounded hover:bg-[var(--bg-hover)] transition-opacity"
                style={{ padding: 4 }}
              >
                <Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {totalAnything === 0 && (
        <p className="text-center" style={{ fontSize: 14, padding: '32px 0', color: 'var(--text-tertiary)' }}>
          No tasks yet. Add one above, or start a Claude session — its TodoWrite tasks will appear here live.
        </p>
      )}
    </div>
  );
}
