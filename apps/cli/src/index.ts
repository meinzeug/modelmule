#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { buildServer } from '@modelmule/server';
import {
  defaultConfig,
  exportProviderProfile,
  importProviderProfile,
  initConfig,
  loadConfig,
  providerTemplate,
  ProviderProfileSchema,
  ProviderTemplateTypeSchema,
  resolveConfigPath,
  saveConfig,
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
      ...(process.env.MODELMULE_API_KEY ? { 'x-modelmule-api-key': process.env.MODELMULE_API_KEY } : {}),
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

function addProviderTemplate(rawType: string): void {
  const type = ProviderTemplateTypeSchema.parse(rawType);
  const config = loadConfig();
  const id = `${type}_new`;
  config.providers[id] = providerTemplate(type);

  const path = saveConfig(config, undefined, { backup: true });
  console.log(`Provider template '${id}' added in ${path}`);
}

const program = new Command();
program.name('modelmule').description('Local AI router for coding tools').version('0.6.0');

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
  .argument('<type>', 'openrouter | ollama | openai_compatible | anthropic | shell_command | codex_cli | claude_cli')
  .action((type: string) => {
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

const profilesCmd = program.command('profiles').description('Provider profile import/export');
profilesCmd
  .command('export')
  .description('Export provider profile JSON')
  .argument('[file]', 'Output file, defaults to stdout')
  .option('--providers <ids>', 'Comma-separated provider ids to export')
  .option('--name <name>', 'Profile name', 'modelmule-provider-profile')
  .action((file: string | undefined, options: { providers?: string; name: string }) => {
    const config = loadConfig();
    const providerIds = options.providers
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const profile = exportProviderProfile(config, providerIds, options.name);
    const content = `${JSON.stringify(profile, null, 2)}\n`;
    if (file) {
      writeFileSync(file, content, 'utf8');
      console.log(`Provider profile exported: ${file}`);
      return;
    }
    console.log(content.trimEnd());
  });

profilesCmd
  .command('import')
  .description('Import provider profile JSON')
  .argument('<file>', 'Profile JSON file')
  .option('--replace', 'Replace existing providers instead of merging')
  .action((file: string, options: { replace?: boolean }) => {
    const raw = readFileSync(file, 'utf8');
    const profile = ProviderProfileSchema.parse(JSON.parse(raw));
    const nextConfig = importProviderProfile(loadConfig(), profile, { replace: Boolean(options.replace) });
    const path = saveConfig(nextConfig, undefined, { backup: true });
    console.log(`Provider profile imported into ${path}`);
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
  .argument('[taskType]', 'Task type to inspect, e.g. coding or local-private')
  .action(async (taskType = 'coding') => {
    const payload = await callLocal('/route/test', {
      method: 'POST',
      body: JSON.stringify({
        taskType
      })
    });
    printJson(payload);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
