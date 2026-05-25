import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { saveConfig, type ModelMuleConfig } from '@modelmule/config';
import { buildServer } from '../apps/server/src/app.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not bind test server');
  }
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

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
    expect(response.body).toContain('Provider verbinden');
    expect(response.body).toContain('Free First aktivieren');
    expect(response.body).toContain('Nur kostenlose Modelle nutzen');
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

  it('returns OpenAI style model list for Codex discovery', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/v1/models?client_version=0.133.0'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.object).toBe('list');
    expect(body.models[0]).toMatchObject({
      id: 'shell-model',
      slug: 'shell-model',
      display_name: 'shell-model',
      supported_reasoning_levels: [],
      shell_type: 'default',
      visibility: 'list',
      supported_in_api: true,
      priority: 0,
      object: 'model',
      created: 0,
      owned_by: 'shell_local'
    });
    expect(body.models[0]).toMatchObject({
      base_instructions: expect.any(String),
      description: null,
      default_reasoning_level: null,
      additional_speed_tiers: [],
      service_tiers: [],
      availability_nux: null,
      upgrade: null,
      model_messages: null,
      supports_reasoning_summaries: false,
      default_reasoning_summary: 'auto',
      support_verbosity: false,
      default_verbosity: null,
      apply_patch_tool_type: null,
      web_search_tool_type: 'text',
      truncation_policy: {
        mode: 'bytes',
        limit: 10000
      },
      supports_parallel_tool_calls: false,
      supports_image_detail_original: false,
      context_window: 272000,
      max_context_window: 272000,
      auto_compact_token_limit: null,
      effective_context_window_percent: 95,
      experimental_supported_tools: [],
      input_modalities: ['text'],
      supports_search_tool: false
    });
    expect(body.data[0]).toMatchObject({
      id: 'shell-model',
      slug: 'shell-model',
      display_name: 'shell-model',
      supported_reasoning_levels: [],
      shell_type: 'default',
      visibility: 'list',
      supported_in_api: true,
      priority: 0,
      object: 'model',
      created: 0,
      owned_by: 'shell_local'
    });
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

  it('streams Responses API events through response.completed for Codex', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'openrouter/auto',
        stream: true,
        input: 'hello streaming codex'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: response.output_text.delta');
    expect(response.body).toContain('event: response.completed');
    expect(response.body).toContain('hello streaming codex');
  });

  it('forwards Codex tools and returns Responses function calls', async () => {
    let capturedBody: any;
    const upstream = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += String(chunk);
      });
      request.on('end', () => {
        capturedBody = JSON.parse(body);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          id: 'chatcmpl_tool',
          model: 'tool-model',
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_exec_1',
                    type: 'function',
                    function: {
                      name: 'exec_command',
                      arguments: '{"cmd":"echo hi"}'
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
            total_tokens: 5
          }
        }));
      });
    });
    const port = await listen(upstream);
    const toolTempDir = mkdtempSync(join(tmpdir(), 'modelmule-tool-test-'));
    const toolConfigPath = join(toolTempDir, 'config.yaml');
    const toolDbPath = join(toolTempDir, 'usage.db');
    saveConfig({
      ...testConfig,
      providers: {
        tool_upstream: {
          type: 'openai_compatible',
          enabled: true,
          baseUrl: `http://127.0.0.1:${port}/v1`,
          priority: 100,
          models: ['tool-model']
        }
      },
      routing: {
        ...testConfig.routing,
        tasks: {
          coding: { prefer: ['tool_upstream'] }
        }
      },
      codingAiTools: {
        codex: { enabled: true }
      }
    }, toolConfigPath);
    const toolSetup = await buildServer({ configPath: toolConfigPath, dbPath: toolDbPath, codexConfigPath: join(toolTempDir, 'codex.toml') });

    try {
      const response = await toolSetup.app.inject({
        method: 'POST',
        url: '/v1/responses',
        payload: {
          model: 'tool-model',
          input: 'create a file',
          tool_choice: 'auto',
          tools: [
            {
              type: 'function',
              name: 'exec_command',
              description: 'Runs a command',
              strict: false,
              parameters: {
                type: 'object',
                properties: {
                  cmd: { type: 'string' }
                },
                required: ['cmd'],
                additionalProperties: false
              }
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(capturedBody.tool_choice).toBe('auto');
      expect(capturedBody.tools[0]).toMatchObject({
        type: 'function',
        function: {
          name: 'exec_command',
          parameters: {
            required: ['cmd']
          }
        }
      });
      const body = response.json();
      expect(body.output[0]).toMatchObject({
        type: 'function_call',
        name: 'exec_command',
        arguments: '{"cmd":"echo hi"}',
        call_id: 'call_exec_1'
      });
      expect(body.output_text).toBe('');
    } finally {
      await toolSetup.app.close();
      await closeServer(upstream);
    }
  });

  it('falls back across OpenRouter free tool models when one is rate limited', async () => {
    const requestedModels: string[] = [];
    const upstream = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += String(chunk);
      });
      request.on('end', () => {
        const parsed = JSON.parse(body);
        requestedModels.push(parsed.model);
        response.setHeader('content-type', 'application/json');
        if (requestedModels.length === 1) {
          response.statusCode = 429;
          response.end(JSON.stringify({ error: { message: 'rate limited' } }));
          return;
        }
        response.end(JSON.stringify({
          id: 'chatcmpl_fallback_tool',
          model: parsed.model,
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_fallback_1',
                    type: 'function',
                    function: {
                      name: 'exec_command',
                      arguments: '{"cmd":"echo fallback"}'
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
            total_tokens: 5
          }
        }));
      });
    });
    const port = await listen(upstream);
    const fallbackTempDir = mkdtempSync(join(tmpdir(), 'modelmule-fallback-test-'));
    const fallbackConfigPath = join(fallbackTempDir, 'config.yaml');
    const fallbackDbPath = join(fallbackTempDir, 'usage.db');
    process.env.OPENROUTER_TEST_KEY = 'test-key';
    saveConfig({
      ...testConfig,
      providers: {
        openrouter_free: {
          type: 'openrouter',
          enabled: true,
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKeyEnv: 'OPENROUTER_TEST_KEY',
          priority: 100,
          models: ['openrouter/free']
        }
      },
      routing: {
        ...testConfig.routing,
        tasks: {
          coding: { prefer: ['openrouter_free'] }
        }
      },
      codingAiTools: {
        codex: { enabled: true }
      }
    }, fallbackConfigPath);
    const fallbackSetup = await buildServer({ configPath: fallbackConfigPath, dbPath: fallbackDbPath, codexConfigPath: join(fallbackTempDir, 'codex.toml') });

    try {
      const response = await fallbackSetup.app.inject({
        method: 'POST',
        url: '/v1/responses',
        payload: {
          model: 'qwen/qwen3-coder:free',
          input: 'create a file',
          tools: [
            {
              type: 'function',
              name: 'exec_command',
              parameters: {
                type: 'object',
                properties: {
                  cmd: { type: 'string' }
                },
                required: ['cmd'],
                additionalProperties: false
              }
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(requestedModels).toEqual(['qwen/qwen3-coder:free', 'openai/gpt-oss-120b:free']);
      expect(response.json().output[0]).toMatchObject({
        type: 'function_call',
        name: 'exec_command',
        call_id: 'call_fallback_1'
      });
    } finally {
      await fallbackSetup.app.close();
      await closeServer(upstream);
      delete process.env.OPENROUTER_TEST_KEY;
    }
  });

  it('keeps empty Codex tool outputs in follow-up model context', async () => {
    let capturedBody: any;
    const upstream = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += String(chunk);
      });
      request.on('end', () => {
        capturedBody = JSON.parse(body);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          id: 'chatcmpl_empty_tool_output',
          model: 'tool-model',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'done'
              }
            }
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 1,
            total_tokens: 4
          }
        }));
      });
    });
    const port = await listen(upstream);
    const emptyToolTempDir = mkdtempSync(join(tmpdir(), 'modelmule-empty-tool-test-'));
    const emptyToolConfigPath = join(emptyToolTempDir, 'config.yaml');
    const emptyToolDbPath = join(emptyToolTempDir, 'usage.db');
    saveConfig({
      ...testConfig,
      providers: {
        tool_upstream: {
          type: 'openai_compatible',
          enabled: true,
          baseUrl: `http://127.0.0.1:${port}/v1`,
          priority: 100,
          models: ['tool-model']
        }
      },
      routing: {
        ...testConfig.routing,
        tasks: {
          coding: { prefer: ['tool_upstream'] }
        }
      },
      codingAiTools: {
        codex: { enabled: true }
      }
    }, emptyToolConfigPath);
    const emptyToolSetup = await buildServer({ configPath: emptyToolConfigPath, dbPath: emptyToolDbPath, codexConfigPath: join(emptyToolTempDir, 'codex.toml') });

    try {
      const response = await emptyToolSetup.app.inject({
        method: 'POST',
        url: '/v1/responses',
        payload: {
          model: 'tool-model',
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'create a file' }]
            },
            {
              type: 'function_call_output',
              call_id: 'call_empty_1',
              output: ''
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(capturedBody.messages).toContainEqual({
        role: 'user',
        content: 'Tool result call_empty_1:\n(completed with no output)'
      });
    } finally {
      await emptyToolSetup.app.close();
      await closeServer(upstream);
    }
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

  it('returns user-facing provider presets for common APIs and local servers', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/provider-presets'
    });

    expect(response.statusCode).toBe(200);
    const presetIds = response.json().presets.map((preset: { id: string }) => preset.id);
    expect(presetIds).toEqual(expect.arrayContaining([
      'openrouter',
      'ollama',
      'lm_studio',
      'openai_compatible',
      'openai',
      'anthropic',
      'gemini',
      'mistral',
      'groq',
      'deepseek',
      'custom_api',
      'chatgpt_account',
      'claude_max_account'
    ]));
  });

  it('loads simplified default routing profiles for Coding-AIs', async () => {
    const response = await setup.app.inject({
      method: 'GET',
      url: '/routing/profiles'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body.profiles)).toEqual(expect.arrayContaining([
      'free_first',
      'only_free',
      'best_quality',
      'local_private',
      'coding_cheap',
      'coding_strong'
    ]));
    expect(body.assignments.codex.routingProfileId).toBeDefined();
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

  it('tests providers and reports missing API keys in friendly language', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'modelmule-provider-test-'));
    const missingKeyConfigPath = join(temp, 'config.yaml');
    saveConfig({
      ...testConfig,
      providers: {
        openrouter_missing: {
          type: 'openrouter',
          enabled: true,
          apiKeyEnv: 'MODEL_MULE_TEST_MISSING_KEY',
          priority: 80,
          models: ['openrouter/auto']
        }
      }
    }, missingKeyConfigPath);
    delete process.env.MODEL_MULE_TEST_MISSING_KEY;
    const missingKeySetup = await buildServer({ configPath: missingKeyConfigPath, dbPath: join(temp, 'usage.db'), codexConfigPath: join(temp, 'codex.toml') });

    try {
      const response = await missingKeySetup.app.inject({
        method: 'GET',
        url: '/providers/openrouter_missing/test'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ready).toBe(false);
      expect(body.message).toBe('API-Key fehlt');
    } finally {
      await missingKeySetup.app.close();
    }
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

  it('honors explicit routing profile selection in route and connection tests', async () => {
    const routeResponse = await setup.app.inject({
      method: 'POST',
      url: '/route/test',
      payload: {
        taskType: 'coding',
        routingProfileId: 'only_free',
        codingTool: 'codex'
      }
    });

    expect(routeResponse.statusCode).toBe(200);
    expect(routeResponse.json().routingProfileId).toBe('only_free');

    const runResponse = await setup.app.inject({
      method: 'POST',
      url: '/test/run',
      payload: {
        prompt: 'hello routed test',
        taskType: 'coding',
        routingProfileId: 'only_free',
        codingTool: 'codex'
      }
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toMatchObject({
      ok: true,
      provider: 'shell_local',
      model: 'shell-model',
      routingProfileId: 'only_free',
      codingTool: 'codex'
    });
  });

  it('enables and disables providers from the control panel', async () => {
    const providerId = 'toggle_me_button_test';
    const createResponse = await setup.app.inject({
      method: 'POST',
      url: '/config/provider',
      payload: {
        id: providerId,
        provider: {
          type: 'shell_command',
          enabled: true,
          command: '/bin/cat',
          priority: 10,
          models: ['toggle-test-model'],
          isLocal: true
        }
      }
    });
    expect(createResponse.statusCode).toBe(200);

    const disableResponse = await setup.app.inject({
      method: 'POST',
      url: `/config/provider/${providerId}/enabled`,
      payload: { enabled: false }
    });
    expect(disableResponse.statusCode).toBe(200);
    expect(disableResponse.json().config.providers[providerId].enabled).toBe(false);

    const enableResponse = await setup.app.inject({
      method: 'POST',
      url: `/config/provider/${providerId}/enabled`,
      payload: { enabled: true }
    });
    expect(enableResponse.statusCode).toBe(200);
    expect(enableResponse.json().config.providers[providerId].enabled).toBe(true);
  });

  it('tests Coding-AI installation status without simulating unsupported configuration', async () => {
    const response = await setup.app.inject({
      method: 'POST',
      url: '/tools/coding-ai/test',
      payload: { toolId: 'codex' }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.toolId).toBe('codex');
    expect(body.endpoint).toBe('http://127.0.0.1:43110/v1');
    expect(body.apiKeyHint).toBe('modelmule');
    expect(typeof body.installed).toBe('boolean');
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

  it('deletes providers without requiring a JSON request body', async () => {
    const providerId = 'delete_me_button_test';
    const createResponse = await setup.app.inject({
      method: 'POST',
      url: '/config/provider',
      payload: {
        id: providerId,
        provider: {
          type: 'shell_command',
          enabled: true,
          command: '/bin/cat',
          priority: 10,
          models: ['delete-test-model'],
          isLocal: true
        }
      }
    });
    expect(createResponse.statusCode).toBe(200);

    const deleteResponse = await setup.app.inject({
      method: 'DELETE',
      url: `/config/provider/${providerId}`
    });

    expect(deleteResponse.statusCode).toBe(200);
    const body = deleteResponse.json();
    expect(body.config.providers[providerId]).toBeUndefined();
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
      model: 'shell-model'
    });

    const codexConfig = readFileSync(codexConfigPath, 'utf8');
    expect(codexConfig).toContain('model_provider = "modelmule"');
    expect(codexConfig).toContain('model = "shell-model"');
    expect(codexConfig).toContain('[model_providers.modelmule]');
    expect(codexConfig).toContain('base_url = "http://127.0.0.1:43110/v1"');
    expect(codexConfig).toContain('wire_api = "responses"');

    const configResponse = await setup.app.inject({
      method: 'GET',
      url: '/config'
    });
    expect(configResponse.statusCode).toBe(200);
    expect(configResponse.json().config.routing.tasks.coding.prefer).not.toContain('codex_cli');
  });

  it('persists provider API keys across server restarts', async () => {
    const envName = 'MODELMULE_PERSIST_TEST_API_KEY';
    delete process.env[envName];
    const persistentConfigPath = join(tempDir, 'persistent-config.yaml');
    const persistentDbPath = join(tempDir, 'persistent-usage.db');
    const persistentSecretsPath = join(tempDir, 'persistent-secrets.json');
    saveConfig({
      ...testConfig,
      providers: {
        persistent_openrouter: {
          type: 'openrouter',
          enabled: true,
          apiKeyEnv: envName,
          priority: 75,
          models: ['openrouter/free']
        }
      },
      routing: {
        defaultMode: 'balanced',
        privacyMode: false,
        tasks: {
          coding: { prefer: ['persistent_openrouter'] }
        }
      }
    }, persistentConfigPath);

    const firstServer = await buildServer({ configPath: persistentConfigPath, dbPath: persistentDbPath, secretsPath: persistentSecretsPath });
    const secretResponse = await firstServer.app.inject({
      method: 'POST',
      url: '/providers/secret',
      payload: {
        id: 'persistent_openrouter',
        apiKey: 'persisted-test-key'
      }
    });

    expect(secretResponse.statusCode).toBe(200);
    expect(secretResponse.json()).not.toHaveProperty('apiKey');
    expect(readFileSync(persistentSecretsPath, 'utf8')).toContain('persisted-test-key');
    expect(statSync(persistentSecretsPath).mode & 0o777).toBe(0o600);
    await firstServer.app.close();
    delete process.env[envName];

    const secondServer = await buildServer({ configPath: persistentConfigPath, dbPath: join(tempDir, 'persistent-usage-restart.db'), secretsPath: persistentSecretsPath });
    const statusResponse = await secondServer.app.inject({
      method: 'GET',
      url: '/setup/status'
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().readyProviderIds).toContain('persistent_openrouter');
    const deleteResponse = await secondServer.app.inject({
      method: 'DELETE',
      url: '/config/provider/persistent_openrouter'
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(readFileSync(persistentSecretsPath, 'utf8')).not.toContain('persisted-test-key');
    await secondServer.app.close();
    delete process.env[envName];
  });

  it('does not route Codex Responses requests back into the Codex CLI provider', async () => {
    await setup.app.inject({
      method: 'POST',
      url: '/tools/coding-ai/connect',
      payload: {
        toolId: 'codex'
      }
    });

    const response = await setup.app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'openrouter/auto',
        input: 'make sure codex does not call itself'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.metadata.modelmule.codingTool).toBe('codex');
    expect(body.metadata.modelmule.usedProvider).not.toBe('codex_cli');
    expect(body.metadata.modelmule.fallbackChain).not.toContain('codex_cli');
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
