import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import {
  createConfigBackup,
  configMigrationStatus,
  exportProviderProfile,
  importProviderProfile,
  listConfigBackups,
  loadConfig,
  ModelMuleConfigSchema,
  ProviderConfigSchema,
  ProviderProfileSchema,
  ProviderTemplateTypeSchema,
  ProviderTypeSchema,
  providerTemplate,
  resolveConfigPath,
  restoreConfigBackup,
  RoutingModeSchema,
  RoutingConfigSchema,
  saveConfig,
  TaskTypeSchema,
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
  apiKey?: string;
}

const providerIdPattern = /^[A-Za-z0-9_-]+$/;
const ProviderIdSchema = z.string().trim().regex(providerIdPattern, 'Provider id must contain only letters, numbers, underscores, and dashes');
const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1)
});
const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1).optional(),
  messages: z.array(ChatMessageSchema).min(1),
  taskType: TaskTypeSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});
const CodeRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional()
});
const RouteTestRequestSchema = z.object({
  taskType: TaskTypeSchema.optional()
});
const ProviderUpsertRequestSchema = z
  .object({
    id: ProviderIdSchema,
    type: ProviderTemplateTypeSchema.optional(),
    provider: ProviderConfigSchema.optional()
  })
  .refine((value) => value.type || value.provider, { message: 'Either type or provider is required' });
const RestoreConfigRequestSchema = z.object({
  name: z.string().min(1)
});
const ProfileImportRequestSchema = z.object({
  profile: ProviderProfileSchema,
  replace: z.boolean().default(false)
});

function getBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(/\s+/, 2) ?? [];
  return scheme?.toLowerCase() === 'bearer' ? token : undefined;
}

function createService(config: ModelMuleConfig, store: UsageStore): ModelMuleService {
  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([providerId, providerConfig]) => [providerId, createProvider(providerId, providerConfig)])
  );

  return new ModelMuleService({ config, providers, store });
}

function errorResponse(error: unknown, type = 'validation_error') {
  if (error instanceof ZodError) {
    return {
      error: {
        message: error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '),
        type,
        details: error.issues
      }
    };
  }

  return {
    error: {
      message: error instanceof Error ? error.message : String(error),
      type
    }
  };
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{ app: FastifyInstance; service: ModelMuleService }> {
  const configPath = resolveConfigPath(options.configPath);
  const apiKey = options.apiKey ?? process.env.MODELMULE_API_KEY;
  let config = loadConfig(options.configPath);
  const store = new UsageStore(options.dbPath);
  let service = createService(config, store);
  const app = Fastify({ logger: false });

  function applyConfig(nextConfig: ModelMuleConfig): ModelMuleConfig {
    config = ModelMuleConfigSchema.parse(nextConfig);
    saveConfig(config, options.configPath, { backup: true });
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

  app.addHook('preHandler', async (request, reply) => {
    if (!apiKey) {
      return;
    }

    const url = request.url.split('?')[0] ?? '/';
    const publicPath = url === '/' || url === '/ui' || url.startsWith('/ui/') || url === '/health' || url === '/auth/status';
    if (publicPath) {
      return;
    }

    const providedKey = request.headers['x-modelmule-api-key'];
    const token = getBearerToken(request.headers.authorization);
    const candidate = Array.isArray(providedKey) ? providedKey[0] : providedKey;
    if (candidate === apiKey || token === apiKey) {
      return;
    }

    reply.code(401);
    return {
      error: {
        message: 'Authentication required',
        type: 'unauthorized'
      }
    };
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
  app.get('/auth/status', async () => ({ required: Boolean(apiKey) }));
  app.get('/system/status', routeRateLimit, async () => ({
    version: process.env.npm_package_version ?? '0.0.0',
    auth: { required: Boolean(apiKey) },
    config: {
      path: configPath,
      migrations: configMigrationStatus(config)
    },
    storage: {
      migrations: store.migrationStatus()
    }
  }));
  app.get('/capabilities', routeRateLimit, async () => ({
    providerTypes: ProviderTypeSchema.options,
    providerTemplates: ProviderTemplateTypeSchema.options,
    routingModes: RoutingModeSchema.options,
    taskTypes: TaskTypeSchema.options
  }));

  app.get('/providers', routeRateLimit, async () => ({ providers: await service.listProviders() }));
  app.get('/models', routeRateLimit, async () => ({ models: await service.listModels() }));
  app.get('/usage', routeRateLimit, async () => service.getUsage());
  app.get('/config', routeRateLimit, async () => ({ path: configPath, config }));
  app.get('/profiles/export', routeRateLimit, async (request) => {
    const query = request.query as { providers?: string; name?: string };
    const providerIds = query.providers
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return { profile: exportProviderProfile(config, providerIds, query.name) };
  });
  app.post('/profiles/import', routeRateLimit, async (request, reply) => {
    try {
      const rawBody = request.body as Record<string, unknown>;
      const body =
        rawBody && typeof rawBody === 'object' && 'profile' in rawBody
          ? ProfileImportRequestSchema.parse(rawBody)
          : { profile: ProviderProfileSchema.parse(rawBody), replace: false };
      return { path: configPath, config: applyConfig(importProviderProfile(config, body.profile, { replace: body.replace })) };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.get('/config/backups', routeRateLimit, async () => ({ backups: listConfigBackups(options.configPath) }));
  app.post('/config/backup', routeRateLimit, async () => ({ backup: createConfigBackup(options.configPath) }));
  app.post('/config/restore', routeRateLimit, async (request, reply) => {
    try {
      const body = RestoreConfigRequestSchema.parse(request.body);
      restoreConfigBackup(body.name, options.configPath);
      return { path: configPath, config: reloadConfig() };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.put('/config', routeRateLimit, async (request, reply) => {
    try {
      const nextConfig = ModelMuleConfigSchema.parse(request.body);
      return { path: configPath, config: applyConfig(nextConfig) };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.post('/config/reload', routeRateLimit, async (_request, reply) => {
    try {
      return { path: configPath, config: reloadConfig() };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.post('/route/test', routeRateLimit, async (request, reply) => {
    try {
      const body = RouteTestRequestSchema.parse(request.body ?? {});
      return service.inspectRoute({
        taskType: body.taskType
      });
    } catch (error) {
      reply.code(400);
      return errorResponse(error, 'routing_error');
    }
  });

  app.post('/config/provider', routeRateLimit, async (request, reply) => {
    try {
      const body = ProviderUpsertRequestSchema.parse(request.body);
      const provider = body.provider
        ? ProviderConfigSchema.parse(body.provider)
        : providerTemplate(body.type as NonNullable<typeof body.type>);

      return {
        path: configPath,
        config: applyConfig({
          ...config,
          providers: {
            ...config.providers,
            [body.id]: provider
          }
        })
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.delete('/config/provider/:id', routeRateLimit, async (request, reply) => {
    const params = request.params as { id?: string };

    try {
      const id = ProviderIdSchema.parse(params.id);
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
      return errorResponse(error);
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
      return errorResponse(error);
    }
  });

  app.post('/v1/chat/completions', routeRateLimit, async (request, reply) => {
    try {
      const body = ChatCompletionRequestSchema.parse(request.body);
      const routed = await service.chat({
        model: body.model,
        messages: body.messages as ChatMessage[],
        taskType: body.taskType,
        metadata: body.metadata
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
      if (error instanceof ZodError) {
        reply.code(400);
        return errorResponse(error, 'invalid_request');
      }
      reply.code(502);
      return errorResponse(error, 'provider_error');
    }
  });

  app.post('/v1/code', routeRateLimit, async (request, reply) => {
    try {
      const body = CodeRequestSchema.parse(request.body);
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
      if (error instanceof ZodError) {
        reply.code(400);
        return errorResponse(error, 'invalid_request');
      }
      reply.code(502);
      return errorResponse(error, 'provider_error');
    }
  });

  return { app, service };
}
