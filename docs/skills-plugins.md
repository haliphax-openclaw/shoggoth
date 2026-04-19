# Skills & Plugins Reference (`@shoggoth/skills-plugins`)

This document is a source-level reference for the `@shoggoth/skills-plugins` package. Skills are exposed to agents via the `builtin-skills` tool (see [MCP Integration — Built-in Tools](mcp-integration.md#built-in-shoggoth-tools)), and plugins hook into the [daemon](daemon.md) lifecycle. It covers skill discovery, the skill file format, skill search, the plugin manifest, plugin loading lifecycle, and the hook registry.

---

## Overview

The package provides two distinct but co-located subsystems:

1. **Skills** — Markdown files with YAML-like frontmatter that are discovered by scanning configured directory roots. Skills are presented to agents via a built-in tool and can be searched/filtered at runtime.
2. **Plugins** — Loadable extension packages (local directories or npm packages) that register hook handlers into a central `HookRegistry`, allowing code to run at defined lifecycle points (e.g. daemon startup/shutdown).

---

## Skills

### Skill File Format

A skill is any `.md` (Markdown) file found under a configured scan root. The file may optionally begin with YAML-like frontmatter delimited by `---` fences:

```markdown
---
id: my-custom-skill
title: My Custom Skill
description: One-line summary for search matching
enabled: true
tags: [typescript, testing, utilities]
category: dev-tools
---

Body content of the skill goes here. This is the part
presented to agents when they read the skill.
```

#### Frontmatter Fields

| Field         | Type              | Default                        | Description |
|---------------|-------------------|--------------------------------|-------------|
| `id`          | `string`          | Auto-derived from file path    | Unique identifier. If omitted, generated from the file's path relative to its scan root (e.g. `subdir/my-skill.md` → `subdir.my-skill`). |
| `title`       | `string`          | Falls back to `name`, then `id`| Human-readable display title. The `name` field is accepted as an alias. |
| `description` | `string`          | `null`                         | One-line description used for search relevance scoring. |
| `enabled`     | `boolean`         | `true`                         | Set to `false` to disable the skill at the file level. Accepts `true`/`false`, `yes`/`no`, `1`/`0`. |
| `tags`        | `string[]` (YAML) | `[]`                           | Freeform tags for filtering. Parsed from inline YAML array syntax `[tag1, tag2]` or comma-separated values. Normalized to lowercase. |
| `category`    | `string`          | `null`                         | Broad grouping label (e.g. `utilities`, `dev-tools`, `integrations`). Normalized to lowercase. |

#### Frontmatter Parsing Rules

- The parser is minimal and line-oriented — it is **not** a full YAML parser.
- Each line inside the `---` fences is matched against the pattern `key: value` where keys are alphanumeric (plus `_`, `.`, `-`).
- Values are taken as raw strings; boolean coercion and tag array parsing happen in dedicated helpers.
- If the file does not start with `---`, the entire content is treated as the body with no frontmatter fields.

#### Auto-Generated Skill IDs

When no `id` field is present in frontmatter, the ID is derived from the file path relative to its scan root:

1. Compute the relative path from the scan root to the file.
2. Strip the `.md` extension.
3. Replace all `/` separators with `.`.

Example: scan root `/skills`, file `/skills/aws/lambda-deploy.md` → id `aws.lambda-deploy`.

### Skill Discovery (Scanning)

Skills are discovered by the `scanSkillDirectories()` function:

1. **Scan roots** are resolved from `config.skills.scanRoots`. Each root path is resolved relative to the config directory (absolute paths are used as-is).
2. Each root is recursively walked for `*.md` files.
3. Files are sorted lexicographically for deterministic ordering.
4. Frontmatter is parsed from each file to extract metadata.
5. A skill is marked `enabled: false` if **either**:
   - The frontmatter `enabled` field is `false`, **or**
   - The skill's ID appears in `config.skills.disabledIds`.

The result is an array of `SkillRecord` objects:

```typescript
interface SkillRecord {
  readonly id: string;
  readonly title: string;
  readonly absolutePath: string;
  readonly enabled: boolean;
  readonly tags: readonly string[];
  readonly category: string | null;
  readonly description: string | null;
}
```

### Skill Search

The `searchSkills()` function provides filtering and ranked search over a list of `SkillRecord`s.

#### Search Parameters

```typescript
interface SkillSearchParams {
  query?: string | null;      // Free-text search
  tags?: readonly string[];   // AND-logic tag filter
  category?: string | null;   // Exact category match
  limit?: number;             // Max results (default: 10)
  offset?: number;            // Pagination offset (default: 0)
}
```

#### Search Behavior

- **Tag filter**: AND logic — a skill must have *all* specified tags to match.
- **Category filter**: Exact match (case-insensitive after normalization).
- **Query scoring**: When a `query` is provided, skills with zero relevance are excluded. Relevance is computed via case-insensitive substring matching with weighted fields:
  - `id` and `title`: weight **3×**
  - `description`: weight **2×**
  - `tags` and `category`: weight **1×**
- Results are sorted by score descending, then by `id` ascending for stable ordering.
- Pagination is applied via `offset` and `limit` after sorting.

#### Search Result

```typescript
interface SkillSearchResult {
  readonly skill: SkillRecord;
  readonly score: number;       // 0 when no query provided
}
```

### Configuration Helpers

| Function | Purpose |
|----------|---------|
| `resolveSkillScanRoots(config)` | Resolves `config.skills.scanRoots` paths relative to `config.configDirectory`. |
| `listSkillsForConfig(config)` | Full scan: resolves roots, applies `disabledIds`, returns all `SkillRecord`s. |
| `skillAbsolutePathById(config, id)` | Looks up a single skill's absolute file path by its ID. Returns `undefined` if not found. |

---

## Plugins

### Plugin Manifest (`shoggoth.json`)

Every plugin directory must contain a `shoggoth.json` file at its root. The manifest is validated with a strict Zod schema:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "hooks": {
    "daemon.startup": "./hooks/startup.js",
    "daemon.shutdown": "./hooks/shutdown.js"
  }
}
```

#### Manifest Fields

| Field     | Type                          | Required | Description |
|-----------|-------------------------------|----------|-------------|
| `name`    | `string`                      | Yes      | Plugin name (non-empty). |
| `version` | `string`                      | Yes      | Plugin version (non-empty). |
| `hooks`   | `Record<HookName, string>`    | No       | Map of hook names to relative file paths. Each file must default-export a function. |

The schema is **strict** — unknown fields cause validation failure.

#### Supported Hook Names (v1)

| Hook Name          | When It Fires |
|--------------------|---------------|
| `daemon.startup`   | When the Shoggoth daemon starts up. |
| `daemon.shutdown`  | When the Shoggoth daemon shuts down. |

### Plugin Loading

Plugins are loaded by `loadPluginFromDirectory()`:

1. Read and parse `shoggoth.json` from the plugin's root directory.
2. Validate the manifest against the strict Zod schema.
3. For each entry in `hooks`:
   - Resolve the relative path to an absolute file URL.
   - Dynamically `import()` the module.
   - Verify the module's `default` export is a function.
   - Register the function as a handler in the `HookRegistry`.
4. Return `LoadedPluginMeta` (`name`, `version`, `rootDir`).

If the default export is not a function, loading throws an error.

### Plugin Resolution (Config-Driven)

`loadAllPluginsFromConfig()` iterates over `config.plugins` entries. Each entry can specify a plugin by:

- **Local path** (`entry.path`): Resolved relative to `config.configDirectory`. Absolute paths are used as-is.
- **npm package** (`entry.package`): Resolved via `createRequire()` from a reference file, locating the package's `package.json` and using its parent directory as the plugin root.

Each plugin load attempt is audited:

```typescript
interface PluginAuditEvent {
  readonly action: "plugin.load" | "plugin.unload";
  readonly resource: string;       // entry.id ?? entry.path ?? entry.package ?? "unknown"
  readonly outcome: "success" | "failure";
  readonly detail?: string;        // Error message on failure
}
```

Loading failures are caught and audited — they do **not** abort the loading of subsequent plugins.

Successfully loaded plugins are returned as `LoadedPluginRef[]` for later use (e.g. shutdown unload auditing):

```typescript
interface LoadedPluginRef {
  readonly resource: string;
  readonly manifestName: string;
}
```

### Hook Registry

The `HookRegistry` is the central dispatch mechanism for plugin hooks.

```typescript
type HookName = "daemon.startup" | "daemon.shutdown";
type HookHandler = (ctx?: unknown) => void | Promise<void>;
```

#### API

| Method | Description |
|--------|-------------|
| `register(name, handler)` | Append a handler for the given hook. Multiple handlers per hook are supported. |
| `run(name, ctx?)` | Execute all handlers for a hook **sequentially** (in registration order), awaiting each. An optional context object is passed to every handler. |
| `clear(name)` | Remove all handlers for a specific hook (e.g. during plugin unload). |
| `reset()` | Remove all handlers for all hooks. |

Handlers are executed in FIFO order (the order they were registered). Each handler is `await`ed before the next runs — there is no parallel execution.

---

## Package Exports

The public API exported from `@shoggoth/skills-plugins`:

```typescript
// Plugin loading
loadAllPluginsFromConfig, resolveLocalPluginPath, resolveNpmPluginRoot
type LoadedPluginRef, PluginAuditEvent, PluginAuditOutcome

// Hook system
HookRegistry
type HookHandler, HookName

// Single-plugin loader
loadPluginFromDirectory
type LoadedPluginMeta

// Plugin manifest
parseShoggothPluginManifest, shoggothPluginManifestSchema
type ShoggothPluginManifest

// Frontmatter utilities
parseBoolField, parseMarkdownFrontmatter

// Skill scanning
scanSkillDirectories
type SkillRecord

// Skill search
searchSkills
type SkillSearchParams, SkillSearchResult

// Config-level skill helpers
listSkillsForConfig, resolveSkillScanRoots, skillAbsolutePathById
```

---

## Quick-Start Examples

### Writing a Skill File

Create a `.md` file under any configured scan root:

```markdown
---
id: docker.compose-debug
title: Debug Docker Compose Issues
description: Step-by-step guide for troubleshooting docker-compose failures
tags: [docker, debugging, containers]
category: dev-tools
enabled: true
---

When a `docker-compose up` command fails, follow these steps...
```

### Writing a Plugin

1. Create a directory with a `shoggoth.json`:

```json
{
  "name": "my-startup-plugin",
  "version": "0.1.0",
  "hooks": {
    "daemon.startup": "./on-startup.js"
  }
}
```

2. Create the hook handler file (`on-startup.js`):

```javascript
export default async function onStartup(ctx) {
  console.log("Shoggoth daemon is starting up!");
}
```

3. Reference the plugin in your Shoggoth config:

```json
{
  "plugins": [
    { "path": "./plugins/my-startup-plugin" }
  ]
}
```

Or for an npm-published plugin:

```json
{
  "plugins": [
    { "package": "shoggoth-plugin-example" }
  ]
}
```

### Disabling Skills via Config

Add skill IDs to `config.skills.disabledIds` (see [Shared — ShoggothSkillsConfig](shared.md#configuration-schema)):

```json
{
  "skills": {
    "scanRoots": ["./skills"],
    "disabledIds": ["docker.compose-debug", "aws.lambda-deploy"]
  }
}
```

This overrides the file-level `enabled` field — even if the file says `enabled: true`, the skill will be disabled.

---

## See Also

- [Daemon](daemon.md) — loads plugins at startup and runs hook handlers
- [MCP Integration](mcp-integration.md) — `builtin-skills` tool exposes skills to agents
- [Shared](shared.md) — `ShoggothSkillsConfig` and `ShoggothPluginEntry` schemas
