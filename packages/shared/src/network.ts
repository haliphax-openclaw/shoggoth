// ---------------------------------------------------------------------------
// Network utilities — private/internal IP range detection
// ---------------------------------------------------------------------------

import { isIP } from "node:net";

/**
 * Returns true when the given IP address string falls within a private or
 * internal range that should be blocked for outbound fetch by default.
 *
 * Covered ranges:
 *  - 127.0.0.0/8   (IPv4 loopback)
 *  - 10.0.0.0/8    (RFC 1918)
 *  - 172.16.0.0/12 (RFC 1918)
 *  - 192.168.0.0/16 (RFC 1918)
 *  - 0.0.0.0/8     (current network)
 *  - 169.254.0.0/16 (link-local)
 *  - ::1            (IPv6 loopback)
 *  - fc00::/7       (IPv6 ULA)
 *  - fe80::/10      (IPv6 link-local)
 *  - ::             (unspecified)
 *  - ::ffff:0:0/96  mapped IPv4 (delegates to IPv4 check)
 */
export function isPrivateIp(hostname: string): boolean {
  const version = isIP(hostname);
  if (version === 0) return false; // not an IP literal — caller should resolve first

  if (version === 4) {
    return isPrivateIPv4(hostname);
  }

  // IPv6
  const lower = hostname.toLowerCase();

  // Unspecified
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;

  // Loopback
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(lower);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);

  // Expand abbreviated IPv6 to check prefix ranges
  const expanded = expandIPv6(lower);
  if (!expanded) return false;

  const first16 = parseInt(expanded.slice(0, 4), 16);

  // fc00::/7  — ULA
  if ((first16 & 0xfe00) === 0xfc00) return true;

  // fe80::/10 — link-local
  if ((first16 & 0xffc0) === 0xfe80) return true;

  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255))
    return false;

  const [a, b] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Expand an IPv6 address to its full 8-group hex representation.
 * Returns null on invalid input.
 */
function expandIPv6(addr: string): string | null {
  // Handle :: expansion
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
