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
  const requested = String(opts.provider ?? '').toLowerCase().trim();

  // Explicit CLI flag
  if (requested === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    return {provider: 'deepseek', config: PROVIDERS.deepseek};
  }
  if (requested === 'openai' && process.env.OPENAI_API_KEY) {
    return {provider: 'openai', config: PROVIDERS.openai};
  }
  if (requested && !PROVIDERS[requested]) {
    throw new Error(
      `Unknown provider "${requested}". Valid options: deepseek, openai`,
    );
  }
  if (requested && !process.env[PROVIDERS[requested].apiKeyEnv]) {
    throw new Error(
      `${PROVIDERS[requested].apiKeyEnv} is required for provider "${requested}"`,
    );
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
  if (!config) return 'gpt-4.1-mini'; // fallback

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
 * @param {OpenAI} client
 * @param {{ model: string, systemPrompt: string, userPrompt: string, temperature?: number }} opts
 * @returns {Promise<object>}
 */
export const structuredChatCompletion = async (client, opts) => {
  const text = await chatCompletion(client, {
    ...opts,
    jsonMode: true,
    temperature: opts.temperature ?? 0.3,
  });

  return JSON.parse(text);
};

// ── Convenience: one-shot structured completion ────────────────────────

/**
 * Resolve provider, create client, run structured completion, return parsed JSON.
 * The most common pattern in the codebase condensed into one call.
 *
 * @param {{ provider?: string, model?: string, envModelKey?: string, systemPrompt: string, userPrompt: string, temperature?: number }} opts
 * @returns {Promise<{ result: object, meta: { provider: string, model: string } }>}
 */
export const runStructuredCompletion = async (opts) => {
  const resolved = resolveProvider({provider: opts.provider});
  if (!resolved.config) {
    throw new Error('No AI provider available. Set DEEPSEEK_API_KEY or OPENAI_API_KEY.');
  }

  const model = resolveModel({
    resolved,
    model: opts.model,
    envModelKey: opts.envModelKey,
  });

  const client = createClient(resolved);
  const parsed = await structuredChatCompletion(client, {
    model,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    temperature: opts.temperature,
  });

  return {
    result: parsed,
    meta: {provider: resolved.provider, model},
  };
};

// ── Capability checks ──────────────────────────────────────────────────

/**
 * Check if the current provider supports a specific feature.
 * @param {string} provider
 * @param {string} feature - e.g. 'transcription', 'responsesApi', 'strictJsonSchema'
 * @returns {boolean}
 */
export const providerSupports = (provider, feature) => {
  const config = PROVIDERS[provider];
  if (!config) return false;
  return Boolean(config.supports[feature]);
};

/**
 * Returns the best available transcription provider.
 * DeepSeek doesn't do transcription, so this always falls back to
 * the existing transcription logic (whisper.cpp → OpenAI → YouTube).
 *
 * @returns {'local-whispercpp' | 'openai' | 'youtube' | null}
 */
export const resolveTranscriptionProvider = () => {
  // Transcription is independent of the chat provider.
  // Use the existing TRANSCRIBE_PROVIDER env var or auto-detect.
  const requested = String(
    process.env.TRANSCRIBE_PROVIDER ?? 'auto',
  ).toLowerCase();

  if (requested !== 'auto') return requested;

  // Auto-detect: whisper.cpp → OpenAI Whisper → YouTube
  // (commandExists check is done at call time in transcribe-openai.mjs)
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'local-whispercpp'; // fallback — caller will check if whisper-cli is installed
};
