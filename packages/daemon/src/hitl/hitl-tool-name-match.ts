/**
 * Canonical tool name match: exact string comparison on fully qualified names.
 */
export function hitlAutoApproveToolNamesMatch(requestedTool: string, allowedEntry: string): boolean {
  const x = requestedTool.trim();
  const y = allowedEntry.trim();
  if (!x || !y) return false;
  return x === y;
}
