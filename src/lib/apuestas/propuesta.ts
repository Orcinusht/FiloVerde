// Lo que devuelve la IA al leer una captura (esquema estricto) y cómo se
// convierte en valores del formulario. La IA PROPONE; el usuario revisa.
// Una captura puede tener VARIAS apuestas: la IA devuelve una lista.

import { z } from 'zod'
import { cuotaADecimal, cuotaATexto } from './cuotas.ts'
import { centimosATexto, eurosACentimos } from './dinero.ts'
import { ESTADOS_APUESTA, ESTADOS_SELECCION, MOTIVOS_DUDA, TIPOS_APUESTA, type MotivoDuda } from './estados.ts'
import { isoALocal, localAIso, validarDia, validarHora } from './fechas.ts'
import {
  ajustarPorTipo,
  MAX_SELECCIONES,
  MAX_TEXTO,
  seleccionVacia,
  valoresVacios,
  type ValoresFormulario,
} from './formulario.ts'
import { resultadoPropuesto } from './calculos.ts'

const textoONulo = z.string().nullable()

export const esquemaSeleccionIA = z.object({
  evento: textoONulo.describe('Partido o evento, p. ej. "Real Madrid - Barcelona"'),
  liga: textoONulo.describe('Competición, p. ej. "LaLiga"'),
  deporte: textoONulo.describe('Deporte en español, p. ej. "Fútbol", "Tenis", "Baloncesto"'),
  mercado: textoONulo.describe('Mercado, p. ej. "1X2", "Más/menos goles 2.5", "Ambos marcan"'),
  pronostico: textoONulo.describe('Lo elegido, p. ej. "Real Madrid", "Más de 2.5"'),
  cuota: textoONulo.describe('Cuota de ESTA selección EXACTAMENTE como aparece ("1.85", "6/4", "+150"); null si no tiene cuota propia'),
  estado: z.enum(ESTADOS_SELECCION as [string, ...string[]]).nullable().describe('Solo si la captura muestra el resultado de la selección'),
  evento_fecha: textoONulo.describe('Día del evento "YYYY-MM-DD" SOLO si aparece en la captura'),
  evento_hora: textoONulo.describe('Hora de inicio "HH:MM" SOLO si aparece en la captura'),
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
  selecciones: z.array(esquemaSeleccionIA),
  dudosos: z.array(esquemaDudaIA).describe('SOLO los campos no visibles, borrosos o deducidos. Nunca lo que se lee con claridad'),
})

export const esquemaPropuestaIA = z.object({
  hay_apuestas: z.boolean().describe('false si la imagen no contiene ningún resguardo de apuesta deportiva o es ilegible'),
  motivo: textoONulo.describe('Si no hay apuestas, explica brevemente por qué (en español)'),
  apuestas: z.array(esquemaApuestaIA).describe('Una entrada por cada apuesta distinta de la captura, en orden de aparición'),
})

export type PropuestaIA = z.infer<typeof esquemaPropuestaIA>
export type ApuestaIA = z.infer<typeof esquemaApuestaIA>

export type Revision = {
  valores: ValoresFormulario
  dudosos: Record<string, MotivoDuda> // clave de campo del formulario → motivo
  casaDetectada: string | null // nombre que leyó la IA (para elegir o crear la casa)
}

export const MAX_APUESTAS_POR_CAPTURA = 10

// Apuesta propuesta por la IA que aún no se ha guardado ni descartado.
export type ApuestaPendiente = {
  transcripcionId: string
  indice: number
  total: number
  ruta: string | null
  revision: Revision
}

const recortar = (v: string | null | undefined) => (v ?? '').trim().slice(0, MAX_TEXTO)

const CAMPOS_VALIDOS = new Set([
  'casa_id', 'tipo', 'fecha', 'importe', 'cuota_total', 'ganancia_potencial', 'estado', 'resultado_economico',
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
  const m = /^selecciones\.(\d+)\.(\w+)$/.exec(c)
  if (m && CAMPOS_SELECCION.has(m[2]) && Number(m[1]) < MAX_SELECCIONES) return c
  return null
}

export function apuestaARevision(p: ApuestaIA): Revision {
  const valores = valoresVacios()
  const dudosos: Record<string, MotivoDuda> = {}
  const marcar = (campo: string, motivo: MotivoDuda) => {
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
    if (iso) valores.fecha = isoALocal(iso)
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
        const dia = validarDia(s.evento_fecha ?? '')
        const hora = dia ? validarHora(s.evento_hora ?? '') : null
        // Fecha y hora del evento: si no aparecen, vacías y a revisar.
        if (!dia) marcar(`selecciones.${i}.evento_fecha`, s.evento_fecha ? 'borroso' : 'no_visible')
        if (!hora) marcar(`selecciones.${i}.evento_hora`, s.evento_hora ? 'borroso' : 'no_visible')
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

  // En una simple, si no se leyó la cuota total, vale la de su selección.
  if (valores.tipo === 'simple' && !valores.cuota_total && valores.selecciones[0].cuota) {
    valores.cuota_total = valores.selecciones[0].cuota
  }

  // Estado y resultado económico detectados (si la captura ya está resuelta).
  if (p.estado && p.estado !== 'pendiente') {
    valores.estado = p.estado
    const cobrado = eurosACentimos(p.importe_cobrado)
    if (p.estado === 'cash_out' && cobrado != null) valores.importe_recuperado = centimosATexto(cobrado)
    const resultado =
      cobrado != null && importe != null
        ? cobrado - importe
        : resultadoPropuesto({ estado: p.estado, importe, cuota: cuotaTotal ?? null, gananciaPotencial: ganancia })
    valores.resultado_economico = centimosATexto(resultado)
  }

  // La simple guarda la cuota total en su selección; "mismo partido" sin cuotas propias.
  // (Si la IA dio "simple" con varias selecciones, se deja así: el formulario pedirá decidir.)
  return { valores: ajustarPorTipo(valores), dudosos, casaDetectada: recortar(p.casa) || null }
}

export function propuestaARevisiones(p: PropuestaIA): Revision[] {
  if (!p.hay_apuestas) return []
  return p.apuestas.slice(0, MAX_APUESTAS_POR_CAPTURA).map(apuestaARevision)
}
