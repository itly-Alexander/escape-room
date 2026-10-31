import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// The build's version, shown on the start page: the commit it was built from
// and that commit's date, e.g. "5b2e393 · 2026-10-31".
function buildVersion() {
  try {
    return execSync('git log -1 --format="%h · %cs"').toString().trim()
  } catch {
    return 'unknown'
  }
}

// Relative asset paths so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
})
