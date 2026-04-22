import type { ChatContentPart } from "@shoggoth/models";
import { IMAGE_MIME_TO_EXTENSION } from "@shoggoth/shared";

export interface OutboundImageAttachment {
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
}

interface OutboundImageResult {
  readonly textContent: string;
  readonly imageAttachments: OutboundImageAttachment[];
}

/**
 * Extract image blocks from assistant content, decode base64 to raw bytes,
 * and return cleaned text + attachment list.
 *
 * - String / null content passes through unchanged (no attachments).
 * - `ChatContentPart[]` content: text parts are concatenated, base64 image
 *   parts become `OutboundImageAttachment`s, URL-only images become `[image]`
 *   placeholders in the text.
 */
export function extractOutboundImages(
  content: string | ChatContentPart[] | null,
): OutboundImageResult {
  if (content === null || typeof content === "string") {
    return { textContent: content ?? "", imageAttachments: [] };
  }

  const textParts: string[] = [];
  const imageAttachments: OutboundImageAttachment[] = [];
  let imageIndex = 0;

  for (const part of content) {
    if (part.type === "text") {
      textParts.push(part.text);
    } else if (part.type === "image") {
      if (part.base64) {
        const ext = IMAGE_MIME_TO_EXTENSION[part.mediaType] ?? ".png";
        imageAttachments.push({
          filename: `image-${imageIndex}${ext}`,
          mediaType: part.mediaType,
          bytes: Buffer.from(part.base64, "base64"),
        });
        imageIndex++;
      } else {
        // URL-only image — no bytes to attach; insert placeholder.
        textParts.push("[image]");
      }
    }
  }

  return {
    textContent: textParts.join(""),
    imageAttachments,
  };
}
