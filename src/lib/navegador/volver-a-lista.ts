// Volver a la lista de Apuestas después de guardar o borrar desde el detalle:
//  · a la MISMA lista (con sus filtros), que viene en ?volver= del enlace;
//  · con "reemplazo" del historial: Atrás no vuelve a abrir el formulario guardado;
//  · con un aviso breve y la posición de scroll que tenía la lista.

const CLAVE_AVISO = 'filoverde:aviso'
const CLAVE_SCROLL = 'filoverde:scroll'

// Solo se acepta una dirección INTERNA de la lista de Apuestas o de la pantalla Análisis (y su
// detalle): nada de saltos a otras webs. La RUTA (antes de "?") debe ser exactamente "/apuestas",
// o "/analisis" seguido de nada, de "/" o de "/" + letras minúsculas, cifras o guiones. Así se rechazan
// "//dominio", "/\dominio", "/analisisx", "/analisis@dominio" y sus versiones codificadas
// ("%2F", "%5C"…), porque "%", "@" y "\" no caben en la ruta. Lo que va tras "?" son parámetros
// ya codificados (pueden llevar "%2F" dentro de un valor) y no cambian a dónde se va.
// (Desde la Fase 3 también "/bankroll" y "/ajustes", con la misma regla que "/analisis".)
const RUTA_SEGURA = /^(\/apuestas|\/(analisis|bankroll|ajustes)(\/[a-z0-9-]+)*\/?)(\?[^#\s\\]*)?$/

export function rutaVueltaSegura(volver: string | null | undefined, porDefecto = '/apuestas'): string {
  if (volver && volver.length <= 2000 && RUTA_SEGURA.test(volver)) return volver
  return porDefecto
}
// Nombre anterior (lo usa el detalle de la apuesta).
export const rutaListaSegura = (volver: string | null | undefined) => rutaVueltaSegura(volver)

export function rutaDeVuelta(): string {
  if (typeof window === 'undefined') return '/apuestas'
  return rutaListaSegura(new URLSearchParams(window.location.search).get('volver'))
}

function guardar(clave: string, valor: string) {
  try {
    sessionStorage.setItem(clave, valor)
  } catch {
    // sin almacenamiento (modo privado): no pasa nada, solo no hay aviso/scroll
  }
}
function leer(clave: string): string | null {
  try {
    const v = sessionStorage.getItem(clave)
    sessionStorage.removeItem(clave)
    return v
  } catch {
    return null
  }
}

export function avisarAlVolver(texto: string) {
  guardar(CLAVE_AVISO, texto)
}
export function tomarAviso(): string | null {
  return leer(CLAVE_AVISO)
}

export function recordarScroll(url: string, y: number) {
  guardar(CLAVE_SCROLL, JSON.stringify({ url, y }))
}
export function tomarScroll(url: string): number | null {
  const v = leer(CLAVE_SCROLL)
  if (!v) return null
  try {
    const { url: u, y } = JSON.parse(v)
    return u === url && Number.isFinite(y) ? y : null
  } catch {
    return null
  }
}
