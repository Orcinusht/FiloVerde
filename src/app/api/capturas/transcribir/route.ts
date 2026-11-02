import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BUCKET, detectarTipo, esRutaPropia, registrarError, usuarioActual } from '@/lib/server/capturas'
import { transcribirCaptura } from '@/lib/server/ia/transcribir'
import { MAX_APUESTAS_POR_CAPTURA, propuestaARevisiones } from '@/lib/apuestas/propuesta'

// La IA puede tardar: margen de 2 minutos.
export const maxDuration = 120

// Tope de seguridad para no disparar el gasto (p. ej. por un fallo que reintente sin parar).
const MAX_POR_HORA = 60

// POST /api/capturas/transcribir  { ruta } — la IA lee una captura ya subida.
// Si falla, la imagen sigue guardada: se puede reintentar o rellenar a mano.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const userId = await usuarioActual(supabase)
  if (!userId) return responder(401, { error: 'Tu sesión ha caducado. Vuelve a entrar.' })

  const cuerpo = await request.json().catch(() => null)
  const ruta = cuerpo?.ruta
  if (!esRutaPropia(ruta, userId)) return responder(400, { error: 'Captura no válida.' })

  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase
    .from('transcripciones')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', haceUnaHora)
  if ((count ?? 0) >= MAX_POR_HORA) {
    return responder(429, {
      codigo: 'limite',
      error: `Has llegado al máximo de ${MAX_POR_HORA} lecturas por hora. Espera un poco o rellénala a mano.`,
    })
  }

  const { data: blob, error: e } = await supabase.storage.from(BUCKET).download(ruta)
  if (e || !blob) {
    registrarError('capturas:descargar', e)
    return responder(404, { error: 'No se encuentra la imagen. Vuelve a subirla.' })
  }
  const bytes = Buffer.from(await blob.arrayBuffer())
  const tipo = detectarTipo(bytes)
  if (!tipo) return responder(415, { error: 'Formato de imagen no admitido.' })

  const r = await transcribirCaptura(bytes, tipo)

  // Una captura = una transcripción = un coste, aunque traiga varias apuestas.
  const revisiones = r.ok ? propuestaARevisiones(r.propuesta) : []
  const noEsApuesta = r.ok && revisiones.length === 0
  let transcripcionId: string | null = null
  if (r.uso) {
    const propuesta = r.ok
      ? { ...r.propuesta, apuestas: r.propuesta.apuestas.slice(0, MAX_APUESTAS_POR_CAPTURA) }
      : null
    const { data, error: eLog } = await supabase
      .from('transcripciones')
      .insert({
        imagen: ruta,
        modelo: r.uso.modelo.slice(0, 100),
        resultado: r.ok ? (noEsApuesta ? 'no_es_apuesta' : 'ok') : 'error',
        error_codigo: r.ok ? null : r.codigo,
        tokens_entrada: r.uso.tokensEntrada,
        tokens_salida: r.uso.tokensSalida,
        coste_usd: r.uso.costeUsd,
        duracion_ms: r.uso.duracionMs,
        n_apuestas: r.ok ? revisiones.length : null,
        // Lo que propuso la IA (con los campos dudosos y su motivo): para diagnosticar
        // y para retomar la revisión sin volver a pagar otra lectura.
        propuesta,
      })
      .select('id')
      .single()
    if (eLog) registrarError('ia:registrar-coste', eLog)
    transcripcionId = data?.id ?? null
  }

  if (!r.ok) return responder(200, { codigo: r.codigo, error: r.mensaje })
  if (noEsApuesta) {
    const motivo = (r.propuesta.motivo ?? '').trim().slice(0, 200)
    return responder(200, {
      codigo: 'no_es_apuesta',
      error: `Esta imagen no parece una apuesta${motivo ? `: ${motivo}` : '.'} Puedes descartarla o rellenarla a mano.`,
    })
  }
  return responder(200, { transcripcionId, revisiones })
}

function responder(status: number, cuerpo: object) {
  return NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } })
}
