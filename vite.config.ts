import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Android(Capacitor)ビルド時は base: '/'、GitHub Pagesは '/fitlog/'
  base: process.env.BUILD_TARGET === 'android' ? '/' : '/fitlog/',
})
