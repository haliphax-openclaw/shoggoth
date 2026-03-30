import { ModelHttpError } from "@shoggoth/models";
import { daemonNotice } from "../notices/load-notices";

/** Discord message body limit; success and error replies are sliced to this length. */
export const DISCORD_PLATFORM_MAX_MESSAGE_BODY_CHARS = 2000;

const GENERIC_ERROR_MESSAGE_CAP = 360;

const FETCH_LIKE_TYPEERROR =
  /fetch|Failed to fetch|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network|NetworkError/i;

/**
 * Maps thrown values to short, Discord-safe copy (no stacks). The caller should
 * still log full `String(e)` for operators.
 */
export function formatDiscordPlatformErrorUserText(e: unknown): string {
  if (e instanceof ModelHttpError) {
    return modelHttpErrorToDiscordMessage(e);
  }
  if (e instanceof TypeError) {
    const m = e.message ?? "";
    if (FETCH_LIKE_TYPEERROR.test(m)) {
      return daemonNotice("discord-error-network-fetch");
    }
  }

  const raw = e instanceof Error ? e.message : String(e);
  const hitlId = extractHitlPendingId(raw);
  if (hitlId) {
    return daemonNotice("discord-error-hitl-pending", { hitlId });
  }

  if (e instanceof Error) {
    const line = raw.split("\n")[0]?.trim() ?? raw;
    return truncate(line, GENERIC_ERROR_MESSAGE_CAP);
  }

  return truncate(String(e), GENERIC_ERROR_MESSAGE_CAP);
}

export function sliceDiscordPlatformMessageBody(text: string): string {
  return text.slice(0, DISCORD_PLATFORM_MAX_MESSAGE_BODY_CHARS);
}

function extractHitlPendingId(s: string): string | undefined {
  const m = s.match(/hitl_pending:([^\s]+)/);
  return m?.[1];
}

function modelHttpErrorToDiscordMessage(err: ModelHttpError): string {
  switch (err.status) {
    case 429:
      return daemonNotice("discord-error-model-429");
    case 502:
    case 503:
    case 504:
      return daemonNotice("discord-error-model-502-504");
    case 500:
      return daemonNotice("discord-error-model-500");
    case 401:
      return daemonNotice("discord-error-model-401");
    case 400: {
      const detail = err.bodySnippet?.trim();
      const excerpt = detail ? truncate(detail, 420) : "";
      return excerpt.length > 0
        ? daemonNotice("discord-error-model-400-with-detail", { detail: excerpt })
        : daemonNotice("discord-error-model-400-generic");
    }
    default:
      return daemonNotice("discord-error-model-default", { status: String(err.status) });
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
