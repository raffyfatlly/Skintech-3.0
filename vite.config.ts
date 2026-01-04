
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Third argument '' loads all env vars, regardless of prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Aggressively find the keys
  const apiKey = 
    env.VITE_GEMINI_API_KEY || 
    env.VITE_API_KEY || 
    process.env.VITE_API_KEY ||
    process.env.API_KEY ||
    '';

  const falKey = 
    env.VITE_FAL_KEY ||
    process.env.VITE_FAL_KEY || 
    env.FAL_KEY || 
    process.env.FAL_KEY || 
    '';

  console.log(`[Vite Build] FAL_KEY Detected: ${falKey ? 'Yes (Hidden)' : 'No'}`);

  return {
    plugins: [react()],
    define: {
      // Critical: JSON.stringify ensures the value is injected as a string literal
      // We default to empty string if missing to prevent 'undefined' reference errors
      'process.env.API_KEY': JSON.stringify(apiKey || ''),
      'process.env.FAL_KEY': JSON.stringify(falKey || ''),
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
