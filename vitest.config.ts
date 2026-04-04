import { defineConfig } from "vitest/config";

export default defineConfig({
  poolOptions: {
    forks: {
      maxForks: 4,
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    onConsoleLog: () => false,
    pool: "forks",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 10_000,
  },
});
