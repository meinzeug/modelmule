import type { ModelMuleConfig, TaskType } from '@modelmule/config';
import { RoutingEngine } from './routing.js';
import { UsageStore } from './storage.js';
import type { ChatRequest, ChatResponse, ProviderRuntime } from './types.js';

export interface ServiceOptions {
  config: ModelMuleConfig;
  providers: Record<string, ProviderRuntime>;
  store: UsageStore;
}

export interface RoutedChatResult {
  response: ChatResponse;
  usedProvider: string;
  fallbackChain: string[];
}

export class ModelMuleService {
  private readonly routing: RoutingEngine;

  constructor(private readonly options: ServiceOptions) {
    this.routing = new RoutingEngine(options.config);
    for (const [providerId, provider] of Object.entries(options.providers)) {
      this.options.store.upsertProvider(providerId, provider.type);
    }
  }

  async listProviders(): Promise<Array<{ id: string; type: string; healthy: boolean; message?: string }>> {
    const entries = Object.entries(this.options.providers);
    const result = await Promise.all(
      entries.map(async ([id, provider]) => {
        const health = await provider.healthCheck().catch((error: unknown) => ({
          healthy: false,
          message: error instanceof Error ? error.message : String(error)
        }));
        return { id, type: provider.type, healthy: health.healthy, message: health.message };
      })
    );
    return result;
  }

  async listModels(): Promise<Array<{ providerId: string; models: string[] }>> {
    const entries = Object.entries(this.options.providers);
    const result = await Promise.all(
      entries.map(async ([providerId, provider]) => {
        const models = await provider.listModels().catch(() => []);
        this.options.store.updateModels(providerId, models);
        return { providerId, models };
      })
    );
    return result;
  }

  getUsage() {
    return this.options.store.usageSummary();
  }

  async chat(request: ChatRequest): Promise<RoutedChatResult> {
    const taskType = this.normalizeTaskType(request.taskType);
    const decision = this.routing.decide(taskType, this.options.providers);
    const fallbackChain: string[] = [];
    let firstProvider: string | undefined;

    for (const providerId of decision.orderedProviders) {
      const provider = this.options.providers[providerId];
      if (!provider) {
        continue;
      }

      if (this.options.config.routing.privacyMode && !provider.isLocal) {
        continue;
      }

      if (provider.dailyBudgetUsd !== undefined) {
        const usedCost = this.options.store.getDailyProviderCost(providerId);
        if (usedCost >= provider.dailyBudgetUsd) {
          this.options.store.logRoutingEvent(taskType, providerId, undefined, 'budget-limit-reached');
          continue;
        }
      }

      if (provider.dailyRequestLimit !== undefined) {
        const usedRequests = this.options.store.getDailyProviderRequests(providerId);
        if (usedRequests >= provider.dailyRequestLimit) {
          this.options.store.logRoutingEvent(taskType, providerId, undefined, 'daily-request-limit-reached');
          continue;
        }
      }

      firstProvider ??= providerId;

      try {
        const response = await provider.chat({ ...request, taskType });
        this.options.store.logRequest({
          providerId,
          model: response.model,
          taskType,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
          estimatedCostUsd: response.usage.estimatedCostUsd,
          status: 'ok'
        });
        if (fallbackChain.length > 0) {
          this.options.store.logRoutingEvent(taskType, firstProvider, providerId, 'fallback-success');
        } else {
          this.options.store.logRoutingEvent(taskType, providerId, undefined, 'primary-success');
        }
        return { response, usedProvider: providerId, fallbackChain };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fallbackChain.push(providerId);
        this.options.store.logRequest({
          providerId,
          model: request.model ?? 'unknown',
          taskType,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          status: 'error',
          errorMessage: message
        });
        this.options.store.logError(providerId, message);
      }
    }

    if (this.options.config.routing.privacyMode) {
      throw new Error('privacyMode=true und kein lokaler Provider verfügbar');
    }
    throw new Error('Kein Provider verfügbar oder alle Provider fehlgeschlagen');
  }

  private normalizeTaskType(taskType: string | undefined): TaskType {
    const known: TaskType[] = [
      'coding',
      'refactor',
      'debugging',
      'planning',
      'cheap-chat',
      'long-context',
      'local-private',
      'premium-reasoning'
    ];
    if (taskType && known.includes(taskType as TaskType)) {
      return taskType as TaskType;
    }
    return 'coding';
  }
}
