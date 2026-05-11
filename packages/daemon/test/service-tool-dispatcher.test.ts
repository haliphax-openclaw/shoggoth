/**
 * Service Tool Dispatcher Tests
 *
 * Phase 3: Manifest Fetching & Plugin Tool Registration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ServiceToolDispatcher, DispatchContext } from "../src/service-tool-dispatcher";
import { TokenMinter } from "../src/service-auth";
import { ServiceKeyStore } from "../src/service-key-store";
import { ServiceEntry } from "../src/service-registry";

// Mock fetch globally
global.fetch = vi.fn();

describe("ServiceToolDispatcher", () => {
  let dispatcher: ServiceToolDispatcher;
  let tokenMinter: TokenMinter;
  let keyStore: ServiceKeyStore;
  let mockServiceEntry: ServiceEntry;

  beforeEach(async () => {
    // Set up a fresh key store and token minter
    keyStore = new ServiceKeyStore("/tmp/test-service-dispatcher-secrets");
    await keyStore.generateKeyPair("test-service");
    tokenMinter = new TokenMinter(keyStore);
    dispatcher = new ServiceToolDispatcher(tokenMinter);

    // Create a mock service entry
    mockServiceEntry = {
      id: "test-service",
      label: "Test Service",
      url: "http://localhost:8080",
      healthy: true,
      capabilities: ["tools"],
      expose: "direct",
      manifest: null,
      registeredTools: [],
    };

    vi.clearAllMocks();
  });

  it("dispatch sends POST request with correct path and body (mock fetch)", async () => {
    const mockResponse = { success: true, data: "test result" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const toolDecl = {
      name: "test.tool",
      description: "A test tool",
      parameters: {},
      method: "POST" as const,
      path: "/api/test",
      dispatch: "body" as const,
    };

    const ctx: DispatchContext = {
      agentId: "agent-123",
      sessionUrn: "session:abc",
      serviceEntry: mockServiceEntry,
    };

    await dispatcher.dispatch(toolDecl, { foo: "bar" }, ctx);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ foo: "bar" }),
      }),
    );
  });

  it("dispatch includes Authorization header with minted token", async () => {
    const mockResponse = { success: true };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const toolDecl = {
      name: "test.tool",
      description: "A test tool",
      parameters: {},
      method: "POST" as const,
      path: "/api/test",
      dispatch: "body" as const,
    };

    const ctx: DispatchContext = {
      agentId: "agent-123",
      sessionUrn: "session:abc",
      serviceEntry: mockServiceEntry,
    };

    await dispatcher.dispatch(toolDecl, { foo: "bar" }, ctx);

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = fetchCall[1] as RequestInit;
    // Verify Authorization header is present with Bearer token
    // Note: TokenMinter.mint() produces different output each time due to age encryption randomness,
    // so we verify the token format instead of exact value
    expect(options.headers).toHaveProperty("Authorization");
    const authHeader = (options.headers as Record<string, string>).Authorization;
    expect(authHeader).toMatch(/^Bearer /);
    // Token should be base64url format
    const token = authHeader.replace("Bearer ", "");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("dispatch handles query dispatch mode (args as query params)", async () => {
    const mockResponse = { success: true };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const toolDecl = {
      name: "test.get",
      description: "A GET tool",
      parameters: {},
      method: "GET" as const,
      path: "/api/items",
      dispatch: "query" as const,
    };

    const ctx: DispatchContext = {
      agentId: "agent-123",
      sessionUrn: "session:abc",
      serviceEntry: mockServiceEntry,
    };

    await dispatcher.dispatch(toolDecl, { id: "123", filter: "active" }, ctx);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/items?id=123&filter=active",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("dispatch returns service response as resultJson", async () => {
    const mockResponse = { result: "expected-data", status: "ok" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const toolDecl = {
      name: "test.tool",
      description: "A test tool",
      parameters: {},
      method: "POST" as const,
      path: "/api/test",
      dispatch: "body" as const,
    };

    const ctx: DispatchContext = {
      agentId: "agent-123",
      sessionUrn: "session:abc",
      serviceEntry: mockServiceEntry,
    };

    const result = await dispatcher.dispatch(toolDecl, {}, ctx);
    expect(result.resultJson).toBe(JSON.stringify(mockResponse));
  });

  it("dispatch throws on non-2xx response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    });

    const toolDecl = {
      name: "test.tool",
      description: "A test tool",
      parameters: {},
      method: "POST" as const,
      path: "/api/test",
      dispatch: "body" as const,
    };

    const ctx: DispatchContext = {
      agentId: "agent-123",
      sessionUrn: "session:abc",
      serviceEntry: mockServiceEntry,
    };

    await expect(dispatcher.dispatch(toolDecl, {}, ctx)).rejects.toThrow("500");
  });
});
