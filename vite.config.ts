import { defineConfig } from 'vite';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import dts from 'vite-plugin-dts';
import { externalizeDeps } from 'vite-plugin-externalize-deps';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        global: true,
      },
    }),
    dts({
      entryRoot: path.resolve(__dirname, 'src/lib'),
      insertTypesEntry: true,
    }),
    externalizeDeps(),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/lib/index.ts'),
      fileName: 'main',
      formats: ['es', 'cjs'],
    },
    outDir: 'dist',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        globals: {
          react: 'React',
          'react-dom': 'reactdom',
        },
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.browser': true,
  },
});
