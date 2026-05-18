import type { Gateway } from "./gateway";
import type { A2UIManager } from "./a2ui-manager";
import {
  validateComponent,
  type ComponentValidationResult,
  type SchemaResolver,
} from "./a2ui-component-schemas";

/** Default catalog URI when none is provided by createSurface */
const DEFAULT_CATALOG_ID = "@shoggoth/a2ui-catalog-all";

/** v0.8 → v0.9 command name aliases */
const COMMAND_ALIASES: Record<string, string> = {
  surfaceUpdate: "updateComponents",
  beginRendering: "createSurface",
  dataModelUpdate: "updateDataModel",
};

/** Known command names that the pipeline can process */
const KNOWN_COMMANDS = new Set([
  "updateComponents",
  "createSurface",
  "updateDataModel",
  "dataSourcePush",
  "deleteSurface",
]);

export interface ValidationResult {
  ok: boolean;
  command: string;
  index: number;
  error?: string;
  componentErrors?: ComponentValidationResult[];
  componentWarnings?: ComponentValidationResult[];
}

/**
 * Normalize a single component from v0.8 wrapped shape to v0.9 flat shape.
 * Also normalizes usageHint → variant.
 */
function normalizeComponent(c: { id: string; component: unknown; [key: string]: unknown }): {
  id: string;
  component: string;
  [key: string]: unknown;
} {
  let result: { id: string; component: string; [key: string]: unknown };

  if (typeof c.component === "string") {
    result = c as { id: string; component: string; [key: string]: unknown };
  } else if (typeof c.component === "object" && c.component !== null) {
    const keys = Object.keys(c.component as object);
    if (keys.length === 1) {
      const type = keys[0];
      const props = (c.component as Record<string, Record<string, unknown>>)[type] ?? {};
      result = { id: c.id, component: type, ...props };
    } else {
      return c as any;
    }
  } else {
    return c as any;
  }

  if ("usageHint" in result && !("variant" in result)) {
    result.variant = result.usageHint;
    delete result.usageHint;
  }

  return result;
}

/** Detect the command name from a parsed JSONL object, applying v0.8 aliases. */
function detectCommand(parsed: Record<string, unknown>): string | null {
  for (const [oldName, newName] of Object.entries(COMMAND_ALIASES)) {
    if (parsed[oldName] !== undefined) {
      parsed[newName] = parsed[oldName];
      delete parsed[oldName];
      return newName;
    }
  }
  for (const key of Object.keys(parsed)) {
    if (KNOWN_COMMANDS.has(key)) return key;
  }
  return null;
}

/** Validate and extract an updateComponents payload. */
function validateUpdateComponents(payload: unknown): string | null {
  const su = payload as { surfaceId?: string; components?: unknown };
  if (!su.surfaceId) return "updateComponents: missing surfaceId";
  if (!Array.isArray(su.components)) return "updateComponents: components must be an array";
  return null;
}

/** Validate and extract a createSurface payload. */
function validateCreateSurface(payload: unknown): string | null {
  const br = payload as { surfaceId?: string };
  if (!br.surfaceId) return "createSurface: missing surfaceId";
  return null;
}

/** Validate and extract an updateDataModel payload. */
function validateUpdateDataModel(payload: unknown): string | null {
  const dm = payload as { surfaceId?: string };
  if (!dm.surfaceId) return "updateDataModel: missing surfaceId";
  return null;
}

/** Validate and extract a dataSourcePush payload. */
function validateDataSourcePush(payload: unknown): string | null {
  const dp = payload as { surfaceId?: string };
  if (!dp.surfaceId) return "dataSourcePush: missing surfaceId";
  return null;
}

/** Validate and extract a deleteSurface payload. */
function validateDeleteSurface(payload: unknown): string | null {
  const ds = payload as { surfaceId?: string };
  if (!ds.surfaceId) return "deleteSurface: missing surfaceId";
  return null;
}

/**
 * Process a single parsed command through the pipeline.
 * Returns a ValidationResult indicating success or failure.
 * On success, applies the command to the manager and broadcasts.
 */
export function processPipelineCommand(
  session: string,
  parsed: Record<string, unknown>,
  index: number,
  a2uiManager: A2UIManager,
  gateway: Gateway,
  resolveSchema?: SchemaResolver,
): ValidationResult {
  const command = detectCommand(parsed);
  if (!command) {
    return { ok: false, command: "unknown", index, error: "Unrecognized command" };
  }

  let error: string | null = null;

  switch (command) {
    case "updateComponents": {
      error = validateUpdateComponents(parsed[command]);
      if (error) break;
      const su = parsed[command] as {
        surfaceId: string;
        components: Array<{ id: string; component: unknown; [key: string]: unknown }>;
      };
      const normalized = su.components.map(normalizeComponent);

      // Validate individual component props
      const validComponents: typeof normalized = [];
      const compErrors: ComponentValidationResult[] = [];
      const compWarnings: ComponentValidationResult[] = [];

      for (const comp of normalized) {
        if (typeof comp.component !== "string") {
          validComponents.push(comp);
          continue;
        }
        const vr = validateComponent(
          comp as { id: string; component: string; [key: string]: unknown },
          resolveSchema ?? (() => undefined),
        );
        if (vr.warnings.length) compWarnings.push(vr);
        if (vr.errors.length) {
          compErrors.push(vr);
        } else {
          validComponents.push(comp);
        }
      }

      // Process valid components even if some failed
      if (validComponents.length) {
        a2uiManager.upsertSurface(session, su.surfaceId, validComponents as any);
        gateway.broadcastSpaSession(session, {
          type: "a2ui.updateComponents",
          surfaceId: su.surfaceId,
          components: validComponents,
        });
      }

      if (compErrors.length) {
        return {
          ok: false,
          command,
          index,
          error: `ValidationFailed: ${compErrors.map((e) => `${e.id}: ${e.errors.join("; ")}`).join(" | ")}`,
          componentErrors: compErrors,
          componentWarnings: compWarnings.length ? compWarnings : undefined,
        };
      }
      return {
        ok: true,
        command,
        index,
        componentWarnings: compWarnings.length ? compWarnings : undefined,
      };
    }
    case "createSurface": {
      error = validateCreateSurface(parsed[command]);
      if (error) break;
      const br = parsed[command] as {
        surfaceId: string;
        root?: string;
        catalogId?: string;
        theme?: string;
        sendDataModel?: boolean;
      };
      const root = br.root ?? "root";
      const catalogId = br.catalogId ?? DEFAULT_CATALOG_ID;
      a2uiManager.setRoot(session, br.surfaceId, root, { catalogId, theme: br.theme });
      gateway.broadcastSpaSession(session, {
        type: "a2ui.createSurface",
        surfaceId: br.surfaceId,
        root,
        catalogId,
        theme: br.theme,
        sendDataModel: br.sendDataModel,
      });
      break;
    }
    case "updateDataModel": {
      error = validateUpdateDataModel(parsed[command]);
      if (error) break;
      const dm = parsed[command] as { surfaceId: string; data: Record<string, unknown> };
      a2uiManager.updateDataModel(session, dm.surfaceId, dm.data ?? {});
      gateway.broadcastSpaSession(session, {
        type: "a2ui.updateDataModel",
        surfaceId: dm.surfaceId,
        data: dm.data ?? {},
      });
      break;
    }
    case "dataSourcePush": {
      error = validateDataSourcePush(parsed[command]);
      if (error) break;
      const dp = parsed[command] as { surfaceId: string; sources: Record<string, unknown> };
      const data = { $sources: dp.sources ?? {} };
      a2uiManager.updateDataModel(session, dp.surfaceId, data);
      gateway.broadcastSpaSession(session, {
        type: "a2ui.updateDataModel",
        surfaceId: dp.surfaceId,
        data,
      });
      break;
    }
    case "deleteSurface": {
      error = validateDeleteSurface(parsed[command]);
      if (error) break;
      const ds = parsed[command] as { surfaceId: string };
      a2uiManager.deleteSurface(session, ds.surfaceId);
      gateway.broadcastSpaSession(session, { type: "a2ui.deleteSurface", surfaceId: ds.surfaceId });
      break;
    }
  }

  if (error) {
    return { ok: false, command, index, error };
  }
  return { ok: true, command, index };
}

/**
 * Process a batch of JSONL lines through the pipeline.
 * Returns per-command validation results.
 */
export function processBatch(
  session: string,
  jsonl: string,
  a2uiManager: A2UIManager,
  gateway: Gateway,
  resolveSchema?: SchemaResolver,
): ValidationResult[] {
  const lines = jsonl.split("\n").filter((l) => l.trim());
  const results: ValidationResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      results.push({
        ok: false,
        command: "parse",
        index: i,
        error: `Invalid JSON: ${lines[i].slice(0, 100)}`,
      });
      continue;
    }
    results.push(processPipelineCommand(session, parsed, i, a2uiManager, gateway, resolveSchema));
  }

  return results;
}

/**
 * Legacy adapter: process a single parsed command, returning boolean for backward compat.
 * Used by the JSONL file watcher.
 */
export function processA2UICommand(
  session: string,
  parsed: Record<string, unknown>,
  a2uiManager: A2UIManager,
  gateway: Gateway,
  resolveSchema?: SchemaResolver,
): boolean {
  const result = processPipelineCommand(session, parsed, 0, a2uiManager, gateway, resolveSchema);
  return result.ok;
}
