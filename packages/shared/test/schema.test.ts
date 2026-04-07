import { describe, it, expect } from 'vitest';
import {
  providerModelSchema,
  providerSchema,
  failoverChainEntrySchema,
  modelsRetrySchema,
} from '../src/schema';

describe('providerModelSchema', () => {
  describe('valid models', () => {
    it('should validate a minimal model with required fields', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with all fields', () => {
      const model = {
        name: 'gpt-4-turbo',
        contextWindowTokens: 128000,
        thinkingFormat: 'xml',
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with thinkingFormat as json', () => {
      const model = {
        name: 'claude-opus',
        contextWindowTokens: 200000,
        thinkingFormat: 'json',
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with large context window', () => {
      const model = {
        name: 'claude-3-opus',
        contextWindowTokens: 200000,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with small context window', () => {
      const model = {
        name: 'gpt-3.5-turbo',
        contextWindowTokens: 4096,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with numeric name', () => {
      const model = {
        name: 'model-123',
        contextWindowTokens: 16384,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with special characters in name', () => {
      const model = {
        name: 'gpt-4-turbo-2024-04-09',
        contextWindowTokens: 128000,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with underscore in name', () => {
      const model = {
        name: 'claude_3_opus',
        contextWindowTokens: 200000,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });
  });

  describe('invalid models', () => {
    it('should reject a model without name', () => {
      const model = {
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model without contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with empty name', () => {
      const model = {
        name: '',
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with negative contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: -1,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with zero contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 0,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with non-integer contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 8192.5,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with invalid thinkingFormat', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 8192,
        thinkingFormat: 'invalid',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with null name', () => {
      const model = {
        name: null,
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with null contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: null,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with string contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: '8192',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with numeric name', () => {
      const model = {
        name: 12345,
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject a model with extra unknown fields', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 8192,
        unknownField: 'value',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });
  });
});

describe('providerSchema', () => {
  describe('valid providers', () => {
    it('should validate a minimal provider with required fields', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with models', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [
          { name: 'gpt-4', contextWindowTokens: 8192 },
          { name: 'gpt-3.5-turbo', contextWindowTokens: 4096 },
        ],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with apiKey auth', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with bearer token auth', () => {
      const provider = {
        id: 'anthropic',
        kind: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        bearerToken: 'token-123',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with basic auth', () => {
      const provider = {
        id: 'custom',
        kind: 'custom',
        baseUrl: 'https://custom.example.com',
        basicAuth: { username: 'user', password: 'pass' },
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with custom headers', () => {
      const provider = {
        id: 'custom',
        kind: 'custom',
        baseUrl: 'https://custom.example.com',
        customHeaders: { 'X-Custom-Header': 'value' },
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with retry config', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with failure config', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        failureConfig: {
          markDownAfterFailures: 3,
          recoveryCheckIntervalMs: 60000,
        },
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with all auth and config fields', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        customHeaders: { 'X-Custom': 'header' },
        models: [{ name: 'gpt-4', contextWindowTokens: 8192 }],
        retryConfig: {
          maxRetries: 5,
          initialDelayMs: 500,
          maxDelayMs: 30000,
          backoffMultiplier: 1.5,
        },
        failureConfig: {
          markDownAfterFailures: 5,
          recoveryCheckIntervalMs: 120000,
        },
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with different kind values', () => {
      const kinds = ['openai', 'anthropic', 'custom', 'azure', 'ollama'];
      kinds.forEach((kind) => {
        const provider = {
          id: `provider-${kind}`,
          kind,
          baseUrl: 'https://example.com',
          models: [],
        };
        expect(() => providerSchema.parse(provider)).not.toThrow();
      });
    });

    it('should validate a provider with numeric id suffix', () => {
      const provider = {
        id: 'openai-2',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with hyphenated id', () => {
      const provider = {
        id: 'my-custom-provider',
        kind: 'custom',
        baseUrl: 'https://example.com',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with localhost baseUrl', () => {
      const provider = {
        id: 'local',
        kind: 'ollama',
        baseUrl: 'http://localhost:11434',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with port in baseUrl', () => {
      const provider = {
        id: 'custom',
        kind: 'custom',
        baseUrl: 'https://example.com:8443',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });
  });

  describe('invalid providers', () => {
    it('should reject a provider without id', () => {
      const provider = {
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider without kind', () => {
      const provider = {
        id: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider without baseUrl', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider without models array', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with empty id', () => {
      const provider = {
        id: '',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with empty kind', () => {
      const provider = {
        id: 'openai',
        kind: '',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with empty baseUrl', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: '',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with invalid baseUrl format', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'not-a-url',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with models not being an array', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: 'not-an-array',
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with invalid model in models array', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [{ name: 'gpt-4' }], // missing contextWindowTokens
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with invalid retryConfig', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        retryConfig: {
          maxRetries: -1,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with invalid failureConfig', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        failureConfig: {
          markDownAfterFailures: 0,
          recoveryCheckIntervalMs: 60000,
        },
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with null id', () => {
      const provider = {
        id: null,
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with numeric id', () => {
      const provider = {
        id: 123,
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject a provider with null models', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: null,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });
  });
});

describe('failoverChainEntrySchema', () => {
  describe('valid entries', () => {
    it('should validate a string ref with provider and model', () => {
      const entry = 'openai/gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with hyphenated provider id', () => {
      const entry = 'my-provider/gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with numeric provider id', () => {
      const entry = 'provider-1/model-1';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with complex model name', () => {
      const entry = 'openai/gpt-4-turbo-2024-04-09';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate an object ref with ref field', () => {
      const entry = { ref: 'openai/gpt-4' };
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate an object ref with additional fields', () => {
      const entry = {
        ref: 'openai/gpt-4',
        weight: 1,
      };
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate an object ref with priority field', () => {
      const entry = {
        ref: 'anthropic/claude-opus',
        priority: 1,
      };
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate multiple different string refs', () => {
      const refs = [
        'openai/gpt-4',
        'anthropic/claude-opus',
        'custom/model-1',
        'local/llama2',
      ];
      refs.forEach((ref) => {
        expect(() => failoverChainEntrySchema.parse(ref)).not.toThrow();
      });
    });

    it('should validate multiple different object refs', () => {
      const refs = [
        { ref: 'openai/gpt-4' },
        { ref: 'anthropic/claude-opus', weight: 2 },
        { ref: 'custom/model-1', priority: 1 },
      ];
      refs.forEach((ref) => {
        expect(() => failoverChainEntrySchema.parse(ref)).not.toThrow();
      });
    });
  });

  describe('invalid entries', () => {
    it('should reject a string ref without slash', () => {
      const entry = 'openai-gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a string ref with empty provider', () => {
      const entry = '/gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a string ref with empty model', () => {
      const entry = 'openai/';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a string ref with multiple slashes', () => {
      const entry = 'openai/gpt-4/extra';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an empty string ref', () => {
      const entry = '';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an object without ref field', () => {
      const entry = { weight: 1 };
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an object with null ref', () => {
      const entry = { ref: null };
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an object with empty ref', () => {
      const entry = { ref: '' };
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a number', () => {
      const entry = 123;
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject null', () => {
      const entry = null;
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an array', () => {
      const entry = ['openai/gpt-4'];
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a ref with special characters', () => {
      const entry = 'openai@/gpt-4!';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });
  });
});

describe('modelsRetrySchema', () => {
  describe('valid retry configs', () => {
    it('should validate a minimal retry config', () => {
      const config = {
        maxRetries: 3,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with all fields', () => {
      const config = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with zero maxRetries', () => {
      const config = {
        maxRetries: 0,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with large maxRetries', () => {
      const config = {
        maxRetries: 100,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with small initialDelayMs', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 100,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with large maxDelayMs', () => {
      const config = {
        maxRetries: 3,
        maxDelayMs: 300000,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with backoffMultiplier of 1', () => {
      const config = {
        maxRetries: 3,
        backoffMultiplier: 1,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with backoffMultiplier of 10', () => {
      const config = {
        maxRetries: 3,
        backoffMultiplier: 10,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with decimal backoffMultiplier', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 10000,
        backoffMultiplier: 1.5,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate multiple different retry configs', () => {
      const configs = [
        { maxRetries: 3 },
        { maxRetries: 5, initialDelayMs: 1000 },
        { maxRetries: 10, initialDelayMs: 500, maxDelayMs: 60000, backoffMultiplier: 2 },
        { maxRetries: 0, initialDelayMs: 100, maxDelayMs: 1000, backoffMultiplier: 1 },
      ];
      configs.forEach((config) => {
        expect(() => modelsRetrySchema.parse(config)).not.toThrow();
      });
    });
  });

  describe('invalid retry configs', () => {
    it('should reject a config without maxRetries', () => {
      const config = {
        initialDelayMs: 1000,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with negative maxRetries', () => {
      const config = {
        maxRetries: -1,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with non-integer maxRetries', () => {
      const config = {
        maxRetries: 3.5,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with null maxRetries', () => {
      const config = {
        maxRetries: null,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with string maxRetries', () => {
      const config = {
        maxRetries: '3',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with negative initialDelayMs', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: -1,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with negative maxDelayMs', () => {
      const config = {
        maxRetries: 3,
        maxDelayMs: -1,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with negative backoffMultiplier', () => {
      const config = {
        maxRetries: 3,
        backoffMultiplier: -1,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with zero backoffMultiplier', () => {
      const config = {
        maxRetries: 3,
        backoffMultiplier: 0,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with non-numeric initialDelayMs', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 'slow',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with non-numeric maxDelayMs', () => {
      const config = {
        maxRetries: 3,
        maxDelayMs: 'fast',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with non-numeric backoffMultiplier', () => {
      const config = {
        maxRetries: 3,
        backoffMultiplier: 'exponential',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with initialDelayMs greater than maxDelayMs', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 10000,
        maxDelayMs: 1000,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with null initialDelayMs', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: null,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with null maxDelayMs', () => {
      const config = {
        maxRetries: 3,
        maxDelayMs: null,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with null backoffMultiplier', () => {
      const config = {
        maxRetries: 3,
        backoffMultiplier: null,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject a config with extra unknown fields', () => {
      const config = {
        maxRetries: 3,
        unknownField: 'value',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });
  });
});
