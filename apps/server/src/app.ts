import Fastify, { type FastifyInstance } from 'fastify';
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
  const rateLimitState = new Map<string, { windowStart: number; count: number }>();

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') {
      return;
    }
    const key = request.ip;
    const now = Date.now();
    const current = rateLimitState.get(key);
    if (!current || now - current.windowStart >= rateLimitWindowMs) {
      rateLimitState.set(key, { windowStart: now, count: 1 });
      return;
    }
    if (current.count >= rateLimitMaxRequests) {
      reply.code(429).send({
        error: {
          message: 'Too many requests',
          type: 'rate_limit_exceeded'
        }
      });
      return;
    }
    current.count += 1;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/providers', async () => ({ providers: await service.listProviders() }));
  app.get('/models', async () => ({ models: await service.listModels() }));
  app.get('/usage', async () => service.getUsage());

  app.post('/config/provider', async (_request, reply) => {
    reply.code(501);
    return { message: 'Konfigurationsupdate per API folgt in späterer Version. Bitte modelmule config edit nutzen.' };
  });

  app.post('/config/routing', async (_request, reply) => {
    reply.code(501);
    return { message: 'Routing-Update per API folgt in späterer Version. Bitte modelmule config edit nutzen.' };
  });

  app.post('/v1/chat/completions', async (request, reply) => {
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

  app.post('/v1/code', async (request, reply) => {
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
