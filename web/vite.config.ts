import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080'
const apiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
    ws: true,
  },
  '/health': {
    target: apiProxyTarget,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        brand: resolve(import.meta.dirname, 'brand/index.html'),
      },
    },
  },
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})