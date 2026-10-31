import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset paths so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
})
