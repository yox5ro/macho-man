import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        // OriginとHostの一致を使うCSRF検証のため、画面側のHostを保持する。
        changeOrigin: false,
      },
    },
  },
})
