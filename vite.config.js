import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Canvas import was first tested at /TodoApp/admin/. It's on the main page now, and this copy of
// the page stays only so links saved during testing still open the app. (GitHub Pages serves
// only files that exist; assets are linked from the base path, so the copy works unchanged.)
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
