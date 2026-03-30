import { loadLayeredConfig, LAYOUT } from "@shoggoth/shared";

export function printConfigHelp(version: string): void {
  console.log(`shoggoth ${version}

Usage:
  shoggoth config show   Print effective layered config (JSON)`);
}

export function runConfigShow(): void {
  const configDir = process.env.SHOGGOTH_CONFIG_DIR ?? LAYOUT.configDir;
  console.log(JSON.stringify(loadLayeredConfig(configDir), null, 2));
}
