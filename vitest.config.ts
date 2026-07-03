import { defineConfig } from 'vitest/config'

// Pure-logic unit tests (lib/*). No DOM needed — the geometry, sanitization and
// plan-normalisation code under test is all plain functions. Component/canvas
// interaction tests can add environment: 'jsdom' later if needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
  },
})
