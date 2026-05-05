// RED Phase 2: This is a stub that will make tests fail
// The real implementation will be added in the next phase

import { ToolDefinition } from "../types";

interface BuiltinToolContext {
  workspacePath: string;
}

interface SearchMatch {
  filePath: string;
  lineNumber: number;
  context: string;
  matchedText: string;
}

interface SearchResult {
  matches: SearchMatch[];
  totalMatches: number;
}

// Stub implementation - returns empty results to make tests fail
export async function builtinSearch(
  _params: {
    path: string;
    pattern: string;
    caseSensitive?: boolean;
    contextLines?: number;
    maxResults?: number;
  },
  _ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  // RED PHASE: Return empty results so all assertions fail
  const emptyResult: SearchResult = {
    matches: [],
    totalMatches: 0,
  };

  return {
    resultJson: JSON.stringify(emptyResult),
  };
}

// Export as a tool definition for registration
export const builtinSearchTool: ToolDefinition = {
  name: "builtin-search",
  description: "Search for patterns in files",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File or directory path to search" },
      pattern: { type: "string", description: "Regex pattern to search for" },
      caseSensitive: { type: "boolean", description: "Case-sensitive search (default: false)" },
      contextLines: { type: "number", description: "Number of context lines around matches" },
      maxResults: { type: "number", description: "Maximum number of results to return" },
    },
    required: ["path", "pattern"],
  },
};
