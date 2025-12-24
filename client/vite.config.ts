import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  // Fix: some deps reference `process.env` in browser builds
  define: {
    'process.env': {},
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5200',
        changeOrigin: true,
        secure: false,
      },
      '/oauth': {
        target: 'http://127.0.0.1:5200',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});