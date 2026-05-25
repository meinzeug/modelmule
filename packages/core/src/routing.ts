import type { ModelMuleConfig, TaskType } from '@modelmule/config';
import type { ProviderRuntime, RouteDecision } from './types.js';

export interface RankedProvider {
  providerId: string;
  score: number;
}

export class RoutingEngine {
  constructor(private readonly config: ModelMuleConfig) {}

  decide(taskType: TaskType, providers: Record<string, ProviderRuntime>): RouteDecision {
    const mode = this.resolveMode(taskType);
    const preferred = this.config.routing.tasks[taskType]?.prefer ?? [];
    const providerIds = Object.keys(providers);

    const ranked: RankedProvider[] = providerIds.map((providerId) => {
      const provider = providers[providerId];
      let score = provider.priority;

      if (preferred.includes(providerId)) {
        score += 100 - preferred.indexOf(providerId) * 10;
      }

      if (this.config.routing.privacyMode && !provider.isLocal) {
        score -= 1000;
      }

      if (mode === 'local-only' && !provider.isLocal) {
        score -= 2000;
      }

      if (taskType === 'local-private' && provider.isLocal) {
        score += 90;
      }

      if ((mode === 'cheapest' || mode === 'free-first' || taskType === 'cheap-chat') && provider.dailyBudgetUsd !== undefined) {
        score += Math.max(0, 100 - provider.dailyBudgetUsd * 10);
      }

      if ((mode === 'premium' || mode === 'coding-max' || taskType === 'premium-reasoning') && !provider.isLocal) {
        score += 40;
      }

      if (taskType === 'coding') {
        score += provider.type.includes('openrouter') ? 25 : 0;
      }

      return { providerId, score };
    });

    ranked.sort((a, b) => b.score - a.score);

    return {
      orderedProviders: ranked.map((item) => item.providerId),
      mode,
      taskType
    };
  }

  private resolveMode(taskType: TaskType): string {
    if (this.config.routing.privacyMode) {
      return 'local-only';
    }
    if (taskType === 'cheap-chat') {
      return 'free-first';
    }
    if (taskType === 'premium-reasoning') {
      return 'premium';
    }
    return this.config.routing.defaultMode;
  }
}
