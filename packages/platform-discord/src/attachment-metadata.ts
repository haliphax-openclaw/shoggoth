import type { MessageAttachment } from "@shoggoth/messaging";

/**
 * Format a byte count into a human-readable string (e.g. "1.2 KB", "3.4 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Build a human-readable metadata block describing message attachments.
 *
 * ```
 * [message has 2 attachment(s)]
 * - photo.png (image/png, 1.2 KB)
 * - doc.pdf (application/pdf, 3.4 MB)
 * ```
 */
export function formatAttachmentMetadata(
  attachments: readonly MessageAttachment[],
): string {
  const header = `[message has ${attachments.length} attachment(s)]`;
  const lines = attachments.map((a) => {
    const parts: string[] = [];
    if (a.contentType) parts.push(a.contentType);
    if (a.sizeBytes !== undefined) parts.push(formatBytes(a.sizeBytes));
    const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    return `- ${a.filename}${detail}`;
  });
  return [header, ...lines].join("\n");
}
