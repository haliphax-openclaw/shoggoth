import { setRootLogger, type Logger } from "@shoggoth/shared";
import { vi } from "vitest";

// Silence all loggers that go through the root singleton
const noop = () => {};
const noopLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  child: () => noopLogger,
};
setRootLogger(noopLogger);

// Catch any log output that bypasses the root logger (e.g. direct createLogger calls)
// by suppressing JSON log lines written to stderr
const originalStderrWrite = process.stderr.write.bind(process.stderr);
vi.spyOn(process.stderr, "write").mockImplementation((chunk: any, ...args: any[]) => {
  const str = typeof chunk === "string" ? chunk : chunk.toString();
  // Suppress structured JSON log lines; let everything else through
  if (str.startsWith("{\"ts\":")) return true;
  return (originalStderrWrite as any)(chunk, ...args);
});
