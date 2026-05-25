import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@modelmule/config';
import { ModelMuleService, UsageStore, type ProviderRuntime } from '@modelmule/core';

function provider(id: string, isLocal = false): ProviderRuntime {
  return {
    id,
    type: isLocal ? 'ollama' : 'openrouter',
    isLocal,
    priority: 70,
    dailyBudgetUsd: isLocal ? undefined : 0,
    listModels: async () => ['m'],
    healthCheck: async () => ({ healthy: true }),
    chat: async () => ({
      id: id,
      model: 'm',
      content: 'ok',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        estimatedCostUsd: 0
      }
    })
  };
}

describe('budget and privacy mode', () => {
  it('uses local provider when privacy mode is enabled', async () => {
    const config = defaultConfig();
    config.routing.privacyMode = true;
    const store = new UsageStore(':memory:');

    const service = new ModelMuleService({
      config,
      store,
      providers: {
        cloud: provider('cloud', false),
        local: provider('local', true)
      }
    });

    const result = await service.chat({ messages: [{ role: 'user', content: 'private request' }], taskType: 'local-private' });
    expect(result.usedProvider).toBe('local');
  });

  it('skips provider when budget is exhausted', async () => {
    const config = defaultConfig();
    config.providers = {
      expensive: { type: 'openrouter', enabled: true, priority: 90, dailyBudgetUsd: 0, models: ['m'], apiKeyEnv: 'OPENROUTER_API_KEY' },
      local: { type: 'ollama', enabled: true, priority: 50, models: ['m'], isLocal: true }
    };
    config.routing.tasks.coding = { prefer: ['expensive', 'local'] };

    const store = new UsageStore(':memory:');
    const service = new ModelMuleService({
      config,
      store,
      providers: {
        expensive: provider('expensive', false),
        local: provider('local', true)
      }
    });

    const result = await service.chat({ messages: [{ role: 'user', content: 'hi' }], taskType: 'coding' });
    expect(result.usedProvider).toBe('local');
  });
});
