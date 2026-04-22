/** Max characters before truncation kicks in. */
const MAX_CHARS = 50_000;
/** Characters kept from each end when truncating. */
const KEEP = 10_000;

const NOTICE =
  "\n\n[... truncated — output exceeded 50,000 characters ...]\n\n";

/**
 * If `text` exceeds 50k characters, return the first and last 10k with a
 * truncation notice in between. Otherwise return as-is.
 */
export function truncateToolOutput(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, KEEP) + NOTICE + text.slice(-KEEP);
}
