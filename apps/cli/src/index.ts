#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Program, Command } from 'commander';
import { buildServer } from '@modelmule/server';
import {
  DEFAULT_CONFIG_PATH,
  defaultConfig,
  initConfig,
  loadConfig,
  resolveConfigPath,
  saveConfig,
  type ProviderType
} from '@modelmule/config';

const host = process.env.MODELMULE_HOST ?? '127.0.0.1';
const port = Number(process.env.MODELMULE_PORT ?? 43110);
const baseUrl = `http://${host}:${port}`;

function endpoint(path: string) {
  return `${baseUrl}${path}`;
}

async function callLocal(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof body?.error?.message === 'string' ? body.error.message : JSON.stringify(body));
  }
  return body;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function serveAction(): Promise<void> {
  const { app } = await buildServer({
    configPath: process.env.MODELMULE_CONFIG_PATH,
    dbPath: process.env.MODELMULE_DB_PATH
  });
  await app.listen({ host, port });
  console.log(`ModelMule server listening on ${baseUrl}`);
}

function addProviderTemplate(type: ProviderType): void {
  const config = loadConfig();
  let id: string;

  switch (type) {
    case 'openrouter':
      id = 'openrouter_new';
      config.providers[id] = {
        type,
        apiKeyEnv: 'OPENROUTER_API_KEY',
        priority: 70,
        models: ['openrouter/auto']
      };
      break;
    case 'ollama':
      id = 'ollama_new';
      config.providers[id] = {
        type,
        baseUrl: 'http://127.0.0.1:11434',
        priority: 60,
        models: ['llama3.1:8b'],
        isLocal: true
      };
      break;
    default:
      throw new Error(`Unsupported provider add template: ${type}`);
  }

  const path = saveConfig(config);
  console.log(`Provider template '${id}' added in ${path}`);
}

const program = new Command();
program.name('modelmule').description('Local AI router for coding tools').version('0.1.0');

program
  .command('init')
  .description('Create ~/.modelmule/config.yaml')
  .action(() => {
    const { path, created } = initConfig();
    console.log(created ? `Config created: ${path}` : `Config already exists: ${path}`);
  });

program.command('serve').description('Start local ModelMule API server').action(async () => {
  await serveAction();
});

program
  .command('chat')
  .description('Send chat prompt to local API')
  .argument('<question>', 'User question')
  .action(async (question: string) => {
    const payload = await callLocal('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'auto',
        taskType: 'cheap-chat',
        messages: [{ role: 'user', content: question }]
      })
    });
    console.log(payload.choices?.[0]?.message?.content ?? '');
    printJson(payload.metadata?.modelmule ?? {});
  });

program
  .command('code')
  .description('Send coding task to local API')
  .argument('<prompt>', 'Coding prompt')
  .action(async (prompt: string) => {
    const payload = await callLocal('/v1/code', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    console.log(payload.output ?? '');
    printJson(payload.metadata?.modelmule ?? {});
  });

const providerCmd = program.command('providers').description('Provider management');
providerCmd
  .command('list')
  .description('List providers from config')
  .action(() => {
    const config = loadConfig();
    printJson(config.providers);
  });

providerCmd
  .command('add')
  .description('Add provider template')
  .argument('<type>', 'openrouter | ollama')
  .action((type: ProviderType) => {
    addProviderTemplate(type);
  });

providerCmd
  .command('test')
  .description('Check provider health via local server')
  .action(async () => {
    const providers = await callLocal('/providers');
    printJson(providers);
  });

const modelsCmd = program.command('models').description('Model commands');
modelsCmd
  .command('list')
  .description('List models from providers')
  .action(async () => {
    const models = await callLocal('/models');
    printJson(models);
  });

program
  .command('usage')
  .description('Show usage dashboard')
  .action(async () => {
    const usage = await callLocal('/usage');
    console.log(`Requests heute: ${usage.requestsToday}`);
    console.log(`Kosten heute (USD): ${usage.costTodayUsd}`);
    console.log('Provider-Status:');
    for (const provider of usage.providerStatus ?? []) {
      console.log(`- ${provider.providerId}: requests=${provider.requestCount}, cost=${provider.costUsd}, errors=${provider.errors}`);
    }
    console.log('Häufigste Modelle:');
    for (const model of usage.frequentModels ?? []) {
      console.log(`- ${model.model}: ${model.count}`);
    }
    console.log(`Fallbacks: ${usage.fallbacks}`);
    console.log(`Fehler: ${usage.errors}`);
  });

program
  .command('config')
  .description('Configuration commands')
  .command('edit')
  .description('Open config file in $EDITOR')
  .action(() => {
    const configPath = resolveConfigPath();
    if (!existsSync(configPath)) {
      saveConfig(defaultConfig(), configPath);
    }

    const editor = process.env.EDITOR;
    if (!editor) {
      console.log(`Set $EDITOR or edit manually: ${configPath}`);
      return;
    }

    const child = spawn(editor, [configPath], { stdio: 'inherit' });
    child.on('close', () => process.exit(0));
  });

program
  .command('route')
  .description('Routing tools')
  .command('test')
  .argument('<prompt>', 'Prompt to test route decision with real call')
  .action(async (prompt: string) => {
    const payload = await callLocal('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'coding',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    printJson(payload.metadata?.modelmule ?? {});
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
