import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { ListTodo, Plus, Trash2, Check, Circle, Loader, AlertTriangle } from 'lucide-react';

type TaskStatus = 'pending' | 'doing' | 'done' | 'blocked';

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');

  const fetchTasks = async () => {
    if (!project) return;
    try {
      const { tasks: t } = await api.getTasks(project.id);
      setTasks(t);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchTasks(); }, [project?.id]);

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

      {tasks.length === 0 && (
        <p className="text-center" style={{ fontSize: 14, padding: '32px 0', color: 'var(--text-tertiary)' }}>
          No tasks yet. Add one above.
        </p>
      )}
    </div>
  );
}
