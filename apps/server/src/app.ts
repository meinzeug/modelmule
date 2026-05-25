import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from '@modelmule/config';
import { ModelMuleService, UsageStore, type ChatMessage } from '@modelmule/core';
import { createProvider } from '@modelmule/providers';

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

export async function buildServer(options: BuildServerOptions = {}): Promise<{ app: FastifyInstance; service: ModelMuleService }> {
  const config = loadConfig(options.configPath);
  const store = new UsageStore(options.dbPath);

  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([providerId, providerConfig]) => [providerId, createProvider(providerId, providerConfig)])
  );

  const service = new ModelMuleService({ config, providers, store });
  const app = Fastify({ logger: false });
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

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/providers', routeRateLimit, async () => ({ providers: await service.listProviders() }));
  app.get('/models', routeRateLimit, async () => ({ models: await service.listModels() }));
  app.get('/usage', routeRateLimit, async () => service.getUsage());
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

  app.post('/config/provider', routeRateLimit, async (_request, reply) => {
    reply.code(501);
    return { message: 'Provider configuration updates via API are not yet available. Use modelmule config edit.' };
  });

  app.post('/config/routing', routeRateLimit, async (_request, reply) => {
    reply.code(501);
    return { message: 'Routing updates via API are not yet available. Use modelmule config edit.' };
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
