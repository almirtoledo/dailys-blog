import { resolve } from 'node:path';
import { cwd } from 'node:process';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config.js';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    root: './',
  },
  plugins: [
    (swc.vite({
      module: { type: 'es6' },
    }) as unknown as any),
  ],
  resolve: {
    alias: {
      '@': resolve(cwd(), 'src'),
    },
  },
});
