import type { ShoggothModelsConfig } from "@shoggoth/shared";
import type { ModelInvocationParams, ModelThinkingOptions, ResponseSchema } from "./types";

function shallowMergeExtras(
  base: Record<string, unknown> | undefined,
  over: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const bEmpty = !base || Object.keys(base).length === 0;
  const oEmpty = !over || Object.keys(over).length === 0;
  if (bEmpty && oEmpty) return undefined;
  if (bEmpty) return { ...over! };
  if (oEmpty) return { ...base };
  return { ...base, ...over };
}

function readThinking(raw: unknown): ModelThinkingOptions | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const t = raw as Record<string, unknown>;
  if (t.enabled !== true && t.enabled !== false) return undefined;
  const budgetRaw = t.budgetTokens;
  const budgetTokens =
    typeof budgetRaw === "number" && Number.isFinite(budgetRaw) && budgetRaw > 0
      ? Math.trunc(budgetRaw)
      : undefined;
  return { enabled: Boolean(t.enabled), budgetTokens };
}

function readResponseSchema(raw: unknown): ResponseSchema | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return { schema: o.schema as Record<string, unknown> };
}

const VALID_STRUCTURED_OUTPUT_MODES = ["strict", "best-effort", "none"] as const;
type StructuredOutputMode = (typeof VALID_STRUCTURED_OUTPUT_MODES)[number];

function readStructuredOutputMode(raw: unknown): StructuredOutputMode | undefined {
  if (typeof raw !== "string") return undefined;
  if ((VALID_STRUCTURED_OUTPUT_MODES as readonly string[]).includes(raw)) {
    return raw as StructuredOutputMode;
  }
  return undefined;
}

/**
 * Parses `sessions.model_selection` JSON (or subagent `model_options`) for invocation fields.
 * Unknown keys are ignored except `requestExtras` / `extraBody` (either name accepted).
 */
export function parseModelInvocationFromUnknown(raw: unknown): ModelInvocationParams {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const mot = o.maxOutputTokens;
  const maxOutputTokens =
    typeof mot === "number" && Number.isFinite(mot) && mot > 0 ? Math.trunc(mot) : undefined;
  const temp = o.temperature;
  const temperature = typeof temp === "number" && Number.isFinite(temp) ? temp : undefined;
  const thinking = readThinking(o.thinking);
  const reasoningEffort =
    typeof o.reasoningEffort === "string" && o.reasoningEffort.trim()
      ? o.reasoningEffort.trim()
      : undefined;
  const extrasRaw = o.requestExtras ?? o.extraBody;
  const requestExtras =
    extrasRaw && typeof extrasRaw === "object" && !Array.isArray(extrasRaw)
      ? { ...(extrasRaw as Record<string, unknown>) }
      : undefined;
  const responseSchema = readResponseSchema(o.responseSchema);
  const structuredOutputMode = readStructuredOutputMode(o.structuredOutputMode);
  return {
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(thinking ? { thinking } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(requestExtras !== undefined ? { requestExtras } : {}),
    ...(responseSchema !== undefined ? { responseSchema } : {}),
    ...(structuredOutputMode !== undefined ? { structuredOutputMode } : {}),
  };
}

function mergeInvocations(
  base: ModelInvocationParams | undefined,
  over: ModelInvocationParams | undefined,
): ModelInvocationParams {
  if (!base || Object.keys(base).length === 0) return over ?? {};
  if (!over || Object.keys(over).length === 0) return base;
  return {
    maxOutputTokens: over.maxOutputTokens ?? base.maxOutputTokens,
    temperature: over.temperature ?? base.temperature,
    thinking: over.thinking ?? base.thinking,
    reasoningEffort: over.reasoningEffort ?? base.reasoningEffort,
    requestExtras: shallowMergeExtras(base.requestExtras, over.requestExtras),
    responseSchema: over.responseSchema ?? base.responseSchema,
    structuredOutputMode: over.structuredOutputMode ?? base.structuredOutputMode,
  };
}

/** Merges `models.defaultInvocation` with per-session `model_selection` (session wins per field). */
export function mergeModelInvocationParams(
  models: ShoggothModelsConfig | undefined,
  sessionModelSelection: unknown,
): ModelInvocationParams {
  const fromConfig = models?.defaultInvocation;
  const fromSession = parseModelInvocationFromUnknown(sessionModelSelection);
  return mergeInvocations(fromConfig, fromSession);
}

/** Overlay wins where set (e.g. compaction summary call overrides). */
export function mergeModelInvocationOverlay(
  base: ModelInvocationParams,
  overlay: ModelInvocationParams | undefined,
): ModelInvocationParams {
  return mergeInvocations(base, overlay);
}

const SESSION_INVOCATION_KEYS = new Set([
  "maxOutputTokens",
  "temperature",
  "thinking",
  "reasoningEffort",
  "requestExtras",
  "extraBody",
  "responseSchema",
  "structuredOutputMode",
]);

function stripInvocationKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!SESSION_INVOCATION_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function modelInvocationParamsToSessionJson(p: ModelInvocationParams): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (p.maxOutputTokens !== undefined) o.maxOutputTokens = p.maxOutputTokens;
  if (p.temperature !== undefined) o.temperature = p.temperature;
  if (p.thinking !== undefined) {
    o.thinking = {
      enabled: p.thinking.enabled,
      ...(p.thinking.budgetTokens !== undefined ? { budgetTokens: p.thinking.budgetTokens } : {}),
    };
  }
  if (p.reasoningEffort !== undefined) o.reasoningEffort = p.reasoningEffort;
  if (p.requestExtras !== undefined && Object.keys(p.requestExtras).length > 0) {
    o.requestExtras = { ...p.requestExtras };
  }
  if (p.responseSchema !== undefined) o.responseSchema = p.responseSchema;
  if (p.structuredOutputMode !== undefined) o.structuredOutputMode = p.structuredOutputMode;
  return o;
}

/**
 * Subagent spawn: start from parent `sessions.model_selection`, optionally overlay `model_options`
 * (same shape as session JSON). Non-invocation keys (e.g. `model`) shallow-merge with overlay winning;
 * invocation fields use the same merge rules as {@link mergeModelInvocationParams} for extras/thinking.
 */
export function mergeSubagentSpawnModelSelection(
  parentModelSelection: unknown,
  modelOptionsOverlay: unknown | undefined,
  modelRef?: string,
): unknown {
  const base =
    parentModelSelection &&
    typeof parentModelSelection === "object" &&
    !Array.isArray(parentModelSelection)
      ? { ...(parentModelSelection as Record<string, unknown>) }
      : {};
  const over =
    modelOptionsOverlay &&
    typeof modelOptionsOverlay === "object" &&
    !Array.isArray(modelOptionsOverlay)
      ? { ...(modelOptionsOverlay as Record<string, unknown>) }
      : undefined;

  const mergedInv = mergeInvocations(
    parseModelInvocationFromUnknown(base),
    parseModelInvocationFromUnknown(over ?? {}),
  );
  const rest = {
    ...stripInvocationKeys(base),
    ...stripInvocationKeys(over ?? {}),
  };
  const invOut = modelInvocationParamsToSessionJson(mergedInv);
  const out: Record<string, unknown> = { ...rest, ...invOut };
  if (modelRef && modelRef.trim()) {
    out.model = modelRef;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
