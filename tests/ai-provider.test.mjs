import {describe, it} from 'node:test';
import assert from 'node:assert';
import {
  PROVIDERS,
  resolveProvider,
  resolveModel,
  providerSupports,
  resolveTranscriptionProvider,
} from '../scripts/ai-provider.mjs';

// ── Provider registry ─────────────────────────────────────────────────

describe('PROVIDERS registry', () => {
  it('defines deepseek with correct config', () => {
    const d = PROVIDERS.deepseek;
    assert.strictEqual(d.id, 'deepseek');
    assert.strictEqual(d.baseURL, 'https://api.deepseek.com');
    assert.strictEqual(d.apiKeyEnv, 'DEEPSEEK_API_KEY');
    assert.strictEqual(d.defaultModel, 'deepseek-v4-pro');
    assert.strictEqual(d.fastModel, 'deepseek-v4-flash');
  });

  it('defines openai with correct config', () => {
    const o = PROVIDERS.openai;
    assert.strictEqual(o.id, 'openai');
    assert.strictEqual(o.baseURL, undefined);
    assert.strictEqual(o.apiKeyEnv, 'OPENAI_API_KEY');
    assert.strictEqual(o.defaultModel, 'gpt-4.1-mini');
  });

  it('deepseek supports chatCompletions but not transcription', () => {
    assert.strictEqual(providerSupports('deepseek', 'chatCompletions'), true);
    assert.strictEqual(providerSupports('deepseek', 'jsonMode'), true);
    assert.strictEqual(providerSupports('deepseek', 'transcription'), false);
    assert.strictEqual(providerSupports('deepseek', 'responsesApi'), false);
    assert.strictEqual(providerSupports('deepseek', 'strictJsonSchema'), false);
  });

  it('openai supports chatCompletions and transcription', () => {
    assert.strictEqual(providerSupports('openai', 'chatCompletions'), true);
    assert.strictEqual(providerSupports('openai', 'jsonMode'), true);
    assert.strictEqual(providerSupports('openai', 'transcription'), true);
    assert.strictEqual(providerSupports('openai', 'responsesApi'), true);
    assert.strictEqual(providerSupports('openai', 'strictJsonSchema'), true);
  });

  it('unknown provider returns false for all capabilities', () => {
    assert.strictEqual(providerSupports('nonexistent', 'chatCompletions'), false);
  });
});

// ── Provider resolution ───────────────────────────────────────────────

describe('resolveProvider', () => {
  it('returns null when no keys are set', () => {
    const prev = {...process.env};
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = resolveProvider();
    assert.strictEqual(result.provider, null);
    assert.strictEqual(result.config, null);

    process.env = prev;
  });

  it('prefers deepseek when both keys are set', () => {
    const prev = {...process.env};
    process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
    process.env.OPENAI_API_KEY = 'sk-test-oai';

    const result = resolveProvider();
    assert.strictEqual(result.provider, 'deepseek');
    assert.strictEqual(result.config.id, 'deepseek');

    process.env = prev;
  });

  it('returns openai when only OPENAI_API_KEY is set', () => {
    const prev = {...process.env};
    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-oai';

    const result = resolveProvider();
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.config.id, 'openai');

    process.env = prev;
  });

  it('returns deepseek when only DEEPSEEK_API_KEY is set', () => {
    const prev = {...process.env};
    process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
    delete process.env.OPENAI_API_KEY;

    const result = resolveProvider();
    assert.strictEqual(result.provider, 'deepseek');

    process.env = prev;
  });

  it('respects explicit --provider flag', () => {
    const prev = {...process.env};
    process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
    process.env.OPENAI_API_KEY = 'sk-test-oai';

    const result = resolveProvider({provider: 'openai'});
    assert.strictEqual(result.provider, 'openai');

    process.env = prev;
  });

  it('throws for unknown provider', () => {
    assert.throws(
      () => resolveProvider({provider: 'nonexistent'}),
      /Unknown provider/,
    );
  });

  it('throws when explicit provider is given but key is missing', () => {
    const prev = {...process.env};
    delete process.env.OPENAI_API_KEY;

    assert.throws(
      () => resolveProvider({provider: 'openai'}),
      /OPENAI_API_KEY is required/,
    );

    process.env = prev;
  });
});

// ── Model resolution ──────────────────────────────────────────────────

describe('resolveModel', () => {
  const deepseekResolved = {provider: 'deepseek', config: PROVIDERS.deepseek};
  const openaiResolved = {provider: 'openai', config: PROVIDERS.openai};

  it('returns explicit model when provided', () => {
    const model = resolveModel({resolved: deepseekResolved, model: 'custom-model'});
    assert.strictEqual(model, 'custom-model');
  });

  it('returns deepseek default model', () => {
    const model = resolveModel({resolved: deepseekResolved});
    assert.strictEqual(model, 'deepseek-v4-pro');
  });

  it('returns deepseek fast model when preferFast is true', () => {
    const model = resolveModel({resolved: deepseekResolved, preferFast: true});
    assert.strictEqual(model, 'deepseek-v4-flash');
  });

  it('returns openai default model', () => {
    const model = resolveModel({resolved: openaiResolved});
    assert.strictEqual(model, 'gpt-4.1-mini');
  });

  it('uses env var override when set', () => {
    const prev = {...process.env};
    process.env.OPENAI_CHAPTER_MODEL = 'env-model';

    const model = resolveModel({
      resolved: openaiResolved,
      envModelKey: 'OPENAI_CHAPTER_MODEL',
    });
    assert.strictEqual(model, 'env-model');

    process.env = prev;
  });

  it('explicit model takes priority over env var', () => {
    const prev = {...process.env};
    process.env.OPENAI_CHAPTER_MODEL = 'env-model';

    const model = resolveModel({
      resolved: openaiResolved,
      model: 'explicit-model',
      envModelKey: 'OPENAI_CHAPTER_MODEL',
    });
    assert.strictEqual(model, 'explicit-model');

    process.env = prev;
  });

  it('returns fallback when resolved config is null', () => {
    const model = resolveModel({resolved: {provider: null, config: null}});
    assert.strictEqual(model, 'gpt-4.1-mini');
  });
});

// ── Transcription provider ────────────────────────────────────────────

describe('resolveTranscriptionProvider', () => {
  it('returns explicit TRANSCRIBE_PROVIDER when set', () => {
    const prev = {...process.env};
    process.env.TRANSCRIBE_PROVIDER = 'openai';

    const result = resolveTranscriptionProvider();
    assert.strictEqual(result, 'openai');

    process.env = prev;
  });

  it('returns local-whispercpp in auto mode without OpenAI key', () => {
    const prev = {...process.env};
    delete process.env.TRANSCRIBE_PROVIDER;
    delete process.env.OPENAI_API_KEY;

    const result = resolveTranscriptionProvider();
    assert.strictEqual(result, 'local-whispercpp');

    process.env = prev;
  });

  it('returns openai in auto mode with OPENAI_API_KEY', () => {
    const prev = {...process.env};
    delete process.env.TRANSCRIBE_PROVIDER;
    process.env.OPENAI_API_KEY = 'sk-test';

    const result = resolveTranscriptionProvider();
    assert.strictEqual(result, 'openai');

    process.env = prev;
  });
});
