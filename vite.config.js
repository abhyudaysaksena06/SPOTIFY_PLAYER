import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Spotify only allows 127.0.0.1 (not "localhost") as a local redirect URI
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 8888, strictPort: true },
})
