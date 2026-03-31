import { readHandleOutput, type BackgroundHandle } from "./subprocess";
import { listExecSessions } from "./tools";

// ---------------------------------------------------------------------------
// Poll tool — check status and output of a background process by PID
// ---------------------------------------------------------------------------

/** Input parameters for the poll tool. */
export interface PollOptions {
  /** Process ID of the background process to check. */
  pid: number;
  /**
   * Maximum milliseconds to wait for the process to finish before returning
   * current status. 0 (default) returns immediately.
   */
  timeout?: number;
  /**
   * When true, return stdout and stderr as separate fields instead of
   * combined `output`.
   */
  streams?: boolean;
  /** Return only the last N lines of output. */
  tail?: number;
  /**
   * Return only output captured after this byte offset. Enables incremental
   * reads across multiple polls.
   */
  since?: number;
}

/** Base fields shared by all poll responses. */
interface PollResultBase {
  pid: number;
  status: "running" | "exited";
  exitCode?: number;
  signal?: string;
  runtimeMs: number;
  /** True when the poll waited (timeout > 0) and the process was still running. */
  waited?: boolean;
  /** Actual milliseconds waited before returning. */
  waitedMs?: number;
}

/** Combined-output response (streams: false, the default). */
export interface PollCombinedResult extends PollResultBase {
  output: string;
  outputBytes: number;
  truncated: boolean;
}

/** Split-stream response (streams: true). */
export interface PollSplitResult extends PollResultBase {
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export type PollResult = PollCombinedResult | PollSplitResult;

/** Error response when the PID is not tracked. */
export interface PollError {
  error: string;
}

export type PollResponse = PollResult | PollError;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the most recent background handle matching a given PID.
 * Handles PID reuse by preferring the most recently created session.
 */
function findHandleByPid(pid: number): BackgroundHandle | undefined {
  const sessions = listExecSessions();
  let best: BackgroundHandle | undefined;
  for (const handle of sessions.values()) {
    if (handle.pid === pid) {
      // sessionId format is "exec-<timestamp36>-<counter36>"
      // Later sessions have higher timestamps, so lexicographic comparison works.
      if (!best || handle.sessionId > best.sessionId) {
        best = handle;
      }
    }
  }
  return best;
}

/**
 * Get the full output string from a handle for a given stream, applying
 * `since` (byte offset) and `tail` (last N lines) filters.
 *
 * Returns { text, totalBytes, truncated }.
 * - `totalBytes` is the total byte count of the stream (before slicing).
 * - `truncated` is true when `since` or `tail` caused output to be trimmed.
 */
function getFilteredOutput(
  handle: BackgroundHandle,
  stream: "stdout" | "stderr",
  since: number | undefined,
  tail: number | undefined,
): { text: string; totalBytes: number; truncated: boolean } {
  const raw = readHandleOutput(handle, stream);
  const totalBytes = Buffer.byteLength(raw, "utf8");

  // `tail` takes precedence over `since` (per proposal)
  if (tail !== undefined) {
    const lines = raw.split("\n");
    // If the string ends with \n, the last element is empty — keep it natural
    const sliced = lines.length <= tail ? lines : lines.slice(-tail);
    const text = sliced.join("\n");
    return { text, totalBytes, truncated: lines.length > tail };
  }

  if (since !== undefined) {
    if (since >= totalBytes) {
      // Caller is caught up — return empty with current byte count
      return { text: "", totalBytes, truncated: false };
    }
    const buf = Buffer.from(raw, "utf8");
    const text = buf.subarray(since).toString("utf8");
    return { text, totalBytes, truncated: since > 0 };
  }

  return { text: raw, totalBytes, truncated: false };
}

/**
 * Estimate process runtime in milliseconds from the sessionId timestamp.
 * sessionId format: "exec-<base36 timestamp>-<counter>"
 */
function estimateRuntimeMs(handle: BackgroundHandle): number {
  const parts = handle.sessionId.split("-");
  // parts[0] = "exec", parts[1] = base36 timestamp, parts[2] = counter
  const startMs = parseInt(parts[1]!, 36);
  return Date.now() - startMs;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePollOptions(opts: PollOptions): void {
  if (opts.pid === undefined || opts.pid === null || typeof opts.pid !== "number") {
    throw new Error("`pid` is required and must be a number.");
  }
  if (!Number.isInteger(opts.pid) || opts.pid <= 0) {
    throw new Error("`pid` must be a positive integer.");
  }
  if (opts.timeout !== undefined) {
    if (typeof opts.timeout !== "number" || opts.timeout < 0) {
      throw new Error("`timeout` must be a non-negative number (milliseconds).");
    }
  }
  if (opts.tail !== undefined) {
    if (typeof opts.tail !== "number" || !Number.isInteger(opts.tail) || opts.tail < 1) {
      throw new Error("`tail` must be a positive integer.");
    }
  }
  if (opts.since !== undefined) {
    if (typeof opts.since !== "number" || opts.since < 0) {
      throw new Error("`since` must be a non-negative number.");
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Poll a background process by PID — check its status and retrieve output.
 *
 * This is a convenience tool that wraps the background session registry.
 * It only tracks processes started via `toolExecExtended` with background
 * or yield-based execution.
 */
export async function toolPoll(opts: PollOptions): Promise<PollResponse> {
  validatePollOptions(opts);

  const handle = findHandleByPid(opts.pid);
  if (!handle) {
    return { error: `no tracked process with pid ${opts.pid}` };
  }

  const timeoutMs = opts.timeout ?? 0;
  let waited = false;
  let waitedMs = 0;

  // If the process is still running and timeout > 0, wait for it
  if (!handle.exited && timeoutMs > 0) {
    const waitStart = Date.now();
    const finished = await Promise.race([
      handle.done.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    waitedMs = Date.now() - waitStart;
    waited = true;
    // `finished` tells us if it completed within the window — but we check
    // handle.exited below regardless (it's the source of truth).
    void finished;
  }

  const runtimeMs = estimateRuntimeMs(handle);

  // Build base result
  const base: PollResultBase = {
    pid: opts.pid,
    status: handle.exited ? "exited" : "running",
    runtimeMs,
  };

  if (handle.exited) {
    base.exitCode = handle.exitCode ?? undefined;
    if (handle.signal) {
      base.signal = handle.signal;
    }
  }

  if (waited) {
    base.waited = true;
    base.waitedMs = waitedMs;
  }

  // Build output fields
  if (opts.streams) {
    const out = getFilteredOutput(handle, "stdout", opts.since, opts.tail);
    const err = getFilteredOutput(handle, "stderr", opts.since, opts.tail);
    return {
      ...base,
      stdout: out.text,
      stderr: err.text,
      stdoutBytes: out.totalBytes,
      stderrBytes: err.totalBytes,
      stdoutTruncated: out.truncated,
      stderrTruncated: err.truncated,
    } as PollSplitResult;
  }

  // Combined output
  const outData = getFilteredOutput(handle, "stdout", opts.since, opts.tail);
  const errData = getFilteredOutput(handle, "stderr", opts.since, opts.tail);

  // Combine stdout + stderr text and byte counts
  const combinedText = outData.text + errData.text;
  const combinedBytes = outData.totalBytes + errData.totalBytes;
  const combinedTruncated = outData.truncated || errData.truncated;

  return {
    ...base,
    output: combinedText,
    outputBytes: combinedBytes,
    truncated: combinedTruncated,
  } as PollCombinedResult;
}
