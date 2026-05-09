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
import { searchCodebase, formatSearchResults } from '../intelligence/search-engine.js';
import { getProjectStructureSummary, indexProject } from '../intelligence/file-indexer.js';
import { getMasterpieceContext } from '../intelligence/masterpiece-context.js';

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
   */
  async *processInteraction(prompt: string, options: InteractionOptions) {
    if (!this.anthropic && !this.openrouterApiKey && !this.geminiApiKey) {
      this.initProviders();
    }

    const db = getDb();
    const runId = uuid();
    const baseEvent = { runId, projectId: options.projectId, sessionId: options.sessionId };
    shadowBus.emitEvent({ ...baseEvent, type: 'run:start', payload: { prompt: prompt.slice(0, 200) } });

    // 1. Plan phase
    const plan = analyzePrompt(prompt, runId);
    shadowBus.emitEvent({ ...baseEvent, type: 'plan', payload: plan });

    if (plan.writeIntent && plan.mentionedFiles.length > 0) {
      try {
        const impact = computeImpactForFiles(options.projectId, plan.mentionedFiles);
        shadowBus.emitEvent({ ...baseEvent, type: 'impact', payload: impact });
      } catch (err: any) {
        console.warn('[orchestrator] impact graph failed:', err.message);
      }
    }

    // 2. Context Builder (Upgraded to Semantic Search)
    const { content: palaceContext } = assembleContext(options.projectId);
    const structureSummary = getProjectStructureSummary(options.projectId);
    
    const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(options.projectId) as any;
    const searchResults = await searchCodebase(options.projectId, project?.path || '', prompt);
    const semanticCodeContext = formatSearchResults(searchResults);
    
    shadowBus.emitEvent({ ...baseEvent, type: 'tool', payload: { 
      name: 'semantic-search', status: 'ok', matches: searchResults.length 
    } });

    // 3. Policy Check
    const policyResult = this.checkPolicy(prompt, options.projectId);
    if (policyResult.status === 'restrict') {
      shadowBus.emitEvent({ ...baseEvent, type: 'error', payload: { message: `Policy restrict: ${policyResult.reason}` } });
      shadowBus.emitEvent({ ...baseEvent, type: 'reflect', payload: buildReflection(runId, 'aborted', 0, 0, policyResult.reason) });
      shadowBus.emitEvent({ ...baseEvent, type: 'run:end', payload: { outcome: 'aborted' } });
      yield { type: 'error', content: `Action restricted: ${policyResult.reason}` };
      return;
    }

    // 4. Budget + Route selection
    const budget = canSpawnSession();
    const isClaudeLimited = !budget.allowed;
    const route = this.pickRoute(isClaudeLimited, !!options.useCLI);
    shadowBus.emitEvent({ ...baseEvent, type: 'tool', payload: { name: 'route', status: 'ok', route } });

    // 5. Build Cursor-grade System Prompt
    const brain = getProjectBrain(options.projectId);
    const systemPrompt = this.buildAgenticPrompt(brain, structureSummary, semanticCodeContext, palaceContext);

    const fileInSystemPrompt = route === 'bedrock' || route === 'anthropic' || route === 'kimi';
    const userPrompt = !fileInSystemPrompt && options.fileContext
      ? `${options.fileContext}\n\n---\n${prompt}`
      : prompt;

    // 6. Execute
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
          yield event;
        } else if (event.type === 'error') {
          outcome = 'error';
          errorMessage = event.content;
          yield event;
        } else {
          yield event;
        }
      }
    } catch (err: any) {
      outcome = 'error';
      errorMessage = err.message;
      yield { type: 'error', content: err.message };
    }

    // 7. Reflect
    const reflection = buildReflection(runId, outcome, chunkCount, totalChars, errorMessage);
    shadowBus.emitEvent({ ...baseEvent, type: 'reflect', payload: reflection });
    shadowBus.emitEvent({ ...baseEvent, type: 'run:end', payload: { outcome } });
  }

  private buildAgenticPrompt(brain: any, structure: string, code: string, memory: string): string {
    const db = getDb();
    const masterpieceSetting = db.prepare("SELECT value FROM settings WHERE key = 'masterpiece_mode'").get() as any;
    
    const parts = [
      'You are Cortex, the World-Class AI Software Engineer. You are at par with Cursor and better than GitHub Copilot.',
      'Your goal is to provide deep, architectural, and production-ready code insights.',
      '',
      '## CODEBASE MAP',
      structure || 'Structure unknown.',
      '',
      '## RELEVANT SNIPPETS (Semantic Search)',
      code || 'No specific snippets retrieved.',
      '',
      '## TEMPORAL MEMORY (Decisions & Facts)',
      memory || 'No historical memory found.',
    ];

    if (brain?.conventions) parts.push('', '## CONVENTIONS', brain.conventions);
    if (masterpieceSetting?.value === 'true') parts.push('\n' + getMasterpieceContext());

    return parts.join('\n');
  }

  private pickRoute(isClaudeLimited: boolean, useCLI: boolean): string {
    if (this.activeProvider !== 'claude-cli') return this.activeProvider;
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

  private async *routeToBedrock(prompt: string, system: string, options: InteractionOptions) {
    const modelId = options.model === 'opus' ? BEDROCK_OPUS : this.bedrockModel;
    yield* this.routeToBedrockModel(modelId, 'bedrock', prompt, system, options);
  }

  private async *routeToDevstral(prompt: string, system: string, options: InteractionOptions) {
    yield* this.routeToBedrockModel(DEVSTRAL_MODEL, 'devstral', prompt, system, options);
  }

  private async *routeToKimi(prompt: string, system: string, options: InteractionOptions) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      yield { type: 'error', content: 'NVIDIA_API_KEY not found in environment. Please add it to sidecar/.env' };
      return;
    }
    const history = (options.history ?? []).map(t => ({ role: t.role, content: t.content }));
    yield* this.routeToOpenAICompatible('https://integrate.api.nvidia.com/v1', apiKey, KIMI_MODEL, 'kimi', prompt, system, history);
  }

  private async *routeToBedrockModel(modelId: string, providerType: string, prompt: string, system: string, options: InteractionOptions) {
    const start = Date.now();
    try {
      const history = (options.history ?? []).map(t => ({ role: t.role, content: [{ text: t.content }] }));
      const command = new ConverseStreamCommand({
        modelId,
        messages: [...history, { role: 'user', content: [{ text: prompt }] }],
        system: [{ text: system }],
        inferenceConfig: { maxTokens: 4096, temperature: 0.5, topP: 0.9 },
      });

      const response = await this.bedrockClient!.send(command);
      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;

      if (response.stream) {
        for await (const chunk of response.stream) {
          if (chunk.contentBlockDelta?.delta?.text) {
            const text = chunk.contentBlockDelta.delta.text;
            fullContent += text;
            yield { type: 'chunk', content: text };
          }
          if (chunk.metadata?.usage) {
            inputTokens = chunk.metadata.usage.inputTokens;
            outputTokens = chunk.metadata.usage.outputTokens;
          }
        }
      }
      this.logUsage(providerType, modelId, inputTokens, outputTokens, Date.now() - start);
      yield { type: 'done', content: fullContent };
    } catch (e: any) {
      yield { type: 'error', content: `Bedrock error: ${e.message}` };
    }
  }

  private async *routeToClaudeCLI(prompt: string, system: string, options: InteractionOptions) {
    const historyLines = (options.history ?? []).map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`).join('\n');
    const fullPrompt = historyLines ? `${system}\n\n## History:\n${historyLines}\n\nUser: ${prompt}` : `${system}\n\nUser: ${prompt}`;
    try {
      const claudePath = findClaudeBinary() || 'claude';
      const claude = spawn(claudePath, ['-p', fullPrompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, HOME: process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME },
      });
      let fullResponse = '';
      for await (const chunk of claude.stdout) {
        const text = chunk.toString();
        fullResponse += text;
        yield { type: 'chunk', content: text };
      }
      yield { type: 'done', content: fullResponse.trim() };
    } catch (err: any) {
      yield { type: 'error', content: `Claude CLI error: ${err.message}` };
    }
  }

  private async *routeToOpenAICompatible(baseUrl: string, apiKey: string, model: string, provider: string, prompt: string, system: string, history: any[]) {
    const start = Date.now();
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: prompt }],
          stream: true,
          max_tokens: 4096, temperature: 0.5,
        })
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const content = JSON.parse(data).choices[0]?.delta?.content || '';
            if (content) { fullContent += content; yield { type: 'chunk', content }; }
          } catch {}
        }
      }
      this.logUsage(provider, model, 0, 0, Date.now() - start);
      yield { type: 'done', content: fullContent };
    } catch (err: any) { yield { type: 'error', content: `${provider} error: ${err.message}` }; }
  }

  private checkPolicy(prompt: string, projectId: string) {
    const db = getDb();
    const restricted = db.prepare("SELECT action_pattern, reason FROM execution_policies WHERE (project_id = ? OR project_id IS NULL) AND policy = 'restrict'").all(projectId) as any[];
    for (const rule of restricted) {
      if (prompt.toLowerCase().includes(rule.action_pattern.toLowerCase())) return { status: 'restrict', reason: rule.reason || 'Restricted pattern' };
    }
    return { status: 'allow' };
  }

  private logUsage(provider: string, model: string, input: number, output: number, latency: number) {
    try {
      const db = getDb();
      db.prepare('INSERT INTO provider_usage (id, provider_type, model_id, input_tokens, output_tokens, latency_ms) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid(), provider, model, input, output, latency);
    } catch {}
  }

  private async *routeToAnthropic(p: string, s: string, o: InteractionOptions) { yield { type: 'error', content: 'Anthropic SDK routing not implemented yet. Use Claude CLI or Bedrock.' }; }
  private async *routeToGeminiNative(p: string, s: string, o: InteractionOptions) { yield { type: 'error', content: 'Gemini routing not implemented.' }; }
  private async *routeToOpenRouter(p: string, s: string, o: InteractionOptions) { yield { type: 'error', content: 'OpenRouter routing not implemented.' }; }
}

export const orchestrator = AIOrchestrator.getInstance();
