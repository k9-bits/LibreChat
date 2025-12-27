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
  define: {
    'process.env': {},
  },
  server: {
    host: '127.0.0.1',
    port: 3090,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3080',
        changeOrigin: true,
        secure: false,
      },
      '/oauth': {
        target: 'http://127.0.0.1:3080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});