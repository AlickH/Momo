import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/app/momo/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/app/momo/api': 'http://127.0.0.1:5001',
      '/app/momo/healthz': 'http://127.0.0.1:5001',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
});
