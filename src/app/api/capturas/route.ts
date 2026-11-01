import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  BUCKET,
  MAX_BYTES_CAPTURA,
  detectarTipo,
  nuevaRuta,
  registrarError,
  usuarioActual,
} from '@/lib/server/capturas'

// POST /api/capturas — sube una captura (ya reducida en el móvil) al bucket privado.
// Devuelve { ruta } para pedir después la transcripción.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return error(401, 'Tu sesión ha caducado. Vuelve a entrar.')

  const largo = Number(request.headers.get('content-length') ?? 0)
  if (largo > MAX_BYTES_CAPTURA + 64 * 1024) return error(413, 'La imagen es demasiado grande (máx. 4 MB).')

  let archivo: FormDataEntryValue | null
  try {
    archivo = (await request.formData()).get('archivo')
  } catch {
    return error(400, 'No se ha recibido la imagen. Vuelve a intentarlo.')
  }
  if (!(archivo instanceof Blob) || archivo.size === 0) return error(400, 'No se ha recibido la imagen.')
  if (archivo.size > MAX_BYTES_CAPTURA) return error(413, 'La imagen es demasiado grande (máx. 4 MB).')

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const tipo = detectarTipo(bytes)
  if (!tipo) return error(415, 'Formato no admitido. Usa una foto o captura (JPEG, PNG o WebP).')

  const ruta = nuevaRuta(userId, tipo)
  const { error: e } = await supabase.storage.from(BUCKET).upload(ruta, bytes, { contentType: tipo, upsert: false })
  if (e) {
    registrarError('capturas:subir', e)
    return error(502, 'No se ha podido guardar la imagen. Vuelve a intentarlo.')
  }
  return NextResponse.json({ ruta })
}

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}
