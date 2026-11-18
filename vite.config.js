import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages serves only files that exist, so /TodoApp/admin/ gets its own copy of the page.
// Assets are linked from the base path, so the copy works unchanged; the app reads the path
// to decide whether to show admin-only features (src/adminMode.js).
function adminPage() {
  return {
    name: 'admin-page',
    apply: 'build',
    async writeBundle(options) {
      const dir = options.dir ?? 'dist'
      await mkdir(join(dir, 'admin'), { recursive: true })
      await copyFile(join(dir, 'index.html'), join(dir, 'admin', 'index.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), adminPage()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  base: '/TodoApp/',
  test: {
    include: ['src/**/*.test.{js,jsx}', 'supabase/functions/**/*.test.js'],
    environment: 'node',
  },
})
