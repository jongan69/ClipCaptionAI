/**
 * Shared AI provider abstraction for ClipCaptionAI.
 *
 * Supports DeepSeek and OpenAI through a common chat-completions interface.
 * DeepSeek's API is OpenAI-compatible — the same `openai` npm SDK works for
 * both, with only baseURL and model names changing.
 *
 * Features NOT available on DeepSeek (OpenAI-only):
 *   - Whisper transcription (audio.transcriptions)
 *   - Responses API (responses.create)
 *
 * Provider resolution order:
 *   1. Explicit --provider CLI flag
 *   2. DEEPSEEK_API_KEY env var → DeepSeek
 *   3. OPENAI_API_KEY env var   → OpenAI
 *   4. null (no provider available)
 */

import OpenAI from 'openai';

// ── Provider registry ─────────────────────────────────────────────────

export const PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-pro',
    fastModel: 'deepseek-v4-flash',
    supports: {
      chatCompletions: true,
      jsonMode: true,
      streaming: true,
      transcription: false,
      responsesApi: false,
      strictJsonSchema: false, // JSON mode but no strict schema support
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: undefined, // SDK default
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4.1-mini',
    fastModel: 'gpt-4.1-mini',
    supports: {
      chatCompletions: true,
      jsonMode: true,
      streaming: true,
      transcription: true,
      responsesApi: true,
      strictJsonSchema: true,
    },
  },
};

// ── Provider resolution ───────────────────────────────────────────────

/**
 * Resolve which AI provider to use.
 *
 * @param {{ provider?: string }} opts
 * @returns {{ provider: string, config: object } | { provider: null, config: null }}
 */
export const resolveProvider = (opts = {}) => {
  const requested = String(opts.provider ?? '')
    .toLowerCase()
    .trim();

  // Explicit CLI flag
  if (requested === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    return {provider: 'deepseek', config: PROVIDERS.deepseek};
  }
  if (requested === 'openai' && process.env.OPENAI_API_KEY) {
    return {provider: 'openai', config: PROVIDERS.openai};
  }
  if (requested && !PROVIDERS[requested]) {
    throw new Error(`Unknown provider "${requested}". Valid options: deepseek, openai`);
  }
  if (requested && !process.env[PROVIDERS[requested].apiKeyEnv]) {
    throw new Error(`${PROVIDERS[requested].apiKeyEnv} is required for provider "${requested}"`);
  }

  // Auto-detect: prefer DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    return {provider: 'deepseek', config: PROVIDERS.deepseek};
  }
  if (process.env.OPENAI_API_KEY) {
    return {provider: 'openai', config: PROVIDERS.openai};
  }

  return {provider: null, config: null};
};

// ── Client creation ────────────────────────────────────────────────────

/**
 * Create an OpenAI-compatible client for the resolved provider.
 *
 * @param {{ provider: string, config: object }} resolved
 * @param {{ maxRetries?: number }} opts
 * @returns {OpenAI}
 */
export const createClient = (resolved, opts = {}) => {
  if (!resolved.config) {
    throw new Error('No AI provider available. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');
  }

  return new OpenAI({
    baseURL: resolved.config.baseURL,
    apiKey: process.env[resolved.config.apiKeyEnv],
    maxRetries: opts.maxRetries ?? 1,
    // Bound any single model call so a hung provider can't hang a pipeline.
    timeout: opts.timeout ?? 180_000,
  });
};

// ── Model resolution ───────────────────────────────────────────────────

/**
 * Resolve the model to use, with env-var overrides.
 *
 * Checks in order:
 *   1. Explicit CLI/model argument
 *   2. Provider-specific env var (OPENAI_CHAPTER_MODEL, etc.)
 *   3. Provider default model
 *
 * @param {{ resolved: object, model?: string, envModelKey?: string, preferFast?: boolean }} opts
 * @returns {string}
 */
export const resolveModel = (opts = {}) => {
  const {resolved, model, envModelKey, preferFast} = opts;

  if (model) return model;
  if (envModelKey && process.env[envModelKey]) return process.env[envModelKey];

  const config = resolved.config;
  // No provider configured → no model. Callers that can operate without AI
  // (heuristic fallback paths) rely on this null; callers that require AI
  // fail later at createClient() with a clear error.
  if (!config) return null;

  return preferFast ? config.fastModel : config.defaultModel;
};

// ── Chat completion helpers ────────────────────────────────────────────

/**
 * Strip markdown code fences that some providers wrap JSON in.
 */
const stripFences = (text) =>
  String(text ?? '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

/**
 * Run a chat completion and return the raw text content.
 *
 * @param {OpenAI} client
 * @param {{ model: string, systemPrompt: string, userPrompt: string, temperature?: number, jsonMode?: boolean }} opts
 * @returns {Promise<string>}
 */
export const chatCompletion = async (client, opts) => {
  const {model, systemPrompt, userPrompt, temperature, jsonMode} = opts;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt},
    ],
    ...(jsonMode ? {response_format: {type: 'json_object'}} : {}),
    temperature: temperature ?? (jsonMode ? 0.3 : 0.7),
  });

  return stripFences(response.choices?.[0]?.message?.content ?? '');
};

/**
 * Run a chat completion and parse the result as JSON.
 *
 * On a JSON parse failure the request is retried once with an explicit
 * "raw JSON only" instruction; if the retry also fails, a descriptive
 * error is thrown instead of a bare SyntaxError.
 *
 * @param {OpenAI} client
 * @param {{ model: string, systemPrompt: string, userPrompt: string, temperature?: number }} opts
 * @returns {Promise<object>}
 */
export const structuredChatCompletion = async (client, opts) => {
  const attempt = (repair = false) =>
    chatCompletion(client, {
      ...opts,
      jsonMode: true,
      temperature: opts.temperature ?? 0.3,
      ...(repair
        ? {
            userPrompt: `${opts.userPrompt}\n\nRespond with raw JSON only — no markdown fences, no commentary.`,
          }
        : {}),
    });

  try {
    const text = await attempt(false);
    return JSON.parse(text);
  } catch (error) {
    // Only repair genuine parse failures; network/API errors pass through.
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    try {
      const retryText = await attempt(true);
      return JSON.parse(retryText);
    } catch (retryError) {
      throw new Error(
        `Model returned invalid JSON${retryError instanceof SyntaxError ? ' after retry' : ''}: ${
          retryError?.message ?? retryError
        }`,
        {cause: retryError},
      );
    }
  }
};
