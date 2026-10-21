import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/moosik/', // GitHub Pages serves the site at yashverma2367.github.io/moosik/
  plugins: [react()],
  server: {
    allowedHosts: ['5769-2401-4900-88ca-1822-2d5a-601-defe-8eb0.ngrok-free.app'],
  },
})
