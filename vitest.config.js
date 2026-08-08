import { defineConfig } from "vitest/config";

// Behaviour tests drive a real browser against a real dev server, so they are
// slow by nature. They run sequentially: the dev server and stub backend bind
// fixed ports, and parallel files would fight over them.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
