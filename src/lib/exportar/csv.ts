// Exportación a CSV (copia de seguridad) pensada para Excel y Google Sheets en español:
// UTF-8 con BOM, separador ";", coma decimal, fechas "AAAA-MM-DD HH:MM" en hora de España.
// Módulo puro (sin base de datos): lo usan las rutas /api/exportar/* y lo prueba `npm test`.

import { isoALocal } from '../apuestas/fechas.ts'

export const BOM = '﻿'
export const SEPARADOR = ';'
export const FIN_LINEA = '\r\n'
// Supabase devuelve como mucho 1000 filas por consulta: se lee en tandas de este tamaño.
export const TAM_PAGINA = 1000

// ---------- Celdas ----------

// Comillas si el valor lleva ";", comillas, saltos de línea o espacios al principio/final.
// Las comillas de dentro se duplican (norma CSV).
function escapar(v: string): string {
  return /[;"\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// Texto LIBRE (notas, evento, liga, mercado, pronóstico, nombres de casa y estrategia):
// si empieza por = + - @ (o tabulador / retorno de carro), Excel lo ejecutaría como fórmula;
// se le antepone un apóstrofo para que quede como texto. Nunca se usa para números.
export function celdaTexto(v: string | null | undefined): string {
  if (v == null || v === '') return ''
  const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return escapar(seguro)
}

// Códigos internos (ids, estados, tipos, divisa…): valores fijos de la app, sin protección
// de fórmulas (no la necesitan) pero escapados igualmente por si acaso.
export function celdaCodigo(v: string | null | undefined): string {
  return v == null ? '' : escapar(String(v))
}

// Céntimos (enteros, pueden ser negativos) → "12,50" / "-12,50". Sin símbolo ni separador de
// miles, para que Excel lo lea como número.
export function celdaDinero(centimos: number | string | null | undefined): string {
  if (centimos == null || centimos === '') return ''
  const n = Number(centimos)
  if (!Number.isFinite(n)) return ''
  const signo = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n))
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

// Cuota decimal (hasta 6 decimales en la BD) → "1,85", "2,00", "1,333333". Sin redondear.
export function celdaCuota(cuota: number | string | null | undefined): string {
  if (cuota == null || cuota === '') return ''
  const n = Number(cuota)
  if (!Number.isFinite(n)) return ''
  const [ent, dec = ''] = n.toFixed(6).split('.')
  return `${ent},${dec.replace(/0+$/, '').padEnd(2, '0')}`
}

// Fecha y hora de la BD (UTC) → "2026-11-04 18:30" en hora de España.
export function celdaFechaHora(iso: string | null | undefined): string {
  return isoALocal(iso).replace('T', ' ')
}

// Día del evento ("2026-11-04", tal cual) y hora ("18:30:00" → "18:30").
export function celdaDia(dia: string | null | undefined): string {
  return dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : ''
}
export function celdaHora(hora: string | null | undefined): string {
  const r = hora ? /^(\d{2}):(\d{2})/.exec(hora) : null
  return r ? `${r[1]}:${r[2]}` : ''
}

export function celdaSiNo(v: boolean | null | undefined): string {
  return v ? 'sí' : 'no'
}

export function celdaEntero(v: number | null | undefined): string {
  return v == null ? '' : String(Math.trunc(Number(v)))
}

// ---------- Archivo ----------

export type Columna<T> = { cabecera: string; valor: (fila: T) => string }

export function generarCsv<T>(columnas: Columna<T>[], filas: T[]): string {
  const lineas = [columnas.map((c) => c.cabecera).join(SEPARADOR)]
  for (const f of filas) lineas.push(columnas.map((c) => c.valor(f)).join(SEPARADOR))
  return BOM + lineas.join(FIN_LINEA) + FIN_LINEA
}

// "filoverde-apuestas-2026-11-04.csv" (día de hoy en España).
export function nombreArchivo(que: 'apuestas' | 'selecciones', ahora = new Date()): string {
  return `filoverde-${que}-${isoALocal(ahora.toISOString()).slice(0, 10)}.csv`
}

// Lee TODAS las filas en tandas (Supabase corta en 1000 por consulta). `pedir(desde, hasta)` es
// inclusivo en los dos extremos, como `.range()` de Supabase. Para cuando una tanda llega corta.
export async function leerTodo<T>(
  pedir: (desde: number, hasta: number) => Promise<T[]>,
  tam = TAM_PAGINA,
): Promise<T[]> {
  const todas: T[] = []
  for (let desde = 0; ; desde += tam) {
    const tanda = await pedir(desde, desde + tam - 1)
    todas.push(...tanda)
    if (tanda.length < tam) return todas
  }
}

// ---------- Columnas de cada archivo ----------

export type ApuestaExportar = {
  id: string
  fecha: string
  casa: string | null
  estrategia: string | null
  tipo: string
  deporte: string | null
  importe: number
  divisa: string
  cuota_total: number | null
  ganancia_potencial: number | null
  estado: string
  resultado_economico: number | null
  notas: string | null
  en_directo: boolean
  viendo_partido: boolean
  precipitada: boolean
  recuperar_perdidas: boolean
  precipitada_momento: string | null
  promo_tipo: string | null
  promo_cuota_original: number | null
  promo_aumento: number | null
  promo_base: string | null
  promo_credito: number | null
  created_at: string
  updated_at: string
}

export const COLUMNAS_APUESTAS: Columna<ApuestaExportar>[] = [
  { cabecera: 'id', valor: (a) => celdaCodigo(a.id) },
  { cabecera: 'fecha', valor: (a) => celdaFechaHora(a.fecha) },
  { cabecera: 'casa', valor: (a) => celdaTexto(a.casa) },
  { cabecera: 'estrategia', valor: (a) => celdaTexto(a.estrategia) },
  { cabecera: 'tipo', valor: (a) => celdaCodigo(a.tipo) },
  { cabecera: 'deporte', valor: (a) => celdaTexto(a.deporte) },
  { cabecera: 'importe', valor: (a) => celdaDinero(a.importe) },
  { cabecera: 'divisa', valor: (a) => celdaCodigo(a.divisa) },
  { cabecera: 'cuota_total', valor: (a) => celdaCuota(a.cuota_total) },
  { cabecera: 'ganancia_potencial', valor: (a) => celdaDinero(a.ganancia_potencial) },
  { cabecera: 'estado', valor: (a) => celdaCodigo(a.estado) },
  { cabecera: 'resultado_economico', valor: (a) => celdaDinero(a.resultado_economico) },
  { cabecera: 'notas', valor: (a) => celdaTexto(a.notas) },
  { cabecera: 'en_directo', valor: (a) => celdaSiNo(a.en_directo) },
  { cabecera: 'viendo_partido', valor: (a) => celdaSiNo(a.viendo_partido) },
  { cabecera: 'precipitada', valor: (a) => celdaSiNo(a.precipitada) },
  { cabecera: 'recuperar_perdidas', valor: (a) => celdaSiNo(a.recuperar_perdidas) },
  { cabecera: 'precipitada_momento', valor: (a) => celdaCodigo(a.precipitada_momento) },
  { cabecera: 'promo_tipo', valor: (a) => celdaCodigo(a.promo_tipo) },
  { cabecera: 'promo_cuota_original', valor: (a) => celdaCuota(a.promo_cuota_original) },
  { cabecera: 'promo_aumento', valor: (a) => celdaDinero(a.promo_aumento) },
  { cabecera: 'promo_base', valor: (a) => celdaCodigo(a.promo_base) },
  { cabecera: 'promo_credito', valor: (a) => celdaDinero(a.promo_credito) },
  { cabecera: 'creada', valor: (a) => celdaFechaHora(a.created_at) },
  { cabecera: 'modificada', valor: (a) => celdaFechaHora(a.updated_at) },
]

export type SeleccionExportar = {
  id: string
  apuesta_id: string
  orden: number
  evento: string | null
  deporte: string | null
  liga: string | null
  mercado: string | null
  pronostico: string | null
  cuota: number | null
  evento_fecha: string | null
  evento_hora: string | null
  estado: string
  created_at: string
  updated_at: string
}

export const COLUMNAS_SELECCIONES: Columna<SeleccionExportar>[] = [
  { cabecera: 'apuesta_id', valor: (s) => celdaCodigo(s.apuesta_id) },
  { cabecera: 'id', valor: (s) => celdaCodigo(s.id) },
  { cabecera: 'orden', valor: (s) => celdaEntero(s.orden) },
  { cabecera: 'evento', valor: (s) => celdaTexto(s.evento) },
  { cabecera: 'deporte', valor: (s) => celdaTexto(s.deporte) },
  { cabecera: 'liga', valor: (s) => celdaTexto(s.liga) },
  { cabecera: 'mercado', valor: (s) => celdaTexto(s.mercado) },
  { cabecera: 'pronostico', valor: (s) => celdaTexto(s.pronostico) },
  { cabecera: 'cuota', valor: (s) => celdaCuota(s.cuota) },
  { cabecera: 'evento_fecha', valor: (s) => celdaDia(s.evento_fecha) },
  { cabecera: 'evento_hora', valor: (s) => celdaHora(s.evento_hora) },
  { cabecera: 'estado', valor: (s) => celdaCodigo(s.estado) },
  { cabecera: 'creada', valor: (s) => celdaFechaHora(s.created_at) },
  { cabecera: 'modificada', valor: (s) => celdaFechaHora(s.updated_at) },
]

// Ordena las selecciones como sus apuestas (por fecha) y, dentro de cada una, por su orden en
// el resguardo. Una selección cuya apuesta no esté en la lista (p. ej. creada a mitad de la
// exportación) va al final.
export function ordenarSelecciones(selecciones: SeleccionExportar[], idsApuestasEnOrden: string[]): SeleccionExportar[] {
  const pos = new Map(idsApuestasEnOrden.map((id, i) => [id, i]))
  const p = (s: SeleccionExportar) => pos.get(s.apuesta_id) ?? Number.MAX_SAFE_INTEGER
  return [...selecciones].sort((a, b) => p(a) - p(b) || a.apuesta_id.localeCompare(b.apuesta_id) || a.orden - b.orden || a.id.localeCompare(b.id))
}
