import { describe, it, expect } from "vitest";
import { buildWorkflowToolDescriptor } from "../src/tool-descriptor.js";

// ---------------------------------------------------------------------------
// Tool descriptor — response_schema in task item properties
// ---------------------------------------------------------------------------

describe("workflow tool descriptor response_schema", () => {
  it("includes response_schema in the task item properties", () => {
    const descriptor = buildWorkflowToolDescriptor();
    const schema = descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const tasks = properties.tasks as Record<string, unknown>;
    const items = tasks.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;

    expect(itemProps).toHaveProperty("response_schema");
  });

  it("response_schema has type 'object'", () => {
    const descriptor = buildWorkflowToolDescriptor();
    const schema = descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const tasks = properties.tasks as Record<string, unknown>;
    const items = tasks.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const responseSchema = itemProps.response_schema as Record<string, unknown>;

    expect(responseSchema.type).toBe("object");
  });

  it("response_schema has a 'schema' property of type 'object'", () => {
    const descriptor = buildWorkflowToolDescriptor();
    const schema = descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const tasks = properties.tasks as Record<string, unknown>;
    const items = tasks.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const responseSchema = itemProps.response_schema as Record<string, unknown>;
    const rsProps = responseSchema.properties as Record<string, unknown>;
    const schemaProp = rsProps.schema as Record<string, unknown>;

    expect(schemaProp).toBeDefined();
    expect(schemaProp.type).toBe("object");
  });

  it("response_schema requires the 'schema' field", () => {
    const descriptor = buildWorkflowToolDescriptor();
    const schema = descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const tasks = properties.tasks as Record<string, unknown>;
    const items = tasks.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const responseSchema = itemProps.response_schema as Record<string, unknown>;

    expect(responseSchema.required).toContain("schema");
  });
});
