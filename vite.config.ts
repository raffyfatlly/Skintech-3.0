import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads ALL env vars, not just those with VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Aggressively find the API Key from common naming conventions
  const apiKey = 
    env.VITE_GEMINI_API_KEY || 
    env.VITE_API_KEY || 
    env.VITE_GOOGLE_API_KEY || 
    env.API_KEY || 
    env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_API_KEY ||
    process.env.API_KEY ||
    '';

  return {
    plugins: [react()],
    define: {
      // Define `process.env.API_KEY` globally for the client build
      // This allows the app to use process.env.API_KEY even in the browser
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              if (id.includes('@google/genai')) {
                return 'genai';
              }
              if (id.includes('lucide-react')) {
                return 'ui-icons';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  };
});