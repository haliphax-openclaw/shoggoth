import type { MessageAttachment } from "@shoggoth/messaging";
import { runAsUser } from "@shoggoth/os-exec";
import { MAX_IMAGE_BLOCK_BYTES } from "@shoggoth/shared";
import { join } from "node:path";
import { getLogger } from "../logging.js";

const log = getLogger();

export interface DownloadInboundAttachmentsOptions {
  readonly attachments: readonly MessageAttachment[];
  readonly messageId: string;
  readonly workspacePath: string;
  readonly creds: { readonly uid: number; readonly gid: number };
  readonly maxBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

function sanitizeFilename(raw: string): string {
  return (
    raw
      .replace(/\.\./g, "_")
      .replace(/[/\\]/g, "_")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f]/g, "")
      .trim() || "attachment"
  );
}

async function downloadOne(
  attachment: MessageAttachment,
  messageId: string,
  workspacePath: string,
  creds: { readonly uid: number; readonly gid: number },
  maxBytes: number,
  fetchFn: typeof fetch,
): Promise<MessageAttachment> {
  const safeName = sanitizeFilename(attachment.filename);
  const relativePath = `media/inbound/${messageId}_${safeName}`;
  const absolutePath = join(workspacePath, relativePath);

  try {
    const response = await fetchFn(attachment.url);
    if (!response.ok) {
      log.warn("attachment_download.fetch_failed", {
        status: response.status,
        url: attachment.url,
      });
      return attachment;
    }

    // Content-Length pre-check
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      log.warn("attachment_download.oversized", {
        contentLength,
        maxBytes,
        filename: attachment.filename,
      });
      return attachment;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Buffer size guard
    if (buffer.byteLength > maxBytes) {
      log.warn("attachment_download.oversized", {
        bufferSize: buffer.byteLength,
        maxBytes,
        filename: attachment.filename,
      });
      return attachment;
    }

    // Write file via runAsUser using a Node one-liner that decodes base64 from env
    const b64 = buffer.toString("base64");
    await runAsUser({
      file: process.execPath,
      args: [
        "-e",
        'require("fs").writeFileSync(process.env._DEST, Buffer.from(process.env._DATA, "base64"));',
      ],
      cwd: "/tmp",
      uid: creds.uid,
      gid: creds.gid,
      env: {
        _DEST: absolutePath,
        _DATA: b64,
      },
    });

    return { ...attachment, localPath: relativePath };
  } catch (err) {
    log.warn("attachment_download.failed", { filename: attachment.filename, err });
    return attachment;
  }
}

export async function downloadInboundAttachments(
  options: DownloadInboundAttachmentsOptions,
): Promise<readonly MessageAttachment[]> {
  const {
    attachments,
    messageId,
    workspacePath,
    creds,
    maxBytes = MAX_IMAGE_BLOCK_BYTES,
    fetchImpl = globalThis.fetch,
  } = options;

  if (attachments.length === 0) return [];

  const results = await Promise.allSettled(
    attachments.map((att) =>
      downloadOne(att, messageId, workspacePath, creds, maxBytes, fetchImpl),
    ),
  );

  return results.map((r, i) => (r.status === "fulfilled" ? r.value : attachments[i]));
}
