import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@modelmule/config';
import { RoutingEngine, type ProviderRuntime } from '@modelmule/core';

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
});
