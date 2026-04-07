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
  maxRetries: z.number().int().nonnegative('maxRetries must be non-negative'),
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
 * Schema for failure configuration
 */
export const failureConfigSchema = z.object({
  markDownAfterFailures: z.number().int().positive('markDownAfterFailures must be positive'),
  recoveryCheckIntervalMs: z.number().int().positive('recoveryCheckIntervalMs must be positive'),
}).strict();

export type FailureConfig = z.infer<typeof failureConfigSchema>;

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
  retryConfig: modelsRetrySchema.optional(),
  failureConfig: failureConfigSchema.optional(),
}).strict();

export type Provider = z.infer<typeof providerSchema>;

/**
 * Schema for a failover chain entry
 * Can be either a string reference "providerId/modelName" or an object with a ref field
 */
export const failoverChainEntrySchema = z.union([
  z.string().regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid ref format. Expected "providerId/modelName"'),
  z.object({
    ref: z.string().regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid ref format. Expected "providerId/modelName"'),
  }),
]);

export type FailoverChainEntry = z.infer<typeof failoverChainEntrySchema>;
