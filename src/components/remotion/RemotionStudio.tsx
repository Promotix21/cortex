import { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api, getSidecarUrl } from '@/lib/api';
import {
  Video, Play, Loader2, CheckCircle, XCircle, Download,
  Lightbulb, MessageSquare, Layout, Film, Plus, Trash2, Send, Sparkles,
  ChevronRight, Clock, Palette,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface VideoIdea {
  id: string;
  title: string;
  description: string;
  style: string;
  status: 'draft' | 'discussing' | 'approved' | 'rendering' | 'completed';
  scenes: Scene[];
  discussion: DiscussionMessage[];
  createdAt: string;
}

interface Scene {
  id: string;
  title: string;
  description: string;
  duration: number; // seconds
  transition: string;
  notes: string;
}

interface DiscussionMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

interface RenderJob {
  id: string;
  projectId: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  outputPath: string | null;
  progress: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

type StudioTab = 'ideas' | 'discuss' | 'storyboard' | 'render';

// ============================================================
// MAIN COMPONENT
// ============================================================

export function RemotionStudio() {
  const project = useProjectStore(s => s.activeProject());
  const [activeTab, setActiveTab] = useState<StudioTab>('ideas');
  const [ideas, setIdeas] = useState<VideoIdea[]>(() => {
    try {
      const saved = localStorage.getItem(`cortex:video-ideas:${project?.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);

  // Persist ideas to localStorage
  useEffect(() => {
    if (project?.id) {
      localStorage.setItem(`cortex:video-ideas:${project.id}`, JSON.stringify(ideas));
    }
  }, [ideas, project?.id]);

  // Reset when project changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cortex:video-ideas:${project?.id}`);
      setIdeas(saved ? JSON.parse(saved) : []);
      setActiveIdeaId(null);
    } catch { setIdeas([]); }
  }, [project?.id]);

  const activeIdea = ideas.find(i => i.id === activeIdeaId) || null;

  const updateIdea = (id: string, update: Partial<VideoIdea>) => {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, ...update } : i));
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p style={{ fontSize: 14 }}>Select a project to use Remotion Studio</p>
      </div>
    );
  }

  const tabs: { id: StudioTab; label: string; icon: React.ElementType }[] = [
    { id: 'ideas', label: 'Ideas', icon: Lightbulb },
    { id: 'discuss', label: 'Discuss', icon: MessageSquare },
    { id: 'storyboard', label: 'Storyboard', icon: Layout },
    { id: 'render', label: 'Render', icon: Film },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div className="flex items-center" style={{ gap: 16 }}>
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{
              width: 48, height: 48,
              background: 'linear-gradient(135deg, rgba(250,179,135,0.2), rgba(250,179,135,0.05))',
              border: '1px solid rgba(250,179,135,0.15)',
            }}
          >
            <Video size={24} style={{ color: 'var(--warning)' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              Remotion Studio
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              {project.name} — Idea to Video Pipeline
            </p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex" style={{ gap: 4, marginBottom: 24, padding: 4, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = (tab.id === 'discuss' || tab.id === 'storyboard') && !activeIdeaId;
          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              className="flex items-center flex-1 justify-center rounded-lg transition-all"
              style={{
                gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600,
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : isDisabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'ideas' && (
        <IdeasTab
          ideas={ideas}
          setIdeas={setIdeas}
          activeIdeaId={activeIdeaId}
          onSelectIdea={(id) => { setActiveIdeaId(id); setActiveTab('discuss'); }}
          projectName={project.name}
        />
      )}
      {activeTab === 'discuss' && activeIdea && (
        <DiscussTab idea={activeIdea} updateIdea={updateIdea} onApprove={() => setActiveTab('storyboard')} />
      )}
      {activeTab === 'storyboard' && activeIdea && (
        <StoryboardTab idea={activeIdea} updateIdea={updateIdea} onRender={() => setActiveTab('render')} />
      )}
      {activeTab === 'render' && (
        <RenderTab projectId={project.id} idea={activeIdea} />
      )}
    </div>
  );
}

// ============================================================
// IDEAS TAB
// ============================================================

function IdeasTab({ ideas, setIdeas, activeIdeaId, onSelectIdea, projectName }: {
  ideas: VideoIdea[];
  setIdeas: React.Dispatch<React.SetStateAction<VideoIdea[]>>;
  activeIdeaId: string | null;
  onSelectIdea: (id: string) => void;
  projectName: string;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStyle, setNewStyle] = useState('modern');

  const addIdea = () => {
    if (!newTitle.trim()) return;
    const idea: VideoIdea = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      description: newDesc.trim(),
      style: newStyle,
      status: 'draft',
      scenes: [],
      discussion: [],
      createdAt: new Date().toISOString(),
    };
    setIdeas(prev => [idea, ...prev]);
    setNewTitle('');
    setNewDesc('');
  };

  const deleteIdea = (id: string) => {
    setIdeas(prev => prev.filter(i => i.id !== id));
  };

  const STYLE_OPTIONS = ['modern', 'minimal', 'bold', 'cinematic', 'playful', 'corporate', 'tech', 'retro'];

  return (
    <div>
      {/* New Idea Form */}
      <div className="rounded-xl" style={{ padding: '20px 24px', marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 16 }}>
          <Sparkles size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>New Video Idea</span>
        </div>
        <div className="flex flex-col" style={{ gap: 12 }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`e.g., "${projectName} — Feature Showcase"`}
            className="w-full rounded-lg outline-none"
            style={{ padding: '10px 14px', fontSize: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Describe the video concept, target audience, key message..."
            rows={3}
            className="w-full rounded-lg outline-none resize-none"
            style={{ padding: '10px 14px', fontSize: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <div className="flex items-center justify-between">
            <div className="flex" style={{ gap: 6 }}>
              {STYLE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setNewStyle(s)}
                  className="rounded-md capitalize"
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600,
                    background: newStyle === s ? 'var(--accent-dim)' : 'var(--bg-hover)',
                    color: newStyle === s ? 'var(--accent)' : 'var(--text-tertiary)',
                    border: `1px solid ${newStyle === s ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={addIdea}
              disabled={!newTitle.trim()}
              className="flex items-center rounded-lg font-semibold disabled:opacity-40"
              style={{ gap: 6, padding: '8px 18px', fontSize: 13, background: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              <Plus size={14} />
              Add Idea
            </button>
          </div>
        </div>
      </div>

      {/* Ideas List */}
      {ideas.length === 0 ? (
        <div className="text-center rounded-xl" style={{ padding: 48, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Lightbulb size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>No video ideas yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>Add your first idea above to start the creative pipeline</p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {ideas.map(idea => (
            <div
              key={idea.id}
              className="rounded-xl transition-all"
              style={{
                padding: '16px 20px',
                background: activeIdeaId === idea.id ? 'var(--accent-dim)' : 'var(--bg-surface)',
                border: `1px solid ${activeIdeaId === idea.id ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
              onClick={() => onSelectIdea(idea.id)}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center" style={{ gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{idea.title}</span>
                  <span className="rounded-md capitalize" style={{
                    padding: '2px 8px', fontSize: 10, fontWeight: 600,
                    background: idea.status === 'approved' ? 'var(--success-dim)' : idea.status === 'completed' ? 'var(--accent-dim)' : 'var(--bg-hover)',
                    color: idea.status === 'approved' ? 'var(--success)' : idea.status === 'completed' ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}>
                    {idea.status}
                  </span>
                </div>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <Palette size={12} style={{ color: 'var(--text-tertiary)' }} />
                  <span className="capitalize" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{idea.style}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteIdea(idea.id); }}
                    className="rounded p-1 transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              </div>
              {idea.description && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{idea.description}</p>
              )}
              <div className="flex items-center" style={{ gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>{idea.scenes.length} scenes</span>
                <span>{idea.discussion.length} messages</span>
                <span><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />{new Date(idea.createdAt).toLocaleDateString()}</span>
                <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DISCUSS TAB
// ============================================================

function DiscussTab({ idea, updateIdea, onApprove }: {
  idea: VideoIdea;
  updateIdea: (id: string, update: Partial<VideoIdea>) => void;
  onApprove: () => void;
}) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [idea.discussion.length]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: DiscussionMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    // Simple AI response (in real implementation, this would call Claude via chat API)
    const aiResponse: DiscussionMessage = {
      id: (Date.now() + 1).toString(),
      role: 'ai',
      content: generateAIResponse(idea, input.trim()),
      timestamp: new Date().toISOString(),
    };

    updateIdea(idea.id, {
      discussion: [...idea.discussion, userMsg, aiResponse],
      status: 'discussing',
    });
    setInput('');
  };

  const handleApprove = () => {
    updateIdea(idea.id, { status: 'approved' });
    // Auto-generate scenes if none exist
    if (idea.scenes.length === 0) {
      const defaultScenes: Scene[] = [
        { id: '1', title: 'Intro / Hook', description: 'Grab attention with the problem statement', duration: 3, transition: 'fade', notes: '' },
        { id: '2', title: 'Problem', description: 'Show the pain point your project solves', duration: 4, transition: 'slide', notes: '' },
        { id: '3', title: 'Solution', description: 'Introduce the project and key features', duration: 5, transition: 'zoom', notes: '' },
        { id: '4', title: 'Demo / Features', description: 'Show the product in action', duration: 8, transition: 'slide', notes: '' },
        { id: '5', title: 'Call to Action', description: 'What should the viewer do next?', duration: 3, transition: 'fade', notes: '' },
      ];
      updateIdea(idea.id, { scenes: defaultScenes });
    }
    onApprove();
  };

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          Discuss: {idea.title}
        </h3>
        <button
          onClick={handleApprove}
          className="flex items-center rounded-lg font-semibold"
          style={{ gap: 6, padding: '8px 18px', fontSize: 13, background: 'var(--success)', color: 'var(--bg-primary)' }}
        >
          <CheckCircle size={14} />
          Approve & Create Storyboard
        </button>
      </div>

      {/* Chat Messages */}
      <div
        className="rounded-xl overflow-auto"
        style={{ padding: '16px 20px', marginBottom: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: 400, minHeight: 200 }}
      >
        {idea.discussion.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>
            Start discussing your video concept. Ask about script ideas, scene suggestions, style choices...
          </p>
        )}
        {idea.discussion.map(msg => (
          <div key={msg.id} style={{ marginBottom: 12 }}>
            <div className="flex items-center" style={{ gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: msg.role === 'user' ? 'var(--accent)' : 'var(--green)' }}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </p>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
        className="flex"
        style={{ gap: 8 }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Discuss the video concept, ask for suggestions..."
          className="flex-1 rounded-lg outline-none"
          style={{ padding: '10px 14px', fontSize: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="flex items-center rounded-lg font-semibold disabled:opacity-40"
          style={{ gap: 6, padding: '10px 18px', fontSize: 13, background: 'var(--accent)', color: 'var(--bg-primary)' }}
        >
          <Send size={14} />
          Send
        </button>
      </form>
    </div>
  );
}

// Simple AI response generator (placeholder — would use Claude in production)
function generateAIResponse(idea: VideoIdea, userInput: string): string {
  const lower = userInput.toLowerCase();
  if (lower.includes('scene') || lower.includes('how many')) {
    return `For a "${idea.style}" style video about "${idea.title}", I'd suggest 5 scenes:\n\n1. **Hook** (3s) — Open with a bold statement or question\n2. **Problem** (4s) — Show the pain point\n3. **Solution** (5s) — Introduce your project\n4. **Features Demo** (8s) — Show 3-4 key features with animations\n5. **CTA** (3s) — End with a clear call to action\n\nTotal: ~23 seconds. Want me to adjust the timing or add/remove scenes?`;
  }
  if (lower.includes('script') || lower.includes('text') || lower.includes('copy')) {
    return `Here's a draft script for "${idea.title}":\n\n**[Hook]** "What if your development workflow could think for itself?"\n**[Problem]** "Managing AI sessions across 8 projects. No memory. No tracking."\n**[Solution]** "${idea.title} — persistent intelligence for every project"\n**[Features]** "Named sessions. Auto-learning. Budget guardrails."\n**[CTA]** "Try it today. Ship smarter."\n\nWant to refine any of these lines?`;
  }
  if (lower.includes('style') || lower.includes('look') || lower.includes('design')) {
    return `For a "${idea.style}" style, I'd recommend:\n\n- **Colors**: Dark background (#1e1e2e) with accent highlights\n- **Typography**: JetBrains Mono for code, DM Sans for headings\n- **Transitions**: Smooth slide-ins, code block reveals\n- **Motion**: Subtle parallax, typing animations for code\n- **Music**: Lo-fi tech beats, builds to chorus at feature reveal\n\nThis matches the Catppuccin Mocha aesthetic. Should I adjust the mood?`;
  }
  return `Great input! For "${idea.title}" with a ${idea.style} style:\n\n- Consider focusing on the unique selling point in the first 3 seconds\n- Use real screenshots/recordings from the project for authenticity\n- Keep total duration under 30 seconds for social media\n\nWhat aspect would you like to discuss further — scenes, script, visuals, or music?`;
}

// ============================================================
// STORYBOARD TAB
// ============================================================

function StoryboardTab({ idea, updateIdea, onRender }: {
  idea: VideoIdea;
  updateIdea: (id: string, update: Partial<VideoIdea>) => void;
  onRender: () => void;
}) {
  const updateScene = (sceneId: string, update: Partial<Scene>) => {
    updateIdea(idea.id, {
      scenes: idea.scenes.map(s => s.id === sceneId ? { ...s, ...update } : s),
    });
  };

  const addScene = () => {
    const newScene: Scene = {
      id: Date.now().toString(),
      title: 'New Scene',
      description: '',
      duration: 4,
      transition: 'slide',
      notes: '',
    };
    updateIdea(idea.id, { scenes: [...idea.scenes, newScene] });
  };

  const removeScene = (sceneId: string) => {
    updateIdea(idea.id, { scenes: idea.scenes.filter(s => s.id !== sceneId) });
  };

  const totalDuration = idea.scenes.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Storyboard: {idea.title}
          </h3>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {idea.scenes.length} scenes, ~{totalDuration}s total
          </span>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button
            onClick={addScene}
            className="flex items-center rounded-lg font-semibold"
            style={{ gap: 6, padding: '8px 16px', fontSize: 13, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <Plus size={14} />
            Add Scene
          </button>
          <button
            onClick={onRender}
            className="flex items-center rounded-lg font-semibold"
            style={{ gap: 6, padding: '8px 18px', fontSize: 13, background: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            <Film size={14} />
            Proceed to Render
          </button>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="flex rounded-lg overflow-hidden" style={{ height: 8, marginBottom: 24, background: 'var(--bg-hover)' }}>
        {idea.scenes.map((scene, i) => (
          <div
            key={scene.id}
            style={{
              width: `${(scene.duration / totalDuration) * 100}%`,
              height: '100%',
              background: `hsl(${(i * 360) / idea.scenes.length}, 60%, 55%)`,
            }}
            title={`${scene.title} — ${scene.duration}s`}
          />
        ))}
      </div>

      {/* Scene Cards */}
      <div className="flex flex-col" style={{ gap: 12 }}>
        {idea.scenes.map((scene, i) => (
          <div key={scene.id} className="rounded-xl" style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
              <div className="flex items-center justify-center rounded-lg" style={{
                width: 32, height: 32, fontSize: 14, fontWeight: 800,
                background: `hsl(${(i * 360) / idea.scenes.length}, 40%, 20%)`,
                color: `hsl(${(i * 360) / idea.scenes.length}, 60%, 65%)`,
              }}>
                {i + 1}
              </div>
              <input
                type="text"
                value={scene.title}
                onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                className="flex-1 rounded-lg outline-none font-bold"
                style={{ padding: '6px 10px', fontSize: 14, background: 'transparent', border: 'none', color: 'var(--text-primary)' }}
              />
              <div className="flex items-center" style={{ gap: 8 }}>
                <input
                  type="number"
                  value={scene.duration}
                  onChange={(e) => updateScene(scene.id, { duration: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="rounded-lg outline-none text-center"
                  style={{ width: 50, padding: '4px', fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>sec</span>
                <select
                  value={scene.transition}
                  onChange={(e) => updateScene(scene.id, { transition: e.target.value })}
                  className="rounded-lg outline-none"
                  style={{ padding: '4px 8px', fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="zoom">Zoom</option>
                  <option value="wipe">Wipe</option>
                  <option value="none">None</option>
                </select>
                <button onClick={() => removeScene(scene.id)} className="rounded p-1 hover:bg-[var(--bg-hover)]">
                  <Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            </div>
            <textarea
              value={scene.description}
              onChange={(e) => updateScene(scene.id, { description: e.target.value })}
              placeholder="Describe what happens in this scene..."
              rows={2}
              className="w-full rounded-lg outline-none resize-none"
              style={{ padding: '8px 10px', fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// RENDER TAB
// ============================================================

function RenderTab({ projectId, idea }: { projectId: string; idea: VideoIdea | null }) {
  const [latestJob, setLatestJob] = useState<RenderJob | null>(null);
  const [rendering, setRendering] = useState(false);

  const fetchLatest = async () => {
    try {
      const data = await api.getLatestRender(projectId);
      setLatestJob(data.job);
    } catch { setLatestJob(null); }
  };

  useEffect(() => { fetchLatest(); }, [projectId]);

  useEffect(() => {
    if (!latestJob || latestJob.status !== 'rendering') return;
    const interval = setInterval(async () => {
      try {
        const data = await api.getRenderStatus(latestJob.id);
        setLatestJob(data.job);
        if (data.job.status !== 'rendering') setRendering(false);
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [latestJob?.id, latestJob?.status]);

  const handleRender = async () => {
    setRendering(true);
    try {
      const data = await api.startRender(projectId);
      setLatestJob(data.job);
    } catch { setRendering(false); }
  };

  return (
    <div>
      {/* Idea Summary */}
      {idea && (
        <div className="rounded-xl" style={{ padding: '16px 20px', marginBottom: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>Rendering</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{idea.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {idea.scenes.length} scenes, ~{idea.scenes.reduce((s, sc) => s + sc.duration, 0)}s, {idea.style} style
          </div>
        </div>
      )}

      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={rendering}
        className="flex items-center rounded-xl font-bold transition-all"
        style={{
          gap: 12, padding: '16px 28px', fontSize: 15, marginBottom: 24,
          background: rendering ? 'var(--bg-hover)' : 'linear-gradient(135deg, var(--accent), #7c6dd8)',
          color: rendering ? 'var(--text-tertiary)' : 'white',
          border: 'none', cursor: rendering ? 'not-allowed' : 'pointer',
        }}
      >
        {rendering ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
        {rendering ? 'Rendering...' : 'Generate Video'}
      </button>

      {/* Render Status */}
      {latestJob && (
        <div className="rounded-xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center" style={{ gap: 12, marginBottom: 16 }}>
            {latestJob.status === 'rendering' && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--warning)' }} />}
            {latestJob.status === 'completed' && <CheckCircle size={18} style={{ color: 'var(--success)' }} />}
            {latestJob.status === 'failed' && <XCircle size={18} style={{ color: 'var(--error)' }} />}
            <span className="font-bold" style={{
              fontSize: 15,
              color: latestJob.status === 'completed' ? 'var(--success)' : latestJob.status === 'failed' ? 'var(--error)' : 'var(--warning)',
            }}>
              {latestJob.status === 'rendering' ? `Rendering... ${latestJob.progress}%` :
               latestJob.status === 'completed' ? 'Render Complete' :
               latestJob.status === 'failed' ? 'Render Failed' : 'Pending'}
            </span>
          </div>

          {latestJob.status === 'rendering' && (
            <div className="rounded-full overflow-hidden" style={{ height: 8, marginBottom: 16, background: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${latestJob.progress}%`, background: 'var(--warning)' }} />
            </div>
          )}

          {latestJob.error && (
            <div className="rounded-lg" style={{ padding: '12px 16px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)' }}>
              {latestJob.error}
            </div>
          )}

          {latestJob.status === 'completed' && latestJob.outputPath && (
            <div style={{ marginTop: 16 }}>
              <video
                src={`${getSidecarUrl()}/api/remotion/video/${latestJob.id}`}
                controls
                className="rounded-xl w-full"
                style={{ maxHeight: 400, background: '#000' }}
              />
              <a
                href={`${getSidecarUrl()}/api/remotion/video/${latestJob.id}`}
                download
                className="flex items-center rounded-xl font-semibold mt-3 inline-flex"
                style={{ gap: 8, padding: '10px 20px', fontSize: 14, background: 'var(--accent-dim)', color: 'var(--accent)', textDecoration: 'none' }}
              >
                <Download size={16} />
                Download Video
              </a>
            </div>
          )}

          <div className="flex items-center" style={{ gap: 16, marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span>Started: {new Date(latestJob.startedAt).toLocaleTimeString()}</span>
            {latestJob.completedAt && <span>Completed: {new Date(latestJob.completedAt).toLocaleTimeString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
