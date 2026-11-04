// Formulario de apuesta: los valores son TEXTO (lo que se escribe en los campos).
// validarFormulario() los convierte a los tipos de la base de datos. Se usa en el
// navegador (para avisar al momento) y OTRA VEZ en el servidor antes de guardar.

import { avisosCoherencia, resultadoPropuesto } from './calculos.ts'
import { cuotaADecimal } from './cuotas.ts'
import { centimosATexto, textoACentimos } from './dinero.ts'
import {
  MIN_SELECCIONES,
  NOMBRE_TIPO,
  esEstadoApuesta,
  esEstadoSeleccion,
  esTipoApuesta,
  type EstadoApuesta,
  type EstadoSeleccion,
  type TipoApuesta,
} from './estados.ts'
import { localAIso, validarDia, validarHora } from './fechas.ts'
import { diaEnMadrid } from './fecha-evento.ts'

const dos2 = (n: number) => String(n).padStart(2, '0')
export function diaEnMadridTexto(instante: Date): string {
  const d = diaEnMadrid(instante)
  return `${d.y}-${dos2(d.m)}-${dos2(d.d)}`
}

// Hora de la apuesta (cuándo se hizo): NO se pide ni se muestra. Se guarda:
//  · al editar sin cambiar el día → la fecha que ya tenía, tal cual;
//  · día de hoy → la hora actual;
//  · otro día (pasado o futuro) → las 12:00 de España.
// Devuelve el ISO, o undefined si el día no es válido.
export function fechaDeLaApuesta(dia: string, original: string | null | undefined, ahora: Date = new Date()): string | undefined {
  const t = dia.trim().slice(0, 10)
  const d = t === '' ? diaEnMadridTexto(ahora) : validarDia(t)
  if (!d) return undefined
  if (original) {
    const o = new Date(original)
    if (!Number.isNaN(o.getTime()) && diaEnMadridTexto(o) === d) return o.toISOString()
  }
  if (d === diaEnMadridTexto(ahora)) return ahora.toISOString()
  return localAIso(`${d}T12:00`) ?? undefined
}
import { esMixto } from './catalogo.ts'
import { calcularAumento, esBasePromo, esPromoAumento, esTipoPromo, type BasePromo, type TipoPromo } from './promociones.ts'
import { cuotaATexto } from './cuotas.ts'

export type Opcion = { id: string; nombre: string }

export const MAX_SELECCIONES = 30
export const MAX_TEXTO = 200
export const MAX_NOTAS = 2000

export type ValoresSeleccion = {
  evento: string
  liga: string
  deporte: string
  mercado: string
  pronostico: string
  cuota: string
  estado: string
  evento_fecha: string // "2026-11-02" (día del evento, hora de España) o ''
  evento_hora: string // "21:00" o '' (= solo se conoce el día)
}

export type ValoresFormulario = {
  casa_id: string
  estrategia_id: string
  tipo: string
  fecha: string // día de la apuesta "2026-11-01" (hora de España); '' = hoy. La hora no se pide.
  fecha_original: string // al editar: la fecha guardada (ISO); si no se cambia el día, se conserva
  importe: string // euros: "10,50"
  cuota_total: string
  ganancia_potencial: string // retorno total en euros
  estado: string
  resultado_economico: string // neto en euros, con signo: "-10,00"
  importe_recuperado: string // solo para cash out (no se guarda; sirve para calcular)
  notas: string
  // Conducta: la marca SIEMPRE el usuario (la IA nunca). Sin marcar = pre-partido y normal.
  en_directo: boolean
  viendo_partido: boolean // solo si en_directo
  precipitada: boolean
  recuperar_perdidas: boolean // solo si precipitada
  // Promoción (la casilla la marca el usuario; la IA solo propone el tipo si lo ve escrito).
  promo: boolean
  promo_tipo: string // '' o uno de TIPOS_PROMO
  promo_cuota_original: string // superaumento / aumento
  promo_aumento: string // euros (puede ser negativo: se avisa)
  promo_base: string // cuál de los dos se leyó o escribió: 'cuota_original' · 'aumento' · 'ambos' · ''
  promo_credito: string // asegurada: crédito si se pierde (euros)
  selecciones: ValoresSeleccion[]
}

export type DatosSeleccion = {
  evento: string | null
  liga: string | null
  deporte: string | null
  mercado: string | null
  pronostico: string | null
  cuota: number | null
  estado: EstadoSeleccion
  evento_fecha: string | null // "YYYY-MM-DD"
  evento_hora: string | null // "HH:MM"
}

export type DatosApuesta = {
  casa_id: string | null
  estrategia_id: string | null
  tipo: TipoApuesta
  fecha: string | null // ISO UTC; null = ahora
  importe: number // céntimos
  cuota_total: number | null
  ganancia_potencial: number | null // céntimos
  estado: EstadoApuesta
  resultado_economico: number | null // céntimos
  notas: string | null
  en_directo: boolean
  viendo_partido: boolean
  precipitada: boolean
  recuperar_perdidas: boolean
  // Siempre presentes (null = sin promoción): así, al editar, quitar la promoción la vacía.
  promo_tipo: TipoPromo | null
  promo_cuota_original: number | null
  promo_aumento: number | null // céntimos
  promo_credito: number | null // céntimos
  promo_base: BasePromo | null
  selecciones: DatosSeleccion[]
}

export type ResultadoValidacion =
  | { ok: true; datos: DatosApuesta; avisos: string[] }
  | { ok: false; errores: Record<string, string>; avisos: string[] }

export function seleccionVacia(): ValoresSeleccion {
  return {
    evento: '', liga: '', deporte: '', mercado: '', pronostico: '', cuota: '', estado: 'pendiente',
    evento_fecha: '', evento_hora: '',
  }
}

// Campos que en "mismo partido" se escriben una vez y valen para todas las selecciones.
export const CAMPOS_COMUNES = ['evento', 'liga', 'deporte', 'evento_fecha', 'evento_hora'] as const

// Ajusta los valores a cómo se guarda cada tipo (sin perder nada que se vea):
//  · simple: la cuota de su selección ES la cuota total.
//  · mismo partido: partido, liga, deporte, fecha y hora de la 1.ª selección valen
//    para todas; las selecciones no llevan cuota propia.
export function ajustarPorTipo(v: ValoresFormulario): ValoresFormulario {
  if (v.tipo === 'simple' && v.selecciones.length === 1) {
    const cuota = v.cuota_total.trim() || v.selecciones[0].cuota
    return {
      ...v,
      cuota_total: cuota,
      selecciones: v.selecciones.map((s, i) => (i === 0 ? { ...s, cuota } : s)),
    }
  }
  if (v.tipo === 'mismo_partido' && v.selecciones.length >= 1) {
    const base = v.selecciones[0]
    return {
      ...v,
      selecciones: v.selecciones.map((s) => ({
        ...s,
        evento: base.evento,
        liga: base.liga,
        deporte: base.deporte,
        evento_fecha: base.evento_fecha,
        evento_hora: base.evento_hora,
        cuota: '',
      })),
    }
  }
  return v
}

export function valoresVacios(): ValoresFormulario {
  return {
    casa_id: '',
    estrategia_id: '',
    tipo: 'simple',
    fecha: diaEnMadridTexto(new Date()),
    fecha_original: '',
    importe: '',
    cuota_total: '',
    ganancia_potencial: '',
    estado: 'pendiente',
    resultado_economico: '',
    importe_recuperado: '',
    notas: '',
    en_directo: false,
    viendo_partido: false,
    precipitada: false,
    recuperar_perdidas: false,
    ...promoVacia(),
    selecciones: [seleccionVacia()],
  }
}

export function promoVacia(): Pick<
  ValoresFormulario,
  'promo' | 'promo_tipo' | 'promo_cuota_original' | 'promo_aumento' | 'promo_base' | 'promo_credito'
> {
  return { promo: false, promo_tipo: '', promo_cuota_original: '', promo_aumento: '', promo_base: '', promo_credito: '' }
}

// Cuota efectiva de la apuesta (la total; en una simple, la de su selección si falta).
export function cuotaDeLaApuesta(v: Pick<ValoresFormulario, 'cuota_total' | 'tipo' | 'selecciones'>): number | null {
  const total = cuotaADecimal(v.cuota_total)
  if (total) return total
  if (v.tipo === 'simple' && v.selecciones.length === 1) return cuotaADecimal(v.selecciones[0].cuota) ?? null
  return null
}

// En el formulario: rellena el dato DERIVADO (aumento o cuota original) a partir del que se leyó
// o escribió, para que se vea al momento. El servidor lo vuelve a calcular al guardar.
export function sincronizarPromo(v: ValoresFormulario): ValoresFormulario {
  if (!v.promo || !esPromoAumento(v.promo_tipo)) return v
  const c = calcularAumento({
    importe: textoACentimos(v.importe) ?? null,
    cuotaTotal: cuotaDeLaApuesta(v),
    gananciaPotencial: textoACentimos(v.ganancia_potencial) ?? null,
    cuotaOriginal: cuotaADecimal(v.promo_cuota_original) ?? null,
    aumento: textoACentimos(v.promo_aumento, { permitirNegativo: true }) ?? null,
    base: v.promo_base,
  })
  if (c.base === 'cuota_original') {
    const t = centimosATexto(c.aumento)
    return t === v.promo_aumento && v.promo_base === 'cuota_original' ? v : { ...v, promo_aumento: t, promo_base: 'cuota_original' }
  }
  if (c.base === 'aumento') {
    const t = c.cuotaOriginal != null ? cuotaATexto(c.cuotaOriginal) : ''
    return t === v.promo_cuota_original && v.promo_base === 'aumento' ? v : { ...v, promo_cuota_original: t, promo_base: 'aumento' }
  }
  return v
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const opcional = (v: string): string | null => {
  const t = v.trim()
  return t === '' ? null : t
}

// Acepta cualquier cosa (viene del navegador): lo que no sea válido da error.
export function validarFormulario(entrada: unknown): ResultadoValidacion {
  const bruto = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>
  const errores: Record<string, string> = {}
  const listaBruta = Array.isArray(bruto.selecciones) ? bruto.selecciones : []
  // Se normaliza por tipo ANTES de validar (lo mismo que ve el formulario).
  const e = ajustarPorTipo({
    ...(bruto as unknown as ValoresFormulario),
    tipo: texto(bruto.tipo),
    cuota_total: texto(bruto.cuota_total),
    selecciones: listaBruta.slice(0, MAX_SELECCIONES + 1).map((s) => {
      const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
      const sel = seleccionVacia()
      for (const k of Object.keys(sel) as (keyof ValoresSeleccion)[]) sel[k] = texto(o[k])
      return sel
    }),
  }) as unknown as Record<string, unknown>

  const casa = texto(e.casa_id).trim()
  if (casa && !UUID.test(casa)) errores.casa_id = 'Casa no válida.'
  const estrategia = texto(e.estrategia_id).trim()
  if (estrategia && !UUID.test(estrategia)) errores.estrategia_id = 'Estrategia no válida.'

  const tipo = texto(e.tipo)
  if (!esTipoApuesta(tipo)) errores.tipo = 'Elige el tipo de apuesta.'

  const estado = texto(e.estado)
  if (!esEstadoApuesta(estado)) errores.estado = 'Elige el estado.'

  const fecha = fechaDeLaApuesta(texto(e.fecha), texto(bruto.fecha_original) || null)
  if (fecha === undefined) errores.fecha = 'Día no válido.'

  const importe = textoACentimos(texto(e.importe))
  if (importe == null) errores.importe = 'Escribe el importe apostado.'
  else if (importe <= 0) errores.importe = 'El importe tiene que ser mayor que 0.'

  const cuotaTotal = cuotaADecimal(texto(e.cuota_total))
  if (cuotaTotal === undefined) errores.cuota_total = 'Cuota no válida (ej.: 1,85 · 6/4 · +150).'

  const ganancia = textoACentimos(texto(e.ganancia_potencial))
  if (ganancia === undefined) errores.ganancia_potencial = 'Importe no válido.'

  const recuperado = textoACentimos(texto(e.importe_recuperado))
  if (recuperado === undefined) errores.importe_recuperado = 'Importe no válido.'

  let resultado = textoACentimos(texto(e.resultado_economico), { permitirNegativo: true })
  if (resultado === undefined) errores.resultado_economico = 'Importe no válido (usa - para pérdidas).'

  const notas = texto(e.notas).trim()
  if (notas.length > MAX_NOTAS) errores.notas = `Máximo ${MAX_NOTAS} caracteres.`

  // Selecciones
  const lista = e.selecciones as ValoresSeleccion[]
  if (lista.length === 0) errores.selecciones = 'Añade al menos una selección.'
  if (lista.length > MAX_SELECCIONES) errores.selecciones = `Máximo ${MAX_SELECCIONES} selecciones.`
  const selecciones: DatosSeleccion[] = lista.slice(0, MAX_SELECCIONES).map((s, i) => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    const campos = ['evento', 'liga', 'deporte', 'mercado', 'pronostico'] as const
    const out: Record<string, string | null> = {}
    for (const c of campos) {
      const v = texto(o[c]).trim()
      if (v.length > MAX_TEXTO) errores[`selecciones.${i}.${c}`] = `Máximo ${MAX_TEXTO} caracteres.`
      out[c] = opcional(v)
    }
    const cuota = cuotaADecimal(texto(o.cuota))
    if (cuota === undefined) errores[`selecciones.${i}.cuota`] = 'Cuota no válida.'
    const est = texto(o.estado) || 'pendiente'
    if (!esEstadoSeleccion(est)) errores[`selecciones.${i}.estado`] = 'Estado no válido.'
    if (!out.deporte) errores[`selecciones.${i}.deporte`] = 'Elige el deporte.'
    else if (esMixto(out.deporte)) errores[`selecciones.${i}.deporte`] = '«Mixto» no es un deporte: elige el de esta selección.'
    if (tipo === 'mismo_partido') {
      if (!out.pronostico && !out.mercado) errores[`selecciones.${i}.pronostico`] = 'Escribe el mercado o el pronóstico.'
    } else if (!out.evento && !out.pronostico && !out.mercado) {
      errores[`selecciones.${i}.evento`] = 'Escribe al menos el evento o el pronóstico.'
    }
    const dia = validarDia(texto(o.evento_fecha))
    if (dia === undefined) errores[`selecciones.${i}.evento_fecha`] = 'Día no válido.'
    const hora = validarHora(texto(o.evento_hora))
    if (hora === undefined) errores[`selecciones.${i}.evento_hora`] = 'Hora no válida.'
    else if (hora && !dia) errores[`selecciones.${i}.evento_hora`] = 'Pon también el día del evento.'
    return {
      evento: out.evento,
      liga: out.liga,
      deporte: out.deporte,
      mercado: out.mercado,
      pronostico: out.pronostico,
      cuota: cuota ?? null,
      estado: (esEstadoSeleccion(est) ? est : 'pendiente') as EstadoSeleccion,
      evento_fecha: dia ?? null,
      evento_hora: hora ?? null,
    }
  })

  if (esTipoApuesta(tipo) && lista.length > 0) {
    const min = MIN_SELECCIONES[tipo]
    if (tipo === 'simple' && selecciones.length > 1) {
      errores.selecciones = 'Una simple tiene una sola selección. Cambia el tipo o quita las demás.'
    } else if (selecciones.length < min) {
      errores.selecciones = `Una apuesta «${NOMBRE_TIPO[tipo]}» necesita al menos ${min} selecciones. Añade más o cambia el tipo.`
    }
  }

  const cuotaFinal = cuotaTotal ?? null

  // ---------- Promoción ----------
  const avisosPromo: string[] = []
  const conPromo = bruto.promo === true
  const tipoPromoTxt = texto(bruto.promo_tipo)
  let promoTipo: TipoPromo | null = null
  let promoCuotaOriginal: number | null = null
  let promoAumento: number | null = null
  let promoCredito: number | null = null
  let promoBase: BasePromo | null = null
  if (conPromo) {
    if (!esTipoPromo(tipoPromoTxt)) errores.promo_tipo = 'Elige el tipo de promoción.'
    else promoTipo = tipoPromoTxt
  }
  if (promoTipo && esPromoAumento(promoTipo)) {
    const c0 = cuotaADecimal(texto(bruto.promo_cuota_original))
    if (c0 === undefined) errores.promo_cuota_original = 'Cuota no válida (ej.: 1,80).'
    const au = textoACentimos(texto(bruto.promo_aumento), { permitirNegativo: true })
    if (au === undefined) errores.promo_aumento = 'Importe no válido.'
    const baseTxt = texto(bruto.promo_base)
    // El dato derivado NO se fía del navegador: se recalcula aquí, en cada guardado.
    const calc = calcularAumento({
      importe: importe ?? null,
      cuotaTotal: cuotaFinal ?? (tipo === 'simple' ? (selecciones[0]?.cuota ?? null) : null),
      gananciaPotencial: ganancia ?? null,
      cuotaOriginal: c0 ?? null,
      aumento: au ?? null,
      base: esBasePromo(baseTxt) ? baseTxt : null,
    })
    promoCuotaOriginal = calc.cuotaOriginal
    promoAumento = calc.aumento
    promoBase = calc.base
    avisosPromo.push(...calc.avisos)
  } else if (promoTipo === 'asegurada') {
    const cr = textoACentimos(texto(bruto.promo_credito))
    if (cr === undefined) errores.promo_credito = 'Importe no válido.'
    // Por defecto, el crédito si se pierde es el importe apostado.
    promoCredito = cr ?? importe ?? null
  }

  // Resultado: si está resuelta y no se ha escrito, se calcula.
  if (esEstadoApuesta(estado)) {
    if (estado === 'pendiente') resultado = null
    else if (resultado == null) {
      resultado = resultadoPropuesto({
        estado,
        importe: importe ?? null,
        cuota: cuotaFinal,
        gananciaPotencial: ganancia ?? null,
        recuperado: recuperado ?? null,
        promo: promoTipo,
      })
      if (resultado == null) {
        errores[estado === 'cash_out' ? 'importe_recuperado' : 'resultado_economico'] =
          estado === 'cash_out'
            ? 'Escribe cuánto recuperaste con el cash out.'
            : 'Falta la cuota para calcular el resultado; escríbelo a mano.'
      }
    }
  }

  const avisos = avisosCoherencia({
    tipo,
    estado,
    importe: importe ?? null,
    cuotaTotal: cuotaFinal,
    gananciaPotencial: ganancia ?? null,
    cuotasSelecciones: selecciones.map((s) => s.cuota),
    estadosSelecciones: selecciones.map((s) => s.estado),
    promo: promoTipo,
  })
  avisos.push(...avisosPromo)

  if (Object.keys(errores).length > 0) return { ok: false, errores, avisos }

  return {
    ok: true,
    avisos,
    datos: {
      casa_id: casa || null,
      estrategia_id: estrategia || null,
      tipo: tipo as TipoApuesta,
      fecha: fecha ?? null,
      importe: importe as number,
      cuota_total: cuotaFinal,
      ganancia_potencial: ganancia ?? null,
      estado: estado as EstadoApuesta,
      resultado_economico: resultado ?? null,
      notas: notas || null,
      // Solo vale "true" de verdad; las subcasillas, solo si su casilla está marcada.
      en_directo: bruto.en_directo === true,
      viendo_partido: bruto.en_directo === true && bruto.viendo_partido === true,
      precipitada: bruto.precipitada === true,
      recuperar_perdidas: bruto.precipitada === true && bruto.recuperar_perdidas === true,
      promo_tipo: promoTipo,
      promo_cuota_original: promoCuotaOriginal,
      promo_aumento: promoAumento,
      promo_credito: promoCredito,
      promo_base: promoBase,
      selecciones,
    },
  }
}
