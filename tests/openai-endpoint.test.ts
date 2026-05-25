import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { saveConfig, type ModelMuleConfig } from '@modelmule/config';
import { buildServer } from '../apps/server/src/app.js';

const tempDir = mkdtempSync(join(tmpdir(), 'modelmule-test-'));
const configPath = join(tempDir, 'config.yaml');
const dbPath = join(tempDir, 'usage.db');

const testConfig: ModelMuleConfig = {
  providers: {
    shell_local: {
      type: 'shell_command',
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
  }
};

saveConfig(testConfig, configPath);

const setup = await buildServer({ configPath, dbPath });

afterAll(async () => {
  await setup.app.close();
});

describe('openai compatible endpoint', () => {
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
});
