import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Starting a PGlite instance and generating its schema is slower than the default timeouts allow.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
