import { defineConfig } from 'tsup';
import path from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  // Emit a single bundled index.d.ts (the engine types are inlined from ../src/lib/scanner).
  dts: true,
  splitting: false,
  sourcemap: true,
  // The engine (../src/lib/scanner via the @scanner alias) is bundled into dist.
  // It only uses Node built-ins and global fetch at runtime, so the published
  // package has no runtime dependencies. `yaml` (zero-dependency) is bundled too;
  // anything else under node_modules stays external.
  noExternal: [/^@scanner\//, /^yaml(\/|$)/],
  esbuildOptions(options) {
    // Resolve @scanner/* path alias to the actual scanner source
    options.alias = {
      '@scanner': path.resolve(__dirname, '../src/lib/scanner'),
    };
  },
});
