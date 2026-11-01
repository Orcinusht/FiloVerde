// Lo que devuelve la IA al leer una captura (esquema estricto) y cómo se
// convierte en valores del formulario. La IA PROPONE; el usuario revisa.

import { z } from 'zod'
import { cuotaADecimal, cuotaATexto } from './cuotas.ts'
import { centimosATexto, eurosACentimos } from './dinero.ts'
import { ESTADOS_APUESTA, ESTADOS_SELECCION, TIPOS_APUESTA } from './estados.ts'
import { isoALocal, localAIso } from './fechas.ts'
import { MAX_SELECCIONES, MAX_TEXTO, seleccionVacia, valoresVacios, type ValoresFormulario } from './formulario.ts'
import { resultadoPropuesto } from './calculos.ts'

const textoONulo = z.string().nullable()

export const esquemaSeleccionIA = z.object({
  evento: textoONulo.describe('Partido o evento, p. ej. "Real Madrid - Barcelona"'),
  liga: textoONulo.describe('Competición, p. ej. "LaLiga"'),
  deporte: textoONulo.describe('Deporte en español, p. ej. "Fútbol", "Tenis", "Baloncesto"'),
  mercado: textoONulo.describe('Mercado, p. ej. "1X2", "Más/menos goles 2.5", "Ambos marcan"'),
  pronostico: textoONulo.describe('Lo elegido, p. ej. "Real Madrid", "Más de 2.5"'),
  cuota: textoONulo.describe('Cuota de la selección EXACTAMENTE como aparece: "1.85", "6/4", "+150"'),
  estado: z.enum(ESTADOS_SELECCION as [string, ...string[]]).nullable().describe('Solo si la captura muestra el resultado de la selección'),
})

export const esquemaPropuestaIA = z.object({
  es_apuesta: z.boolean().describe('false si la imagen no es un boleto/resguardo de apuesta deportiva'),
  motivo: textoONulo.describe('Si no es una apuesta o no se puede leer, explica brevemente por qué (en español)'),
  casa: textoONulo.describe('Casa de apuestas (por el logo o el texto), p. ej. "Bet365", "Codere"'),
  tipo: z.enum(TIPOS_APUESTA).nullable(),
  fecha: textoONulo.describe('Fecha y hora de la apuesta si aparece: "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM" (hora local que muestra la captura)'),
  importe: z.number().nullable().describe('Importe apostado, en unidades de moneda (10.5 = 10,50 €)'),
  cuota_total: textoONulo.describe('Cuota total EXACTAMENTE como aparece'),
  ganancia_potencial: z.number().nullable().describe('Ganancia/retorno potencial total que muestra la captura (incluye lo apostado)'),
  estado: z.enum(ESTADOS_APUESTA).nullable().describe('Solo si la captura muestra que ya está resuelta'),
  importe_cobrado: z.number().nullable().describe('Si está resuelta: lo que se cobró en total (premio, devolución o cash out). 0 si perdida'),
  selecciones: z.array(esquemaSeleccionIA),
  dudosos: z
    .array(z.string())
    .describe('Campos que no se leen con seguridad, p. ej. "importe", "cuota_total", "selecciones.0.cuota"'),
})

export type PropuestaIA = z.infer<typeof esquemaPropuestaIA>

export type Revision = {
  valores: ValoresFormulario
  dudosos: string[] // claves de campo del formulario
  casaDetectada: string | null // nombre que leyó la IA (para elegir o crear la casa)
}

const recortar = (v: string | null | undefined) => (v ?? '').trim().slice(0, MAX_TEXTO)

const CAMPOS_VALIDOS = new Set([
  'casa_id', 'tipo', 'fecha', 'importe', 'cuota_total', 'ganancia_potencial', 'estado', 'resultado_economico',
])
const CAMPOS_SELECCION = new Set(['evento', 'liga', 'deporte', 'mercado', 'pronostico', 'cuota', 'estado'])

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

export function propuestaARevision(p: PropuestaIA): Revision {
  const valores = valoresVacios()
  const dudosos = new Set<string>()
  for (const d of p.dudosos ?? []) {
    const n = normalizarDudoso(d)
    if (n) dudosos.add(n)
  }

  valores.tipo = p.tipo ?? (p.selecciones.length > 1 ? 'combinada' : 'simple')
  if (!p.tipo) dudosos.add('tipo')

  // Fecha: solo si es válida; si no, vacía (= ahora) y marcada.
  if (p.fecha) {
    const iso = localAIso(p.fecha)
    if (iso) valores.fecha = isoALocal(iso)
    else dudosos.add('fecha')
  }

  const importe = eurosACentimos(p.importe)
  valores.importe = importe != null && importe > 0 ? centimosATexto(importe) : ''
  if (!valores.importe) dudosos.add('importe')

  const cuotaTotal = cuotaADecimal(p.cuota_total)
  valores.cuota_total = cuotaTotal ? cuotaATexto(cuotaTotal) : ''
  if (p.cuota_total && cuotaTotal === undefined) dudosos.add('cuota_total')

  const ganancia = eurosACentimos(p.ganancia_potencial)
  valores.ganancia_potencial = ganancia != null && ganancia >= 0 ? centimosATexto(ganancia) : ''

  const sels = p.selecciones.slice(0, MAX_SELECCIONES)
  valores.selecciones = sels.length
    ? sels.map((s, i) => {
        const cuota = cuotaADecimal(s.cuota)
        if (s.cuota && cuota === undefined) dudosos.add(`selecciones.${i}.cuota`)
        return {
          evento: recortar(s.evento),
          liga: recortar(s.liga),
          deporte: recortar(s.deporte),
          mercado: recortar(s.mercado),
          pronostico: recortar(s.pronostico),
          cuota: cuota ? cuotaATexto(cuota) : '',
          estado: s.estado ?? 'pendiente',
        }
      })
    : [seleccionVacia()]
  if (valores.tipo === 'simple' && valores.selecciones.length > 1) valores.tipo = 'combinada'
  if (valores.tipo === 'simple' && !valores.cuota_total && valores.selecciones[0].cuota) {
    valores.cuota_total = valores.selecciones[0].cuota
  }

  // Estado y resultado económico detectados (si la captura ya está resuelta).
  if (p.estado && p.estado !== 'pendiente') {
    valores.estado = p.estado
    const cobrado = eurosACentimos(p.importe_cobrado)
    if (p.estado === 'cash_out' && cobrado != null) valores.importe_recuperado = centimosATexto(cobrado)
    let resultado: number | null = null
    if (cobrado != null && importe != null) resultado = cobrado - importe
    else
      resultado = resultadoPropuesto({
        estado: p.estado,
        importe,
        cuota: cuotaTotal ?? null,
        gananciaPotencial: ganancia,
      })
    valores.resultado_economico = centimosATexto(resultado)
    dudosos.add('estado') // siempre a confirmar
  }

  return { valores, dudosos: [...dudosos], casaDetectada: recortar(p.casa) || null }
}
