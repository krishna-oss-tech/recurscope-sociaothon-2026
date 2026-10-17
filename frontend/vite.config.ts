import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dedicated RecurScope ports prevent collisions with the JanSetu demo.
// strictPort is intentional: never silently switch to another app's port.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 5189, strictPort: true },
})
