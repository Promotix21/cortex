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
      <div className="flex items-center gap-2 mb-4">
        <ListTodo size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tasks</h3>
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {active.length} active · {done.length} done
        </span>
      </div>

      {/* Add Task */}
      <div className="flex gap-2 mb-4">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Add a task..."
          className="flex-1 px-3 py-1.5 rounded text-xs outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={addTask}
          disabled={!newTitle.trim()}
          className="px-2.5 py-1.5 rounded text-xs disabled:opacity-30"
          style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Active Tasks */}
      {active.map(task => {
        const cfg = statusConfig[task.status];
        const Icon = cfg.icon;
        return (
          <div
            key={task.id}
            className="flex items-center gap-2.5 py-2 border-b group"
            style={{ borderColor: 'var(--border)' }}
          >
            <button onClick={() => cycleStatus(task)} className="shrink-0" title={`Status: ${cfg.label} (click to cycle)`}>
              <Icon size={14} style={{ color: cfg.color }} />
            </button>
            <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>
              {task.title}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-surface)', color: cfg.color }}
            >
              {cfg.label}
            </span>
            <button
              onClick={() => deleteTask(task.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] transition-opacity"
            >
              <Trash2 size={11} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
        );
      })}

      {/* Done Tasks */}
      {done.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>
            Completed ({done.length})
          </p>
          {done.slice(0, 10).map(task => (
            <div
              key={task.id}
              className="flex items-center gap-2.5 py-1.5 group"
            >
              <Check size={14} style={{ color: 'var(--success)' }} />
              <span className="flex-1 text-xs line-through" style={{ color: 'var(--text-tertiary)' }}>
                {task.title}
              </span>
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] transition-opacity"
              >
                <Trash2 size={11} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          No tasks yet. Add one above.
        </p>
      )}
    </div>
  );
}
