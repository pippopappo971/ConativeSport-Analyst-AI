import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      {
        name: 'disable-vite-hmr-client-ws',
        apply: 'serve',
        transform(code, id) {
          if (id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs')) {
            return code
              .replace(
                'transport.connect(createHMRHandler(handleMessage));',
                '/* HMR WebSocket disabled */'
              )
              .replace('throw new Error("send was called before connect");', 'return;')
              .replace('throw new Error("invoke was called before connect");', 'return;');
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'ConativeSport Analyst',
          short_name: 'ConativeAI',
          description:
            'Analisi pedagogica conativa dello sport, rilevamento mobilitazione alunni e valutazione video live.',
          theme_color: '#101b2f',
          background_color: '#101b2f',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/assets/aistudio/**', '**/mediapipe/**'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    server: {
      hmr: false,
      ws: false,
      watch: {
        ignored: ['**/public/assets/aistudio/**', '**/.auth-config.json', '**/dist/**'],
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});