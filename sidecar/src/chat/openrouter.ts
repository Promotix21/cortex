import { getDb } from '../db/index.js';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Available models via OpenRouter
 */
export const OPENROUTER_MODELS = [
  // Meta Llama
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', provider: 'Meta', category: 'open-source' },
  { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', provider: 'Meta', category: 'open-source' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta', category: 'open-source' },

  // Google
  { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', provider: 'Google', category: 'proprietary' },
  { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', provider: 'Google', category: 'proprietary' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google', category: 'proprietary' },

  // OpenAI
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', category: 'proprietary' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'OpenAI', category: 'proprietary' },
  { id: 'openai/o3-mini', name: 'o3-mini', provider: 'OpenAI', category: 'proprietary' },

  // Anthropic (via OpenRouter — alternative to CLI)
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', category: 'proprietary' },
  { id: 'anthropic/claude-haiku-3.5', name: 'Claude Haiku 3.5', provider: 'Anthropic', category: 'proprietary' },

  // DeepSeek
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', category: 'open-source' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek', category: 'open-source' },

  // Qwen
  { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B', provider: 'Qwen', category: 'open-source' },
  { id: 'qwen/qwen3-30b-a3b', name: 'Qwen3 30B', provider: 'Qwen', category: 'open-source' },

  // Mistral
  { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', provider: 'Mistral', category: 'open-source' },
  { id: 'mistralai/codestral-2501', name: 'Codestral', provider: 'Mistral', category: 'open-source' },

  // Free tier
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta', category: 'free' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', provider: 'Google', category: 'free' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'DeepSeek', category: 'free' },
  { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B (Free)', provider: 'Qwen', category: 'free' },
] as const;

export type OpenRouterModel = typeof OPENROUTER_MODELS[number];

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Get the OpenRouter API key from settings
 */
export function getOpenRouterKey(): string | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'openrouter_api_key'").get() as { value: string } | undefined;
    return row?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get the currently selected model from settings
 */
export function getSelectedModel(): string {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'chat_model'").get() as { value: string } | undefined;
    return row?.value || 'claude-cli'; // Default to Claude CLI
  } catch {
    return 'claude-cli';
  }
}

/**
 * Get the currently selected provider
 */
export function getChatProvider(): 'claude-cli' | 'openrouter' {
  const model = getSelectedModel();
  return model === 'claude-cli' ? 'claude-cli' : 'openrouter';
}

/**
 * Validate an OpenRouter API key
 */
export async function validateOpenRouterKey(apiKey: string): Promise<{ valid: boolean; error?: string; credits?: number }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { data?: { usage?: number; limit?: number } };
    return {
      valid: true,
      credits: data.data?.limit ? data.data.limit - (data.data.usage || 0) : undefined,
    };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Send a message via OpenRouter API with streaming.
 * Uses the OpenAI-compatible chat completions endpoint.
 */
export async function* sendOpenRouterMessage(
  modelId: string,
  systemPrompt: string,
  messages: ChatMessage[],
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content: string }> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    yield { type: 'error', content: 'OpenRouter API key not configured. Go to Settings to add your key.' };
    return;
  }

  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
  };

  try {
    const res = await fetch(OPENROUTER_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Promotix21/cortex',
        'X-Title': 'Cortex AI Workspace',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      yield { type: 'error', content: `OpenRouter error ${res.status}: ${errBody}` };
      return;
    }

    if (!res.body) {
      yield { type: 'error', content: 'No response body from OpenRouter' };
      return;
    }

    let fullResponse = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            yield { type: 'chunk', content };
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }

    yield { type: 'done', content: fullResponse };
  } catch (err: any) {
    yield { type: 'error', content: `OpenRouter connection error: ${err.message}` };
  }
}
