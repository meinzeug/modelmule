import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

export const RoutingModeSchema = z.enum(['cheapest', 'balanced', 'premium', 'local-only', 'coding-max', 'free-first']);

export const ProviderTypeSchema = z.enum([
  'openrouter',
  'ollama',
  'openai_compatible',
  'anthropic',
  'shell_command'
]);

export const ProviderTemplateTypeSchema = z.enum([
  'openrouter',
  'ollama',
  'openai_compatible',
  'anthropic',
  'shell_command',
  'codex_cli',
  'claude_cli'
]);

export const ProviderConfigSchema = z.object({
  type: ProviderTypeSchema,
  enabled: z.boolean().default(true),
  displayName: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  dailyRequestLimit: z.number().int().positive().optional(),
  dailyBudgetUsd: z.number().nonnegative().optional(),
  priority: z.number().int().min(0).max(100).default(50),
  models: z.array(z.string()).default([]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  isLocal: z.boolean().optional()
});

export const ModelCapabilityTagSchema = z.enum([
  'free',
  'paid',
  'local',
  'fast',
  'strong',
  'cheap',
  'coding',
  'reasoning',
  'experimental'
]);

export const ModelCatalogEntrySchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  enabled: z.boolean().default(true),
  tags: z.array(ModelCapabilityTagSchema).default([]),
  notes: z.string().optional()
});

export const RoutingTaskConfigSchema = z.object({
  prefer: z.array(z.string()).default([])
});

export const RoutingConfigSchema = z.object({
  defaultMode: RoutingModeSchema.default('balanced'),
  privacyMode: z.boolean().default(false),
  tasks: z.record(z.string(), RoutingTaskConfigSchema).default({})
});

export const RoutingProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  mode: RoutingModeSchema.default('balanced'),
  providerOrder: z.array(z.string()).default([]),
  modelPreferences: z.record(z.array(z.string())).default({}),
  allowPaid: z.boolean().default(true),
  localOnly: z.boolean().default(false),
  maxCostUsdPerRequest: z.number().nonnegative().optional()
});

export const CodingAiToolConfigSchema = z.object({
  enabled: z.boolean().default(true),
  routingProfileId: z.string().optional(),
  providerId: z.string().optional(),
  notes: z.string().optional()
});

export const CURRENT_CONFIG_SCHEMA_VERSION = 1;

export const ModelMuleConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(CURRENT_CONFIG_SCHEMA_VERSION),
  providers: z.record(z.string(), ProviderConfigSchema),
  models: z.record(z.string(), ModelCatalogEntrySchema).default({}),
  routing: RoutingConfigSchema.default({ defaultMode: 'balanced', privacyMode: false, tasks: {} }),
  routingProfiles: z.record(z.string(), RoutingProfileSchema).default({}),
  codingAiTools: z.record(z.string(), CodingAiToolConfigSchema).default({})
});

export const ProviderProfileSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  name: z.string().min(1).default('modelmule-provider-profile'),
  createdAt: z.string().default(() => new Date().toISOString()),
  providers: z.record(z.string(), ProviderConfigSchema),
  routing: RoutingConfigSchema.optional()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;
export type ProviderType = z.infer<typeof ProviderTypeSchema>;
export type ProviderTemplateType = z.infer<typeof ProviderTemplateTypeSchema>;
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type RoutingProfile = z.infer<typeof RoutingProfileSchema>;
export type ModelMuleConfig = z.infer<typeof ModelMuleConfigSchema>;
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;

export const DEFAULT_CONFIG_PATH = join(homedir(), '.modelmule', 'config.yaml');
export const DEFAULT_DB_PATH = join(homedir(), '.modelmule', 'modelmule.db');

export interface ConfigMigrationStatus {
  currentVersion: number;
  latestVersion: number;
  needsMigration: boolean;
}

export interface ConfigBackup {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export function providerTemplate(type: ProviderTemplateType): ProviderConfig {
  switch (type) {
    case 'openrouter':
      return {
        type,
        enabled: true,
        apiKeyEnv: 'OPENROUTER_API_KEY',
        priority: 70,
        models: ['openrouter/auto']
      };
    case 'ollama':
      return {
        type,
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434',
        priority: 60,
        models: ['llama3.1:8b'],
        isLocal: true
      };
    case 'openai_compatible':
      return {
        type,
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKeyEnv: 'OPENAI_API_KEY',
        priority: 75,
        models: ['gpt-4.1-mini']
      };
    case 'anthropic':
      return {
        type,
        enabled: true,
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        priority: 75,
        models: ['claude-3-5-sonnet-latest']
      };
    case 'shell_command':
      return {
        type,
        enabled: true,
        command: '/bin/cat',
        args: [],
        timeoutMs: 120_000,
        priority: 40,
        models: ['shell-command-model'],
        isLocal: true
      };
    case 'codex_cli':
      return {
        type: 'shell_command',
        enabled: true,
        command: 'codex',
        args: ['exec', '-'],
        timeoutMs: 600_000,
        priority: 65,
        models: ['codex-cli'],
        isLocal: true
      };
    case 'claude_cli':
      return {
        type: 'shell_command',
        enabled: true,
        command: 'claude',
        args: ['-p'],
        timeoutMs: 600_000,
        priority: 65,
        models: ['claude-cli'],
        isLocal: true
      };
  }
}

export const defaultConfig = (): ModelMuleConfig => ({
  schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
  providers: {
    openrouter_main: {
      type: 'openrouter',
      enabled: true,
      displayName: 'OpenRouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      dailyRequestLimit: 1000,
      dailyBudgetUsd: 2,
      priority: 80,
      models: ['openrouter/auto']
    },
    ollama_local: {
      type: 'ollama',
      enabled: true,
      displayName: 'Ollama lokal',
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
  },
  models: {
    'openrouter_main:openrouter/auto': {
      providerId: 'openrouter_main',
      model: 'openrouter/auto',
      enabled: true,
      tags: ['coding', 'cheap']
    },
    'openrouter_main:openrouter/free': {
      providerId: 'openrouter_main',
      model: 'openrouter/free',
      enabled: true,
      tags: ['free', 'cheap', 'coding']
    },
    'ollama_local:llama3.1:8b': {
      providerId: 'ollama_local',
      model: 'llama3.1:8b',
      enabled: true,
      tags: ['local', 'free', 'coding']
    }
  },
  routingProfiles: {
    free_first: {
      name: 'Free First',
      description: 'Kostenlose und lokale Modelle zuerst, danach gunstige Cloud-Provider.',
      mode: 'free-first',
      providerOrder: ['openrouter_main', 'ollama_local'],
      modelPreferences: {
        openrouter_main: ['openrouter/free', 'openrouter/auto'],
        ollama_local: ['llama3.1:8b']
      },
      allowPaid: true,
      localOnly: false
    },
    only_free: {
      name: 'Nur kostenlos',
      description: 'Nur lokale oder als kostenlos markierte Modelle.',
      mode: 'free-first',
      providerOrder: ['ollama_local', 'openrouter_main'],
      modelPreferences: {
        ollama_local: ['llama3.1:8b'],
        openrouter_main: ['openrouter/free']
      },
      allowPaid: false,
      localOnly: false
    },
    best_quality: {
      name: 'Beste Qualitat',
      description: 'Starkere Modelle bevorzugen, Kosten sind zweitrangig.',
      mode: 'premium',
      providerOrder: ['openrouter_main', 'ollama_local'],
      modelPreferences: {
        openrouter_main: ['openrouter/auto']
      },
      allowPaid: true,
      localOnly: false
    }
  },
  codingAiTools: {
    codex: { enabled: true, routingProfileId: 'free_first' },
    opencode: { enabled: true, routingProfileId: 'only_free' },
    aider: { enabled: true, routingProfileId: 'free_first' },
    claude_code: { enabled: true, routingProfileId: 'best_quality' }
  }
});

export function configMigrationStatus(config: ModelMuleConfig): ConfigMigrationStatus {
  return {
    currentVersion: config.schemaVersion,
    latestVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    needsMigration: config.schemaVersion < CURRENT_CONFIG_SCHEMA_VERSION
  };
}

export function exportProviderProfile(config: ModelMuleConfig, providerIds?: string[], name = 'modelmule-provider-profile'): ProviderProfile {
  const selected = providerIds && providerIds.length > 0 ? providerIds : Object.keys(config.providers);
  const providers = Object.fromEntries(
    selected
      .filter((providerId) => config.providers[providerId])
      .map((providerId) => [providerId, config.providers[providerId]])
  );

  return ProviderProfileSchema.parse({
    schemaVersion: 1,
    name,
    createdAt: new Date().toISOString(),
    providers,
    routing: config.routing
  });
}

export function importProviderProfile(
  config: ModelMuleConfig,
  profile: ProviderProfile,
  options: { replace?: boolean } = {}
): ModelMuleConfig {
  const parsedProfile = ProviderProfileSchema.parse(profile);
  return ModelMuleConfigSchema.parse({
    ...config,
    providers: options.replace
      ? parsedProfile.providers
      : {
          ...config.providers,
          ...parsedProfile.providers
        },
    routing: parsedProfile.routing ?? config.routing
  });
}

export function resolveConfigPath(configPath?: string): string {
  return configPath ?? process.env.MODELMULE_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

export function ensureConfigDir(configPath: string): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function resolveConfigBackupDir(configPath?: string): string {
  return join(dirname(resolveConfigPath(configPath)), 'backups');
}

function backupName(date = new Date()): string {
  return `config.${date.toISOString().replace(/[:.]/g, '-')}.yaml`;
}

function toBackup(name: string, path: string): ConfigBackup {
  const stat = statSync(path);
  return {
    name,
    path,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size
  };
}

export function createConfigBackup(configPath?: string): ConfigBackup | undefined {
  const path = resolveConfigPath(configPath);
  if (!existsSync(path)) {
    return undefined;
  }

  const dir = resolveConfigBackupDir(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const name = backupName();
  const backupPath = join(dir, name);
  copyFileSync(path, backupPath);
  return toBackup(name, backupPath);
}

export function listConfigBackups(configPath?: string): ConfigBackup[] {
  const dir = resolveConfigBackupDir(configPath);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => /^config\.[A-Za-z0-9_.-]+\.yaml$/.test(name))
    .map((name) => toBackup(name, join(dir, name)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreConfigBackup(name: string, configPath?: string): string {
  if (!/^config\.[A-Za-z0-9_.-]+\.yaml$/.test(name)) {
    throw new Error('Invalid backup name');
  }

  const path = resolveConfigPath(configPath);
  const backupPath = join(resolveConfigBackupDir(configPath), name);
  if (!existsSync(backupPath)) {
    throw new Error(`Config backup '${name}' does not exist`);
  }

  createConfigBackup(configPath);
  ensureConfigDir(path);
  copyFileSync(backupPath, path);
  return path;
}

export function loadConfig(configPath?: string): ModelMuleConfig {
  const path = resolveConfigPath(configPath);
  if (!existsSync(path)) {
    return defaultConfig();
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = YAML.parse(raw);
  return normalizeInlineSecrets(applyRuntimeDefaults(ModelMuleConfigSchema.parse(parsed)));
}

function applyRuntimeDefaults(config: ModelMuleConfig): ModelMuleConfig {
  const defaults = defaultConfig();
  return ModelMuleConfigSchema.parse({
    ...config,
    models: Object.keys(config.models ?? {}).length > 0 ? config.models : defaults.models,
    routingProfiles: Object.keys(config.routingProfiles ?? {}).length > 0 ? config.routingProfiles : defaults.routingProfiles,
    codingAiTools: Object.keys(config.codingAiTools ?? {}).length > 0 ? config.codingAiTools : defaults.codingAiTools
  });
}

function looksLikeInlineSecret(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(sk-|sk_|or-|eyJ|AIza|xai-|gsk_|mistral-|deepseek-)/i.test(value) || value.length > 48;
}

function normalizeInlineSecrets(config: ModelMuleConfig): ModelMuleConfig {
  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([providerId, provider]) => {
      if (!looksLikeInlineSecret(provider.apiKeyEnv)) {
        return [providerId, provider];
      }

      const envName = `MODELMULE_${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
      process.env[envName] = provider.apiKeyEnv;
      return [
        providerId,
        {
          ...provider,
          apiKeyEnv: envName
        }
      ];
    })
  );

  return ModelMuleConfigSchema.parse({
    ...config,
    providers
  });
}

export function saveConfig(config: ModelMuleConfig, configPath?: string, options: { backup?: boolean } = {}): string {
  const path = resolveConfigPath(configPath);
  ensureConfigDir(path);
  if (options.backup) {
    createConfigBackup(configPath);
  }
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
