/**
 * Configurable notice resolver for platform-discord.
 * The daemon registers the real `daemonNotice` implementation at startup.
 */
import type { NoticeResolver } from "./daemon-types";

let _resolver: NoticeResolver | undefined;

/** Register the daemon's notice resolver. Call once during platform startup. */
export function setNoticeResolver(resolver: NoticeResolver): void {
  _resolver = resolver;
}

/** Resolve a notice template. Throws if no resolver has been registered. */
export function daemonNotice(key: string, vars: Record<string, string> = {}): string {
  if (!_resolver) throw new Error("platform-discord: notice resolver not registered; call setNoticeResolver() at startup");
  return _resolver(key, vars);
}
