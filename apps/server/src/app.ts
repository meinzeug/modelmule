import Fastify, { type FastifyInstance } from 'fastify';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import {
  createConfigBackup,
  configMigrationStatus,
  exportProviderProfile,
  importProviderProfile,
  listConfigBackups,
  loadConfig,
  ModelCatalogEntrySchema,
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
  RoutingProfileSchema,
  CodingAiToolConfigSchema,
  saveConfig,
  TaskTypeSchema,
  type ModelMuleConfig
} from '@modelmule/config';
import { ModelMuleService, UsageStore, type ChatMessage } from '@modelmule/core';
import { createProvider } from '@modelmule/providers';
import { dashboardCss, dashboardHtml, dashboardJs } from './ui.js';

const OPENROUTER_FREE_CODING_MODEL = 'qwen/qwen3-coder:free';

function toOpenAIResponse(input: {
  id: string;
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  usedProvider: string;
  fallbackChain: string[];
  routingProfileId?: string;
  codingTool?: string;
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
          fallbackChain: input.fallbackChain,
          routingProfileId: input.routingProfileId,
          codingTool: input.codingTool
      }
    }
  };
}

function responseContentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => responseContentToText(part)).filter(Boolean).join('\n');
  }

  if (content && typeof content === 'object') {
    const part = content as Record<string, unknown>;
    if (typeof part.text === 'string') {
      return part.text;
    }
    if (typeof part.input_text === 'string') {
      return part.input_text;
    }
    if (typeof part.output_text === 'string') {
      return part.output_text;
    }
    if ('content' in part) {
      return responseContentToText(part.content);
    }
  }

  return '';
}

function responseRoleToChatRole(role: unknown): ChatMessage['role'] {
  if (role === 'assistant' || role === 'tool' || role === 'user') {
    return role;
  }
  return 'system';
}

function responsesInputToChatMessages(input: { instructions?: string; input?: unknown }): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (input.instructions?.trim()) {
    messages.push({ role: 'system', content: input.instructions.trim() });
  }

  if (typeof input.input === 'string' && input.input.trim()) {
    messages.push({ role: 'user', content: input.input.trim() });
  } else if (Array.isArray(input.input)) {
    for (const item of input.input) {
      if (typeof item === 'string' && item.trim()) {
        messages.push({ role: 'user', content: item.trim() });
        continue;
      }

      if (!item || typeof item !== 'object') {
        continue;
      }

      const inputItem = item as Record<string, unknown>;
      if (inputItem.type === 'function_call_output' || inputItem.type === 'custom_tool_call_output') {
        const output = responseContentToText(inputItem.output).trim() || '(completed with no output)';
        const callId = typeof inputItem.call_id === 'string' ? ` ${inputItem.call_id}` : '';
        messages.push({ role: 'user', content: `Tool result${callId}:\n${output}` });
        continue;
      }

      const content = responseContentToText(inputItem.content ?? inputItem.text ?? inputItem.input_text).trim();
      if (content) {
        messages.push({ role: responseRoleToChatRole(inputItem.role), content });
      }
    }
  } else {
    const content = responseContentToText(input.input).trim();
    if (content) {
      messages.push({ role: 'user', content });
    }
  }

  return messages;
}

function codexCompatibleModel(model: string | undefined, hasTools = false): string | undefined {
  if (hasTools && model === 'openrouter/free') {
    return OPENROUTER_FREE_CODING_MODEL;
  }
  return model;
}

function toResponsesApiResponse(input: {
  id: string;
  model: string;
  content: string;
  toolCalls?: Array<{ id: string; callId: string; name: string; arguments: string }>;
  promptTokens: number;
  completionTokens: number;
  usedProvider: string;
  fallbackChain: string[];
  routingProfileId?: string;
  codingTool?: string;
}) {
  const created = Math.floor(Date.now() / 1000);
  const output = [
    ...(input.toolCalls?.map((toolCall) => ({
      id: toolCall.id,
      type: 'function_call',
      name: toolCall.name,
      arguments: toolCall.arguments,
      call_id: toolCall.callId
    })) ?? []),
    ...(input.content ? [
      {
        id: `${input.id}-message`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: input.content,
            annotations: []
          }
        ]
      }
    ] : [])
  ];

  return {
    id: input.id,
    object: 'response',
    created_at: created,
    status: 'completed',
    model: input.model,
    output,
    output_text: input.content,
    usage: {
      input_tokens: input.promptTokens,
      output_tokens: input.completionTokens,
      total_tokens: input.promptTokens + input.completionTokens
    },
    metadata: {
      modelmule: {
        usedProvider: input.usedProvider,
        fallbackChain: input.fallbackChain,
        routingProfileId: input.routingProfileId,
        codingTool: input.codingTool
      }
    }
  };
}

function toCodexModelInfo(providerId: string, model: string) {
  return {
    id: model,
    slug: model,
    display_name: model,
    description: null,
    default_reasoning_level: null,
    supported_reasoning_levels: [],
    shell_type: 'default',
    visibility: 'list',
    supported_in_api: true,
    priority: 0,
    additional_speed_tiers: [],
    service_tiers: [],
    default_service_tier: null,
    availability_nux: null,
    upgrade: null,
    base_instructions: 'You are Codex, a coding agent routed through ModelMule.',
    model_messages: null,
    supports_reasoning_summaries: false,
    default_reasoning_summary: 'auto',
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: null,
    web_search_tool_type: 'text',
    truncation_policy: {
      mode: 'bytes',
      limit: 10_000
    },
    supports_parallel_tool_calls: false,
    supports_image_detail_original: false,
    context_window: 272_000,
    max_context_window: 272_000,
    auto_compact_token_limit: null,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: ['text'],
    supports_search_tool: false,
    object: 'model',
    created: 0,
    owned_by: providerId
  };
}

function codexDiscoveryModels(models: string[]): string[] {
  const visibleModels = models.flatMap((model) => {
    const compatibleModel = codexCompatibleModel(model, true);
    return compatibleModel && compatibleModel !== model ? [compatibleModel, model] : [model];
  });
  return [...new Set(visibleModels)];
}

function sendResponsesStream(reply: { raw: NodeJS.WritableStream & { setHeader(name: string, value: string): void; statusCode: number } }, response: ReturnType<typeof toResponsesApiResponse>) {
  const writeEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  reply.raw.statusCode = 200;
  reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('cache-control', 'no-cache');
  reply.raw.setHeader('connection', 'keep-alive');
  reply.raw.setHeader('x-accel-buffering', 'no');

  writeEvent('response.created', {
    type: 'response.created',
    response: {
      ...response,
      status: 'in_progress',
      output: [],
      output_text: ''
    }
  });
  writeEvent('response.in_progress', {
    type: 'response.in_progress',
    response: {
      ...response,
      status: 'in_progress',
      output: [],
      output_text: ''
    }
  });
  for (const [outputIndex, item] of response.output.entries()) {
    writeEvent('response.output_item.added', {
      type: 'response.output_item.added',
      output_index: outputIndex,
      item: item.type === 'message' ? { ...item, status: 'in_progress', content: [] } : item
    });

    if (item.type === 'message' && 'content' in item && Array.isArray(item.content)) {
      const content = item.content[0];
      writeEvent('response.content_part.added', {
        type: 'response.content_part.added',
        item_id: item.id,
        output_index: outputIndex,
        content_index: 0,
        part: {
          ...content,
          text: ''
        }
      });
      writeEvent('response.output_text.delta', {
        type: 'response.output_text.delta',
        item_id: item.id,
        output_index: outputIndex,
        content_index: 0,
        delta: response.output_text
      });
      writeEvent('response.output_text.done', {
        type: 'response.output_text.done',
        item_id: item.id,
        output_index: outputIndex,
        content_index: 0,
        text: response.output_text
      });
      writeEvent('response.content_part.done', {
        type: 'response.content_part.done',
        item_id: item.id,
        output_index: outputIndex,
        content_index: 0,
        part: content
      });
    }

    writeEvent('response.output_item.done', {
      type: 'response.output_item.done',
      output_index: outputIndex,
      item
    });
  }
  writeEvent('response.completed', {
    type: 'response.completed',
    response
  });
  reply.raw.end();
}

export interface BuildServerOptions {
  configPath?: string;
  dbPath?: string;
  apiKey?: string;
  codexConfigPath?: string;
  secretsPath?: string;
}

const SecretsFileSchema = z.object({
  env: z.record(z.string()).default({})
});

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
const ResponsesRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    input: z.unknown().optional(),
    instructions: z.string().optional(),
    stream: z.boolean().optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    parallel_tool_calls: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .passthrough()
  .refine((value) => value.input !== undefined || Boolean(value.instructions?.trim()), { message: 'input or instructions is required' });
const CodeRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional()
});
const RouteTestRequestSchema = z.object({
  taskType: TaskTypeSchema.optional(),
  routingProfileId: z.string().min(1).optional(),
  codingTool: z.string().min(1).optional()
});
const ToolTestRequestSchema = z.object({
  toolId: z.string().min(1)
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
const ProviderSecretRequestSchema = z.object({
  id: ProviderIdSchema,
  apiKey: z.string().min(1)
});
const ProviderEnabledRequestSchema = z.object({
  enabled: z.boolean()
});
const ConnectionTestRequestSchema = z.object({
  prompt: z.string().min(1),
  taskType: TaskTypeSchema.default('coding'),
  codingTool: z.string().min(1).optional(),
  routingProfileId: z.string().min(1).optional()
});
const RoutingProfileUpsertRequestSchema = z.object({
  id: z.string().trim().regex(providerIdPattern, 'Routing profile id must contain only letters, numbers, underscores, and dashes'),
  profile: RoutingProfileSchema
});
const CodingAiAssignmentRequestSchema = z.object({
  toolId: z.string().min(1),
  assignment: CodingAiToolConfigSchema
});
const CodingAiInstallRequestSchema = z.object({
  toolId: z.string().min(1),
  method: z.string().min(1).optional()
});
const CodingAiConnectRequestSchema = z.object({
  toolId: z.string().min(1),
  providerId: ProviderIdSchema.optional()
});
const ModelCatalogUpdateRequestSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean()
});
const SetupQuickstartRequestSchema = z.object({
  presetId: z.string().min(1),
  providerId: ProviderIdSchema.optional(),
  apiKey: z.string().optional(),
  routingProfileId: z.string().min(1).optional(),
  codingToolId: z.string().min(1).optional()
});

interface CodingAiDefinition {
  id: string;
  name: string;
  description: string;
  command: string;
  installMethods: Record<string, string[]>;
  defaultProviderId: string;
  defaultArgs: string[];
  defaultModel: string;
}

interface ProviderPreset {
  id: string;
  name: string;
  type: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  model?: string;
  isLocal?: boolean;
  note?: string;
}

const CODING_AI_DEFINITIONS: CodingAiDefinition[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI Codex als lokales CLI-Tool.',
    command: 'codex',
    installMethods: {
      npm: ['npm', 'install', '-g', '@openai/codex'],
      pnpm: ['pnpm', 'add', '-g', '@openai/codex']
    },
    defaultProviderId: 'codex_cli',
    defaultArgs: ['exec', '-'],
    defaultModel: 'codex-cli'
  },
  {
    id: 'claude_code',
    name: 'Claude Code',
    description: 'Anthropic Claude Code als CLI-Tool.',
    command: 'claude',
    installMethods: {
      npm: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
      pnpm: ['pnpm', 'add', '-g', '@anthropic-ai/claude-code']
    },
    defaultProviderId: 'claude_cli',
    defaultArgs: ['-p'],
    defaultModel: 'claude-cli'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode CLI mit stdin/stdout Anbindung.',
    command: 'opencode',
    installMethods: {
      npm: ['npm', 'install', '-g', '@opencode-ai/cli'],
      pnpm: ['pnpm', 'add', '-g', '@opencode-ai/cli']
    },
    defaultProviderId: 'opencode_cli',
    defaultArgs: ['chat', '--stdin'],
    defaultModel: 'opencode-cli'
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'Aider als lokales Coding-CLI.',
    command: 'aider',
    installMethods: {
      pipx: ['pipx', 'install', 'aider-chat'],
      pip: ['python3', '-m', 'pip', 'install', '--user', 'aider-chat']
    },
    defaultProviderId: 'aider_cli',
    defaultArgs: ['--message-file', '-'],
    defaultModel: 'aider-cli'
  }
];

function commandPath(command: string): string | undefined {
  const check = spawnSync('sh', ['-c', 'command -v "$1"', 'modelmule-command-check', command], {
    encoding: 'utf8',
    timeout: 5000
  });
  const output = check.stdout.trim();
  return check.status === 0 && output ? output : undefined;
}

function findCodingAi(toolId: string): CodingAiDefinition | undefined {
  return CODING_AI_DEFINITIONS.find((tool) => tool.id === toolId);
}

function commandVersion(command: string): string | undefined {
  for (const args of [['--version'], ['version']]) {
    const run = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
    const output = `${run.stdout}${run.stderr}`.trim().split('\n')[0]?.trim();
    if (run.status === 0 && output) {
      return output;
    }
  }
  return undefined;
}

function looksLikeSecret(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(sk-|sk_|or-|eyJ|AIza|xai-|gsk_|mistral-|deepseek-)/i.test(value) || value.length > 48;
}

function maskSecret(value: string | undefined): string | undefined {
  if (!value || !looksLikeSecret(value)) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function safeConfig(config: ModelMuleConfig): ModelMuleConfig {
  return {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([providerId, provider]) => [
        providerId,
        {
          ...provider,
          apiKeyEnv: maskSecret(provider.apiKeyEnv)
        }
      ])
    )
  };
}

function modelTags(providerId: string, model: string, provider: ModelMuleConfig['providers'][string]): string[] {
  const lower = model.toLowerCase();
  const tags = new Set<string>();
  if (provider.isLocal || provider.type === 'ollama' || provider.baseUrl?.includes('localhost') || provider.baseUrl?.includes('127.0.0.1')) {
    tags.add('local');
    tags.add('free');
  }
  if (lower.includes(':free') || lower.includes('/free') || lower.endsWith('-free')) tags.add('free');
  if (lower.includes('coder') || lower.includes('code') || lower.includes('codex')) tags.add('coding');
  if (lower.includes('reason') || lower.includes('r1') || lower.includes('o1') || lower.includes('o3')) tags.add('reasoning');
  if (lower.includes('flash') || lower.includes('mini') || lower.includes('small') || lower.includes('8b')) tags.add('fast');
  if (lower.includes('cheap') || tags.has('free')) tags.add('cheap');
  if (lower.includes('beta') || lower.includes('preview') || lower.includes('experimental')) tags.add('experimental');
  if (!tags.has('free') && !tags.has('local')) tags.add('paid');
  return [...tags];
}

const providerPresets: ProviderPreset[] = [
  { id: 'openrouter', name: 'OpenRouter', type: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', model: 'qwen/qwen3-coder:free' },
  { id: 'openai_compatible', name: 'OpenAI-kompatible API', type: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY', model: 'gpt-4.1-mini' },
  { id: 'openai', name: 'OpenAI API', type: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', model: 'gpt-4.1-mini' },
  { id: 'anthropic', name: 'Anthropic Claude API', type: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', model: 'claude-3-5-sonnet-latest' },
  { id: 'gemini', name: 'Google Gemini API', type: 'openai_compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', model: 'gemini-1.5-flash' },
  { id: 'mistral', name: 'Mistral API', type: 'openai_compatible', baseUrl: 'https://api.mistral.ai/v1', apiKeyEnv: 'MISTRAL_API_KEY', model: 'mistral-small-latest' },
  { id: 'groq', name: 'Groq API', type: 'openai_compatible', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', model: 'llama-3.1-8b-instant' },
  { id: 'deepseek', name: 'DeepSeek API', type: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1', apiKeyEnv: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' },
  { id: 'ollama', name: 'Ollama lokal', type: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'llama3.1:8b', isLocal: true },
  { id: 'lm_studio', name: 'LM Studio lokal', type: 'openai_compatible', baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model', isLocal: true },
  { id: 'custom_api', name: 'Custom API', type: 'openai_compatible', baseUrl: 'https://example.local/v1', apiKeyEnv: 'CUSTOM_API_KEY', model: 'custom-model' },
  { id: 'chatgpt_account', name: 'ChatGPT Account-Abo', type: 'account_placeholder', note: 'Nur Hinweisbereich. Keine Cookie-, Scraping- oder inoffizielle Account-Automation.' },
  { id: 'claude_max_account', name: 'Claude Max Abo', type: 'account_placeholder', note: 'Nur Hinweisbereich. Keine Cookie-, Scraping- oder inoffizielle Account-Automation.' }
];

function presetProviderId(presetId: string): string {
  const aliases: Record<string, string> = {
    openrouter: 'openrouter_main',
    ollama: 'ollama_local',
    lm_studio: 'lm_studio_local'
  };
  return aliases[presetId] ?? `${presetId}_main`;
}

function inferEnvName(providerId: string): string {
  const normalized = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `MODELMULE_${normalized || 'PROVIDER'}_API_KEY`;
}

function resolveSecretsPath(configPath?: string, secretsPath?: string): string {
  return secretsPath ?? process.env.MODELMULE_SECRETS_PATH ?? join(dirname(resolveConfigPath(configPath)), 'secrets.json');
}

function readSecretsFile(path: string): { env: Record<string, string> } {
  if (!existsSync(path)) {
    return { env: {} };
  }
  const raw = readFileSync(path, 'utf8');
  return SecretsFileSchema.parse(JSON.parse(raw));
}

function writeSecretsFile(path: string, secrets: { env: Record<string, string> }): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(SecretsFileSchema.parse(secrets), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function loadPersistentSecrets(config: ModelMuleConfig, secretsPath: string): void {
  const secrets = readSecretsFile(secretsPath);
  const envNames = new Set(Object.values(config.providers).map((provider) => provider.apiKeyEnv).filter((envName): envName is string => Boolean(envName)));
  for (const envName of envNames) {
    const value = secrets.env[envName];
    if (value && !process.env[envName]) {
      process.env[envName] = value;
    }
  }
}

function persistProviderSecret(secretsPath: string, envName: string, apiKey: string): void {
  const secrets = readSecretsFile(secretsPath);
  writeSecretsFile(secretsPath, {
    env: {
      ...secrets.env,
      [envName]: apiKey
    }
  });
}

function removeProviderSecret(secretsPath: string, envName: string): void {
  const secrets = readSecretsFile(secretsPath);
  if (!(envName in secrets.env)) {
    return;
  }
  const env = { ...secrets.env };
  delete env[envName];
  writeSecretsFile(secretsPath, { env });
}

function resolveCodexConfigPath(configPath?: string): string {
  if (configPath) {
    return configPath;
  }
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  return join(codexHome, 'config.toml');
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function withoutTopLevelKeys(content: string, keys: string[]): string {
  const keySet = new Set(keys);
  let inTable = false;
  return content
    .split('\n')
    .filter((line) => {
      if (/^\s*\[/.test(line)) {
        inTable = true;
      }
      if (inTable) {
        return true;
      }
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      return !match || !keySet.has(match[1]);
    })
    .join('\n');
}

function withoutTomlTable(content: string, tableName: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const tableMatch = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (tableMatch) {
      skipping = tableMatch[1].trim() === tableName;
      if (skipping) {
        continue;
      }
    }
    if (!skipping) {
      result.push(line);
    }
  }

  return result.join('\n');
}

function codexModelFromConfig(config: ModelMuleConfig, routingProfileId?: string): string {
  const profile = routingProfileId ? config.routingProfiles?.[routingProfileId] : undefined;
  const preferredProviderIds = [
    ...(profile?.providerOrder ?? []),
    ...(config.routing.tasks.coding?.prefer ?? []),
    ...Object.keys(config.providers ?? {})
  ];
  const uniqueProviderIds = [...new Set(preferredProviderIds)];

  for (const providerId of uniqueProviderIds) {
    const provider = config.providers[providerId];
    if (!provider || provider.enabled === false || provider.type === 'shell_command' || provider.apiKeyEnv && !process.env[provider.apiKeyEnv]) {
      continue;
    }
    const profileModel = profile?.modelPreferences?.[providerId]?.[0];
    const providerModel = provider.models?.[0];
    if (profileModel || providerModel) {
      return codexCompatibleModel(profileModel ?? providerModel, true) ?? OPENROUTER_FREE_CODING_MODEL;
    }
  }

  for (const provider of Object.values(config.providers ?? {})) {
    if (provider.enabled !== false && provider.type !== 'shell_command' && (!provider.apiKeyEnv || process.env[provider.apiKeyEnv]) && provider.models?.[0]) {
      return codexCompatibleModel(provider.models[0], true) ?? OPENROUTER_FREE_CODING_MODEL;
    }
  }

  for (const provider of Object.values(config.providers ?? {})) {
    if (provider.enabled !== false && provider.isLocal && provider.models?.[0]) {
      return provider.models[0];
    }
  }

  for (const provider of Object.values(config.providers ?? {})) {
    if (provider.enabled !== false && provider.type !== 'shell_command' && provider.models?.[0]) {
      return provider.models[0];
    }
  }

  return 'openrouter/auto';
}

function upsertCodexModelMuleProvider(configPath?: string, model = 'openrouter/auto'): { path: string; backupPath?: string; providerId: string; model: string } {
  const path = resolveCodexConfigPath(configPath);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  let backupPath: string | undefined;
  if (existing.trim().length > 0) {
    backupPath = join(dir, `config.toml.modelmule-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    writeFileSync(backupPath, existing, 'utf8');
  }

  const providerId = 'modelmule';
  const cleaned = withoutTomlTable(withoutTopLevelKeys(existing, ['model_provider', 'model']), `model_providers.${providerId}`).trim();
  const modelMuleBlock = [
    '# Added by ModelMule. Codex will send model requests to the local ModelMule router.',
    `model_provider = ${tomlString(providerId)}`,
    `model = ${tomlString(model)}`,
    '',
    `[model_providers.${providerId}]`,
    `name = ${tomlString('ModelMule')}`,
    `base_url = ${tomlString('http://127.0.0.1:43110/v1')}`,
    `wire_api = ${tomlString('responses')}`,
    ''
  ].join('\n');

  const nextContent = cleaned ? `${modelMuleBlock}\n${cleaned}\n` : `${modelMuleBlock}\n`;
  writeFileSync(path, nextContent, 'utf8');

  return { path, backupPath, providerId, model };
}

function setupStatus(config: ModelMuleConfig) {
  const providers = Object.entries(config.providers ?? {}).filter(([, provider]) => provider.enabled !== false);
  const readyProviderIds = providers
    .filter(([, provider]) => !provider.apiKeyEnv || Boolean(process.env[provider.apiKeyEnv]))
    .map(([providerId]) => providerId);
  const missingSecretProviderIds = providers
    .filter(([, provider]) => provider.apiKeyEnv && !process.env[provider.apiKeyEnv])
    .map(([providerId]) => providerId);
  const connectedToolIds = CODING_AI_DEFINITIONS
    .filter((tool) => providers.some(([, provider]) => provider.type === 'shell_command' && provider.command === tool.command) || config.codingAiTools?.[tool.id]?.enabled !== false && Boolean(config.codingAiTools?.[tool.id]))
    .map((tool) => tool.id);
  const assignedToolIds = Object.entries(config.codingAiTools ?? {})
    .filter(([, assignment]) => assignment.enabled !== false && assignment.routingProfileId)
    .map(([toolId]) => toolId);
  const installedToolIds = CODING_AI_DEFINITIONS.filter((tool) => commandPath(tool.command)).map((tool) => tool.id);

  return {
    endpoint: 'http://127.0.0.1:43110/v1',
    providersTotal: providers.length,
    readyProviderIds,
    missingSecretProviderIds,
    installedToolIds,
    connectedToolIds,
    assignedToolIds,
    routingProfilesTotal: Object.keys(config.routingProfiles ?? {}).length,
    modelsTotal: Object.keys(config.models ?? {}).length,
    steps: [
      {
        id: 'provider',
        label: 'KI-Anbieter eingerichtet',
        done: readyProviderIds.length > 0,
        detail: readyProviderIds.length > 0 ? `${readyProviderIds.length} Anbieter bereit` : 'Waehle OpenRouter, Ollama oder einen anderen Anbieter.'
      },
      {
        id: 'tool',
        label: 'Coding-AI verbunden',
        done: connectedToolIds.length > 0 || assignedToolIds.length > 0,
        detail: connectedToolIds.length > 0 ? `${connectedToolIds.length} Tool verbunden` : 'Waehle Codex, OpenCode, Aider oder Claude Code.'
      },
      {
        id: 'routing',
        label: 'Routing-Profil gewaehlt',
        done: assignedToolIds.length > 0,
        detail: assignedToolIds.length > 0 ? `${assignedToolIds.length} Zuweisung aktiv` : 'Free First ist fuer den Start empfohlen.'
      },
      {
        id: 'test',
        label: 'Chat-Test bereit',
        done: providers.length > 0,
        detail: 'Sende danach eine Testfrage im Chat-Test.'
      }
    ]
  };
}

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

function friendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/missing env var|requires apiKeyEnv|api[-_ ]?key/i.test(message)) {
    return 'API-Key fehlt';
  }
  if (/ollama/i.test(message) && /fetch|connect|ECONNREFUSED|failed/i.test(message)) {
    return 'Ollama laeuft nicht';
  }
  if (/not found|command not found|ENOENT/i.test(message)) {
    return 'Tool nicht installiert oder Provider nicht erreichbar';
  }
  if (/budget|request-limit|rate limit/i.test(message)) {
    return 'Budget/Request-Limit erreicht';
  }
  if (/no provider|all providers failed/i.test(message)) {
    return 'Alle Fallbacks fehlgeschlagen';
  }
  if (/fetch|ECONNREFUSED|ENOTFOUND|timeout|network/i.test(message)) {
    return 'Provider nicht erreichbar';
  }
  return message;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{ app: FastifyInstance; service: ModelMuleService }> {
  const configPath = resolveConfigPath(options.configPath);
  const secretsPath = resolveSecretsPath(options.configPath, options.secretsPath);
  const apiKey = options.apiKey ?? process.env.MODELMULE_API_KEY;
  let config = loadConfig(options.configPath);
  loadPersistentSecrets(config, secretsPath);
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
    loadPersistentSecrets(config, secretsPath);
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
    taskTypes: TaskTypeSchema.options,
    providerPresets
  }));

  app.get('/provider-presets', routeRateLimit, async () => ({ presets: providerPresets }));
  app.get('/setup/status', routeRateLimit, async () => setupStatus(config));
  app.post('/setup/quickstart', routeRateLimit, async (request, reply) => {
    try {
      const body = SetupQuickstartRequestSchema.parse(request.body);
      const preset = providerPresets.find((item) => item.id === body.presetId);
      if (!preset) {
        reply.code(404);
        return {
          error: {
            message: `Provider preset '${body.presetId}' does not exist`,
            type: 'not_found'
          }
        };
      }
      if (!ProviderTypeSchema.safeParse(preset.type).success) {
        reply.code(400);
        return {
          error: {
            message: `${preset.name} kann nicht automatisch verbunden werden. Nutze dafuer die Hinweise im Expertenbereich.`,
            type: 'validation_error'
          }
        };
      }

      const providerId = body.providerId ?? presetProviderId(preset.id);
      const existingProvider = config.providers[providerId];
      const apiKeyEnv = existingProvider?.apiKeyEnv ?? preset.apiKeyEnv ?? inferEnvName(providerId);
      const provider = ProviderConfigSchema.parse({
        type: preset.type,
        enabled: true,
        displayName: preset.name,
        baseUrl: preset.baseUrl,
        apiKeyEnv: preset.isLocal ? undefined : apiKeyEnv,
        priority: preset.isLocal ? 60 : 80,
        models: preset.model ? [preset.model] : [],
        isLocal: preset.isLocal
      });

      if (body.apiKey?.trim() && provider.apiKeyEnv) {
        const apiKey = body.apiKey.trim();
        process.env[provider.apiKeyEnv] = apiKey;
        persistProviderSecret(secretsPath, provider.apiKeyEnv, apiKey);
      }

      const routingProfileId = body.routingProfileId ?? 'free_first';
      const currentProfile = config.routingProfiles?.[routingProfileId];
      const nextRoutingProfiles = currentProfile
        ? {
            ...(config.routingProfiles ?? {}),
            [routingProfileId]: {
              ...currentProfile,
              providerOrder: [providerId, ...currentProfile.providerOrder.filter((id) => id !== providerId)],
              modelPreferences: preset.model
                ? {
                    ...currentProfile.modelPreferences,
                    [providerId]: [preset.model]
                  }
                : currentProfile.modelPreferences
            }
          }
        : config.routingProfiles;
      const currentCodingPrefer = config.routing.tasks.coding?.prefer ?? [];
      const nextCodingPrefer = [providerId, ...currentCodingPrefer.filter((id) => id !== providerId)];
      const nextModels = preset.model
        ? {
            ...(config.models ?? {}),
            [`${providerId}:${preset.model}`]: ModelCatalogEntrySchema.parse({
              providerId,
              model: preset.model,
              enabled: true,
              tags: modelTags(providerId, preset.model, provider)
            })
          }
        : config.models;
      const nextCodingAiTools = body.codingToolId
        ? {
            ...(config.codingAiTools ?? {}),
            [body.codingToolId]: {
              ...(config.codingAiTools?.[body.codingToolId] ?? {}),
              enabled: true,
              routingProfileId
            }
          }
        : config.codingAiTools;
      const codexConfig = body.codingToolId === 'codex' ? upsertCodexModelMuleProvider(options.codexConfigPath, codexModelFromConfig({
        ...config,
        providers: {
          ...config.providers,
          [providerId]: provider
        },
        routingProfiles: nextRoutingProfiles,
        models: nextModels,
        codingAiTools: nextCodingAiTools
      }, routingProfileId)) : undefined;

      const nextConfig = applyConfig({
        ...config,
        providers: {
          ...config.providers,
          [providerId]: provider
        },
        models: nextModels,
        routingProfiles: nextRoutingProfiles,
        codingAiTools: nextCodingAiTools,
        routing: {
          ...config.routing,
          tasks: {
            ...config.routing.tasks,
            coding: {
              prefer: nextCodingPrefer
            }
          }
        }
      });

      return {
        providerId,
        apiKeyEnv: provider.apiKeyEnv,
        routingProfileId,
        codingToolId: body.codingToolId,
        codexConfig,
        status: setupStatus(nextConfig),
        config: safeConfig(nextConfig)
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.get('/providers', routeRateLimit, async () => ({ providers: await service.listProviders() }));
  app.get('/providers/:id/test', routeRateLimit, async (request, reply) => {
    const params = request.params as { id?: string };

    try {
      const id = ProviderIdSchema.parse(params.id);
      const providerConfig = config.providers[id];
      if (!providerConfig) {
        reply.code(404);
        return { error: { message: `Provider '${id}' does not exist`, type: 'not_found' } };
      }

      if (providerConfig.apiKeyEnv && !process.env[providerConfig.apiKeyEnv]) {
        return {
          id,
          ready: false,
          status: 'einrichtung_noetig',
          message: 'API-Key fehlt'
        };
      }

      const provider = createProvider(id, providerConfig);
      const health = await provider.healthCheck();
      return {
        id,
        ready: health.healthy,
        status: health.healthy ? 'bereit' : 'fehler',
        message: health.message ?? (health.healthy ? 'Provider ist erreichbar' : 'Provider nicht erreichbar')
      };
    } catch (error) {
      return {
        id: params.id,
        ready: false,
        status: 'fehler',
        message: friendlyErrorMessage(error),
        rawMessage: error instanceof Error ? error.message : String(error)
      };
    }
  });
  app.get('/models/catalog', routeRateLimit, async () => {
    const providerModels = await service.listModels();
    const entries = providerModels.flatMap(({ providerId, models }) => {
      const provider = config.providers[providerId];
      if (!provider) {
        return [];
      }
      return models.map((model) => {
        const key = `${providerId}:${model}`;
        const configured = config.models?.[key];
        const tags = configured?.tags?.length ? configured.tags : modelTags(providerId, model, provider);
        return {
          id: key,
          providerId,
          providerName: provider.displayName ?? providerId,
          model,
          enabled: configured?.enabled ?? true,
          tags,
          free: tags.includes('free'),
          local: tags.includes('local'),
          coding: tags.includes('coding'),
          reasoning: tags.includes('reasoning')
        };
      });
    });
    return { models: entries };
  });
  app.post('/models/catalog/update', routeRateLimit, async (request, reply) => {
    try {
      const body = ModelCatalogUpdateRequestSchema.parse(request.body);
      const [providerId, ...modelParts] = body.id.split(':');
      const model = modelParts.join(':');
      const provider = config.providers[providerId];
      if (!provider || !model) {
        reply.code(404);
        return {
          error: {
            message: `Model '${body.id}' does not exist`,
            type: 'not_found'
          }
        };
      }

      const current = config.models?.[body.id];
      return {
        path: configPath,
        config: safeConfig(
          applyConfig({
            ...config,
            models: {
              ...(config.models ?? {}),
              [body.id]: ModelCatalogEntrySchema.parse({
                providerId,
                model,
                enabled: body.enabled,
                tags: current?.tags?.length ? current.tags : modelTags(providerId, model, provider),
                notes: current?.notes
              })
            }
          })
        )
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.get('/routing/profiles', routeRateLimit, async () => ({ profiles: config.routingProfiles ?? {}, assignments: config.codingAiTools ?? {} }));
  app.post('/routing/profile', routeRateLimit, async (request, reply) => {
    try {
      const body = RoutingProfileUpsertRequestSchema.parse(request.body);
      return {
        path: configPath,
        config: safeConfig(
          applyConfig({
            ...config,
            routingProfiles: {
              ...(config.routingProfiles ?? {}),
              [body.id]: body.profile
            }
          })
        )
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.post('/tools/coding-ai/assign', routeRateLimit, async (request, reply) => {
    try {
      const body = CodingAiAssignmentRequestSchema.parse(request.body);
      return {
        path: configPath,
        config: safeConfig(
          applyConfig({
            ...config,
            codingAiTools: {
              ...(config.codingAiTools ?? {}),
              [body.toolId]: body.assignment
            }
          })
        )
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.get('/tools/coding-ai', routeRateLimit, async () => {
    const providers = config.providers ?? {};
    return {
      tools: CODING_AI_DEFINITIONS.map((tool) => {
        const path = commandPath(tool.command);
        const configuredProviders = Object.entries(providers)
          .filter(([, provider]) => provider.type === 'shell_command' && provider.command === tool.command)
          .map(([id]) => id);

        return {
          id: tool.id,
          name: tool.name,
          description: tool.description,
          command: tool.command,
          installed: Boolean(path),
          commandPath: path,
          version: path ? commandVersion(tool.command) : undefined,
          installMethods: Object.keys(tool.installMethods),
          defaultProviderId: tool.defaultProviderId,
          configuredProviders,
          assignment: config.codingAiTools?.[tool.id]
        };
      })
    };
  });
  app.post('/tools/coding-ai/install', routeRateLimit, async (request, reply) => {
    try {
      const body = CodingAiInstallRequestSchema.parse(request.body);
      const tool = findCodingAi(body.toolId);
      if (!tool) {
        reply.code(404);
        return {
          error: {
            message: `Unknown coding AI tool '${body.toolId}'`,
            type: 'not_found'
          }
        };
      }

      const selectedMethod = body.method && tool.installMethods[body.method] ? body.method : Object.keys(tool.installMethods)[0];
      const command = tool.installMethods[selectedMethod];
      if (!command || command.length === 0) {
        reply.code(400);
        return {
          error: {
            message: `No install command configured for '${tool.id}'`,
            type: 'validation_error'
          }
        };
      }

      const run = spawnSync(command[0], command.slice(1), {
        encoding: 'utf8',
        timeout: 300_000
      });
      const path = commandPath(tool.command);

      return {
        toolId: tool.id,
        method: selectedMethod,
        command: command.join(' '),
        exitCode: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        installed: Boolean(path),
        commandPath: path
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.post('/tools/coding-ai/test', routeRateLimit, async (request, reply) => {
    try {
      const body = ToolTestRequestSchema.parse(request.body);
      const tool = findCodingAi(body.toolId);
      if (!tool) {
        reply.code(404);
        return {
          error: {
            message: `Unknown coding AI tool '${body.toolId}'`,
            type: 'not_found'
          }
        };
      }

      const path = commandPath(tool.command);
      const version = path ? commandVersion(tool.command) : undefined;
      return {
        toolId: tool.id,
        installed: Boolean(path),
        commandPath: path,
        version,
        message: path ? `${tool.name} ist installiert` : `${tool.name} ist nicht installiert`,
        endpoint: 'http://127.0.0.1:43110/v1',
        apiKeyHint: 'modelmule'
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.post('/tools/coding-ai/connect', routeRateLimit, async (request, reply) => {
    try {
      const body = CodingAiConnectRequestSchema.parse(request.body);
      const tool = findCodingAi(body.toolId);
      if (!tool) {
        reply.code(404);
        return {
          error: {
            message: `Unknown coding AI tool '${body.toolId}'`,
            type: 'not_found'
          }
        };
      }

      if (tool.id === 'codex') {
        const removedProviderId = body.providerId ?? tool.defaultProviderId;
        const providers = { ...config.providers };
        delete providers[removedProviderId];
        const codingPrefer = (config.routing.tasks.coding?.prefer ?? []).filter((id) => id !== removedProviderId);
        const routingProfileId = config.codingAiTools?.codex?.routingProfileId ?? 'free_first';
        const nextConfig = applyConfig({
          ...config,
          providers,
          codingAiTools: {
            ...(config.codingAiTools ?? {}),
            codex: {
              ...(config.codingAiTools?.codex ?? {}),
              enabled: true,
              routingProfileId
            }
          },
          routing: {
            ...config.routing,
            tasks: {
              ...config.routing.tasks,
              coding: {
                prefer: codingPrefer
              }
            }
          }
        });
        const codexConfig = upsertCodexModelMuleProvider(options.codexConfigPath, codexModelFromConfig(nextConfig, routingProfileId));

        return {
          providerId: 'modelmule',
          toolId: tool.id,
          codexConfig,
          status: setupStatus(nextConfig),
          configPath
        };
      }

      const providerId = body.providerId ?? tool.defaultProviderId;
      const provider = {
        type: 'shell_command' as const,
        enabled: true,
        command: tool.command,
        args: tool.defaultArgs,
        timeoutMs: 600_000,
        priority: 65,
        models: [tool.defaultModel],
        isLocal: true
      };

      const currentCodingPrefer = config.routing.tasks.coding?.prefer ?? [];
      const nextCodingPrefer = currentCodingPrefer.includes(providerId)
        ? currentCodingPrefer
        : [...currentCodingPrefer, providerId];

      const nextConfig = applyConfig({
        ...config,
        providers: {
          ...config.providers,
          [providerId]: provider
        },
        routing: {
          ...config.routing,
          tasks: {
            ...config.routing.tasks,
            coding: {
              prefer: nextCodingPrefer
            }
          }
        }
      });

      return {
        providerId,
        toolId: tool.id,
        status: setupStatus(nextConfig),
        configPath
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.post('/providers/secret', routeRateLimit, async (request, reply) => {
    try {
      const body = ProviderSecretRequestSchema.parse(request.body);
      const provider = config.providers[body.id];
      if (!provider) {
        reply.code(404);
        return {
          error: {
            message: `Provider '${body.id}' does not exist`,
            type: 'not_found'
          }
        };
      }

      if (!provider.apiKeyEnv) {
        reply.code(400);
        return {
          error: {
            message: `Provider '${body.id}' does not use apiKeyEnv`,
            type: 'validation_error'
          }
        };
      }

      const apiKey = body.apiKey.trim();
      process.env[provider.apiKeyEnv] = apiKey;
      persistProviderSecret(secretsPath, provider.apiKeyEnv, apiKey);
      return { id: body.id, apiKeyEnv: provider.apiKeyEnv, configured: true };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.get('/models', routeRateLimit, async () => ({ models: await service.listModels() }));
  app.get('/v1/models', routeRateLimit, async () => {
    const providers = await service.listModels();
    const models = providers.flatMap((provider) => codexDiscoveryModels(provider.models).map((model) => toCodexModelInfo(provider.providerId, model)));
    return {
      object: 'list',
      data: models,
      models
    };
  });
  app.get('/usage', routeRateLimit, async () => service.getUsage());
  app.get('/config', routeRateLimit, async () => ({ path: configPath, config: safeConfig(config) }));
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
      return { path: configPath, config: safeConfig(applyConfig(importProviderProfile(config, body.profile, { replace: body.replace }))) };
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
      return { path: configPath, config: safeConfig(reloadConfig()) };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });
  app.put('/config', routeRateLimit, async (request, reply) => {
    try {
      const nextConfig = ModelMuleConfigSchema.parse(request.body);
      return { path: configPath, config: safeConfig(applyConfig(nextConfig)) };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.post('/config/reload', routeRateLimit, async (_request, reply) => {
    try {
      return { path: configPath, config: safeConfig(reloadConfig()) };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.post('/route/test', routeRateLimit, async (request, reply) => {
    try {
      const body = RouteTestRequestSchema.parse(request.body ?? {});
      return service.inspectRoute({
        taskType: body.taskType,
        metadata: {
          ...(body.codingTool ? { codingTool: body.codingTool } : {}),
          ...(body.routingProfileId ? { routingProfileId: body.routingProfileId } : {})
        }
      });
    } catch (error) {
      reply.code(400);
      return errorResponse(error, 'routing_error');
    }
  });

  app.post('/test/run', routeRateLimit, async (request, reply) => {
    try {
      const body = ConnectionTestRequestSchema.parse(request.body);
      const routed = await service.chat({
        taskType: body.taskType,
        messages: [{ role: 'user', content: body.prompt }],
        metadata: {
          ...(body.codingTool ? { codingTool: body.codingTool } : {}),
          ...(body.routingProfileId ? { routingProfileId: body.routingProfileId } : {})
        }
      });

      return {
        ok: true,
        response: routed.response.content,
        provider: routed.usedProvider,
        model: routed.response.model,
        fallbackChain: routed.fallbackChain,
        routingProfileId: routed.routingProfileId,
        codingTool: routed.codingTool
      };
    } catch (error) {
      reply.code(502);
      return {
        ok: false,
        error: {
          message: friendlyErrorMessage(error),
          rawMessage: error instanceof Error ? error.message : String(error),
          type: 'provider_error'
        }
      };
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
        config: safeConfig(applyConfig({
          ...config,
          providers: {
            ...config.providers,
            [body.id]: provider
          }
        }))
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
      if (config.providers[id].apiKeyEnv) {
        removeProviderSecret(secretsPath, config.providers[id].apiKeyEnv);
        delete process.env[config.providers[id].apiKeyEnv];
      }
      delete providers[id];
      const tasks = Object.fromEntries(
        Object.entries(config.routing.tasks).map(([taskType, taskConfig]) => [
          taskType,
          { prefer: taskConfig.prefer.filter((providerId) => providerId !== id) }
        ])
      );

      return {
        path: configPath,
        config: safeConfig(applyConfig({
          ...config,
          providers,
          routing: {
            ...config.routing,
            tasks
          }
        }))
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.post('/config/provider/:id/enabled', routeRateLimit, async (request, reply) => {
    const params = request.params as { id?: string };

    try {
      const id = ProviderIdSchema.parse(params.id);
      const body = ProviderEnabledRequestSchema.parse(request.body);
      const provider = config.providers[id];
      if (!provider) {
        reply.code(404);
        return {
          error: {
            message: `Provider '${id}' does not exist`,
            type: 'not_found'
          }
        };
      }

      return {
        path: configPath,
        config: safeConfig(applyConfig({
          ...config,
          providers: {
            ...config.providers,
            [id]: {
              ...provider,
              enabled: body.enabled
            }
          }
        }))
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
        config: safeConfig(applyConfig({
          ...config,
          routing
        }))
      };
    } catch (error) {
      reply.code(400);
      return errorResponse(error);
    }
  });

  app.post('/v1/chat/completions', routeRateLimit, async (request, reply) => {
    try {
      const body = ChatCompletionRequestSchema.parse(request.body);
      const codingToolHeader = request.headers['x-modelmule-tool'];
      const codingTool = Array.isArray(codingToolHeader) ? codingToolHeader[0] : codingToolHeader;
      const excludedProviderIds = codingTool ? [findCodingAi(codingTool)?.defaultProviderId].filter((providerId): providerId is string => Boolean(providerId)) : [];
      const routed = await service.chat({
        model: body.model,
        messages: body.messages as ChatMessage[],
        taskType: body.taskType,
        metadata: {
          ...(body.metadata ?? {}),
          ...(codingTool ? { codingTool, excludeProviderIds: excludedProviderIds.length ? excludedProviderIds : undefined } : {})
        }
      });

      return toOpenAIResponse({
        id: routed.response.id,
        model: routed.response.model,
        content: routed.response.content,
        promptTokens: routed.response.usage.promptTokens,
        completionTokens: routed.response.usage.completionTokens,
        usedProvider: routed.usedProvider,
        fallbackChain: routed.fallbackChain,
        routingProfileId: routed.routingProfileId,
        codingTool: routed.codingTool
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

  app.post('/v1/responses', routeRateLimit, async (request, reply) => {
    try {
      const body = ResponsesRequestSchema.parse(request.body);
      const messages = responsesInputToChatMessages(body);
      if (!messages.length) {
        reply.code(400);
        return {
          error: {
            message: 'Responses request must contain text input',
            type: 'invalid_request'
          }
        };
      }

      const codingToolHeader = request.headers['x-modelmule-tool'];
      const codingTool = Array.isArray(codingToolHeader) ? codingToolHeader[0] : codingToolHeader;
      const effectiveCodingTool = codingTool ?? 'codex';
      const excludedProviderIds = [findCodingAi(effectiveCodingTool)?.defaultProviderId].filter((providerId): providerId is string => Boolean(providerId));
      const routed = await service.chat({
        model: codexCompatibleModel(body.model, Boolean(body.tools?.length)),
        messages,
        taskType: 'coding',
        tools: body.tools,
        toolChoice: body.tool_choice,
        parallelToolCalls: body.parallel_tool_calls,
        metadata: {
          ...(body.metadata ?? {}),
          codingTool: effectiveCodingTool,
          excludeProviderIds: excludedProviderIds
        }
      });

      const response = toResponsesApiResponse({
        id: routed.response.id,
        model: routed.response.model,
        content: routed.response.content,
        toolCalls: routed.response.toolCalls,
        promptTokens: routed.response.usage.promptTokens,
        completionTokens: routed.response.usage.completionTokens,
        usedProvider: routed.usedProvider,
        fallbackChain: routed.fallbackChain,
        routingProfileId: routed.routingProfileId,
        codingTool: routed.codingTool
      });

      if (body.stream) {
        sendResponsesStream(reply, response);
        return reply;
      }

      return response;
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
