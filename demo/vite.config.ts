import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    dedupe: [
      'react',
      'react-dom',
      'react-leaflet',
      '@react-leaflet/core',
      'leaflet',
    ],
  },
  optimizeDeps: {
    force: true,
  },
});
