import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { saveConfig, type ModelMuleConfig } from '@modelmule/config';
import { buildServer } from '../apps/server/src/app.js';

const tempDir = mkdtempSync(join(tmpdir(), 'modelmule-test-'));
const configPath = join(tempDir, 'config.yaml');
const dbPath = join(tempDir, 'usage.db');
const authDbPath = join(tempDir, 'auth-usage.db');
const codexConfigPath = join(tempDir, 'codex', 'config.toml');

const testConfig: ModelMuleConfig = {
  schemaVersion: 1,
  providers: {
    shell_local: {
      type: 'shell_command',
      enabled: true,
      command: '/bin/cat',
      priority: 90,
      models: ['shell-model'],
      isLocal: true
    }
  },
  routing: {
    defaultMode: 'balanced',
    privacyMode: false,
    tasks: {
      coding: { prefer: ['shell_local'] }
    }
  },
  models: {},
  routingProfiles: {},
  codingAiTools: {}
};

saveConfig(testConfig, configPath);

const setup = await buildServer({ configPath, dbPath, codexConfigPath });
const authSetup = await buildServer({ configPath, dbPath: authDbPath, apiKey: 'secret-token', codexConfigPath: join(tempDir, 'auth-codex', 'config.toml') });

afterAll(async () => {
  await setup.app.close();
  await authSetup.app.close();
});

describe('openai compatible endpoint', () => {
  it('serves the local dashboard', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Einfaches Setup');
    expect(response.body).toContain('Setup-Assistent');
    expect(response.body).toContain('Assistent starten');
    expect(response.body).toContain('ModelMule Schritt fuer Schritt einrichten');
    expect(response.body).toContain('Modelle verwalten');
    expect(response.body).toContain('Routing-Profile');
    expect(response.body).toContain('Coding AIs installieren und verbinden');
  });

  it('returns OpenAI style response with modelmule metadata', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        messages: [{ role: 'user', content: 'hello modelmule' }],
        taskType: 'coding'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toContain('user: hello modelmule');
    expect(body.metadata.modelmule.usedProvider).toBe('shell_local');
  });

  it('returns Responses API style output for Codex custom providers', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'openrouter/auto',
        instructions: 'You are connected through Codex.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'hello from codex'
              }
            ]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.object).toBe('response');
    expect(body.output[0].content[0]).toMatchObject({
      type: 'output_text'
    });
    expect(body.output_text).toContain('hello from codex');
    expect(body.metadata.modelmule.codingTool).toBe('codex');
  });

  it('returns model catalog entries with free/local tags', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/models/catalog'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.models[0]).toMatchObject({
      providerId: 'shell_local',
      model: 'shell-model',
      enabled: true
    });
  });

  it('updates model catalog entries', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/models/catalog/update',
      payload: {
        id: 'shell_local:shell-model',
        enabled: false
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config.models['shell_local:shell-model']).toMatchObject({
      providerId: 'shell_local',
      model: 'shell-model',
      enabled: false
    });
  });

  it('routes by coding AI routing profile metadata', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/tools/coding-ai/assign',
      payload: {
        toolId: 'codex',
        assignment: {
          enabled: true,
          routingProfileId: 'test_profile'
        }
      }
    });

    expect(response.statusCode).toBe(200);

    const profileResponse = await setup.app.inject({
      method: 'POST',
      url: '/routing/profile',
      payload: {
        id: 'test_profile',
        profile: {
          name: 'Test Profile',
          mode: 'balanced',
          providerOrder: ['shell_local'],
          modelPreferences: {},
          allowPaid: false,
          localOnly: true
        }
      }
    });

    expect(profileResponse.statusCode).toBe(200);

    const chatResponse = await setup.app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: {
        'x-modelmule-tool': 'codex'
      },
      payload: {
        messages: [{ role: 'user', content: 'hello through profile' }],
        taskType: 'coding'
      }
    });

    expect(chatResponse.statusCode).toBe(200);
    const body = chatResponse.json();
    expect(body.metadata.modelmule.routingProfileId).toBe('test_profile');
    expect(body.metadata.modelmule.codingTool).toBe('codex');
  });

  it('returns provider capability metadata', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/capabilities'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.providerTemplates).toContain('codex_cli');
    expect(body.providerTemplates).toContain('claude_cli');
    expect(body.taskTypes).toContain('coding');
    expect(body.routingModes).toContain('balanced');
  });

  it('returns system migration status', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/system/status'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config.migrations.needsMigration).toBe(false);
    expect(body.storage.migrations.needsMigration).toBe(false);
    expect(body.storage.migrations.applied[0].name).toBe('initial_schema');
  });

  it('returns provider diagnostics with local metadata', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/providers'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.providers[0]).toMatchObject({
      id: 'shell_local',
      type: 'shell_command',
      healthy: true,
      isLocal: true,
      priority: 90,
      capabilities: {
        execution: 'local-cli',
        supportsLocalExecution: true
      }
    });
    expect(typeof body.providers[0].capabilities.score).toBe('number');
  });

  it('rejects invalid chat requests with structured errors', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        messages: []
      }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.type).toBe('invalid_request');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('returns route preview without calling a provider', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/route/test',
      payload: {
        taskType: 'coding'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.taskType).toBe('coding');
    expect(body.selectedProvider).toBe('shell_local');
    expect(body.providers).toEqual([
      {
        providerId: 'shell_local',
        available: true,
        reason: 'eligible'
      }
    ]);
  });

  it('adds codex CLI as a shell command provider preset', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/config/provider',
      payload: {
        id: 'codex_local',
        type: 'codex_cli'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config.providers.codex_local).toMatchObject({
      type: 'shell_command',
      command: 'codex',
      args: ['exec', '-'],
      isLocal: true
    });
  });

  it('connects Codex CLI by writing Codex config.toml', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/tools/coding-ai/connect',
      payload: {
        toolId: 'codex'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.codexConfig).toMatchObject({
      path: codexConfigPath,
      providerId: 'modelmule',
      model: 'openrouter/auto'
    });

    const codexConfig = readFileSync(codexConfigPath, 'utf8');
    expect(codexConfig).toContain('model_provider = "modelmule"');
    expect(codexConfig).toContain('model = "openrouter/auto"');
    expect(codexConfig).toContain('[model_providers.modelmule]');
    expect(codexConfig).toContain('base_url = "http://127.0.0.1:43110/v1"');
    expect(codexConfig).toContain('wire_api = "responses"');
  });

  it('creates a config backup before server-side config writes', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/config/backups'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.backups.length).toBeGreaterThan(0);
    expect(body.backups[0].name).toMatch(/^config\..+\.yaml$/);
  });

  it('exports and imports provider profiles', async () => {
    const exportResponse = await setup.app.inject({
      method: 'GET',
      url: '/profiles/export?providers=shell_local&name=test-profile'
    });

    expect(exportResponse.statusCode).toBe(200);
    const exported = exportResponse.json();
    expect(exported.profile.name).toBe('test-profile');
    expect(exported.profile.providers.shell_local.type).toBe('shell_command');

    const importResponse = await setup.app.inject({
      method: 'POST',
      url: '/profiles/import',
      payload: {
        profile: {
          ...exported.profile,
          providers: {
            imported_shell: exported.profile.providers.shell_local
          }
        }
      }
    });

    expect(importResponse.statusCode).toBe(200);
    const imported = importResponse.json();
    expect(imported.config.providers.imported_shell.type).toBe('shell_command');
  });

  it('applies setup quickstart without returning raw secrets', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/setup/quickstart',
      payload: {
        presetId: 'openrouter',
        providerId: 'quick_openrouter',
        apiKey: 'test-openrouter-key',
        routingProfileId: 'free_first',
        codingToolId: 'codex'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.providerId).toBe('quick_openrouter');
    expect(body.config.providers.quick_openrouter.apiKeyEnv).toBe('OPENROUTER_API_KEY');
    expect(JSON.stringify(body)).not.toContain('test-openrouter-key');
    expect(body.config.codingAiTools.codex.routingProfileId).toBe('free_first');
    expect(body.codexConfig.path).toBe(codexConfigPath);
    expect(body.status.steps.some((step: { id: string; done: boolean }) => step.id === 'provider' && step.done)).toBe(true);
  });

  it('enforces optional API authentication when configured', async () => {
    const unauthorized = await authSetup.app.inject({
      method: 'GET',
      url: '/providers'
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await authSetup.app.inject({
      method: 'GET',
      url: '/providers',
      headers: {
        'x-modelmule-api-key': 'secret-token'
      }
    });
    expect(authorized.statusCode).toBe(200);
  });
});
