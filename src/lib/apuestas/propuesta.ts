// Lo que devuelve la IA al leer una captura (esquema estricto) y cómo se
// convierte en valores del formulario. La IA PROPONE; el usuario revisa.
// Una captura puede tener VARIAS apuestas: la IA devuelve una lista.

import { z } from 'zod'
import { cuotaADecimal, cuotaATexto } from './cuotas.ts'
import { centimosATexto, eurosACentimos } from './dinero.ts'
import {
  ESTADOS_APUESTA,
  ESTADOS_SELECCION,
  MOTIVOS_DUDA,
  TIPOS_APUESTA,
  type MotivoRevision,
} from './estados.ts'
import { buscarDeporte, buscarLiga, esMixto, type Catalogo } from './catalogo.ts'
import { isoALocal, localAIso } from './fechas.ts'
import {
  ajustarPorTipo,
  MAX_SELECCIONES,
  MAX_TEXTO,
  seleccionVacia,
  valoresVacios,
  type ValoresFormulario,
} from './formulario.ts'
import { resultadoPropuesto } from './calculos.ts'
import { TIPOS_PROMO, esPromoAumento } from './promociones.ts'
import { resolverFechaEvento } from './fecha-evento.ts'

const textoONulo = z.string().nullable()

export const esquemaSeleccionIA = z.object({
  evento: textoONulo.describe('Partido o evento, p. ej. "Real Madrid - Barcelona"'),
  liga: textoONulo.describe('Competición de ESTA selección; preferiblemente una del catálogo para su deporte'),
  deporte: textoONulo.describe('Deporte de ESTA selección; preferiblemente uno del catálogo'),
  mercado: textoONulo.describe('Mercado, p. ej. "1X2", "Más/menos goles 2.5", "Ambos marcan"'),
  pronostico: textoONulo.describe('Lo elegido, p. ej. "Real Madrid", "Más de 2.5"'),
  cuota: textoONulo.describe('Cuota de ESTA selección EXACTAMENTE como aparece ("1.85", "6/4", "+150"); null si no tiene cuota propia'),
  estado: z.enum(ESTADOS_SELECCION as [string, ...string[]]).nullable().describe('Solo si la captura muestra el resultado de la selección'),
  evento_fecha_texto: textoONulo.describe(
    'Día y/o hora de inicio del evento COPIADOS TAL CUAL como aparecen ("Dom 8 nov / 17:00", "Hoy 21:00", "08/11 21:00"); null si no aparecen',
  ),
  sustituto: textoONulo.describe('Mercado de jugador: nombre del SUSTITUTO si aparece junto al jugador tachado; null si no hay'),
})

export const esquemaDudaIA = z.object({
  campo: z.string().describe('p. ej. "importe", "cuota_total", "selecciones.1.liga"'),
  motivo: z.enum(MOTIVOS_DUDA).describe('no_visible: no aparece · borroso: se ve mal · deducido: no aparece y lo has deducido'),
})

export const esquemaApuestaIA = z.object({
  casa: textoONulo.describe('Casa de apuestas (por el logo o el texto), p. ej. "Bet365", "Codere"'),
  tipo: z.enum(TIPOS_APUESTA).nullable(),
  fecha: textoONulo.describe('Cuándo se HIZO la apuesta, si aparece: "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM"'),
  importe: z.number().nullable().describe('Importe apostado, en unidades de moneda (10.5 = 10,50 €)'),
  cuota_total: textoONulo.describe('Cuota total EXACTAMENTE como aparece'),
  ganancia_potencial: z.number().nullable().describe('Ganancia/retorno potencial total que muestra la captura (incluye lo apostado)'),
  estado: z.enum(ESTADOS_APUESTA).nullable().describe('Solo si la captura muestra que ya está resuelta'),
  importe_cobrado: z.number().nullable().describe('Si está resuelta: lo cobrado en total (premio, devolución o cash out). 0 si perdida'),
  promo_tipo: z
    .enum(TIPOS_PROMO)
    .nullable()
    .describe('Promoción SOLO si la captura la indica de forma explícita; null si no'),
  promo_cuota_original: textoONulo.describe('Superaumento/aumento: cuota SIN la promoción (p. ej. la tachada), EXACTAMENTE como aparece'),
  promo_aumento: z.number().nullable().describe('Superaumento/aumento: aumento de ganancias en unidades de moneda, si aparece escrito'),
  promo_credito: z.number().nullable().describe('Apuesta asegurada: crédito que devuelven si se pierde, si aparece escrito'),
  selecciones: z.array(esquemaSeleccionIA),
  dudosos: z.array(esquemaDudaIA).describe('SOLO los campos no visibles, borrosos o deducidos. Nunca lo que se lee con claridad'),
  incompleta: z.boolean().describe('true si la apuesta está cortada en la captura (sin ninguna selección con su pronóstico completo)'),
})

export const esquemaPropuestaIA = z.object({
  hay_apuestas: z.boolean().describe('false si la imagen no contiene ningún resguardo de apuesta deportiva o es ilegible'),
  motivo: textoONulo.describe('Si no hay apuestas, explica brevemente por qué (en español)'),
  apuestas: z.array(esquemaApuestaIA).describe('Una entrada por cada apuesta distinta de la captura, en orden de aparición'),
})

export type PropuestaIA = z.infer<typeof esquemaPropuestaIA>

// Propuestas guardadas ANTES de leer promociones (instrucciones v1-v3) no traen sus campos: se
// completan con null para poder retomarlas sin volver a llamar a la IA.
export function completarPropuestaAntigua(p: unknown): unknown {
  if (!p || typeof p !== 'object' || !Array.isArray((p as { apuestas?: unknown }).apuestas)) return p
  const o = p as { apuestas: unknown[] }
  return {
    ...o,
    apuestas: o.apuestas.map((a) =>
      a && typeof a === 'object'
        ? {
            promo_tipo: null,
            promo_cuota_original: null,
            promo_aumento: null,
            promo_credito: null,
            incompleta: false,
            ...a,
            // Lecturas anteriores a la v5: sin campo "sustituto" en las selecciones.
            selecciones: Array.isArray((a as { selecciones?: unknown }).selecciones)
              ? ((a as { selecciones: unknown[] }).selecciones).map((s) => {
                  if (!s || typeof s !== 'object') return s
                  const o = s as Record<string, unknown>
                  if ('evento_fecha_texto' in o) return { sustituto: null, ...o }
                  // Antes de la v6 la IA daba "YYYY-MM-DD" y "HH:MM": se convierten a texto y pasan
                  // por el mismo traductor (una fecha ISO completa no sale en ámbar).
                  const { evento_fecha, evento_hora, ...resto } = o
                  const texto = [evento_fecha, evento_fecha ? evento_hora : null].filter((x) => typeof x === 'string' && x).join(' ')
                  return { sustituto: null, ...resto, evento_fecha_texto: texto || null }
                })
              : (a as { selecciones?: unknown }).selecciones,
          }
        : a,
    ),
  }
}
export type ApuestaIA = z.infer<typeof esquemaApuestaIA>

export type Revision = {
  valores: ValoresFormulario
  dudosos: Record<string, MotivoRevision> // clave de campo del formulario → motivo
  casaDetectada: string | null // nombre que leyó la IA (para elegir o crear la casa)
}

export const MAX_APUESTAS_POR_CAPTURA = 10

// Apuesta propuesta por la IA que aún no se ha guardado ni descartado.
export type ApuestaPendiente = {
  transcripcionId: string
  indice: number
  total: number
  posicion?: number // 1.ª, 2.ª… entre las apuestas válidas de la captura
  ruta: string | null
  revision: Revision
}

const recortar = (v: string | null | undefined) => (v ?? '').trim().slice(0, MAX_TEXTO)

const CAMPOS_VALIDOS = new Set([
  'casa_id', 'tipo', 'fecha', 'importe', 'cuota_total', 'ganancia_potencial', 'estado', 'resultado_economico',
  'promo_tipo', 'promo_cuota_original', 'promo_aumento', 'promo_credito',
])
const CAMPOS_SELECCION = new Set([
  'evento', 'liga', 'deporte', 'mercado', 'pronostico', 'cuota', 'estado', 'evento_fecha', 'evento_hora',
])

// Normaliza las claves de "dudosos" que dé la IA a las del formulario.
function normalizarDudoso(clave: string): string | null {
  const c = clave.trim().replace(/\[(\d+)\]/g, '.$1')
  if (c === 'casa') return 'casa_id'
  if (c === 'importe_cobrado') return 'resultado_economico'
  if (CAMPOS_VALIDOS.has(c)) return c
  const m = /^selecciones\.(\d+)\.(\w+)$/.exec(c.replace(/\.evento_fecha_texto$/, '.evento_fecha'))
  if (m && CAMPOS_SELECCION.has(m[2]) && Number(m[1]) < MAX_SELECCIONES) return c
  return null
}

const MOTIVO_FECHA = { deducido: 'deducido', falta_dia: 'falta_dia', no_entendida: 'no_entendida', no_visible: 'no_visible' } as const

// ¿Es una apuesta de verdad? Al menos una selección legible con su pronóstico y no cortada.
// Lo comprueba el SERVIDOR (no se fía solo de la IA).
export function esApuestaValida(a: ApuestaIA): boolean {
  if (a.incompleta === true) return false
  return (a.selecciones ?? []).some((s) => (s.pronostico ?? '').trim().length >= 1)
}

// `referencia` = cuándo se subió la captura (para "Hoy", "Mañana" y las fechas sin año).
export function apuestaARevision(p: ApuestaIA, catalogo?: Catalogo, referencia: Date = new Date()): Revision {
  const valores = valoresVacios()
  const dudosos: Record<string, MotivoRevision> = {}
  const marcar = (campo: string, motivo: MotivoRevision) => {
    if (!dudosos[campo]) dudosos[campo] = motivo
  }
  for (const d of p.dudosos ?? []) {
    const n = normalizarDudoso(d.campo)
    if (n) dudosos[n] = d.motivo
  }

  const sels = p.selecciones.slice(0, MAX_SELECCIONES)
  valores.tipo = p.tipo ?? (sels.length > 1 ? 'combinada' : 'simple')
  if (!p.tipo) marcar('tipo', 'deducido')

  // Fecha de la apuesta: solo si es válida; si no, vacía (= ahora).
  if (p.fecha) {
    const iso = localAIso(p.fecha)
    if (iso) valores.fecha = isoALocal(iso).slice(0, 10) // solo el día (la hora la pone el servidor)
    else marcar('fecha', 'borroso')
  }

  const importe = eurosACentimos(p.importe)
  valores.importe = importe != null && importe > 0 ? centimosATexto(importe) : ''
  if (!valores.importe) marcar('importe', 'no_visible')

  const cuotaTotal = cuotaADecimal(p.cuota_total)
  valores.cuota_total = cuotaTotal ? cuotaATexto(cuotaTotal) : ''
  if (p.cuota_total && cuotaTotal === undefined) marcar('cuota_total', 'borroso')

  const ganancia = eurosACentimos(p.ganancia_potencial)
  valores.ganancia_potencial = ganancia != null && ganancia >= 0 ? centimosATexto(ganancia) : ''

  valores.selecciones = sels.length
    ? sels.map((s, i) => {
        const cuota = cuotaADecimal(s.cuota)
        if (s.cuota && cuota === undefined) marcar(`selecciones.${i}.cuota`, 'borroso')
        // Fecha y hora del evento: la IA copia el texto y el código lo traduce (nunca la IA).
        const f = resolverFechaEvento(s.evento_fecha_texto, referencia)
        const dia = f.dia
        const hora = f.hora
        if (f.motivoDia) marcar(`selecciones.${i}.evento_fecha`, MOTIVO_FECHA[f.motivoDia])
        if (f.motivoHora) marcar(`selecciones.${i}.evento_hora`, MOTIVO_FECHA[f.motivoHora])
        return {
          evento: recortar(s.evento),
          liga: recortar(s.liga),
          deporte: recortar(s.deporte),
          mercado: recortar(s.mercado),
          pronostico: recortar(s.pronostico),
          cuota: cuota ? cuotaATexto(cuota) : '',
          estado: s.estado ?? 'pendiente',
          evento_fecha: dia ?? '',
          evento_hora: hora ?? '',
        }
      })
    : [seleccionVacia()]

  // Deporte y liga de cada selección, contra el catálogo del usuario:
  //  · está en el catálogo → se usa tal como está escrito allí;
  //  · no está → se deja lo leído, en ámbar como "nueva" (con "Crear y usar");
  //  · vacío → en ámbar como "no visible".
  if (catalogo) {
    valores.selecciones.forEach((s, i) => {
      const kd = `selecciones.${i}.deporte`
      const kl = `selecciones.${i}.liga`
      if (esMixto(s.deporte)) s.deporte = ''
      const d = buscarDeporte(catalogo, s.deporte)
      if (d) s.deporte = d.nombre
      else if (s.deporte) dudosos[kd] = 'nueva'
      else marcar(kd, 'no_visible')
      const l = buscarLiga(catalogo, s.deporte, s.liga)
      if (l) s.liga = l.nombre
      else if (s.liga) dudosos[kl] = 'nueva'
      else marcar(kl, 'no_visible')
    })
  }

  // Jugador sustituido: el pronóstico es el jugador elegido (tachado); el sustituto se anota en las
  // notas. Solo aquí, al crear desde la lectura: las notas que escriba el usuario no se tocan.
  const sustitutos = [...new Set(sels.map((s) => recortar(s.sustituto)).filter(Boolean))]
  if (sustitutos.length) valores.notas = sustitutos.map((n) => `Sustituto: ${n}`).join('\n')

  // En una simple, si no se leyó la cuota total, vale la de su selección.
  if (valores.tipo === 'simple' && !valores.cuota_total && valores.selecciones[0].cuota) {
    valores.cuota_total = valores.selecciones[0].cuota
  }

  // Promoción: la IA SOLO lee (tipo, cuota original, aumento, crédito). Nada se calcula aquí: el
  // dato que falte lo calcula el formulario (y el servidor al guardar). El tipo, siempre a confirmar.
  const tipoPromo = p.promo_tipo && (TIPOS_PROMO as readonly string[]).includes(p.promo_tipo) ? p.promo_tipo : null
  if (tipoPromo) {
    valores.promo = true
    valores.promo_tipo = tipoPromo
    if (!dudosos.promo_tipo) dudosos.promo_tipo = 'propuesta'
    if (esPromoAumento(tipoPromo)) {
      const c0 = cuotaADecimal(p.promo_cuota_original)
      if (p.promo_cuota_original && c0 === undefined) marcar('promo_cuota_original', 'borroso')
      const au = p.promo_aumento != null ? eurosACentimos(p.promo_aumento) : null
      valores.promo_cuota_original = c0 ? cuotaATexto(c0) : ''
      valores.promo_aumento = au != null ? centimosATexto(au) : ''
      valores.promo_base = c0 && au != null ? 'ambos' : c0 ? 'cuota_original' : au != null ? 'aumento' : ''
    } else if (tipoPromo === 'asegurada') {
      const cr = eurosACentimos(p.promo_credito)
      valores.promo_credito = cr != null && cr >= 0 ? centimosATexto(cr) : valores.importe
    }
  }

  // Estado y resultado económico detectados (si la captura ya está resuelta).
  if (p.estado && p.estado !== 'pendiente') {
    valores.estado = p.estado
    const cobrado = eurosACentimos(p.importe_cobrado)
    if (p.estado === 'cash_out' && cobrado != null) valores.importe_recuperado = centimosATexto(cobrado)
    const resultado =
      cobrado != null && importe != null
        ? // Con crédito, el importe no era dinero propio: el resultado es todo lo cobrado.
          tipoPromo === 'credito'
          ? cobrado
          : cobrado - importe
        : resultadoPropuesto({ estado: p.estado, importe, cuota: cuotaTotal ?? null, gananciaPotencial: ganancia, promo: tipoPromo })
    valores.resultado_economico = centimosATexto(resultado)
  }

  // La simple guarda la cuota total en su selección; "mismo partido" sin cuotas propias.
  // (Si la IA dio "simple" con varias selecciones, se deja así: el formulario pedirá decidir.)
  return { valores: ajustarPorTipo(valores), dudosos, casaDetectada: recortar(p.casa) || null }
}

export type RevisionesCaptura = {
  validas: { indice: number; revision: Revision }[] // indice = posición en la lectura (no cambia)
  ignoradas: number // apuestas cortadas o sin selección con pronóstico
}

export function revisionesDeCaptura(p: PropuestaIA, catalogo?: Catalogo, referencia: Date = new Date()): RevisionesCaptura {
  if (!p.hay_apuestas) return { validas: [], ignoradas: 0 }
  const apuestas = p.apuestas.slice(0, MAX_APUESTAS_POR_CAPTURA)
  const validas = apuestas.flatMap((a, indice) => (esApuestaValida(a) ? [{ indice, revision: apuestaARevision(a, catalogo, referencia) }] : []))
  return { validas, ignoradas: apuestas.length - validas.length }
}

// Solo las válidas, en orden (compatibilidad).
export function propuestaARevisiones(p: PropuestaIA, catalogo?: Catalogo, referencia: Date = new Date()): Revision[] {
  return revisionesDeCaptura(p, catalogo, referencia).validas.map((v) => v.revision)
}
