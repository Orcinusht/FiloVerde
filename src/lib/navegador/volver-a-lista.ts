// Volver a la lista de Apuestas después de guardar o borrar desde el detalle:
//  · a la MISMA lista (con sus filtros), que viene en ?volver= del enlace;
//  · con "reemplazo" del historial: Atrás no vuelve a abrir el formulario guardado;
//  · con un aviso breve y la posición de scroll que tenía la lista.

const CLAVE_AVISO = 'filoverde:aviso'
const CLAVE_SCROLL = 'filoverde:scroll'

// Solo se acepta una dirección de la propia lista (nada de saltos a otras webs).
export function rutaListaSegura(volver: string | null | undefined): string {
  if (volver && /^\/apuestas(\?[^#\s]*)?$/.test(volver) && !volver.startsWith('//')) return volver
  return '/apuestas'
}

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
