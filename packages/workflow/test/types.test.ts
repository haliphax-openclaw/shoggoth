import { describe, it, expect } from "vitest";
import { handleWorkflowToolCall } from "../src/tool-handler.js";
import type { AgentTaskDef } from "../src/types.js";

// ---------------------------------------------------------------------------
// AgentTaskDef — responseSchema field via tool handler parsing
// ---------------------------------------------------------------------------

describe("AgentTaskDef responseSchema", () => {
  it("toTaskDefs preserves responseSchema from task input with response_schema", async () => {
    // The tool handler's toTaskDefs should convert response_schema → responseSchema
    // on the resulting AgentTaskDef. This will fail until the implementation is added.
    const spawnedTasks: unknown[] = [];

    const mockServer = {
      start: async (tasks: AgentTaskDef[]) => {
        spawnedTasks.push(...tasks);
        return "wf-123";
      },
      get: () => undefined,
    };

    const mockControlPlane = {
      abort: async () => {},
      pause: async () => {},
      resume: async () => {},
      status: async () => ({ tasks: [], graph: new Map() }),
      list: async () => [],
      post: async () => {},
      edit: async () => {},
      retry: async () => {},
      retention: async () => ({}),
    };

    const result = await handleWorkflowToolCall(
      {
        action: "start",
        name: "test-wf",
        reply_to: "agent:test",
        graph: "1",
        tasks: [
          {
            id: 1,
            kind: "agent",
            prompt: "Analyze logs",
            response_schema: {
              schema: {
                type: "object",
                properties: {
                  total_errors: { type: "number" },
                },
                required: ["total_errors"],
              },
            },
          } as any, // response_schema isn't on TaskInput yet
        ],
      },
      {
        server: mockServer as any,
        controlPlane: mockControlPlane as any,
        stateDir: "/tmp/test-wf",
        currentDepth: 0,
        maxDepth: 3,
      },
    );

    expect(result.ok).toBe(true);
    expect(spawnedTasks).toHaveLength(1);

    const taskDef = spawnedTasks[0] as AgentTaskDef;
    // This assertion will FAIL because toTaskDefs doesn't copy response_schema → responseSchema yet
    expect(taskDef.responseSchema).toBeDefined();
    expect(taskDef.responseSchema!.schema).toEqual({
      type: "object",
      properties: {
        total_errors: { type: "number" },
      },
      required: ["total_errors"],
    });
  });

  it("toTaskDefs omits responseSchema when not provided in input", async () => {
    const spawnedTasks: unknown[] = [];

    const mockServer = {
      start: async (tasks: AgentTaskDef[]) => {
        spawnedTasks.push(...tasks);
        return "wf-456";
      },
      get: () => undefined,
    };

    const mockControlPlane = {
      abort: async () => {},
      pause: async () => {},
      resume: async () => {},
      status: async () => ({ tasks: [], graph: new Map() }),
      list: async () => [],
      post: async () => {},
      edit: async () => {},
      retry: async () => {},
      retention: async () => ({}),
    };

    const result = await handleWorkflowToolCall(
      {
        action: "start",
        name: "test-wf-no-schema",
        reply_to: "agent:test",
        graph: "1",
        tasks: [
          {
            id: 1,
            kind: "agent",
            prompt: "Simple task",
          },
        ],
      },
      {
        server: mockServer as any,
        controlPlane: mockControlPlane as any,
        stateDir: "/tmp/test-wf",
        currentDepth: 0,
        maxDepth: 3,
      },
    );

    expect(result.ok).toBe(true);
    expect(spawnedTasks).toHaveLength(1);

    const taskDef = spawnedTasks[0] as AgentTaskDef;
    expect(taskDef.responseSchema).toBeUndefined();
  });
});
