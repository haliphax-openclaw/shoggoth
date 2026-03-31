# Agent Instructions

## The Project

This is Shoggoth, an agent orchestration platform that is Docker-first with a strict permission boundary between the system (`root`, UID/GID `0`), the orchestrator daemon (`shoggoth`, UID/GID `900`) and agents (`agent`, UID/GID `901`).

## Plan Ahead

Significant or complex changes to the codebase should be planned first. Plan documents consisting of implementation/execution phases should be placed in the `plans/` folder in a date-stamped subfolder grouping them by plan. The primary plan document should be named `README.md`.

Example:

- `plans/2026-01-01_initial-implementation/` - plan folder
  - `README.md` - primary plan document
  - `phase-1-diagram.jpg` - related asset (diagram)
  - `phase-2-schema.json` - related asset (JSON schema)
  - `phase-3-spec.md` - complementary plan document

When all of the phases of a plan have been implemented, that plan's grouping folder should be moved to `plans/done/`.

Example: `plans/2025-01-01_initial-implementation/` -> `plans/done/2025-01-01_initial_implementation/`

### Plan Guidelines

- Break plans into chunked phases so they are easier to delegate to subagents
- Binary plan assets (images, etc.) should be kept small when possible to avoid bloating the git repository size

## Tests Before Code

Contributions to this codebase must use red/green TDD.

## It's Okay to Break Things

This is pre-release software, and the only user is the developer. Backward compatibility, maintaining call site structure, etc. are a waste of effort and should be skipped.

## Security First

The security principles and policies of the project should always be kept in mind when implementing new features or refactoring. The system, daemon, and agent layers should have read-only (or read-never) barriers between them both in the file system and in processes.

## Pluggable Platforms

Message platform code should maintain separation between a platform implementation (e.g. Discord reaction handling code) and the daemon's internal representation of the feature capability (reactions) for features that exist in multiple platforms.

Platforms should plug into system internals using hook points so that the implementation remains packaged and separate.

Discord is currently the only available platform, but it should not be treated as such--future platform development and layers of abstraction should always be considered when making changes to the messaging system.
