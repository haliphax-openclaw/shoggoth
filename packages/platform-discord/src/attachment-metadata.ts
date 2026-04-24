import type { MessageAttachment } from "@shoggoth/messaging";

/**
 * Format a byte count into a human-readable string (e.g. "1.2 KB", "3.4 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Build a human-readable metadata block describing message attachments.
 *
 * ```
 * [message has 2 attachment(s)]
 * - photo.png (image/png, 1.2 KB) → media/inbound/1234567890_photo.png
 * - doc.pdf (application/pdf, 3.4 MB) → media/inbound/1234567890_doc.pdf
 * ```
 */
export function formatAttachmentMetadata(attachments: readonly MessageAttachment[]): string {
  const header = `[message has ${attachments.length} attachment(s)]`;
  const lines = attachments.map((a) => {
    const parts: string[] = [];
    if (a.contentType) parts.push(a.contentType);
    if (a.sizeBytes !== undefined) parts.push(formatBytes(a.sizeBytes));
    const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    const path = a.localPath ? ` \u2192 ${a.localPath}` : "";
    return `- ${a.filename}${detail}${path}`;
  });
  return [header, ...lines].join("\n");
}
