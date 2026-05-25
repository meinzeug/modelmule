import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { z } from 'zod';

dotenv.config();

export const TaskTypeSchema = z.enum([
  'coding',
  'refactor',
  'debugging',
  'planning',
  'cheap-chat',
  'long-context',
  'local-private',
  'premium-reasoning'
]);

export type TaskType = z.infer<typeof TaskTypeSchema>;

const ProviderTypeSchema = z.enum([
  'openrouter',
  'ollama',
  'openai_compatible',
  'anthropic',
  'shell_command'
]);

const ProviderSchema = z.object({
  type: ProviderTypeSchema,
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  dailyRequestLimit: z.number().int().positive().optional(),
  dailyBudgetUsd: z.number().nonnegative().optional(),
  priority: z.number().int().min(0).max(100).default(50),
  models: z.array(z.string()).default([]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  isLocal: z.boolean().optional()
});

const RoutingTaskSchema = z.object({
  prefer: z.array(z.string()).default([])
});

const RoutingSchema = z.object({
  defaultMode: z.enum(['cheapest', 'balanced', 'premium', 'local-only', 'coding-max', 'free-first']).default('balanced'),
  privacyMode: z.boolean().default(false),
  tasks: z.record(TaskTypeSchema, RoutingTaskSchema).partial().default({})
});

export const ModelMuleConfigSchema = z.object({
  providers: z.record(z.string(), ProviderSchema),
  routing: RoutingSchema.default({ defaultMode: 'balanced', privacyMode: false, tasks: {} })
});

export type ProviderConfig = z.infer<typeof ProviderSchema>;
export type ProviderType = z.infer<typeof ProviderTypeSchema>;
export type RoutingConfig = z.infer<typeof RoutingSchema>;
export type ModelMuleConfig = z.infer<typeof ModelMuleConfigSchema>;

export const DEFAULT_CONFIG_PATH = join(homedir(), '.modelmule', 'config.yaml');
export const DEFAULT_DB_PATH = join(homedir(), '.modelmule', 'modelmule.db');

export const defaultConfig = (): ModelMuleConfig => ({
  providers: {
    openrouter_main: {
      type: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      dailyRequestLimit: 1000,
      dailyBudgetUsd: 2,
      priority: 80,
      models: ['openrouter/auto']
    },
    ollama_local: {
      type: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      priority: 60,
      models: ['llama3.1:8b'],
      isLocal: true
    }
  },
  routing: {
    defaultMode: 'balanced',
    privacyMode: false,
    tasks: {
      coding: { prefer: ['openrouter_main', 'ollama_local'] },
      'cheap-chat': { prefer: ['openrouter_main', 'ollama_local'] },
      'local-private': { prefer: ['ollama_local'] }
    }
  }
});

export function resolveConfigPath(configPath?: string): string {
  return configPath ?? process.env.MODELMULE_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

export function ensureConfigDir(configPath: string): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(configPath?: string): ModelMuleConfig {
  const path = resolveConfigPath(configPath);
  if (!existsSync(path)) {
    return defaultConfig();
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = YAML.parse(raw);
  return ModelMuleConfigSchema.parse(parsed);
}

export function saveConfig(config: ModelMuleConfig, configPath?: string): string {
  const path = resolveConfigPath(configPath);
  ensureConfigDir(path);
  const content = YAML.stringify(ModelMuleConfigSchema.parse(config));
  writeFileSync(path, content, 'utf8');
  return path;
}

export function initConfig(configPath?: string): { path: string; created: boolean } {
  const path = resolveConfigPath(configPath);
  if (existsSync(path)) {
    return { path, created: false };
  }
  saveConfig(defaultConfig(), path);
  return { path, created: true };
}
