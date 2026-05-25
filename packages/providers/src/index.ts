import { spawn } from 'node:child_process';
import type { ProviderConfig, ProviderType } from '@modelmule/config';
import type { ChatRequest, ChatResponse, ProviderHealth, ProviderRuntime } from '@modelmule/core';

function makeUsage(prompt = 0, completion = 0, estimated = 0) {
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    estimatedCostUsd: estimated
  };
}

function parseTextFromMessages(messages: ChatRequest['messages']): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join('\n');
}

function createResponse(model: string, content: string, usage?: Partial<ChatResponse['usage']>, raw?: unknown): ChatResponse {
  const prompt = usage?.promptTokens ?? 0;
  const completion = usage?.completionTokens ?? Math.ceil(content.length / 4);
  const estimated = usage?.estimatedCostUsd ?? 0;
  return {
    id: `mm_${Date.now().toString(36)}`,
    model,
    content,
    usage: makeUsage(prompt, completion, estimated),
    raw
  };
}

abstract class BaseProvider implements ProviderRuntime {
  readonly id: string;
  readonly type: string;
  readonly isLocal: boolean;
  readonly priority: number;
  readonly dailyBudgetUsd?: number;
  readonly dailyRequestLimit?: number;

  constructor(id: string, type: ProviderType, config: ProviderConfig) {
    this.id = id;
    this.type = type;
    this.isLocal = config.isLocal ?? type === 'ollama' || type === 'shell_command';
    this.priority = config.priority;
    this.dailyBudgetUsd = config.dailyBudgetUsd;
    this.dailyRequestLimit = config.dailyRequestLimit;
  }

  abstract listModels(): Promise<string[]>;
  abstract healthCheck(): Promise<ProviderHealth>;
  abstract chat(request: ChatRequest): Promise<ChatResponse>;
}

class OpenRouterProvider extends BaseProvider {
  private readonly apiKeyEnv?: string;
  private readonly baseUrl: string;
  private readonly configuredModels: string[];

  constructor(id: string, config: ProviderConfig) {
    super(id, 'openrouter', config);
    this.apiKeyEnv = config.apiKeyEnv;
    this.baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    this.configuredModels = config.models;
  }

  async listModels(): Promise<string[]> {
    if (this.configuredModels.length > 0) {
      return this.configuredModels;
    }
    const response = await fetch(`${this.baseUrl}/models`);
    if (!response.ok) {
      throw new Error(`OpenRouter models error ${response.status}`);
    }
    const payload = (await response.json()) as { data?: Array<{ id: string }> };
    return payload.data?.map((m) => m.id) ?? ['openrouter/auto'];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      await this.listModels();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.apiKeyEnv) {
      throw new Error(`Provider ${this.id} requires apiKeyEnv`);
    }
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing env var ${this.apiKeyEnv}`);
    }

    const body = {
      model: request.model ?? this.configuredModels[0] ?? 'openrouter/auto',
      messages: request.messages
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as any;
    const content = payload.choices?.[0]?.message?.content ?? '';
    const usage = {
      promptTokens: Number(payload.usage?.prompt_tokens ?? 0),
      completionTokens: Number(payload.usage?.completion_tokens ?? 0),
      estimatedCostUsd: Number(payload.usage?.cost ?? 0)
    };
    return createResponse(payload.model ?? body.model, content, usage, payload);
  }
}

class OllamaProvider extends BaseProvider {
  private readonly baseUrl: string;
  private readonly configuredModels: string[];

  constructor(id: string, config: ProviderConfig) {
    super(id, 'ollama', config);
    this.baseUrl = (config.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.configuredModels = config.models;
  }

  async listModels(): Promise<string[]> {
    if (this.configuredModels.length > 0) {
      return this.configuredModels;
    }
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama models error ${response.status}`);
    }
    const payload = (await response.json()) as { models?: Array<{ name: string }> };
    return payload.models?.map((m) => m.name) ?? [];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      await this.listModels();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model ?? this.configuredModels[0] ?? 'llama3.1:8b';
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as any;
    const content = payload.message?.content ?? '';
    const usage = {
      promptTokens: Number(payload.prompt_eval_count ?? 0),
      completionTokens: Number(payload.eval_count ?? 0),
      estimatedCostUsd: 0
    };
    return createResponse(payload.model ?? model, content, usage, payload);
  }
}

class OpenAICompatibleProvider extends BaseProvider {
  private readonly apiKeyEnv?: string;
  private readonly baseUrl: string;
  private readonly configuredModels: string[];

  constructor(id: string, config: ProviderConfig) {
    super(id, 'openai_compatible', config);
    this.apiKeyEnv = config.apiKeyEnv;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.configuredModels = config.models;
  }

  async listModels(): Promise<string[]> {
    if (this.configuredModels.length > 0) {
      return this.configuredModels;
    }
    return ['gpt-4.1-mini'];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { healthy: true };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const apiKey = this.apiKeyEnv ? process.env[this.apiKeyEnv] : undefined;
    const model = request.model ?? this.configuredModels[0] ?? 'gpt-4.1-mini';
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: apiKey ? `Bearer ${apiKey}` : 'Bearer dummy-local-key'
      },
      body: JSON.stringify({ model, messages: request.messages })
    });
    if (!response.ok) {
      throw new Error(`OpenAI-compatible ${response.status}: ${await response.text()}`);
    }
    const payload = (await response.json()) as any;
    const content = payload.choices?.[0]?.message?.content ?? '';
    return createResponse(
      payload.model ?? model,
      content,
      {
        promptTokens: Number(payload.usage?.prompt_tokens ?? 0),
        completionTokens: Number(payload.usage?.completion_tokens ?? 0),
        estimatedCostUsd: Number(payload.usage?.cost ?? 0)
      },
      payload
    );
  }
}

class AnthropicProvider extends BaseProvider {
  private readonly apiKeyEnv?: string;
  private readonly baseUrl: string;
  private readonly configuredModels: string[];

  constructor(id: string, config: ProviderConfig) {
    super(id, 'anthropic', config);
    this.apiKeyEnv = config.apiKeyEnv;
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.configuredModels = config.models;
  }

  async listModels(): Promise<string[]> {
    return this.configuredModels.length > 0 ? this.configuredModels : ['claude-3-5-sonnet-latest'];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { healthy: true };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.apiKeyEnv) {
      throw new Error(`Provider ${this.id} requires apiKeyEnv`);
    }
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing env var ${this.apiKeyEnv}`);
    }
    const model = request.model ?? this.configuredModels[0] ?? 'claude-3-5-sonnet-latest';
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: parseTextFromMessages(request.messages) }]
      })
    });
    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
    }
    const payload = (await response.json()) as any;
    const content = payload.content?.[0]?.text ?? '';
    return createResponse(
      model,
      content,
      {
        promptTokens: Number(payload.usage?.input_tokens ?? 0),
        completionTokens: Number(payload.usage?.output_tokens ?? 0)
      },
      payload
    );
  }
}

class ShellCommandProvider extends BaseProvider {
  private readonly command?: string;
  private readonly args: string[];
  private readonly configuredModels: string[];

  constructor(id: string, config: ProviderConfig) {
    super(id, 'shell_command', config);
    this.command = config.command;
    this.args = config.args ?? [];
    this.configuredModels = config.models;
  }

  async listModels(): Promise<string[]> {
    return this.configuredModels.length > 0 ? this.configuredModels : ['shell-command-model'];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { healthy: Boolean(this.command), message: this.command ? undefined : 'No command configured' };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.command) {
      throw new Error(`Provider ${this.id} requires command`);
    }

    const model = request.model ?? this.configuredModels[0] ?? 'shell-command-model';
    const prompt = parseTextFromMessages(request.messages);

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.command!, this.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Shell command exited with ${code}: ${stderr.trim()}`));
          return;
        }
        resolve(stdout.trim() || stderr.trim());
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });

    return createResponse(model, output, {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(output.length / 4)
    });
  }
}

export function createProvider(providerId: string, config: ProviderConfig): ProviderRuntime {
  switch (config.type) {
    case 'openrouter':
      return new OpenRouterProvider(providerId, config);
    case 'ollama':
      return new OllamaProvider(providerId, config);
    case 'openai_compatible':
      return new OpenAICompatibleProvider(providerId, config);
    case 'anthropic':
      return new AnthropicProvider(providerId, config);
    case 'shell_command':
      return new ShellCommandProvider(providerId, config);
    default:
      throw new Error(`Unsupported provider type: ${(config as ProviderConfig).type}`);
  }
}
