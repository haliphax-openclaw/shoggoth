import type { ChatContentPart } from "./types";

/**
 * Extracts thinking blocks from content that uses XML-style tags.
 * Returns an array of ChatContentPart if thinking tags are found,
 * otherwise returns the original string unchanged.
 */
export function extractXmlThinkingBlocks(
  content: string,
): string | ChatContentPart[] {
  const regex = /<thinking>([\s\S]*?)<\/thinking>/g;

  // Quick check: if no matches, return original string
  if (!regex.test(content)) {
    return content;
  }

  // Reset regex state for iteration
  regex.lastIndex = 0;

  const parts: ChatContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Add text before this thinking block
    const before = content.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push({ type: "text", text: before });
    }

    // Add thinking block (skip if empty after trim)
    const thinkingText = match[1].trim();
    if (thinkingText) {
      parts.push({ type: "thinking", text: thinkingText });
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text after the last thinking block
  const after = content.slice(lastIndex).trim();
  if (after) {
    parts.push({ type: "text", text: after });
  }

  // If we only have one text part, return it as a string
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].text;
  }

  return parts;
}

/**
 * Normalizes thinking blocks based on the format specified in model capabilities.
 * - "native": Returns content unchanged (provider handles thinking natively)
 * - "xml-tags": Extracts thinking blocks from XML tags
 * - "none": Returns content unchanged (no thinking processing)
 */
export function normalizeThinkingBlocks(
  content: string,
  format: "native" | "xml-tags" | "none" | undefined,
): string | ChatContentPart[] {
  if (format !== "xml-tags") {
    return content;
  }

  return extractXmlThinkingBlocks(content);
}
