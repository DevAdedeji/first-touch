import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-07',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  pwa: {
    registerType: 'prompt',
    client: { installPrompt: true },
    manifest: {
      id: '/',
      name: 'First Touch Football',
      short_name: 'First Touch',
      description: 'A playable 11-a-side football exhibition.',
      theme_color: '#071b2b',
      background_color: '#071b2b',
      display: 'standalone',
      orientation: 'landscape',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,glb,mp3,ogg}'],
      navigateFallback: '/',
      cleanupOutdatedCaches: true,
    },
    devOptions: { enabled: false },
  },
  app: {
    head: {
      title: 'First Touch — The beautiful game, simplified.',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#071b2b' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        {
          name: 'description',
          content:
            'A playable, beautifully simple 11-a-side football exhibition. Built with Nuxt and Three.js.',
        },
      ],
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
      ],
    },
  },
})
