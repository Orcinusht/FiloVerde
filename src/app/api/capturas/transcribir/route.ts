import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BUCKET, detectarTipo, esRutaPropia, registrarError, usuarioActual } from '@/lib/server/capturas'
import { transcribirCaptura, VERSION_INSTRUCCIONES } from '@/lib/server/ia/transcribir'
import { leerCatalogo } from '@/lib/server/catalogo'
import { catalogoParaIA, catalogoVacio } from '@/lib/apuestas/catalogo'
import { MAX_APUESTAS_POR_CAPTURA, revisionesDeCaptura } from '@/lib/apuestas/propuesta'
import { MAX_INTENTOS, esTemporal } from '@/lib/apuestas/reintentos-ia'
import { apuestasPendientes } from '@/lib/server/pendientes'
import { casaParaIA, resolverCasaIndicada } from '@/lib/apuestas/casa-tanda'

// Una petición = UN intento (máximo 60 s de IA); los reintentos los pide el móvil. Margen: 2 min.
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
  // Número de intento (1-3) para esta captura: más allá no se llama a la IA.
  const intento = cuerpo?.intento ?? 1
  if (!Number.isInteger(intento) || intento < 1 || intento > MAX_INTENTOS) {
    return responder(400, { codigo: 'demasiados_intentos', error: 'Demasiados intentos seguidos. Pulsa «Reintentar» más tarde o rellénala a mano.' })
  }

  // Si esta captura ya se leyó bien (p. ej. se perdió la respuesta y el móvil reintenta), se
  // devuelve esa lectura: ni se vuelve a pagar ni se crea otra fila.
  const { data: previa } = await supabase
    .from('transcripciones')
    .select('id')
    .eq('imagen', ruta)
    .eq('resultado', 'ok')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (previa?.id) {
    const pendientes = (await apuestasPendientes(supabase).catch(() => [])).filter((p) => p.transcripcionId === previa.id)
    if (pendientes.length) {
      return responder(200, { transcripcionId: previa.id, revisiones: pendientes.map((p) => p.revision), indices: pendientes.map((p) => p.indice), total: pendientes[0].total, reutilizada: true })
    }
  }

  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase
    .from('transcripciones')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', haceUnaHora)
  if ((count ?? 0) >= MAX_POR_HORA) {
    return responder(429, {
      codigo: 'tope_hora',
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

  // Catálogo del usuario (si fallara, se lee igualmente sin él).
  const catalogo = await leerCatalogo(supabase).catch((e) => {
    registrarError('catalogo:leer', e)
    return catalogoVacio()
  })
  // Casa de la tanda: solo si es una casa activa de ESTE usuario (leída con su sesión). Si no, se
  // lee como "Que la detecte la IA" y queda en el log (sin datos personales).
  let indicada = null
  if (typeof cuerpo?.casaId === 'string' && cuerpo.casaId) {
    const { data: casas, error: eCasas } = await supabase.from('casas_apuestas').select('id, nombre, archivada').eq('user_id', userId)
    if (eCasas) registrarError('capturas:casa-tanda', eCasas)
    indicada = resolverCasaIndicada(cuerpo.casaId, casas ?? [])
    if (!indicada && !eCasas) console.warn('[capturas:casa-tanda]', { motivo: 'casa no válida: se lee sin casa indicada' })
  }
  const r = await transcribirCaptura(bytes, tipo, catalogoParaIA(catalogo), indicada ? casaParaIA(indicada.nombre) : null)

  // Una captura = una transcripción = un coste, aunque traiga varias apuestas. Solo cuentan las
  // apuestas VÁLIDAS (selección legible con pronóstico); las cortadas se ignoran y se cuentan.
  const { validas, ignoradas } = r.ok ? revisionesDeCaptura(r.propuesta, catalogo, new Date(), indicada) : { validas: [], ignoradas: 0 }
  const noEsApuesta = r.ok && validas.length === 0
  let transcripcionId: string | null = null
  if (r.uso) {
    const propuesta = r.ok
      ? {
          ...r.propuesta,
          apuestas: r.propuesta.apuestas.slice(0, MAX_APUESTAS_POR_CAPTURA),
          // La casa elegida para esta tanda (para retomar la revisión con ella).
          ...(indicada ? { casa_indicada: indicada } : {}),
        }
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
        n_apuestas: r.ok ? validas.length : null,
        version_instrucciones: VERSION_INSTRUCCIONES,
        // Lo que propuso la IA (con los campos dudosos y su motivo): para diagnosticar
        // y para retomar la revisión sin volver a pagar otra lectura.
        propuesta,
      })
      .select('id')
      .single()
    if (eLog) registrarError('ia:registrar-coste', eLog)
    transcripcionId = data?.id ?? null
  }

  // Los errores temporales (saturación, límite, tiempo, conexión) se reintentan desde el móvil.
  if (!r.ok) {
    return responder(200, { codigo: r.codigo, error: r.mensaje, temporal: esTemporal(r.codigo), reintentarEnS: r.retryAfterS ?? null })
  }
  if (noEsApuesta) {
    const motivo = (r.propuesta.motivo ?? '').trim().slice(0, 200)
    return responder(200, {
      codigo: 'no_es_apuesta',
      error:
        ignoradas > 0
          ? `Solo he encontrado ${ignoradas === 1 ? 'una apuesta cortada o sin selección' : `${ignoradas} apuestas cortadas o sin selección`}. Haz la captura con la apuesta entera, o rellénala a mano.`
          : `Esta imagen no parece una apuesta${motivo ? `: ${motivo}` : '.'} Puedes descartarla o rellenarla a mano.`,
    })
  }
  return responder(200, {
    transcripcionId,
    revisiones: validas.map((v) => v.revision),
    indices: validas.map((v) => v.indice),
    total: validas.length,
    ignoradas,
  })
}

function responder(status: number, cuerpo: object) {
  return NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } })
}
