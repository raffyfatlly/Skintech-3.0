
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  // Aggressively find the API Key from common naming conventions
  const apiKey = 
    env.VITE_GEMINI_API_KEY || 
    env.VITE_API_KEY || 
    process.env.VITE_API_KEY ||
    process.env.API_KEY ||
    '';

  // Prioritize process.env for Vercel System Env Vars which might not have VITE_ prefix
  const falKey = 
    process.env.FAL_KEY || 
    env.FAL_KEY || 
    process.env.VITE_FAL_KEY || 
    env.VITE_FAL_KEY || 
    '';

  return {
    plugins: [react()],
    define: {
      // Define `process.env.API_KEY` globally for the client build
      'process.env.API_KEY': JSON.stringify(apiKey),
      // Define both process.env and a global constant for maximum reliability
      'process.env.FAL_KEY': JSON.stringify(falKey),
      '__FAL_KEY__': JSON.stringify(falKey),
      // Prevent crash if process is accessed directly in some contexts
      'process.env': {} 
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
