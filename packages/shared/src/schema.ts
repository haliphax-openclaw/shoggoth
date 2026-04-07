import { z } from 'zod';

/**
 * Schema for a model definition within a provider
 */
export const providerModelSchema = z.object({
  name: z.string().min(1, 'Model name cannot be empty'),
  contextWindowTokens: z.number().int().positive('Context window must be a positive integer'),
  thinkingFormat: z.enum(['xml', 'json']).optional(),
}).strict();

export type ProviderModel = z.infer<typeof providerModelSchema>;

/**
 * Schema for retry configuration
 */
export const modelsRetrySchema = z.object({
  maxAttempts: z.number().int().positive('maxAttempts must be positive'),
  initialDelayMs: z.number().nonnegative('initialDelayMs must be non-negative').optional(),
  maxDelayMs: z.number().nonnegative('maxDelayMs must be non-negative').optional(),
  backoffMultiplier: z.number().positive('backoffMultiplier must be positive').optional(),
}).strict().refine(
  (data) => {
    if (data.initialDelayMs !== undefined && data.maxDelayMs !== undefined) {
      return data.initialDelayMs <= data.maxDelayMs;
    }
    return true;
  },
  { message: 'initialDelayMs must be less than or equal to maxDelayMs' }
);

export type ModelsRetry = z.infer<typeof modelsRetrySchema>;

/**
 * Schema for a provider definition
 */
export const providerSchema = z.object({
  id: z.string().min(1, 'Provider id cannot be empty'),
  kind: z.string().min(1, 'Provider kind cannot be empty'),
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  basicAuth: z.object({
    username: z.string(),
    password: z.string(),
  }).optional(),
  customHeaders: z.record(z.string()).optional(),
  models: z.array(providerModelSchema),
  retryMaxAttempts: z.number().int().nonnegative('retryMaxAttempts must be non-negative').optional(),
  retryInitialDelayMs: z.number().nonnegative('retryInitialDelayMs must be non-negative').optional(),
  retryMaxDelayMs: z.number().nonnegative('retryMaxDelayMs must be non-negative').optional(),
  retryBackoffMultiplier: z.number().positive('retryBackoffMultiplier must be positive').optional(),
  failureThresholdCount: z.number().int().nonnegative('failureThresholdCount must be non-negative').optional(),
  failureThresholdWindowMs: z.number().int().nonnegative('failureThresholdWindowMs must be non-negative').optional(),
  failureRecoveryDelayMs: z.number().int().nonnegative('failureRecoveryDelayMs must be non-negative').optional(),
}).strict();

export type Provider = z.infer<typeof providerSchema>;

/**
 * Schema for a failover chain entry
 * Can be either a string reference "providerId/modelName" or an object with a ref field
 */
export const failoverChainEntrySchema = z.union([
  z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid ref format. Expected "providerId/modelName"'),
  z.object({
    ref: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid ref format. Expected "providerId/modelName"'),
  }),
]);

export type FailoverChainEntry = z.infer<typeof failoverChainEntrySchema>;
