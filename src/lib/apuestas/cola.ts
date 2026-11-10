// Estados de la cola de revisión de capturas (funciones puras, probadas en tests/logica.test.ts).

export type EstadoItemCola = 'pendiente' | 'guardada' | 'descartada' | 'leyendo' | 'error' | 'eligiendo'

// Estado de un elemento de la cola a partir de su paso y de lo hecho con él.
export function estadoCola(it: { paso: string; estado?: string }): EstadoItemCola {
  if (it.estado === 'guardada' || it.estado === 'descartada') return it.estado
  if (it.paso === 'error') return 'error'
  if (it.paso === 'eligiendo') return 'eligiendo'
  if (it.paso === 'lista' || it.paso === 'manual') return 'pendiente'
  return 'leyendo'
}

const sinTerminar = (e: EstadoItemCola) => e !== 'guardada' && e !== 'descartada'

// La siguiente apuesta sin terminar después de `actual`; si no hay, la primera anterior (salvo
// `soloDespues`). null = no queda ninguna: se enseña el resumen.
export function siguientePendiente(estados: EstadoItemCola[], actual: number, { soloDespues = false } = {}): number | null {
  for (let i = actual + 1; i < estados.length; i++) if (sinTerminar(estados[i])) return i
  if (soloDespues) return null
  for (let i = 0; i <= Math.min(actual, estados.length - 1); i++) if (sinTerminar(estados[i])) return i
  return null
}

export function resumenCola(estados: EstadoItemCola[]) {
  return {
    guardadas: estados.filter((e) => e === 'guardada').length,
    descartadas: estados.filter((e) => e === 'descartada').length,
    pendientes: estados.filter(sinTerminar).length,
  }
}

// Pantalla "¿Cuáles quieres guardar?": marcadas por defecto las que NO están ya registradas.
export function marcadasPorDefecto(opciones: { indice: number; yaRegistrada: boolean }[]): number[] {
  return opciones.filter((o) => !o.yaRegistrada).map((o) => o.indice)
}

// "Descartar todas": las apuestas de la cola SIN GUARDAR (pendientes, fallidas y capturas con
// varias apuestas por elegir). Las guardadas y las ya descartadas no se tocan. Si alguna captura
// aún se está leyendo, no se puede (se avisa) para no dejar una lectura a medias.
export type ParaDescartar = { clave: string; indices: (number | null)[] }
export function paraDescartarTodas(
  items: { clave: string; paso: string; estado?: string; indice?: number; opciones?: { indice: number }[] }[],
): { lista: ParaDescartar[]; apuestas: number; leyendo: boolean } {
  const lista: ParaDescartar[] = []
  let leyendo = false
  for (const it of items) {
    const e = estadoCola(it)
    if (e === 'leyendo') leyendo = true
    else if (e === 'pendiente' || e === 'error') lista.push({ clave: it.clave, indices: [it.indice ?? null] })
    else if (e === 'eligiendo') lista.push({ clave: it.clave, indices: (it.opciones ?? []).map((o) => o.indice) })
  }
  return { lista, apuestas: lista.reduce((n, x) => n + Math.max(1, x.indices.length), 0), leyendo }
}
