import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async redirects() {
    return [
      { source: '/', destination: '/apuestas', permanent: false },
      // (Hasta el 2026-11-06, /graficas redirigía a /analisis; ahora es la pestaña Gráficas.)
    ]
  },
  async headers() {
    return [
      {
        // El service worker siempre se comprueba fresco para que las actualizaciones lleguen.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
}

export default nextConfig
