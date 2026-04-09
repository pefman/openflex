import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7878',
      '/auth': 'http://localhost:7878',
      '/cache': 'http://localhost:7878',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
