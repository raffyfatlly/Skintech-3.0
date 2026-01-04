
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  // CRITICAL: Vercel exposes variables as process.env.KEY. 
  // We must capture 'FAL_KEY' specifically as requested.
  const apiKey = 
    process.env.VITE_API_KEY ||
    process.env.API_KEY ||
    env.VITE_API_KEY || 
    '';

  const falKey = 
    process.env.FAL_KEY ||       // <--- Matches Vercel Environment Variable Name
    process.env.VITE_FAL_KEY ||  // <--- Fallback for local .env
    env.FAL_KEY || 
    '';

  const nanoApiKey = 
    process.env.NANO_API_KEY || 
    process.env.VITE_NANO_API_KEY || 
    env.NANO_API_KEY || 
    '';

  console.log(`[Vite Build] API Configuration:`);
  console.log(`- Google API Key: ${apiKey ? 'Found' : 'Missing'}`);
  console.log(`- Nano API Key: ${nanoApiKey ? 'Found' : 'Missing'}`);
  console.log(`- Fal AI Key: ${falKey ? 'Found' : 'Missing'}`);

  return {
    plugins: [react()],
    define: {
      // Inject these variables into the code at build time
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.FAL_KEY': JSON.stringify(falKey),
      'process.env.NANO_API_KEY': JSON.stringify(nanoApiKey),
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
