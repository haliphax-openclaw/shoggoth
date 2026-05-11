import * as net from "node:net";
import type { ExternalServiceHealth } from "@shoggoth/shared";
import type { ServiceRegistry } from "./service-registry";

/**
 * Polls external services for health and updates the ServiceRegistry accordingly.
 */
export class HealthChecker {
  private intervals = new Map<string, NodeJS.Timeout>();
  private registry: ServiceRegistry;

  constructor(registry: ServiceRegistry) {
    this.registry = registry;
  }

  /**
   * Start periodic health polling for a service.
   */
  startPolling(serviceId: string, healthConfig: ExternalServiceHealth, intervalMs: number): void {
    // Clear any existing interval for this service
    this.stopPolling(serviceId);

    // Run an initial check immediately
    void this.runCheck(serviceId, healthConfig);

    const interval = setInterval(() => {
      void this.runCheck(serviceId, healthConfig);
    }, intervalMs);

    this.intervals.set(serviceId, interval);
  }

  /**
   * Stop polling for a specific service.
   */
  stopPolling(serviceId: string): void {
    const interval = this.intervals.get(serviceId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(serviceId);
    }
  }

  /**
   * Stop all polling intervals.
   */
  stopAll(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Run a single health check and return true if healthy, false otherwise.
   */
  async checkOnce(serviceId: string, healthConfig: ExternalServiceHealth): Promise<boolean> {
    return this.runCheck(serviceId, healthConfig);
  }

  private async runCheck(serviceId: string, healthConfig: ExternalServiceHealth): Promise<boolean> {
    try {
      if (healthConfig.kind === "tcp") {
        await this.checkTcp(healthConfig);
      } else {
        await this.checkHttp(healthConfig);
      }
      this.registry.markHealthy(serviceId);
      return true;
    } catch {
      this.registry.markUnhealthy(serviceId);
      return false;
    }
  }

  private checkTcp(config: Extract<ExternalServiceHealth, { kind: "tcp" }>): Promise<void> {
    const port = config.port ?? 80;
    const timeoutMs = config.timeoutMs ?? 5000;

    return new Promise((resolve, reject) => {
      const socket = net.connect({ port, host: "127.0.0.1" });

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("TCP health check timed out"));
      }, timeoutMs);

      socket.on("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve();
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        socket.destroy();
        reject(err);
      });
    });
  }

  private async checkHttp(config: Extract<ExternalServiceHealth, { kind: "http" }>): Promise<void> {
    const expectedStatus = config.expectedStatus ?? 200;
    const timeoutMs = config.timeoutMs ?? 5000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.url, { signal: controller.signal });
      if (response.status !== expectedStatus) {
        throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
