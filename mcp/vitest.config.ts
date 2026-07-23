import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@scanner': path.resolve(__dirname, '../src/lib/scanner'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
