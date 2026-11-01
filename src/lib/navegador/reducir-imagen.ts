// Reduce una foto o captura EN EL MÓVIL antes de subirla: lado largo ≤ 1.600 px,
// JPEG. Así la subida es rápida, cabe en el límite de Vercel y la IA cuesta menos.
// Acepta HEIC del iPhone: Safari lo abre directamente; si el navegador no
// sabe, se carga un conversor (solo en ese caso, porque pesa ~1 MB).

export const LADO_MAXIMO = 1600
const MAX_BYTES = 4 * 1024 * 1024
export const MAX_BYTES_ORIGINAL = 40 * 1024 * 1024

export class ErrorImagen extends Error {}

function pareceHeic(archivo: File) {
  return /heic|heif/i.test(archivo.type) || /\.(heic|heif)$/i.test(archivo.name)
}

async function abrir(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      // probamos con <img>
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    // Se libera cuando ya está decodificada.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export async function reducirImagen(archivo: File): Promise<Blob> {
  if (archivo.size > MAX_BYTES_ORIGINAL) throw new ErrorImagen('La imagen pesa demasiado (máx. 40 MB).')
  if (archivo.type && !archivo.type.startsWith('image/') && !pareceHeic(archivo)) {
    throw new ErrorImagen('Ese archivo no es una imagen.')
  }

  let imagen: ImageBitmap | HTMLImageElement
  try {
    imagen = await abrir(archivo)
  } catch {
    if (!pareceHeic(archivo)) throw new ErrorImagen('No se ha podido abrir la imagen. Prueba con otra.')
    try {
      const { heicTo } = await import('heic-to/next')
      imagen = await abrir(await heicTo({ blob: archivo, type: 'image/jpeg', quality: 0.92 }))
    } catch {
      throw new ErrorImagen('No se ha podido convertir la foto HEIC. Haz una captura de pantalla y súbela.')
    }
  }

  const ancho = 'naturalWidth' in imagen ? imagen.naturalWidth : imagen.width
  const alto = 'naturalHeight' in imagen ? imagen.naturalHeight : imagen.height
  if (!ancho || !alto) throw new ErrorImagen('La imagen está vacía.')
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto))
  const w = Math.max(1, Math.round(ancho * escala))
  const h = Math.max(1, Math.round(alto * escala))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ErrorImagen('Tu navegador no permite preparar la imagen.')
  ctx.fillStyle = '#fff' // las PNG con transparencia quedan sobre blanco
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(imagen, 0, 0, w, h)
  if ('close' in imagen) imagen.close()

  for (const calidad of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', calidad))
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new ErrorImagen('No se ha podido reducir la imagen lo suficiente.')
}
