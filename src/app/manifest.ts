import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Filoverde',
    short_name: 'Filoverde',
    description: 'Registra y analiza tus apuestas deportivas.',
    lang: 'es',
    start_url: '/apuestas',
    scope: '/',
    display: 'standalone', // se abre como app, sin barra del navegador
    orientation: 'portrait',
    background_color: '#0d1110',
    theme_color: '#16a34a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
