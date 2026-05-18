/**
 * Component schema definitions and validation for A2UI surfaces.
 */

export type PropType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "string|object"
  | "number|string";

export interface ComponentSchema {
  props: Record<string, { type: PropType; required?: boolean }>;
}

export type SchemaResolver = (componentName: string) => ComponentSchema | undefined;

export interface ComponentValidationResult {
  id: string;
  component: string;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a single component's props against its schema.
 * Returns errors for missing required props or type mismatches,
 * and warnings for unknown props.
 */
export function validateComponent(
  comp: { id: string; component: string; [key: string]: unknown },
  resolveSchema: SchemaResolver,
): ComponentValidationResult {
  const result: ComponentValidationResult = {
    id: comp.id,
    component: comp.component,
    errors: [],
    warnings: [],
  };

  const schema = resolveSchema(comp.component);
  if (!schema) {
    // No schema available — skip validation
    return result;
  }

  const knownProps = new Set(Object.keys(schema.props));

  // Check required props
  for (const [name, def] of Object.entries(schema.props)) {
    if (def.required && !(name in comp)) {
      result.errors.push(`Missing required prop "${name}"`);
    }
  }

  // Check provided props
  for (const key of Object.keys(comp)) {
    if (key === "id" || key === "component") continue;
    if (!knownProps.has(key)) {
      result.warnings.push(`Unknown prop "${key}"`);
      continue;
    }

    const value = comp[key];
    const expected = schema.props[key];
    if (value === undefined || value === null) continue;

    if (!matchesType(value, expected.type)) {
      result.errors.push(
        `Prop "${key}" expected type "${expected.type}" but got "${typeof value}"`,
      );
    }
  }

  return result;
}

function matchesType(value: unknown, type: PropType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    case "string|object":
      return typeof value === "string" || (typeof value === "object" && !Array.isArray(value));
    case "number|string":
      return typeof value === "number" || typeof value === "string";
    default:
      return true;
  }
}
