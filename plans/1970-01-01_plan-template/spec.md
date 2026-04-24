# Specification

> Type signatures, interfaces, schemas, and code examples that define the contract for this plan. Remove instructional blockquotes as you fill in each section.

## Interfaces

> Define the key types and interfaces introduced or modified by this plan.

```ts
interface ExampleConfig {
  /** Whether the feature is enabled. */
  enabled: boolean;
  /** Maximum retry attempts before giving up. */
  maxRetries: number;
}
```

## API / Function Signatures

> Document public-facing functions, methods, or endpoints with their signatures and brief descriptions.

```ts
/**
 * Process an incoming request using the new pipeline.
 * @param input - Raw input payload.
 * @param config - Feature configuration.
 * @returns Processed result or throws on validation failure.
 */
function processRequest(input: RawPayload, config: ExampleConfig): Promise<Result>;
```

## Data Structures / Schemas

> Schemas for any new or modified data (database records, config files, message formats, etc.).

```jsonc
{
  "id": "string", // Unique identifier
  "status": "string", // "pending" | "active" | "done"
  "createdAt": "string", // ISO 8601 timestamp
}
```

## Code Examples

> Short, concrete usage examples that illustrate how the spec comes together.

```ts
const config: ExampleConfig = { enabled: true, maxRetries: 3 };
const result = await processRequest(rawPayload, config);
```
