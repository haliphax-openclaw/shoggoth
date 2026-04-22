# builtin-skills

List, locate, or read installed agent skills.

## Parameters

| Param    | Type   | Required          | Notes                         |
| -------- | ------ | ----------------- | ----------------------------- |
| `action` | string | yes               | `list`, `path`, or `read`     |
| `id`     | string | for `path`/`read` | Skill id (from `list` output) |

## Actions

- **list** — returns all skills: `id`, `title`, `path`, `enabled`.
- **path** — returns the absolute path of a skill's SKILL.md.
- **read** — returns the absolute path and full content of a skill's SKILL.md.

## Examples

**List all skills:**

```json
{ "action": "list" }
```

**Get a skill's path:**

```json
{ "action": "path", "id": "weather" }
```

**Read a skill's content:**

```json
{ "action": "read", "id": "weather" }
```

## Tips

- Use `list` first to discover available skill ids.
- Prefer `path` over `read` when you only need the location (avoids loading full content into context).
- Disabled skills still appear in `list`; check the `enabled` field.
