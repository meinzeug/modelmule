import type { ModelMuleConfig, TaskType } from '@modelmule/config';
import { RoutingEngine } from './routing.js';
import { UsageStore } from './storage.js';
import type { ChatRequest, ChatResponse, ProviderRuntime, RoutePreview, RoutePreviewProvider } from './types.js';

export interface ServiceOptions {
  config: ModelMuleConfig;
  providers: Record<string, ProviderRuntime>;
  store: UsageStore;
}

export interface RoutedChatResult {
  response: ChatResponse;
  usedProvider: string;
  fallbackChain: string[];
  routingProfileId?: string;
  codingTool?: string;
}

export class ModelMuleService {
  private readonly routing: RoutingEngine;

  constructor(private readonly options: ServiceOptions) {
    const enabledProviders = Object.fromEntries(
      Object.entries(options.providers).filter(([providerId]) => options.config.providers[providerId]?.enabled !== false)
    );
    this.options = { ...options, providers: enabledProviders };
    this.routing = new RoutingEngine(options.config);
    for (const [providerId, provider] of Object.entries(this.options.providers)) {
      this.options.store.upsertProvider(providerId, provider.type);
    }
  }

  async listProviders(): Promise<
    Array<{
      id: string;
      type: string;
      healthy: boolean;
      isLocal: boolean;
      priority: number;
      dailyBudgetUsd?: number;
      dailyRequestLimit?: number;
      capabilities: {
        score: number;
        execution: string;
        supportsStaticModels: boolean;
        supportsLocalExecution: boolean;
        supportsBudgetLimit: boolean;
        supportsRequestLimit: boolean;
        recommendedFor: string[];
      };
      message?: string;
    }>
  > {
    const entries = Object.entries(this.options.providers);
    const result = await Promise.all(
      entries.map(async ([id, provider]) => {
        const health = await provider.healthCheck().catch((error: unknown) => ({
          healthy: false,
          message: error instanceof Error ? error.message : String(error)
        }));
        const configured = this.options.config.providers[id];
        const isShellCommand = provider.type === 'shell_command';
        const isCloud = !provider.isLocal;
        const hasStaticModels = Boolean(configured?.models?.length);
        const score =
          provider.priority +
          (health.healthy ? 20 : -40) +
          (provider.isLocal ? 10 : 0) +
          (hasStaticModels ? 5 : 0) -
          (provider.dailyBudgetUsd !== undefined ? Math.min(provider.dailyBudgetUsd, 10) : 0);
        return {
          id,
          type: provider.type,
          healthy: health.healthy,
          isLocal: provider.isLocal,
          priority: provider.priority,
          dailyBudgetUsd: provider.dailyBudgetUsd,
          dailyRequestLimit: provider.dailyRequestLimit,
          capabilities: {
            score: Math.round(score),
            execution: isShellCommand ? 'local-cli' : provider.isLocal ? 'local-http' : 'cloud-api',
            supportsStaticModels: hasStaticModels,
            supportsLocalExecution: provider.isLocal,
            supportsBudgetLimit: provider.dailyBudgetUsd !== undefined,
            supportsRequestLimit: provider.dailyRequestLimit !== undefined,
            recommendedFor: [
              ...(provider.isLocal ? ['local-private'] : ['coding', 'premium-reasoning']),
              ...(isCloud ? ['long-context'] : []),
              ...(isShellCommand ? ['coding', 'debugging'] : [])
            ]
          },
          message: health.message
        };
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

  inspectRoute(request: Pick<ChatRequest, 'taskType' | 'metadata'>): RoutePreview {
    const taskType = this.normalizeTaskType(request.taskType);
    const codingTool = this.resolveCodingTool(request.metadata);
    const excludedProviderIds = this.resolveExcludedProviderIds(request.metadata);
    const routingProfileId = this.resolveRoutingProfileId(request.metadata, codingTool);
    const decision = this.routing.decide(taskType, this.options.providers, routingProfileId);
    const providers: RoutePreviewProvider[] = [];
    let selectedProvider: string | undefined;

    for (const providerId of decision.orderedProviders) {
      if (excludedProviderIds.has(providerId)) {
        providers.push({
          providerId,
          available: false,
          reason: 'excluded-provider'
        });
        continue;
      }

      const provider = this.options.providers[providerId];
      if (!provider) {
        providers.push({
          providerId,
          available: false,
          reason: 'missing-provider'
        });
        continue;
      }

      if (this.options.config.routing.privacyMode && !provider.isLocal) {
        providers.push({
          providerId,
          available: false,
          reason: 'privacy-mode'
        });
        continue;
      }

      if (provider.dailyBudgetUsd !== undefined) {
        const usedCost = this.options.store.getDailyProviderCost(providerId);
        if (usedCost >= provider.dailyBudgetUsd) {
          providers.push({
            providerId,
            available: false,
            reason: 'budget-limit-reached'
          });
          continue;
        }
      }

      if (provider.dailyRequestLimit !== undefined) {
        const usedRequests = this.options.store.getDailyProviderRequests(providerId);
        if (usedRequests >= provider.dailyRequestLimit) {
          providers.push({
            providerId,
            available: false,
            reason: 'daily-request-limit-reached'
          });
          continue;
        }
      }

      providers.push({
        providerId,
        available: true,
        reason: 'eligible'
      });
      selectedProvider ??= providerId;
    }

    return {
      ...decision,
      selectedProvider,
      providers
    };
  }

  async chat(request: ChatRequest): Promise<RoutedChatResult> {
    const codingTool = this.resolveCodingTool(request.metadata);
    const preview = this.inspectRoute({ taskType: request.taskType, metadata: request.metadata });
    const taskType = preview.taskType;
    const fallbackChain: string[] = [];
    let firstProvider: string | undefined;

    for (const candidate of preview.providers) {
      if (!candidate.available) {
        if (candidate.reason === 'budget-limit-reached' || candidate.reason === 'daily-request-limit-reached') {
          this.options.store.logRoutingEvent(taskType, candidate.providerId, undefined, candidate.reason);
        }
        continue;
      }

      const providerId = candidate.providerId;
      const provider = this.options.providers[providerId];
      if (!provider) {
        continue;
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
        return { response, usedProvider: providerId, fallbackChain, routingProfileId: preview.routingProfileId, codingTool };
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
      throw new Error('privacyMode=true and no local provider is available');
    }
    throw new Error('No provider available or all providers failed');
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

  private resolveCodingTool(metadata: Record<string, unknown> | undefined): string | undefined {
    const candidate = metadata?.codingTool ?? metadata?.tool ?? metadata?.client;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
  }

  private resolveExcludedProviderIds(metadata: Record<string, unknown> | undefined): Set<string> {
    const raw = metadata?.excludeProviderIds ?? metadata?.blockedProviderIds;
    if (Array.isArray(raw)) {
      return new Set(raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()));
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return new Set([raw.trim()]);
    }
    return new Set();
  }

  private resolveRoutingProfileId(metadata: Record<string, unknown> | undefined, codingTool: string | undefined): string | undefined {
    const explicitProfileId = typeof metadata?.routingProfileId === 'string' ? metadata.routingProfileId.trim() : '';
    if (explicitProfileId) {
      return explicitProfileId;
    }
    if (!codingTool) {
      return undefined;
    }
    const assignment = this.options.config.codingAiTools?.[codingTool];
    if (!assignment || assignment.enabled === false) {
      return undefined;
    }
    return assignment.routingProfileId;
  }
}
