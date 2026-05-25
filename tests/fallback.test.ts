import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@modelmule/config';
import { ModelMuleService, UsageStore, type ProviderRuntime } from '@modelmule/core';

function provider(id: string, impl: Partial<ProviderRuntime>): ProviderRuntime {
  return {
    id,
    type: 'openrouter',
    isLocal: false,
    priority: 50,
    listModels: async () => ['model-a'],
    healthCheck: async () => ({ healthy: true }),
    chat: async () => ({
      id: 'x',
      model: 'model-a',
      content: 'ok',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        estimatedCostUsd: 0
      }
    }),
    ...impl
  };
}

describe('fallback behavior', () => {
  it('falls back to next provider on error', async () => {
    const config = defaultConfig();
    config.providers = {
      first: { type: 'openrouter', priority: 90, models: ['first-model'], apiKeyEnv: 'OPENROUTER_API_KEY' },
      second: { type: 'ollama', priority: 50, models: ['second-model'], isLocal: true }
    };
    config.routing.tasks.coding = { prefer: ['first', 'second'] };

    const store = new UsageStore(':memory:');
    const service = new ModelMuleService({
      config,
      store,
      providers: {
        first: provider('first', {
          chat: async () => {
            throw new Error('rate limit');
          }
        }),
        second: provider('second', {
          type: 'ollama',
          isLocal: true,
          chat: async () => ({
            id: 'r2',
            model: 'second-model',
            content: 'fallback result',
            usage: {
              promptTokens: 3,
              completionTokens: 4,
              totalTokens: 7,
              estimatedCostUsd: 0
            }
          })
        })
      }
    });

    const result = await service.chat({ messages: [{ role: 'user', content: 'hello' }], taskType: 'coding' });
    expect(result.usedProvider).toBe('second');
    expect(result.fallbackChain).toEqual(['first']);
  });
});
