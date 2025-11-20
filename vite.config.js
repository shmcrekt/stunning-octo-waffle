// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Suppress or adjust the chunk size warning for large bundles.
    // We are setting the limit to 1000kB (1MB) since App.jsx is large.
    chunkSizeWarningLimit: 1000, 
    
    // Ensure the entry point is correctly identified, though Vercel should handle this
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
})
