# Builtin Tool Enhancements Specification

## Overview

This document provides detailed specifications for each enhancement to builtin tools, including interface signatures, behaviors, and example usage.

---

## Phase 1: Formatted Output for `builtin-read`

### Current Behavior

```typescript
// Current implementation returns single line
builtin-read(path: string): string
// Output: "line1\nline2\nline3"
```

### New Interface

```typescript
interface BuiltinReadParams {
  path: string;
  lines?: boolean; // Split output by newline characters
  lineNumbers?: boolean; // Prefix each line with number
}
```

### Expected Output Formats

**Basic (current):**

```
line1
line2
line3
```

**With `--lines` (split):**

```
line1
line2
line3
```

(As separate lines, not escaped newlines)

**With `--lines --line-numbers`:**

```
1: line1
2: line2
3: line3
```

**Large file handling:**

- For files > 1000 lines, add truncation warning
- Provide option to show only first/last N lines

### Edge Cases

1. Empty files: Return empty string regardless of flags
2. Files with special characters: Escape properly
3. Binary files: Detect and warn user

---

## Phase 2: Split `builtin-search-replace`

### New `builtin-search` Tool

```typescript
interface BuiltinSearchParams {
  path: string; // File or directory path
  pattern: string; // Regex pattern to search
  caseSensitive?: boolean; // Default: false
  contextLines?: number; // Lines of context around matches (default: 2)
  maxResults?: number; // Cap results (default: 100)
}
```

**Return Value:**

```typescript
interface SearchResults {
  matches: Array<{
    filePath: string;
    lineNumber: number;
    context: string;
    matchedText: string;
  }>;
  totalMatches: number;
}
```

### Modified `builtin-replace` Tool

```typescript
interface BuiltinReplaceParams {
  file: string; // File path
  pattern: string; // Regex pattern to match
  replacement: string; // Replacement text
  caseSensitive?: boolean; // Default: false
  maxOccurrences?: number; // Limit replacements (default: Infinity)
  dryRun?: boolean; // Preview without modifying
}
```

### API Consistency

- Rename `file` parameter to `path` in `builtin-replace` for consistency
- Deprecate old `file` parameter with warning, support both temporarily

---

## Phase 3: Improved Regex Error Messages

### Current Error Format

```
Error: Invalid regular expression...
```

### New Error Format

```
Error: Invalid regular expression at position 15:
  Pattern: /abc[d/
              ^
  Context: The pattern is missing a closing bracket ']'
```

### Error Components

1. **Position indicator**: Character position where parsing failed
2. **Pattern display**: Show the problematic pattern with marker
3. **Context explanation**: User-friendly description of the issue
4. **Suggestion**: Optional recommended fix

### Error Handling

```typescript
try {
  new RegExp(userPattern, flags);
} catch (e: any) {
  if (e instanceof SyntaxError) {
    throw new ToolError(
      `Invalid regex pattern at position ${e.index}:\n  Pattern: /${userPattern}/\n  Error: ${e.message}`,
    );
  }
  throw e;
}
```

---

## Phase 4: Multiline String Support in `builtin-exec`

### Current Limitation

```bash
# Difficult to pass multiline content
builtin-exec argv: ["git", "commit", "-m", "line1\nline2\nline3"]
```

### New Approaches

**Option A: JSON Array with String Arrays**

```typescript
builtin-exec(argv: string[][]): Result
// argv[0] can be array of lines joined by newlines
```

**Option B: Dedicated Multiline Flag**

```typescript
interface BuiltinExecParams {
  argv: string[];
  multiline?: boolean; // If true, join argv[1] with newlines
  multilineMode?: "join" | "block"; // How to handle multiline content
}
```

**Option C: JSON String with Escaping (Recommended)**

```typescript
// Support standard JSON escaping in strings
builtin-exec(argv: ["git", "commit", "-m", "This is line 1\nThis is line 2"])
// Or use heredoc-style:
builtin-exec(argv: ["git", "commit", "-m"], multiline: "This is line 1\nThis is line 2")
```

### Recommended Implementation

Implement JSON-aware string parsing where `\n` sequences are preserved as newlines when passed through tool APIs, and provide documentation on proper escaping.

---

## Phase 5: Dry-Run Mode for Replacements

### New Interface Extension

```typescript
interface BuiltinReplaceParams {
  path: string;
  pattern: string;
  replacement: string;
  caseSensitive?: boolean;
  maxOccurrences?: number;
  dryRun?: boolean; // NEW: Preview changes only
}
```

### Dry-Run Output Format

```
Dry-run mode: No files will be modified.

File: example.ts
  Line 42: Change
    Before: const x = 10;
    After:  const x = 20;

  Line 157: Change
    Before: let y = false;
    After:  let y = true;

2 replacements would be made.
```

### Implementation Details

1. Parse file into lines
2. Apply regex to find all matches
3. For each match, compute replacement
4. Output diff-like format showing changes
5. If `dryRun: false`, apply changes

### Safety Features

- Always require explicit `dryRun: false` to modify files
- For non-dry-run, show final confirmation prompt if > 10 changes
- Never modify files if pattern matches > 1000 locations (prevent accidents)

---

## Phase 6: Line-Level Operations

### Line Deletion

**Interface:**

```typescript
interface BuiltinReplaceParams {
  path: string;
  deleteLines: number[]; // Array of line numbers to delete (1-indexed)
  deleteRange?: {
    // Alternative: range deletion
    start: number;
    end: number;
  };
}
```

**Example Usage:**

```
Delete lines 10-20:
{
  path: "file.ts",
  deleteRange: { start: 10, end: 20 }
}

Delete lines 5, 15, 25:
{
  path: "file.ts",
  deleteLines: [5, 15, 25]
}
```

### Range Replacement

**Interface:**

```typescript
interface BuiltinReplaceParams {
  path: string;
  replaceRange: {
    // Replace a range of lines
    start: number;
    end: number;
    replacement: string; // Single string or array of strings
  };
}
```

**Example Usage:**

```
Replace lines 5-10 with new content:
{
  path: "config.yaml",
  replaceRange: {
    start: 5,
    end: 10,
    replacement: [
      "new_key: value1",
      "new_key: value2"
    ]
  }
}
```

### Implementation Details

1. **Line numbering**: 1-indexed for user-friendliness
2. **Error handling**:
   - Out-of-range lines: Clear error message
   - Overlapping deletions: Merge and warn
   - Invalid ranges: End < start
3. **File format preservation**:
   - Maintain original line endings (CRLF vs LF)
   - Preserve trailing newline if present

### Edge Cases

- Deleting entire file
- Replacing with empty content
- Ranges that span entire file
- Mixed line ending types

---

## Testing Strategy

### Unit Tests

- Each tool gets dedicated test file
- Test all parameter combinations
- Mock file system operations
- Test error handling specifically

### Integration Tests

- Real file operations with cleanup
- Cross-tool scenarios
- Large file handling
- Edge case testing

### Regression Tests

- Existing usage patterns must continue to work
- Backwards compatibility assertions

---

## Documentation Updates Required

1. Tool reference documentation for each modified/new tool
2. Migration guide for renamed parameters
3. Examples for each new feature
4. Error message reference

---

## API Versioning

- All changes are additive or non-breaking
- Deprecated parameters will be supported for one major version
- Release notes will document all changes
