import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/content',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'linkedin-main': resolve(__dirname, 'src/content/linkedin-main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@services': resolve(__dirname, 'src/services'),
      '@content': resolve(__dirname, 'src/content'),
    },
  },
});
