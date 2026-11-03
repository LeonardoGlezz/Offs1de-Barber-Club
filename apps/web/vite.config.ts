import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages el sitio vive en /<repo>/; en local y en dominio propio, en /.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Offs1de Barber Club · Reservas',
        short_name: 'Offs1de',
        description: 'Agenda tu corte en Offs1de Barber Club sin registrarte.',
        lang: 'es-MX',
        theme_color: '#0e0e0e',
        background_color: '#0e0e0e',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La API nunca se guarda en caché: los horarios tienen que ser los vigentes.
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
