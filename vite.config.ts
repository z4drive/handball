import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HandballHub',
        short_name: 'Handball',
        description: 'Handball match details app',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/handball_icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/handball_icon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
