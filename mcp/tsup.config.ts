import { defineConfig } from 'tsup';
import path from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: true,
  // Bundle scanner-core into the output, keep MCP SDK external
  noExternal: [/^(?!@modelcontextprotocol)/],
  esbuildOptions(options) {
    // Resolve @scanner/* path alias to the actual scanner source
    options.alias = {
      '@scanner': path.resolve(__dirname, '../src/lib/scanner'),
    };
  },
});
