import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-haiku-5-5';
const GEMINI_MODEL = 'gemini-flash-latest';

let claudeExhausted = false;
let claudeExhaustedAt = 0;
const RETRY_AFTER_MS = 60 * 60 * 1000; // retry Claude after 1h

function getClaudeClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (claudeExhausted && Date.now() - claudeExhaustedAt < RETRY_AFTER_MS) return null;
  if (claudeExhausted) claudeExhausted = false;
  const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: key };
  if (process.env.ANTHROPIC_WORKSPACE_ID) {
    opts.defaultHeaders = { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID };
  }
  return new Anthropic(opts);
}

function markClaudeExhausted() {
  claudeExhausted = true;
  claudeExhaustedAt = Date.now();
  console.warn('[IA] Créditos Claude esgotados — fallback para Gemini');
}

export interface AITextRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  jsonSchema?: Record<string, any>;
}

export interface AIVisionRequest extends AITextRequest {
  fileBase64: string;
  mimeType: string;
}

async function callClaude(req: AITextRequest | AIVisionRequest): Promise<string | null> {
  const client = getClaudeClient();
  if (!client) return null;

  const messages: Anthropic.MessageParam[] = [];
  const content: Anthropic.ContentBlockParam[] = [];

  if ('fileBase64' in req && req.fileBase64) {
    if (req.mimeType === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.fileBase64 } });
    } else {
      const imgType = req.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      content.push({ type: 'image', source: { type: 'base64', media_type: imgType, data: req.fileBase64 } });
    }
  }
  content.push({ type: 'text', text: req.prompt });
  messages.push({ role: 'user', content });

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: req.systemPrompt || undefined,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages,
    });

    for (const block of response.content) {
      if (block.type === 'text') return block.text;
    }
    return null;
  } catch (err: any) {
    if (err instanceof Anthropic.RateLimitError || err?.status === 429) {
      markClaudeExhausted();
      return null;
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('[IA] Claude API key inválida');
      markClaudeExhausted();
      return null;
    }
    console.error('[IA] Claude erro:', err.message || err);
    return null;
  }
}

async function callGemini(req: AITextRequest | AIVisionRequest, schema?: Record<string, any>): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const parts: any[] = [];
  if ('fileBase64' in req && req.fileBase64) {
    parts.push({ inline_data: { mime_type: req.mimeType, data: req.fileBase64 } });
  }
  parts.push({ text: req.prompt });

  const body: any = {
    contents: [{ parts }],
    generationConfig: {
      temperature: req.temperature ?? 0.1,
    },
  };
  if (req.systemPrompt) {
    body.system_instruction = { parts: [{ text: req.systemPrompt }] };
  }
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!resp.ok) {
      console.error('[IA] Gemini HTTP', resp.status);
      return null;
    }
    const json: any = await resp.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err: any) {
    console.error('[IA] Gemini erro:', err.message || err);
    return null;
  }
}

export async function aiGenerate(
  req: AITextRequest | AIVisionRequest,
  geminiSchema?: Record<string, any>,
): Promise<{ text: string | null; provider: 'claude' | 'gemini' | null }> {
  const claudeResult = await callClaude(req);
  if (claudeResult) return { text: claudeResult, provider: 'claude' };

  const geminiResult = await callGemini(req, geminiSchema);
  if (geminiResult) return { text: geminiResult, provider: 'gemini' };

  return { text: null, provider: null };
}

export function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braces = raw.match(/\{[\s\S]*\}/);
  if (braces) return braces[0];
  return raw.trim();
}

export function getActiveProvider(): 'claude' | 'gemini' | 'none' {
  if (process.env.ANTHROPIC_API_KEY && !claudeExhausted) return 'claude';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'none';
}
