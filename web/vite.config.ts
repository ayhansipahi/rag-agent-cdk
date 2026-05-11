import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Local dev: proxy /chat to the deployed Lambda Function URL.
      // Override with VITE_BACKEND_URL=http://localhost:... if running the
      // backend locally with SAM or a similar harness.
      '/chat': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:9999',
        changeOrigin: true,
      },
    },
  },
});
