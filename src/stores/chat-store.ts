import { create } from 'zustand';
import { api } from '@/lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatStore {
  messages: ChatMessage[];
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  projectId: string | null;

  fetchHistory: (projectId: string) => Promise<void>;
  sendMessage: (projectId: string, message: string) => Promise<void>;
  clearHistory: (projectId: string) => Promise<void>;
  setProjectId: (id: string | null) => void;
}

const SIDECAR_URL = 'http://localhost:4700';

export const useChatStore = create<ChatStore>((set, _get) => ({
  messages: [],
  streaming: false,
  streamingContent: '',
  error: null,
  projectId: null,

  setProjectId: (id) => set({ projectId: id, messages: [], error: null }),

  fetchHistory: async (projectId) => {
    try {
      const data = await api.getChatHistory(projectId);
      set({ messages: data.history, projectId, error: null });
    } catch {
      // silent
    }
  },

  sendMessage: async (projectId, message) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    set(s => ({
      messages: [...s.messages, userMsg],
      streaming: true,
      streamingContent: '',
      error: null,
    }));

    try {
      const res = await fetch(`${SIDECAR_URL}/api/chat/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.type === 'chunk') {
              fullContent += event.content;
              set({ streamingContent: fullContent });
            } else if (event.type === 'error') {
              set({ error: event.content, streaming: false });
              return;
            }
          } catch {
            // Malformed SSE line
          }
        }
      }

      // Add assistant message
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
      };

      set(s => ({
        messages: [...s.messages, assistantMsg],
        streaming: false,
        streamingContent: '',
      }));
    } catch (err: any) {
      set({ error: err.message, streaming: false, streamingContent: '' });
    }
  },

  clearHistory: async (projectId) => {
    await api.clearChat(projectId);
    set({ messages: [], error: null });
  },
}));
