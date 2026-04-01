import { DISCORD_PLATFORM_MAX_MESSAGE_BODY_CHARS } from "./errors";

/**
 * Paired inline formatting markers tracked across chunk boundaries.
 * Order matters: longer markers must come first so `**` is matched before `*`.
 */
const INLINE_MARKERS = ["**", "__", "~~", "||", "*"] as const;

/**
 * Split a Discord message into chunks that each fit within `maxLength`.
 *
 * Splitting priority: newline → space → hard-cut.
 *
 * Fenced code blocks (triple backticks with optional language tag) are tracked:
 * if a chunk ends inside a code block the chunk is closed with ``` and the next
 * chunk reopens with the same fence (including language tag).
 *
 * Paired inline formatting markers (`**`, `*`, `__`, `~~`, `||`) that are opened
 * but not closed within a chunk are closed at the end and reopened at the start
 * of the next chunk.
 */
export function splitDiscordMessage(
  text: string,
  maxLength: number = DISCORD_PLATFORM_MAX_MESSAGE_BODY_CHARS,
): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  /** Non-empty when we are inside a fenced code block; holds the full opening fence line (e.g. "```ts"). */
  let openFence = "";
  /** Inline markers that are currently "open" (toggled odd number of times). */
  let openInline: string[] = [];

  while (remaining.length > 0) {
    // Build a prefix that reopens any formatting state carried from the previous chunk.
    const prefix = buildReopenPrefix(openFence, openInline);
    const budget = maxLength - prefix.length;

    if (budget <= 0) {
      // Degenerate: maxLength too small to fit even the prefix. Hard-cut to avoid infinite loop.
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
      continue;
    }

    if (remaining.length <= budget) {
      chunks.push(prefix + remaining);
      break;
    }

    // Find a split point within budget.
    let splitAt = findSplitPoint(remaining, budget);

    // Reserve room for a closing suffix (fence + inline markers).
    const closeSuffix = buildCloseSuffix(remaining.slice(0, splitAt), openFence, openInline);
    if (splitAt + closeSuffix.length > budget) {
      // Recalculate with reduced budget.
      splitAt = findSplitPoint(remaining, budget - closeSuffix.length);
    }

    const raw = remaining.slice(0, splitAt);
    // Recalculate close suffix for the actual raw content (fence state may differ).
    const { suffix, newOpenFence, newOpenInline } = computeChunkSuffix(raw, openFence, openInline);

    chunks.push(prefix + raw + suffix);
    remaining = remaining.slice(splitAt);
    openFence = newOpenFence;
    openInline = newOpenInline;
  }

  return chunks;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function findSplitPoint(text: string, budget: number): number {
  if (text.length <= budget) return text.length;

  // Prefer newline boundary.
  const newlineIdx = text.lastIndexOf("\n", budget - 1);
  if (newlineIdx > 0) return newlineIdx + 1; // include the newline in this chunk

  // Then space boundary.
  const spaceIdx = text.lastIndexOf(" ", budget - 1);
  if (spaceIdx > 0) return spaceIdx + 1;

  // Hard-cut.
  return budget;
}

const FENCE_OPEN_RE = /^(`{3,})(\S*)/;

/**
 * Walk `raw` and determine what formatting state is open at the end.
 * Returns the suffix to append (closing markers) and the new open state
 * to carry into the next chunk.
 */
function computeChunkSuffix(
  raw: string,
  prevOpenFence: string,
  prevOpenInline: string[],
): { suffix: string; newOpenFence: string; newOpenInline: string[] } {
  let inFence = prevOpenFence !== "";
  let fenceTag = prevOpenFence;

  // Scan lines for fence toggles.
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (inFence) {
      // Check for closing fence.
      if (trimmed.startsWith("```") && trimmed.replace(/`/g, "").trim() === "") {
        inFence = false;
        fenceTag = "";
      }
    } else {
      const m = trimmed.match(FENCE_OPEN_RE);
      if (m && m[1].length >= 3) {
        inFence = true;
        fenceTag = m[2] ? `\`\`\`${m[2]}` : "```";
      }
    }
  }

  // Inline markers — only relevant outside code fences for the trailing text.
  // We track toggles across the entire raw chunk.
  const openInline = inFence ? [] : computeOpenInlineMarkers(raw, prevOpenInline, prevOpenFence);

  let suffix = "";
  let newOpenFence = "";
  const newOpenInline: string[] = [];

  // Close open inline markers (reverse order).
  if (openInline.length > 0) {
    suffix += [...openInline].reverse().join("");
    newOpenInline.push(...openInline);
  }

  // Close open fence.
  if (inFence) {
    suffix += (suffix || raw.endsWith("\n") ? "" : "\n") + "```";
    newOpenFence = fenceTag;
  }

  return { suffix, newOpenFence, newOpenInline };
}

/**
 * Determine which inline markers are "open" (toggled an odd number of times)
 * at the end of `raw`, starting from `prevOpen` state.
 *
 * Only counts markers that appear outside of fenced code blocks.
 */
function computeOpenInlineMarkers(
  raw: string,
  prevOpen: string[],
  prevOpenFence: string,
): string[] {
  const toggleCounts = new Map<string, number>();
  for (const m of prevOpen) toggleCounts.set(m, 1);

  let inFence = prevOpenFence !== "";

  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (inFence) {
      if (trimmed.startsWith("```") && trimmed.replace(/`/g, "").trim() === "") {
        inFence = false;
      }
      continue;
    }
    const m = trimmed.match(FENCE_OPEN_RE);
    if (m && m[1].length >= 3) {
      inFence = true;
      continue;
    }

    // Count inline marker occurrences in this line.
    let pos = 0;
    while (pos < line.length) {
      // Skip inline code spans.
      if (line[pos] === "`") {
        pos++;
        while (pos < line.length && line[pos] !== "`") pos++;
        if (pos < line.length) pos++; // skip closing backtick
        continue;
      }

      let matched = false;
      for (const marker of INLINE_MARKERS) {
        if (line.startsWith(marker, pos)) {
          toggleCounts.set(marker, (toggleCounts.get(marker) ?? 0) + 1);
          pos += marker.length;
          matched = true;
          break;
        }
      }
      if (!matched) pos++;
    }
  }

  // Markers with odd toggle count are "open".
  const open: string[] = [];
  for (const marker of INLINE_MARKERS) {
    const c = toggleCounts.get(marker) ?? 0;
    if (c % 2 === 1) open.push(marker);
  }
  return open;
}

function buildReopenPrefix(openFence: string, openInline: string[]): string {
  let prefix = "";
  if (openFence) prefix += openFence + "\n";
  if (openInline.length > 0) prefix += openInline.join("");
  return prefix;
}

function buildCloseSuffix(
  raw: string,
  prevOpenFence: string,
  prevOpenInline: string[],
): string {
  const { suffix } = computeChunkSuffix(raw, prevOpenFence, prevOpenInline);
  return suffix;
}
