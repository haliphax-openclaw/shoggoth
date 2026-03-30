import type { PlatformHandle } from "./platform";

const platforms = new Map<string, PlatformHandle>();

export function registerPlatform(id: string, handle: PlatformHandle): void {
  platforms.set(id, handle);
}

export function getPlatform(id: string): PlatformHandle | undefined {
  return platforms.get(id);
}

export function getAllPlatforms(): ReadonlyMap<string, PlatformHandle> {
  return platforms;
}

export async function stopAllPlatforms(): Promise<void> {
  for (const [, handle] of platforms) {
    await handle.stop();
  }
  platforms.clear();
}
