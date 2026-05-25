import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@modelmule/config';
import { ModelMuleService, RoutingEngine, UsageStore, type ProviderRuntime } from '@modelmule/core';

function provider(id: string, props: Partial<ProviderRuntime>): ProviderRuntime {
  return {
    id,
    type: 'openrouter',
    isLocal: false,
    priority: 50,
    listModels: async () => [],
    healthCheck: async () => ({ healthy: true }),
    chat: async () => {
      throw new Error('not used');
    },
    ...props
  };
}

describe('routing engine', () => {
  it('prefers local provider in privacy mode', () => {
    const config = defaultConfig();
    config.routing.privacyMode = true;
    const engine = new RoutingEngine(config);

    const decision = engine.decide('coding', {
      cloud: provider('cloud', { isLocal: false, priority: 90 }),
      local: provider('local', { type: 'ollama', isLocal: true, priority: 40 })
    });

    expect(decision.orderedProviders[0]).toBe('local');
  });

  it('reports preview availability and selected provider', () => {
    const config = defaultConfig();
    config.providers = {
      cloud: { type: 'openrouter', priority: 90, dailyBudgetUsd: 0, models: ['cloud-model'], apiKeyEnv: 'OPENROUTER_API_KEY' },
      local: { type: 'ollama', priority: 50, models: ['local-model'], isLocal: true }
    };
    config.routing.tasks.coding = { prefer: ['cloud', 'local'] };

    const service = new ModelMuleService({
      config,
      store: new UsageStore(':memory:'),
      providers: {
        cloud: provider('cloud', { priority: 90, dailyBudgetUsd: 0 }),
        local: provider('local', { type: 'ollama', isLocal: true, priority: 50 })
      }
    });

    const preview = service.inspectRoute({ taskType: 'coding' });
    expect(preview.selectedProvider).toBe('local');
    expect(preview.providers).toEqual([
      {
        providerId: 'cloud',
        available: false,
        reason: 'budget-limit-reached'
      },
      {
        providerId: 'local',
        available: true,
        reason: 'eligible'
      }
    ]);
  });
});
