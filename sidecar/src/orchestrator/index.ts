import { assembleContext } from '../intelligence/context-injector.js';
import { getProjectBrain } from '../chat/chat-service.js';
import { getDb } from '../db/index.js';
import { Anthropic } from '@anthropic-ai/sdk';
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { canSpawnSession } from '../intelligence/budget-guard.js';
import { findClaudeBinary } from '../utils/binaries.js';
import { shadowBus } from './event-bus.js';
import { analyzePrompt, buildReflection } from './plan.js';
import { computeImpactForFiles } from '../intelligence/impact-graph.js';

export const BEDROCK_SONNET = 'us.anthropic.claude-sonnet-4-6';
export const BEDROCK_OPUS = 'us.anthropic.claude-opus-4-7';
export const DEVSTRAL_MODEL = 'mistral.devstral-2-123b';
export const KIMI_MODEL = 'moonshotai/kimi-k2.6';

export type ActiveProvider = 'claude-cli' | 'bedrock' | 'devstral' | 'kimi';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface InteractionOptions {
  projectId: string;
  sessionId?: string;
  stream?: boolean;
  model?: string;
  useCLI?: boolean;
  history?: ConversationTurn[];
  fileContext?: string;
}

/**
 * AI Orchestrator
 *
 * The central coordination layer for all AI interactions.
 * Handles context assembly, policy checking, and provider routing.
 */
export class AIOrchestrator {
  private static instance: AIOrchestrator;
  private anthropic: Anthropic | null = null;
  private openrouterApiKey: string | null = null;
  private geminiApiKey: string | null = null;
  private bedrockClient: BedrockRuntimeClient | null = null;
  private activeProvider: ActiveProvider = 'claude-cli';
  private bedrockModel: string = BEDROCK_SONNET;

  private constructor() {
    this.initProviders();
  }

  static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      AIOrchestrator.instance = new AIOrchestrator();
    }
    return AIOrchestrator.instance;
  }

  private initProviders() {
    let db: ReturnType<typeof getDb>;
    try { db = getDb(); } catch { return; }
    const settings = db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('claude_api_key', 'openrouter_api_key', 'gemini_api_key', 'active_provider', 'bedrock_model')"
    ).all() as any[];

    for (const s of settings) {
      if (s.key === 'claude_api_key' && s.value) {
        this.anthropic = new Anthropic({ apiKey: s.value });
      }
      if (s.key === 'openrouter_api_key' && s.value) {
        this.openrouterApiKey = s.value;
      }
      if (s.key === 'gemini_api_key' && s.value) {
        this.geminiApiKey = s.value;
      }
      if (s.key === 'active_provider' && s.value) {
        this.activeProvider = s.value as ActiveProvider;
      }
      if (s.key === 'bedrock_model' && s.value) {
        this.bedrockModel = s.value;
      }
    }

    // Bedrock uses the default AWS credential chain — reads ~/.aws/credentials automatically.
    // No explicit key needed if `aws configure` has been run.
    const awsRegion = process.env.AWS_REGION || 'us-west-2';
    this.bedrockClient = new BedrockRuntimeClient({ region: awsRegion });
  }

  setActiveProvider(provider: ActiveProvider, model?: string) {
    this.activeProvider = provider;
    if (model) this.bedrockModel = model;
    try {
      const db = getDb();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_provider', ?)").run(provider);
      if (model) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bedrock_model', ?)").run(model);
    } catch { /* non-fatal */ }
  }

  getActiveProvider() {
    return { provider: this.activeProvider, model: this.bedrockModel };
  }

  /**
   * Process a user prompt through the orchestrated pipeline.
   * Emits Plan → Tool → Chunk → Reflect events to the Shadow Terminal bus.
   */
  async *processInteraction(prompt: string, options: InteractionOptions) {
    // Lazy provider init — DB is guaranteed ready by the time a request arrives
    if (!this.anthropic && !this.openrouterApiKey && !this.geminiApiKey) {
      this.initProviders();
    }

    const runId = uuid();
    const baseEvent = { runId, projectId: options.projectId, sessionId: options.sessionId };
    shadowBus.emitEvent({ ...baseEvent, type: 'run:start', payload: { prompt: prompt.slice(0, 200) } });

    // 1. Plan phase — analyze prompt locally
    const plan = analyzePrompt(prompt, runId);
    shadowBus.emitEvent({ ...baseEvent, type: 'plan', payload: plan });

    // 1a. Impact Graph — if plan has write intent + mentioned files, compute dependents
    if (plan.writeIntent && plan.mentionedFiles.length > 0) {
      try {
        const impact = computeImpactForFiles(options.projectId, plan.mentionedFiles);
        shadowBus.emitEvent({ ...baseEvent, type: 'impact', payload: impact });
      } catch (err: any) {
        console.warn('[orchestrator] impact graph failed:', err.message);
      }
    }

    // 2. Context Builder
    const { content: contextContent } = assembleContext(options.projectId);
    shadowBus.emitEvent({ ...baseEvent, type: 'tool', payload: { name: 'context-injector', status: 'ok', chars: contextContent.length } });

    // 3. Policy Check
    const policyResult = this.checkPolicy(prompt, options.projectId);
    if (policyResult.status === 'restrict') {
      shadowBus.emitEvent({ ...baseEvent, type: 'error', payload: { message: `Policy restrict: ${policyResult.reason}` } });
      shadowBus.emitEvent({ ...baseEvent, type: 'reflect', payload: buildReflection(runId, 'aborted', 0, 0, policyResult.reason) });
      shadowBus.emitEvent({ ...baseEvent, type: 'run:end', payload: { outcome: 'aborted' } });
      yield { type: 'error', content: `Action restricted: ${policyResult.reason}` };
      return;
    }

    // 4. System Prompt + Route selection
    const brain = getProjectBrain(options.projectId);

    // 5. Budget + Route selection
    const budget = canSpawnSession();
    const isClaudeLimited = !budget.allowed;
    const route = this.pickRoute(isClaudeLimited, !!options.useCLI);
    shadowBus.emitEvent({ ...baseEvent, type: 'tool', payload: { name: 'route', status: 'ok', route } });

    // Mistral (devstral) and Claude CLI underweight system prompts — inject files into
    // the user turn instead. Bedrock Claude handles system prompts correctly.
    const fileInSystemPrompt = route === 'bedrock' || route === 'anthropic';
    const systemPrompt = this.buildSystemPrompt(brain, contextContent, fileInSystemPrompt ? options.fileContext : undefined);
    const userPrompt = !fileInSystemPrompt && options.fileContext
      ? `${options.fileContext}\n\n---\n${prompt}`
      : prompt;

    // 6. Execute + capture metrics for Reflection phase
    let chunkCount = 0;
    let totalChars = 0;
    let errorMessage: string | undefined;
    let outcome: 'success' | 'error' | 'aborted' | 'partial' = 'success';

    try {
      const router = this.getRouter(route);
      for await (const event of router.call(this, userPrompt, systemPrompt, options)) {
        if (event.type === 'chunk') {
          chunkCount++;
          totalChars += event.content.length;
        } else if (event.type === 'error') {
          outcome = 'error';
          errorMessage = event.content;
        }
        yield event;
      }
    } catch (err: any) {
      outcome = 'error';
      errorMessage = err.message;
      yield { type: 'error', content: err.message };
    }

    if (outcome === 'success' && chunkCount === 0) outcome = 'partial';

    const reflection = buildReflection(runId, outcome, chunkCount, totalChars, errorMessage);
    shadowBus.emitEvent({ ...baseEvent, type: 'reflect', payload: reflection });
    shadowBus.emitEvent({ ...baseEvent, type: 'run:end', payload: { outcome } });
  }

  private pickRoute(isClaudeLimited: boolean, useCLI: boolean): 'claude-cli' | 'anthropic' | 'bedrock' | 'devstral' | 'gemini-native' | 'openrouter' {
    if (this.activeProvider === 'bedrock') return 'bedrock';
    if (this.activeProvider === 'devstral') return 'devstral';

    if (isClaudeLimited) {
      if (this.bedrockClient) return 'bedrock';
      if (this.geminiApiKey) return 'gemini-native';
      if (this.openrouterApiKey) return 'openrouter';
      return 'claude-cli';
    }
    if (useCLI || !this.anthropic) return 'claude-cli';
    return 'anthropic';
  }

  private getRouter(route: string) {
    switch (route) {
      case 'claude-cli': return this.routeToClaudeCLI;
      case 'anthropic': return this.routeToAnthropic;
      case 'bedrock': return this.routeToBedrock;
      case 'devstral': return this.routeToDevstral;
      case 'kimi': return this.routeToKimi;
      case 'gemini-native': return this.routeToGeminiNative;
      case 'openrouter': return this.routeToOpenRouter;
      default: return this.routeToClaudeCLI;
    }
  }

  private async *routeToKimi(prompt: string, system: string, options: InteractionOptions) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      yield { type: 'error', content: 'NVIDIA_API_KEY not found in environment. Please add it to sidecar/.env' };
      return;
    }

    const history = (options.history ?? []).map(t => ({
      role: t.role,
      content: t.content
    }));

    yield* this.routeToOpenAICompatible(
      'https://integrate.api.nvidia.com/v1',
      apiKey,
      KIMI_MODEL,
      'kimi',
      prompt,
      system,
      history
    );
  }

  private async *routeToOpenAICompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    providerType: string,
    prompt: string,
    system: string,
    history: any[]
  ) {
    const start = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            ...history,
            { role: 'user', content: prompt }
          ],
          stream: true,
          max_tokens: 4096,
          temperature: 0.5,
          top_p: 1,
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI-compatible provider error: ${response.status} ${err}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (!reader) throw new Error('Failed to get response reader');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                yield { type: 'chunk', content };
              }
              // NVIDIA NIM might not provide usage in stream, but if it does:
              if (json.usage) {
                inputTokens = json.usage.prompt_tokens;
                outputTokens = json.usage.completion_tokens;
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      // Est tokens if not provided (1 token ~= 4 chars)
      if (inputTokens === 0) {
        inputTokens = Math.ceil((system.length + prompt.length + JSON.stringify(history).length) / 4);
        outputTokens = Math.ceil(fullContent.length / 4);
      }

      this.logUsage(providerType, model, inputTokens, outputTokens, Date.now() - start);
      yield { type: 'done', content: fullContent };

    } catch (err: any) {
      yield { type: 'error', content: `${providerType} error: ${err.message}` };
    }
  }

  private checkPolicy(prompt: string, projectId: string) {
    const db = getDb();
    const restricted = db.prepare("SELECT action_pattern, policy, reason FROM execution_policies WHERE (project_id = ? OR project_id IS NULL) AND policy = 'restrict'").all(projectId) as any[];

    for (const rule of restricted) {
      if (prompt.toLowerCase().includes(rule.action_pattern.toLowerCase())) {
        return { status: 'restrict', reason: rule.reason || `Matches restricted pattern: ${rule.action_pattern}` };
      }
    }

    return { status: 'allow' };
  }

  private buildSystemPrompt(brain: any, context: string, fileContext?: string): string {
    const parts = [
      'You are Cortex, an expert AI development assistant embedded in the user\'s project.',
      'You have access to the actual project source files listed below — read them carefully before answering.',
      'Never say you cannot read files. Never make up file contents. If a file is not provided, say so.',
      '',
      '## Project Intelligence',
      context,
    ];

    if (brain?.conventions) {
      parts.push('', '## Conventions', brain.conventions);
    }

    if (fileContext) {
      parts.push('', fileContext);
    }

    return parts.join('\n');
  }

  private async *routeToAnthropic(prompt: string, system: string, options: InteractionOptions) {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    try {
      const messages: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const turn of (options.history ?? [])) {
        messages.push({ role: turn.role, content: turn.content });
      }
      messages.push({ role: 'user', content: prompt });

      const stream = await this.anthropic.messages.create({
        model: options.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: system,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield { type: 'chunk', content: chunk.delta.text };
        }
      }
      yield { type: 'done', content: '' };
    } catch (err: any) {
      yield { type: 'error', content: err.message };
    }
  }

  private async *routeToBedrockModel(modelId: string, providerType: string, prompt: string, system: string, options: InteractionOptions) {
    if (!this.bedrockClient) {
      yield { type: 'error', content: 'Bedrock client not initialized' };
      return;
    }
    const startedAt = Date.now();
    try {
      // Build multi-turn message array from history + current prompt
      const messages: { role: 'user' | 'assistant'; content: { text: string }[] }[] = [];
      for (const turn of (options.history ?? [])) {
        messages.push({ role: turn.role, content: [{ text: turn.content }] });
      }
      messages.push({ role: 'user', content: [{ text: prompt }] });

      const command = new ConverseStreamCommand({
        modelId,
        system: [{ text: system }],
        messages,
        inferenceConfig: { temperature: 0.7, maxTokens: 8192 },
      });
      const response = await this.bedrockClient.send(command);
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const event of response.stream ?? []) {
        if ('contentBlockDelta' in event && event.contentBlockDelta?.delta?.text) {
          yield { type: 'chunk', content: event.contentBlockDelta.delta.text };
        }
        if ('metadata' in event && event.metadata?.usage) {
          inputTokens = event.metadata.usage.inputTokens ?? 0;
          outputTokens = event.metadata.usage.outputTokens ?? 0;
        }
      }
      try {
        const db = getDb();
        db.prepare(
          'INSERT INTO provider_usage (id, provider_type, model_id, session_id, project_id, input_tokens, output_tokens, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(uuid(), providerType, modelId, options.sessionId ?? null, options.projectId, inputTokens, outputTokens, Date.now() - startedAt);
      } catch { /* non-fatal */ }
      yield { type: 'done', content: '' };
    } catch (err: any) {
      const e = err as Error & { name?: string };
      if (e.name === 'CredentialsProviderError' || /credential/i.test(e.message)) {
        yield { type: 'error', content: 'AWS credentials not found. Run: aws configure' };
      } else if (e.name === 'AccessDeniedException') {
        yield { type: 'error', content: `Bedrock access denied for model ${modelId}. Ensure it is enabled in the AWS Bedrock console.` };
      } else {
        yield { type: 'error', content: `Bedrock error: ${e.message}` };
      }
    }
  }

  private async *routeToBedrock(prompt: string, system: string, options: InteractionOptions) {
    const modelId = options.model === 'opus' ? BEDROCK_OPUS : this.bedrockModel;
    yield* this.routeToBedrockModel(modelId, 'bedrock', prompt, system, options);
  }

  private async *routeToDevstral(prompt: string, system: string, options: InteractionOptions) {
    yield* this.routeToBedrockModel(DEVSTRAL_MODEL, 'devstral', prompt, system, options);
  }

  private async *routeToClaudeCLI(prompt: string, system: string, options: InteractionOptions) {
    const historyLines = (options.history ?? []).map(t =>
      `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`
    ).join('\n');
    const fullPrompt = historyLines
      ? `${system}\n\n## Conversation History:\n${historyLines}\n\nUser: ${prompt}`
      : `${system}\n\nUser: ${prompt}`;

    try {
      const claudePath = findClaudeBinary() || 'claude';
      const claude = spawn(claudePath, ['-p', fullPrompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      for await (const chunk of claude.stdout) {
        yield { type: 'chunk', content: chunk.toString() };
      }

      let stderr = '';
      for await (const chunk of claude.stderr) {
        stderr += chunk.toString();
      }

      const exitCode = await new Promise<number>((resolve) => {
        claude.on('close', resolve);
      });

      if (exitCode !== 0 && !stderr.includes('Warning')) {
        yield { type: 'error', content: stderr || `Claude CLI exited with code ${exitCode}` };
      } else {
        yield { type: 'done', content: '' };
      }
    } catch (err: any) {
      yield { type: 'error', content: err.message };
    }
  }

  private async *routeToGeminiNative(prompt: string, system: string, options: InteractionOptions) {
    if (!this.geminiApiKey) throw new Error('Gemini API key not configured');

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse&key=${this.geminiApiKey}`;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.1 }
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`Gemini API error: ${err[0]?.error?.message || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Could not get response reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) yield { type: 'chunk', content };
            } catch { /* ignore */ }
          }
        }
      }
      yield { type: 'done', content: '' };
    } catch (err: any) {
      yield { type: 'error', content: `Gemini fallback failed: ${err.message}` };
    }
  }

  private async *routeToOpenRouter(prompt: string, system: string, options: InteractionOptions) {
    if (!this.openrouterApiKey) throw new Error('OpenRouter API key not configured');

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://github.com/AetheriumDev/cortex',
          'X-Title': 'Cortex AI Workspace',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || 'google/gemini-pro-1.5-exp-0801',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`OpenRouter error: ${err.error?.message || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Could not get response reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices[0]?.delta?.content;
              if (content) yield { type: 'chunk', content };
            } catch { /* ignore parse errors */ }
          }
        }
      }

      yield { type: 'done', content: '' };
    } catch (err: any) {
      yield { type: 'error', content: `OpenRouter fallback failed: ${err.message}` };
    }
  }
}

export const orchestrator = AIOrchestrator.getInstance();
