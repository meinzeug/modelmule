import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@modelmule/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@modelmule/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@modelmule/providers': resolve(__dirname, 'packages/providers/src/index.ts'),
      '@modelmule/server': resolve(__dirname, 'apps/server/src/index.ts')
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
