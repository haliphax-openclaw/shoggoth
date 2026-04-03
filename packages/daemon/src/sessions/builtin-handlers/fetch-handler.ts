// ---------------------------------------------------------------------------
// fetch handler — structured HTTP client
// ---------------------------------------------------------------------------

import { lookup } from "node:dns/promises";
import { isPrivateIp } from "@shoggoth/shared";
import type { BuiltinToolRegistry, BuiltinToolContext } from "../builtin-tool-registry";

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576; // 1 MB
const DEFAULT_TIMEOUT_MS = 30_000;
const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export function register(registry: BuiltinToolRegistry): void {
  registry.register("fetch", fetchHandler);
}

// ---------------------------------------------------------------------------
// CIDR matching
// ---------------------------------------------------------------------------

function parseCidr(cidr: string): { ip: number[]; prefixLen: number; version: 4 | 6 } | null {
  const slash = cidr.lastIndexOf("/");
  if (slash === -1) return null;
  const ipStr = cidr.slice(0, slash);
  const prefixLen = parseInt(cidr.slice(slash + 1), 10);
  if (isNaN(prefixLen)) return null;

  if (ipStr.includes(":")) {
    const expanded = expandIPv6(ipStr);
    if (!expanded) return null;
    const groups = expanded.split(":").map((g) => parseInt(g, 16));
    if (groups.length !== 8 || prefixLen < 0 || prefixLen > 128) return null;
    // Flatten to 16 bytes
    const bytes: number[] = [];
    for (const g of groups) {
      bytes.push((g >> 8) & 0xff, g & 0xff);
    }
    return { ip: bytes, prefixLen, version: 6 };
  }

  const parts = ipStr.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  if (prefixLen < 0 || prefixLen > 32) return null;
  return { ip: parts, prefixLen, version: 4 };
}

function ipMatchesCidr(ipStr: string, cidr: ReturnType<typeof parseCidr>): boolean {
  if (!cidr) return false;

  if (cidr.version === 4) {
    const parts = ipStr.split(".").map(Number);
    if (parts.length !== 4) return false;
    // Compare prefix bits
    for (let bit = 0; bit < cidr.prefixLen; bit++) {
      const byteIdx = bit >> 3;
      const bitMask = 0x80 >> (bit & 7);
      if ((parts[byteIdx] & bitMask) !== (cidr.ip[byteIdx] & bitMask)) return false;
    }
    return true;
  }

  // IPv6
  const expanded = expandIPv6(ipStr);
  if (!expanded) return false;
  const groups = expanded.split(":").map((g) => parseInt(g, 16));
  const bytes: number[] = [];
  for (const g of groups) {
    bytes.push((g >> 8) & 0xff, g & 0xff);
  }
  for (let bit = 0; bit < cidr.prefixLen; bit++) {
    const byteIdx = bit >> 3;
    const bitMask = 0x80 >> (bit & 7);
    if ((bytes[byteIdx] & bitMask) !== (cidr.ip[byteIdx] & bitMask)) return false;
  }
  return true;
}

function expandIPv6(addr: string): string | null {
  let halves: string[];
  if (addr.includes("::")) {
    const [left, right] = addr.split("::");
    const leftGroups = left ? left.split(":") : [];
    const rightGroups = right ? right.split(":") : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    if (missing < 0) return null;
    halves = [...leftGroups, ...Array(missing).fill("0"), ...rightGroups];
  } else {
    halves = addr.split(":");
  }
  if (halves.length !== 8) return null;
  return halves.map((g) => g.padStart(4, "0")).join(":");
}

// ---------------------------------------------------------------------------
// Private IP check with allowlist support
// ---------------------------------------------------------------------------

function isIpAllowed(
  ip: string,
  hostname: string,
  allowPrivateIps: boolean,
  allowlist: string[],
): boolean {
  if (!isPrivateIp(ip)) return true; // public IP — always allowed
  if (allowPrivateIps) return true;

  // Check allowlist: entries can be CIDR ranges or hostnames
  for (const entry of allowlist) {
    // Hostname match
    if (entry === hostname) return true;
    // CIDR match
    const cidr = parseCidr(entry);
    if (cidr && ipMatchesCidr(ip, cidr)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function fetchHandler(
  args: Record<string, unknown>,
  ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  const url = args.url as string | undefined;
  if (!url || typeof url !== "string") {
    return { resultJson: JSON.stringify({ error: "url is required and must be a string" }) };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { resultJson: JSON.stringify({ error: `Invalid URL: ${url}` }) };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { resultJson: JSON.stringify({ error: `Unsupported protocol: ${parsed.protocol}` }) };
  }

  const method = ((args.method as string) ?? "GET").toUpperCase();
  if (!VALID_METHODS.has(method)) {
    return { resultJson: JSON.stringify({ error: `Unsupported HTTP method: ${method}` }) };
  }

  const maxResponseBytes = Math.max(
    (args.maxResponseBytes as number) ?? DEFAULT_MAX_RESPONSE_BYTES,
    0,
  );
  const timeoutMs = Math.max((args.timeoutMs as number) ?? DEFAULT_TIMEOUT_MS, 0);
  const binary = (args.binary as boolean) ?? false;

  // --- Fetch config from runtime config ---
  const fetchConfig = (ctx.config as Record<string, unknown>).fetch as
    | { allowPrivateIps?: boolean; privateIpAllowlist?: string[] }
    | undefined;
  const allowPrivateIps = fetchConfig?.allowPrivateIps ?? false;
  const privateIpAllowlist = fetchConfig?.privateIpAllowlist ?? [];

  // --- Private IP check: resolve hostname first ---
  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  try {
    const resolved = await lookup(hostname, { all: true });
    for (const entry of resolved) {
      if (!isIpAllowed(entry.address, hostname, allowPrivateIps, privateIpAllowlist)) {
        return {
          resultJson: JSON.stringify({
            error: `Blocked: ${hostname} resolves to private/internal IP ${entry.address}. Configure fetch.allowPrivateIps or fetch.privateIpAllowlist to permit.`,
          }),
        };
      }
    }
  } catch (err: unknown) {
    return {
      resultJson: JSON.stringify({
        error: `DNS resolution failed for ${hostname}: ${(err as Error).message}`,
      }),
    };
  }

  // --- Build request ---
  const headers: Record<string, string> = {};
  if (args.headers && typeof args.headers === "object") {
    for (const [k, v] of Object.entries(args.headers as Record<string, unknown>)) {
      headers[k] = String(v);
    }
  }

  let bodyPayload: string | undefined;
  if (args.body !== undefined && args.body !== null) {
    if (typeof args.body === "object") {
      bodyPayload = JSON.stringify(args.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    } else {
      bodyPayload = String(args.body);
    }
  }

  // --- Execute fetch ---
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(parsed.href, {
      method,
      headers,
      body: bodyPayload,
      signal: controller.signal,
      redirect: "manual", // no redirect following by default
    });
    clearTimeout(timer);

    // --- Read response body with cap ---
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;

    if (res.body) {
      const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value);
          if (totalBytes + chunk.length > maxResponseBytes) {
            const remaining = maxResponseBytes - totalBytes;
            if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
            totalBytes += chunk.length;
            truncated = true;
            reader.cancel().catch(() => {});
            break;
          }
          chunks.push(chunk);
          totalBytes += chunk.length;
        }
      } catch {
        // stream error after partial read — use what we have
      }
    }

    const rawBuf = Buffer.concat(chunks);
    const bodyBytes = totalBytes;

    // --- Format body ---
    let body: string;
    if (binary) {
      body = rawBuf.toString("base64");
    } else {
      body = rawBuf.toString("utf-8");
      // Pretty-print JSON responses
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json") || ct.includes("+json")) {
        try {
          body = JSON.stringify(JSON.parse(body), null, 2);
        } catch {
          // not valid JSON — keep raw text
        }
      }
    }

    if (truncated) {
      body += "\n\n[truncated — response exceeded maxResponseBytes]";
    }

    // --- Build response headers map ---
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    return {
      resultJson: JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body,
        truncated,
        bodyBytes,
      }),
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      return { resultJson: JSON.stringify({ error: `Request timed out after ${timeoutMs}ms` }) };
    }
    return { resultJson: JSON.stringify({ error: `Fetch failed: ${(err as Error).message}` }) };
  }
}
