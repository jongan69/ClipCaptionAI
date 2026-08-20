import {describe, it} from 'node:test';
import assert from 'node:assert';
import {
  PROVIDERS,
  resolveProvider,
  resolveModel,
  createClient,
  chatCompletion,
  structuredChatCompletion,
} from '../scripts/ai-provider.mjs';

// Restore process.env after a mutating test, even on failure.
const withEnv = (mutator, fn) => {
  const prev = {...process.env};
  try {
    mutator();
    return fn();
  } finally {
    process.env = prev;
  }
};

// Fake OpenAI-compatible client for exercising the request-shaping path.
const mockClient = (handler) => ({
  chat: {completions: {create: handler}},
});

const jsonResponse = (content) => ({
  choices: [{message: {content}}],
});

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
});

// ── Provider resolution ───────────────────────────────────────────────

describe('resolveProvider', () => {
  it('returns null when no keys are set', () => {
    withEnv(
      () => {
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.OPENAI_API_KEY;
      },
      () => {
        const result = resolveProvider();
        assert.strictEqual(result.provider, null);
        assert.strictEqual(result.config, null);
      },
    );
  });

  it('prefers deepseek when both keys are set', () => {
    withEnv(
      () => {
        process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
        process.env.OPENAI_API_KEY = 'sk-test-oai';
      },
      () => {
        const result = resolveProvider();
        assert.strictEqual(result.provider, 'deepseek');
        assert.strictEqual(result.config.id, 'deepseek');
      },
    );
  });

  it('returns openai when only OPENAI_API_KEY is set', () => {
    withEnv(
      () => {
        delete process.env.DEEPSEEK_API_KEY;
        process.env.OPENAI_API_KEY = 'sk-test-oai';
      },
      () => {
        const result = resolveProvider();
        assert.strictEqual(result.provider, 'openai');
        assert.strictEqual(result.config.id, 'openai');
      },
    );
  });

  it('returns deepseek when only DEEPSEEK_API_KEY is set', () => {
    withEnv(
      () => {
        process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
        delete process.env.OPENAI_API_KEY;
      },
      () => {
        const result = resolveProvider();
        assert.strictEqual(result.provider, 'deepseek');
      },
    );
  });

  it('respects explicit --provider flag', () => {
    withEnv(
      () => {
        process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
        process.env.OPENAI_API_KEY = 'sk-test-oai';
      },
      () => {
        const result = resolveProvider({provider: 'openai'});
        assert.strictEqual(result.provider, 'openai');
      },
    );
  });

  it('throws for unknown provider', () => {
    assert.throws(() => resolveProvider({provider: 'nonexistent'}), /Unknown provider/);
  });

  it('throws when explicit provider is given but key is missing', () => {
    withEnv(
      () => {
        delete process.env.OPENAI_API_KEY;
      },
      () => {
        assert.throws(() => resolveProvider({provider: 'openai'}), /OPENAI_API_KEY is required/);
      },
    );
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
    withEnv(
      () => {
        process.env.OPENAI_CHAPTER_MODEL = 'env-model';
      },
      () => {
        const model = resolveModel({
          resolved: openaiResolved,
          envModelKey: 'OPENAI_CHAPTER_MODEL',
        });
        assert.strictEqual(model, 'env-model');
      },
    );
  });

  it('explicit model takes priority over env var', () => {
    withEnv(
      () => {
        process.env.OPENAI_CHAPTER_MODEL = 'env-model';
      },
      () => {
        const model = resolveModel({
          resolved: openaiResolved,
          model: 'explicit-model',
          envModelKey: 'OPENAI_CHAPTER_MODEL',
        });
        assert.strictEqual(model, 'explicit-model');
      },
    );
  });

  it('returns null when no provider is configured', () => {
    const model = resolveModel({resolved: {provider: null, config: null}});
    assert.strictEqual(model, null);
  });
});

// ── Client creation ───────────────────────────────────────────────────

describe('createClient', () => {
  it('throws a clear error when no provider is configured', () => {
    assert.throws(() => createClient({provider: null, config: null}), /No AI provider available/);
  });

  it('builds a client for the resolved provider with timeout and retries', () => {
    withEnv(
      () => {
        process.env.DEEPSEEK_API_KEY = 'sk-test-ds';
      },
      () => {
        const resolved = resolveProvider();
        const client = createClient(resolved);
        assert.strictEqual(client.baseURL, 'https://api.deepseek.com');
        assert.strictEqual(client.apiKey, 'sk-test-ds');
        assert.strictEqual(client.timeout, 180_000);
        assert.strictEqual(client.maxRetries, 1);
      },
    );
  });
});

// ── chatCompletion (request shaping) ──────────────────────────────────

describe('chatCompletion', () => {
  it('sends system/user messages and the resolved model', async () => {
    let captured;
    const client = mockClient(async (params) => {
      captured = params;
      return jsonResponse('hello');
    });

    const text = await chatCompletion(client, {
      model: 'test-model',
      systemPrompt: 'sys',
      userPrompt: 'user',
    });
    assert.strictEqual(text, 'hello');
    assert.strictEqual(captured.model, 'test-model');
    assert.deepStrictEqual(captured.messages, [
      {role: 'system', content: 'sys'},
      {role: 'user', content: 'user'},
    ]);
    assert.strictEqual(captured.response_format, undefined);
  });

  it('adds response_format json_object in jsonMode', async () => {
    let captured;
    const client = mockClient(async (params) => {
      captured = params;
      return jsonResponse('{}');
    });

    await chatCompletion(client, {model: 'm', systemPrompt: 's', userPrompt: 'u', jsonMode: true});
    assert.deepStrictEqual(captured.response_format, {type: 'json_object'});
  });

  it('strips markdown fences from the response', async () => {
    const client = mockClient(async () => jsonResponse('```json\n{"a":1}\n```'));
    const text = await chatCompletion(client, {model: 'm', systemPrompt: 's', userPrompt: 'u'});
    assert.strictEqual(text, '{"a":1}');
  });

  it('returns empty string when the response has no content', async () => {
    const client = mockClient(async () => ({choices: []}));
    const text = await chatCompletion(client, {model: 'm', systemPrompt: 's', userPrompt: 'u'});
    assert.strictEqual(text, '');
  });
});

// ── structuredChatCompletion (JSON parse + retry) ─────────────────────

describe('structuredChatCompletion', () => {
  it('parses valid JSON on the first attempt', async () => {
    let calls = 0;
    const client = mockClient(async () => {
      calls += 1;
      return jsonResponse('{"clips": [{"title": "a"}]}');
    });

    const parsed = await structuredChatCompletion(client, {
      model: 'm',
      systemPrompt: 's',
      userPrompt: 'u',
    });
    assert.deepStrictEqual(parsed, {clips: [{title: 'a'}]});
    assert.strictEqual(calls, 1);
  });

  it('retries once with a repair prompt when JSON is invalid', async () => {
    const prompts = [];
    const client = mockClient(async (params) => {
      prompts.push(params.messages[1].content);
      return jsonResponse(prompts.length === 1 ? 'not json at all' : '{"ok": true}');
    });

    const parsed = await structuredChatCompletion(client, {
      model: 'm',
      systemPrompt: 's',
      userPrompt: 'original prompt',
    });
    assert.deepStrictEqual(parsed, {ok: true});
    assert.strictEqual(prompts.length, 2);
    assert.match(prompts[1], /raw JSON only/);
    assert.match(prompts[1], /original prompt/);
  });

  it('throws a descriptive error when JSON stays invalid after retry', async () => {
    let calls = 0;
    const client = mockClient(async () => {
      calls += 1;
      return jsonResponse('still not json');
    });

    await assert.rejects(
      structuredChatCompletion(client, {model: 'm', systemPrompt: 's', userPrompt: 'u'}),
      /Model returned invalid JSON after retry/,
    );
    assert.strictEqual(calls, 2);
  });

  it('does not retry network/API errors', async () => {
    let calls = 0;
    const client = mockClient(async () => {
      calls += 1;
      const error = new Error('connect ECONNREFUSED');
      error.status = 500;
      throw error;
    });

    await assert.rejects(
      structuredChatCompletion(client, {model: 'm', systemPrompt: 's', userPrompt: 'u'}),
      /ECONNREFUSED/,
    );
    assert.strictEqual(calls, 1);
  });
});
