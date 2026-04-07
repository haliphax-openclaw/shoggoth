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

    it('should validate a model with thinkingFormat as "json"', () => {
      const model = {
        name: 'claude-3-opus',
        contextWindowTokens: 200000,
        thinkingFormat: 'json',
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate a model with large context window', () => {
      const model = {
        name: 'claude-3-opus',
        contextWindowTokens: 1000000,
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

    it('should validate model names with hyphens and numbers', () => {
      const model = {
        name: 'gpt-4-turbo-2024-04-09',
        contextWindowTokens: 128000,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate model names with underscores', () => {
      const model = {
        name: 'claude_3_opus_20240229',
        contextWindowTokens: 200000,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });

    it('should validate model names with dots', () => {
      const model = {
        name: 'llama.2.70b',
        contextWindowTokens: 4096,
      };
      expect(() => providerModelSchema.parse(model)).not.toThrow();
    });
  });

  describe('invalid models', () => {
    it('should reject model without name', () => {
      const model = {
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model without contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with empty name', () => {
      const model = {
        name: '',
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with zero contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 0,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with negative contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: -1000,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with non-numeric contextWindowTokens', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 'large',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with invalid thinkingFormat', () => {
      const model = {
        name: 'gpt-4',
        contextWindowTokens: 8192,
        thinkingFormat: 'invalid',
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with non-string name', () => {
      const model = {
        name: 123,
        contextWindowTokens: 8192,
      };
      expect(() => providerModelSchema.parse(model)).toThrow();
    });

    it('should reject model with extra unknown fields', () => {
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
          { name: 'gpt-4-turbo', contextWindowTokens: 128000 },
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
        bearerToken: 'token-value',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with custom headers', () => {
      const provider = {
        id: 'custom',
        kind: 'custom',
        baseUrl: 'https://custom.api.com',
        customHeaders: {
          'X-API-Key': 'key-value',
          'X-Custom-Header': 'custom-value',
        },
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
        retryMaxAttempts: 3,
        retryInitialDelayMs: 1000,
        retryMaxDelayMs: 10000,
        retryBackoffMultiplier: 2,
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with failure config', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        failureThresholdCount: 5,
        failureThresholdWindowMs: 60000,
        failureRecoveryDelayMs: 30000,
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate a provider with all auth and config fields', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        customHeaders: { 'X-Custom': 'value' },
        models: [{ name: 'gpt-4', contextWindowTokens: 8192 }],
        retryMaxAttempts: 3,
        retryInitialDelayMs: 1000,
        retryMaxDelayMs: 10000,
        retryBackoffMultiplier: 2,
        failureThresholdCount: 5,
        failureThresholdWindowMs: 60000,
        failureRecoveryDelayMs: 30000,
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate provider with different kinds', () => {
      const kinds = ['openai', 'anthropic', 'custom', 'azure', 'ollama'];
      kinds.forEach((kind) => {
        const provider = {
          id: `provider-${kind}`,
          kind,
          baseUrl: 'https://api.example.com',
          models: [],
        };
        expect(() => providerSchema.parse(provider)).not.toThrow();
      });
    });

    it('should validate provider with https baseUrl', () => {
      const provider = {
        id: 'secure',
        kind: 'openai',
        baseUrl: 'https://secure.api.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate provider with http baseUrl', () => {
      const provider = {
        id: 'local',
        kind: 'ollama',
        baseUrl: 'http://localhost:11434',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });

    it('should validate provider with port in baseUrl', () => {
      const provider = {
        id: 'custom',
        kind: 'custom',
        baseUrl: 'https://api.example.com:8443/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).not.toThrow();
    });
  });

  describe('invalid providers', () => {
    it('should reject provider without id', () => {
      const provider = {
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider without kind', () => {
      const provider = {
        id: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider without baseUrl', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider without models array', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with empty id', () => {
      const provider = {
        id: '',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with empty kind', () => {
      const provider = {
        id: 'openai',
        kind: '',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with empty baseUrl', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: '',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with invalid baseUrl format', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'not-a-url',
        models: [],
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with non-array models', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: 'not-an-array',
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with invalid model in models array', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [{ name: 'gpt-4' }], // missing contextWindowTokens
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative retryMaxAttempts', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        retryMaxAttempts: -1,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative retryInitialDelayMs', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        retryInitialDelayMs: -100,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative retryMaxDelayMs', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        retryMaxDelayMs: -1000,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative retryBackoffMultiplier', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        retryBackoffMultiplier: -2,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative failureThresholdCount', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        failureThresholdCount: -5,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative failureThresholdWindowMs', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        failureThresholdWindowMs: -60000,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with negative failureRecoveryDelayMs', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        failureRecoveryDelayMs: -30000,
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with non-object customHeaders', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        customHeaders: 'not-an-object',
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });

    it('should reject provider with non-string customHeaders values', () => {
      const provider = {
        id: 'openai',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        customHeaders: { 'X-Custom': 123 },
      };
      expect(() => providerSchema.parse(provider)).toThrow();
    });
  });
});

describe('failoverChainEntrySchema', () => {
  describe('valid entries', () => {
    it('should validate a string ref with providerId/model format', () => {
      const entry = 'openai/gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with different provider and model names', () => {
      const entry = 'anthropic/claude-3-opus';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with hyphens in names', () => {
      const entry = 'azure-openai/gpt-4-turbo';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with underscores in names', () => {
      const entry = 'custom_provider/custom_model';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate a string ref with dots in names', () => {
      const entry = 'provider.v1/model.2024';
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate an object with ref field', () => {
      const entry = { ref: 'openai/gpt-4' };
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate an object with ref and additional fields', () => {
      const entry = {
        ref: 'openai/gpt-4',
        weight: 1,
        priority: 'high',
      };
      expect(() => failoverChainEntrySchema.parse(entry)).not.toThrow();
    });

    it('should validate multiple different string refs', () => {
      const refs = [
        'openai/gpt-4',
        'anthropic/claude-3-opus',
        'azure/gpt-4-turbo',
        'ollama/llama2',
      ];
      refs.forEach((ref) => {
        expect(() => failoverChainEntrySchema.parse(ref)).not.toThrow();
      });
    });

    it('should validate multiple different object refs', () => {
      const refs = [
        { ref: 'openai/gpt-4' },
        { ref: 'anthropic/claude-3-opus', weight: 2 },
        { ref: 'azure/gpt-4-turbo', priority: 'high' },
      ];
      refs.forEach((ref) => {
        expect(() => failoverChainEntrySchema.parse(ref)).not.toThrow();
      });
    });
  });

  describe('invalid entries', () => {
    it('should reject a string without slash separator', () => {
      const entry = 'openai-gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a string with empty provider id', () => {
      const entry = '/gpt-4';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a string with empty model name', () => {
      const entry = 'openai/';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject a string with multiple slashes', () => {
      const entry = 'openai/gpt-4/extra';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an empty string', () => {
      const entry = '';
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an object without ref field', () => {
      const entry = { weight: 1 };
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an object with empty ref', () => {
      const entry = { ref: '' };
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an object with invalid ref format', () => {
      const entry = { ref: 'invalid-format' };
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

    it('should reject undefined', () => {
      const entry = undefined;
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });

    it('should reject an array', () => {
      const entry = ['openai/gpt-4'];
      expect(() => failoverChainEntrySchema.parse(entry)).toThrow();
    });
  });
});

describe('modelsRetrySchema', () => {
  describe('valid retry configs', () => {
    it('should validate a minimal retry config', () => {
      const config = {
        maxAttempts: 3,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate a retry config with all fields', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with maxAttempts of 1', () => {
      const config = {
        maxAttempts: 1,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with large maxAttempts', () => {
      const config = {
        maxAttempts: 100,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with small initialDelayMs', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 100,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with large initialDelayMs', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 60000,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with small maxDelayMs', () => {
      const config = {
        maxAttempts: 3,
        maxDelayMs: 1000,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with large maxDelayMs', () => {
      const config = {
        maxAttempts: 3,
        maxDelayMs: 300000,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with backoffMultiplier of 1', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: 1,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with backoffMultiplier of 2', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: 2,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with decimal backoffMultiplier', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: 1.5,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });

    it('should validate retry config with large backoffMultiplier', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: 10,
      };
      expect(() => modelsRetrySchema.parse(config)).not.toThrow();
    });
  });

  describe('invalid retry configs', () => {
    it('should reject config without maxAttempts', () => {
      const config = {
        initialDelayMs: 1000,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with zero maxAttempts', () => {
      const config = {
        maxAttempts: 0,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with negative maxAttempts', () => {
      const config = {
        maxAttempts: -3,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with non-integer maxAttempts', () => {
      const config = {
        maxAttempts: 3.5,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with non-numeric maxAttempts', () => {
      const config = {
        maxAttempts: 'three',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with negative initialDelayMs', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: -1000,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with negative maxDelayMs', () => {
      const config = {
        maxAttempts: 3,
        maxDelayMs: -10000,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with negative backoffMultiplier', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: -2,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with zero backoffMultiplier', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: 0,
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with non-numeric initialDelayMs', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 'slow',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with non-numeric maxDelayMs', () => {
      const config = {
        maxAttempts: 3,
        maxDelayMs: 'fast',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with non-numeric backoffMultiplier', () => {
      const config = {
        maxAttempts: 3,
        backoffMultiplier: 'exponential',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });

    it('should reject config with extra unknown fields', () => {
      const config = {
        maxAttempts: 3,
        unknownField: 'value',
      };
      expect(() => modelsRetrySchema.parse(config)).toThrow();
    });
  });
});
