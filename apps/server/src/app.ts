import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  loadConfig,
  ModelMuleConfigSchema,
  ProviderConfigSchema,
  ProviderTemplateTypeSchema,
  providerTemplate,
  resolveConfigPath,
  RoutingConfigSchema,
  saveConfig,
  type ModelMuleConfig
} from '@modelmule/config';
import { ModelMuleService, UsageStore, type ChatMessage } from '@modelmule/core';
import { createProvider } from '@modelmule/providers';
import { dashboardCss, dashboardHtml, dashboardJs } from './ui.js';

function toOpenAIResponse(input: {
  id: string;
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  usedProvider: string;
  fallbackChain: string[];
}) {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: input.id,
    object: 'chat.completion',
    created,
    model: input.model,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: input.content
        }
      }
    ],
    usage: {
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens: input.promptTokens + input.completionTokens
    },
    metadata: {
      modelmule: {
        usedProvider: input.usedProvider,
        fallbackChain: input.fallbackChain
      }
    }
  };
}

export interface BuildServerOptions {
  configPath?: string;
  dbPath?: string;
}

const providerIdPattern = /^[A-Za-z0-9_-]+$/;

function createService(config: ModelMuleConfig, store: UsageStore): ModelMuleService {
  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([providerId, providerConfig]) => [providerId, createProvider(providerId, providerConfig)])
  );

  return new ModelMuleService({ config, providers, store });
}

function validationError(error: unknown) {
  return {
    error: {
      message: error instanceof Error ? error.message : String(error),
      type: 'validation_error'
    }
  };
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{ app: FastifyInstance; service: ModelMuleService }> {
  const configPath = resolveConfigPath(options.configPath);
  let config = loadConfig(options.configPath);
  const store = new UsageStore(options.dbPath);
  let service = createService(config, store);
  const app = Fastify({ logger: false });

  function applyConfig(nextConfig: ModelMuleConfig): ModelMuleConfig {
    config = ModelMuleConfigSchema.parse(nextConfig);
    saveConfig(config, options.configPath);
    service = createService(config, store);
    return config;
  }

  function reloadConfig(): ModelMuleConfig {
    config = loadConfig(options.configPath);
    service = createService(config, store);
    return config;
  }

  const rateLimitWindowMs = Number(process.env.MODELMULE_RATE_LIMIT_WINDOW_MS ?? 60_000);
  const rateLimitMaxRequests = Number(process.env.MODELMULE_RATE_LIMIT_MAX_REQUESTS ?? 120);
  const routeRateLimit = {
    config: {
      rateLimit: {
        max: rateLimitMaxRequests,
        timeWindow: rateLimitWindowMs
      }
    }
  } as const;
  await app.register(rateLimit, {
    global: true,
    hook: 'onRequest',
    max: rateLimitMaxRequests,
    timeWindow: rateLimitWindowMs,
    keyGenerator: (request) => request.ip
  });

  app.get('/', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return dashboardHtml;
  });

  app.get('/ui', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return dashboardHtml;
  });

  app.get('/ui/styles.css', async (_request, reply) => {
    reply.type('text/css; charset=utf-8');
    return dashboardCss;
  });

  app.get('/ui/app.js', async (_request, reply) => {
    reply.type('application/javascript; charset=utf-8');
    return dashboardJs;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/providers', routeRateLimit, async () => ({ providers: await service.listProviders() }));
  app.get('/models', routeRateLimit, async () => ({ models: await service.listModels() }));
  app.get('/usage', routeRateLimit, async () => service.getUsage());
  app.get('/config', routeRateLimit, async () => ({ path: configPath, config }));
  app.put('/config', routeRateLimit, async (request, reply) => {
    try {
      const nextConfig = ModelMuleConfigSchema.parse(request.body);
      return { path: configPath, config: applyConfig(nextConfig) };
    } catch (error) {
      reply.code(400);
      return validationError(error);
    }
  });

  app.post('/config/reload', routeRateLimit, async (_request, reply) => {
    try {
      return { path: configPath, config: reloadConfig() };
    } catch (error) {
      reply.code(400);
      return validationError(error);
    }
  });

  app.post('/route/test', routeRateLimit, async (request, reply) => {
    const body = request.body as {
      taskType?: string;
    };

    try {
      return service.inspectRoute({
        taskType: body?.taskType as any
      });
    } catch (error) {
      reply.code(400);
      return {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: 'routing_error'
        }
      };
    }
  });

  app.post('/config/provider', routeRateLimit, async (request, reply) => {
    const body = request.body as {
      id?: string;
      type?: unknown;
      provider?: unknown;
    };

    try {
      const id = String(body?.id ?? '').trim();
      if (!providerIdPattern.test(id)) {
        throw new Error('Provider id must contain only letters, numbers, underscores, and dashes');
      }

      const provider = body.provider
        ? ProviderConfigSchema.parse(body.provider)
        : providerTemplate(ProviderTemplateTypeSchema.parse(body.type));

      return {
        path: configPath,
        config: applyConfig({
          ...config,
          providers: {
            ...config.providers,
            [id]: provider
          }
        })
      };
    } catch (error) {
      reply.code(400);
      return validationError(error);
    }
  });

  app.delete('/config/provider/:id', routeRateLimit, async (request, reply) => {
    const params = request.params as { id?: string };

    try {
      const id = String(params.id ?? '').trim();
      if (!providerIdPattern.test(id)) {
        throw new Error('Provider id must contain only letters, numbers, underscores, and dashes');
      }
      if (!config.providers[id]) {
        reply.code(404);
        return {
          error: {
            message: `Provider '${id}' does not exist`,
            type: 'not_found'
          }
        };
      }

      const providers = { ...config.providers };
      delete providers[id];
      const tasks = Object.fromEntries(
        Object.entries(config.routing.tasks).map(([taskType, taskConfig]) => [
          taskType,
          { prefer: taskConfig.prefer.filter((providerId) => providerId !== id) }
        ])
      );

      return {
        path: configPath,
        config: applyConfig({
          ...config,
          providers,
          routing: {
            ...config.routing,
            tasks
          }
        })
      };
    } catch (error) {
      reply.code(400);
      return validationError(error);
    }
  });

  app.post('/config/routing', routeRateLimit, async (request, reply) => {
    try {
      const routing = RoutingConfigSchema.parse(request.body);
      return {
        path: configPath,
        config: applyConfig({
          ...config,
          routing
        })
      };
    } catch (error) {
      reply.code(400);
      return validationError(error);
    }
  });

  app.post('/v1/chat/completions', routeRateLimit, async (request, reply) => {
    const body = request.body as {
      model?: string;
      messages?: ChatMessage[];
      taskType?: string;
    };

    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      reply.code(400);
      return { error: 'messages is required' };
    }

    try {
      const routed = await service.chat({
        model: body.model,
        messages: body.messages,
        taskType: body.taskType as any
      });

      return toOpenAIResponse({
        id: routed.response.id,
        model: routed.response.model,
        content: routed.response.content,
        promptTokens: routed.response.usage.promptTokens,
        completionTokens: routed.response.usage.completionTokens,
        usedProvider: routed.usedProvider,
        fallbackChain: routed.fallbackChain
      });
    } catch (error) {
      reply.code(502);
      return {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: 'provider_error'
        }
      };
    }
  });

  app.post('/v1/code', routeRateLimit, async (request, reply) => {
    const body = request.body as {
      prompt?: string;
      model?: string;
    };

    if (!body?.prompt) {
      reply.code(400);
      return { error: 'prompt is required' };
    }

    try {
      const routed = await service.chat({
        model: body.model,
        taskType: 'coding',
        messages: [{ role: 'user', content: body.prompt }]
      });

      return {
        output: routed.response.content,
        model: routed.response.model,
        metadata: {
          modelmule: {
            usedProvider: routed.usedProvider,
            fallbackChain: routed.fallbackChain
          }
        }
      };
    } catch (error) {
      reply.code(502);
      return {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: 'provider_error'
        }
      };
    }
  });

  return { app, service };
}
