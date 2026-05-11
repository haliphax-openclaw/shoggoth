import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as http from "node:http";
import * as net from "node:net";
import { HealthChecker } from "../src/health-checker";
import type { ServiceRegistry } from "../src/service-registry";
import type { ExternalServiceHealth } from "@shoggoth/shared";

function createMockRegistry() {
  return {
    markHealthy: vi.fn(),
    markUnhealthy: vi.fn(),
  } as unknown as ServiceRegistry & {
    markHealthy: ReturnType<typeof vi.fn>;
    markUnhealthy: ReturnType<typeof vi.fn>;
  };
}

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve(addr.port);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe("HealthChecker", () => {
  let registry: ReturnType<typeof createMockRegistry>;
  let checker: HealthChecker;

  beforeEach(() => {
    registry = createMockRegistry();
    checker = new HealthChecker(registry);
  });

  afterEach(() => {
    checker.stopAll();
  });

  describe("HTTP health checks", () => {
    let server: http.Server;
    let port: number;

    afterEach(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    it("marks healthy on 200 response", async () => {
      server = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end("OK");
      });
      port = await listenOnRandomPort(server);

      const config: ExternalServiceHealth = {
        kind: "http",
        url: `http://127.0.0.1:${port}/health`,
      };

      const result = await checker.checkOnce("svc-1", config);

      expect(result).toBe(true);
      expect(registry.markHealthy).toHaveBeenCalledWith("svc-1");
      expect(registry.markUnhealthy).not.toHaveBeenCalled();
    });

    it("marks unhealthy on non-200 response", async () => {
      server = http.createServer((_req, res) => {
        res.writeHead(503);
        res.end("Service Unavailable");
      });
      port = await listenOnRandomPort(server);

      const config: ExternalServiceHealth = {
        kind: "http",
        url: `http://127.0.0.1:${port}/health`,
      };

      const result = await checker.checkOnce("svc-1", config);

      expect(result).toBe(false);
      expect(registry.markUnhealthy).toHaveBeenCalledWith("svc-1");
      expect(registry.markHealthy).not.toHaveBeenCalled();
    });

    it("marks unhealthy on fetch error (network failure)", async () => {
      const config: ExternalServiceHealth = {
        kind: "http",
        url: "http://127.0.0.1:1/health", // port 1 should be unreachable
        timeoutMs: 1000,
      };

      const result = await checker.checkOnce("svc-1", config);

      expect(result).toBe(false);
      expect(registry.markUnhealthy).toHaveBeenCalledWith("svc-1");
      expect(registry.markHealthy).not.toHaveBeenCalled();
    });

    it("respects expectedStatus configuration", async () => {
      server = http.createServer((_req, res) => {
        res.writeHead(204);
        res.end();
      });
      port = await listenOnRandomPort(server);

      const config: ExternalServiceHealth = {
        kind: "http",
        url: `http://127.0.0.1:${port}/health`,
        expectedStatus: 204,
      };

      const result = await checker.checkOnce("svc-1", config);

      expect(result).toBe(true);
      expect(registry.markHealthy).toHaveBeenCalledWith("svc-1");
    });
  });

  describe("TCP health checks", () => {
    let server: net.Server;
    let port: number;

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("marks healthy on successful connect", async () => {
      server = net.createServer((socket) => {
        socket.end();
      });
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      port = (server.address() as net.AddressInfo).port;

      const config: ExternalServiceHealth = {
        kind: "tcp",
        port,
      };

      const result = await checker.checkOnce("svc-tcp", config);

      expect(result).toBe(true);
      expect(registry.markHealthy).toHaveBeenCalledWith("svc-tcp");
      expect(registry.markUnhealthy).not.toHaveBeenCalled();
    });

    it("marks unhealthy on connection refused", async () => {
      // Use a port that is not listening
      const config: ExternalServiceHealth = {
        kind: "tcp",
        port: 1, // port 1 should refuse connections
        timeoutMs: 1000,
      };

      const result = await checker.checkOnce("svc-tcp", config);

      expect(result).toBe(false);
      expect(registry.markUnhealthy).toHaveBeenCalledWith("svc-tcp");
      expect(registry.markHealthy).not.toHaveBeenCalled();
    });
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stopPolling clears the interval", () => {
      const config: ExternalServiceHealth = {
        kind: "http",
        url: "http://127.0.0.1:9999/health",
      };

      checker.startPolling("svc-poll", config, 5000);

      // Verify the interval is set
      checker.stopPolling("svc-poll");

      // Advance time - no further checks should happen after stop
      registry.markHealthy.mockClear();
      registry.markUnhealthy.mockClear();

      vi.advanceTimersByTime(15000);

      // After stopping, no new calls should be made from the interval
      // (the initial immediate check may have fired, but no interval-based ones after stop)
      expect(registry.markHealthy).not.toHaveBeenCalled();
    });

    it("stopAll clears all intervals", () => {
      const config: ExternalServiceHealth = {
        kind: "http",
        url: "http://127.0.0.1:9999/health",
      };

      checker.startPolling("svc-1", config, 5000);
      checker.startPolling("svc-2", config, 5000);

      checker.stopAll();

      registry.markHealthy.mockClear();
      registry.markUnhealthy.mockClear();

      vi.advanceTimersByTime(15000);

      expect(registry.markHealthy).not.toHaveBeenCalled();
    });
  });
});
