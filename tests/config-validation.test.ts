import { describe, expect, it } from 'vitest';
import { ModelMuleConfigSchema, defaultConfig } from '@modelmule/config';

describe('config validation', () => {
  it('accepts default config', () => {
    expect(() => ModelMuleConfigSchema.parse(defaultConfig())).not.toThrow();
  });

  it('rejects unsupported provider type', () => {
    const invalid = {
      ...defaultConfig(),
      providers: {
        bad: {
          type: 'unsupported'
        }
      }
    };

    expect(() => ModelMuleConfigSchema.parse(invalid)).toThrow();
  });
});
