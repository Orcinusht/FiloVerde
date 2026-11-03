// ¿Es esta apuesta una copia CALCADA de otra? Comparación estricta y exacta (no por parecido).
//
// Se compara: casa, tipo, importe, cuota total, ganancia potencial (solo si las dos la tienen),
// número de selecciones y, en cada una, evento, mercado, pronóstico y cuota (vacía = vacía, como
// en "mismo partido") y la fecha del evento (solo si las dos la tienen). El orden de las
// selecciones da igual. Textos sin mayúsculas, tildes ni espacios de más; números exactos.
// NO se compara: estado, resultado, estrategia, notas, deporte, liga, hora, fecha de registro,
// en directo ni precipitada.

import { normalizar } from './catalogo.ts'

export type HuellaSeleccion = {
  evento: string | null
  mercado: string | null
  pronostico: string | null
  cuota: number | null
  evento_fecha: string | null // "YYYY-MM-DD"
}

export type HuellaApuesta = {
  casa_id: string | null
  tipo: string
  importe: number // céntimos
  cuota_total: number | null
  ganancia_potencial: number | null // céntimos
  selecciones: HuellaSeleccion[]
}

// Cuotas con 6 decimales como en la base de datos (2.1 = 2.100000).
const cuotaExacta = (c: number | null | undefined) => (c == null || !Number.isFinite(Number(c)) ? null : Math.round(Number(c) * 1e6))
const texto = (t: string | null | undefined) => normalizar(t)
const dia = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)

function claveSeleccion(s: HuellaSeleccion): string {
  return JSON.stringify([texto(s.evento), texto(s.mercado), texto(s.pronostico), cuotaExacta(s.cuota)])
}

export function esCalcada(a: HuellaApuesta, b: HuellaApuesta): boolean {
  if ((a.casa_id ?? null) !== (b.casa_id ?? null)) return false
  if (a.tipo !== b.tipo) return false
  if (a.importe !== b.importe) return false
  if (cuotaExacta(a.cuota_total) !== cuotaExacta(b.cuota_total)) return false
  if (a.ganancia_potencial != null && b.ganancia_potencial != null && a.ganancia_potencial !== b.ganancia_potencial)
    return false
  if (a.selecciones.length !== b.selecciones.length) return false

  // Emparejar selecciones sin importar el orden. Primero las que coinciden también en la fecha
  // del evento; después, las que tienen la fecha vacía en alguno de los dos lados.
  const libres = b.selecciones.map((s) => ({ clave: claveSeleccion(s), fecha: dia(s.evento_fecha), usada: false }))
  const pendientes = a.selecciones.map((s) => ({ clave: claveSeleccion(s), fecha: dia(s.evento_fecha) }))
  for (const exigirFecha of [true, false]) {
    for (let i = pendientes.length - 1; i >= 0; i--) {
      const p = pendientes[i]
      const j = libres.findIndex(
        (l) =>
          !l.usada &&
          l.clave === p.clave &&
          (exigirFecha ? p.fecha != null && l.fecha === p.fecha : p.fecha == null || l.fecha == null || l.fecha === p.fecha),
      )
      if (j >= 0) {
        libres[j].usada = true
        pendientes.splice(i, 1)
      }
    }
  }
  return pendientes.length === 0
}

// Huella estable de los datos comparados: si cambia, "Incluir de nuevo" vuelve a preguntar.
export function claveHuella(h: HuellaApuesta): string {
  return JSON.stringify([
    h.casa_id ?? null,
    h.tipo,
    h.importe,
    cuotaExacta(h.cuota_total),
    h.ganancia_potencial ?? null,
    h.selecciones.map((s) => claveSeleccion(s) + '|' + (dia(s.evento_fecha) ?? '')).sort(),
  ])
}
