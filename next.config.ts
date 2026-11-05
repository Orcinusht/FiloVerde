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
      // Fase 2: la pestaña "Gráficas" pasó a ser "Análisis".
      { source: '/graficas', destination: '/analisis', permanent: false },
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
