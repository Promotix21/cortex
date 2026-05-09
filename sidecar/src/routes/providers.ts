import { Router } from 'express';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getDb } from '../db/index.js';
import { orchestrator, BEDROCK_SONNET, BEDROCK_OPUS, DEVSTRAL_MODEL, KIMI_MODEL, type ActiveProvider } from '../orchestrator/index.js';

export const providersRouter: ReturnType<typeof Router> = Router();

const BEDROCK_REGION = process.env.AWS_REGION || 'us-west-2';

// GET /api/providers/status
providersRouter.get('/status', (req, res) => {
  const db = getDb();
  const { provider, model } = orchestrator.getActiveProvider();

  // Last 7 days provider usage
  const usage = db.prepare(`
    SELECT provider_type, model_id, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
           COUNT(*) as call_count, AVG(latency_ms) as avg_latency_ms
    FROM provider_usage
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY provider_type, model_id
  `).all() as any[];

  res.json({
    activeProvider: provider,
    activeModel: model,
    providers: [
      {
        id: 'claude-cli',
        displayName: 'Claude Pro (CLI)',
        isActive: provider === 'claude-cli',
        models: ['claude-code'],
      },
      {
        id: 'bedrock',
        displayName: 'AWS Bedrock — Claude',
        isActive: provider === 'bedrock',
        models: [
          { id: BEDROCK_SONNET, label: 'Claude Sonnet 4.6' },
          { id: BEDROCK_OPUS, label: 'Claude Opus 4.7' },
        ],
        region: BEDROCK_REGION,
      },
      {
        id: 'devstral',
        displayName: 'Devstral 2 (Mistral)',
        isActive: provider === 'devstral',
        models: [{ id: DEVSTRAL_MODEL, label: 'Devstral 2 123B' }],
        region: BEDROCK_REGION,
      },
      {
        id: 'kimi',
        displayName: 'Kimi K2.6 (NVIDIA NIM)',
        isActive: provider === 'kimi',
        models: [{ id: KIMI_MODEL, label: 'Kimi K2.6' }],
        region: 'Global (NVIDIA)',
      },
    ],
    usageStats: usage,
  });
});

// POST /api/providers/switch — { provider: 'claude-cli' | 'bedrock' | 'devstral' | 'kimi', model?: string }
providersRouter.post('/switch', (req, res) => {
  const { provider, model } = req.body;
  const valid: ActiveProvider[] = ['claude-cli', 'bedrock', 'devstral', 'kimi'];
  if (!provider || !valid.includes(provider)) {
    res.status(400).json({ error: `provider must be one of: ${valid.join(', ')}` });
    return;
  }

  const resolvedModel = model || (
    provider === 'bedrock' ? BEDROCK_SONNET : 
    provider === 'devstral' ? DEVSTRAL_MODEL : 
    provider === 'kimi' ? KIMI_MODEL : 
    undefined
  );
  orchestrator.setActiveProvider(provider as ActiveProvider, resolvedModel);

  const messages: Record<ActiveProvider, string> = {
    'claude-cli': 'Switched to Claude Pro (CLI)',
    'bedrock': `Switched to AWS Bedrock — ${resolvedModel === BEDROCK_OPUS ? 'Claude Opus 4.7' : 'Claude Sonnet 4.6'}`,
    'devstral': 'Switched to Devstral 2 123B (Mistral AI)',
    'kimi': 'Switched to Kimi K2.6 via NVIDIA NIM',
  };

  res.json({ success: true, activeProvider: provider, activeModel: resolvedModel, message: messages[provider as ActiveProvider] });
});

// GET /api/providers/kimi/test — verify NVIDIA NIM connection
providersRouter.get('/kimi/test', async (req, res) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    res.status(401).json({ ok: false, error: 'NVIDIA_API_KEY not found in sidecar/.env' });
    return;
  }

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      })
    });

    if (response.ok) {
      res.json({ ok: true, model: KIMI_MODEL, provider: 'NVIDIA NIM' });
    } else {
      const err = await response.text();
      res.status(response.status).json({ ok: false, error: err });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/providers/bedrock/test — verify AWS credentials + Bedrock access
providersRouter.get('/bedrock/test', async (req, res) => {
  const client = new BedrockRuntimeClient({ region: BEDROCK_REGION });
  try {
    await client.send(new ConverseCommand({
      modelId: BEDROCK_SONNET,
      messages: [{ role: 'user', content: [{ text: 'hi' }] }],
      inferenceConfig: { maxTokens: 5 },
    }));
    res.json({ ok: true, region: BEDROCK_REGION, model: BEDROCK_SONNET });
  } catch (err: any) {
    const e = err as Error & { name?: string };
    const isCredErr = e.name === 'CredentialsProviderError' || /credential/i.test(e.message);
    res.status(isCredErr ? 401 : 500).json({
      ok: false,
      error: isCredErr ? 'AWS credentials not found. Run: aws configure' : e.message,
      name: e.name,
    });
  }
});

// GET /api/providers/usage — token usage summary (all providers)
providersRouter.get('/usage', (req, res) => {
  const db = getDb();
  const days = Number(req.query.days ?? 30);
  const rows = db.prepare(`
    SELECT provider_type, model_id,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens,
           COUNT(*) as call_count,
           DATE(created_at) as date
    FROM provider_usage
    WHERE created_at > datetime('now', ?)
    GROUP BY provider_type, model_id, DATE(created_at)
    ORDER BY date DESC
  `).all(`-${days} days`) as any[];
  res.json({ rows, days });
});
