import { porCuota } from './promociones.ts'
import type { EstadoApuesta } from './estados.ts'

// Resultado económico NETO (en céntimos) que se propone según el estado.
// La "ganancia potencial" es el retorno total (importe × cuota, con lo apostado).
// Siempre es una propuesta: en el formulario se puede corregir.
export function resultadoPropuesto(args: {
  estado: EstadoApuesta
  importe: number | null
  cuota: number | null
  gananciaPotencial: number | null
  recuperado?: number | null // solo cash out
  promo?: string | null // tipo de promoción ('credito' cambia el cálculo)
}): number | null {
  const { estado, importe, cuota, gananciaPotencial, recuperado } = args
  if (importe == null) return null
  // Apuesta con CRÉDITO: el importe no es dinero propio. Si gana, solo cuenta la ganancia (el
  // importe no se devuelve); si pierde (o se anula), el resultado es 0; en cash out, todo lo
  // recuperado.
  if (args.promo === 'credito') {
    switch (estado) {
      case 'pendiente':
        return null
      case 'ganada':
        if (cuota != null) return porCuota(importe, cuota) - importe
        return gananciaPotencial != null ? gananciaPotencial - importe : null
      case 'media_ganada':
        return cuota != null ? Math.round((porCuota(importe, cuota) - importe) / 2) : null
      case 'perdida':
      case 'media_perdida':
      case 'anulada':
        return 0
      case 'cash_out':
        return recuperado ?? null
    }
  }
  // Sin promoción, con aumento o con asegurada: la fórmula de siempre (el aumento ya va en la
  // ganancia potencial; en media ganada/perdida no se aplica el aumento).
  switch (estado) {
    case 'pendiente':
      return null
    case 'ganada':
      if (gananciaPotencial != null) return gananciaPotencial - importe
      return cuota != null ? Math.round(importe * (cuota - 1)) : null
    case 'perdida':
      return -importe
    case 'anulada':
      return 0
    case 'media_ganada':
      // Mitad ganada a la cuota, mitad devuelta.
      return cuota != null ? Math.round((importe / 2) * (cuota - 1)) : null
    case 'media_perdida':
      // Mitad perdida, mitad devuelta.
      return -Math.round(importe / 2)
    case 'cash_out':
      return recuperado != null ? recuperado - importe : null
  }
}

// Producto de las cuotas de las selecciones (para una combinada).
export function productoCuotas(cuotas: (number | null)[]): number | null {
  if (cuotas.length === 0 || cuotas.some((c) => c == null)) return null
  const p = (cuotas as number[]).reduce((a, b) => a * b, 1)
  return Math.round(p * 1_000_000) / 1_000_000
}

// Avisos (no bloquean el guardado) si los números no cuadran entre sí.
export function avisosCoherencia(args: {
  tipo: string
  estado?: string
  importe: number | null
  cuotaTotal: number | null
  gananciaPotencial: number | null
  cuotasSelecciones: (number | null)[]
  estadosSelecciones?: string[]
  promo?: string | null
}): string[] {
  const { tipo, estado, importe, cuotaTotal, gananciaPotencial, cuotasSelecciones } = args
  const estados = args.estadosSelecciones ?? []
  const avisos: string[] = []
  const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',')

  // Importe × cuota TOTAL frente a la ganancia potencial (en todos los tipos). No en apuestas con
  // aumento (la ganancia ya lleva el aumento) ni con crédito (la casa no devuelve el importe).
  const sinComparar = args.promo === 'superaumento' || args.promo === 'aumento' || args.promo === 'credito'
  if (!sinComparar && importe != null && cuotaTotal != null && gananciaPotencial != null) {
    const esperado = importe * cuotaTotal
    const dif = Math.abs(esperado - gananciaPotencial)
    // Tolerancia: 1 % o 5 céntimos (redondeos de la casa).
    if (dif > Math.max(5, esperado * 0.01)) {
      avisos.push(
        `La ganancia potencial no cuadra con importe × cuota total (saldría ${euros(esperado)} €). Puede ser un bono o una cuota mejorada; revísalo.`,
      )
    }
  }

  // Solo en combinadas: la cuota total suele ser el producto de las selecciones.
  // (En "mismo partido" las cuotas están relacionadas y no se multiplican.)
  if (tipo === 'combinada' && cuotaTotal != null) {
    const producto = productoCuotas(cuotasSelecciones)
    if (producto != null && Math.abs(producto - cuotaTotal) > Math.max(0.02, producto * 0.01)) {
      avisos.push(
        `La cuota total no coincide con el producto de las selecciones (${producto
          .toFixed(2)
          .replace('.', ',')}). Puede ser un redondeo o una cuota mejorada; revísalo.`,
      )
    }
  }

  // Selección anulada en combinada o sistema: la cuota efectiva baja.
  if ((tipo === 'combinada' || tipo === 'sistema') && estados.includes('anulada')) {
    avisos.push(
      'Hay una selección anulada: la casa recalcula la cuota sin ella. Revisa el resultado económico.',
    )
  }

  // Perdida con varias selecciones, pero ninguna marcada como fallada.
  if (estado === 'perdida' && estados.length > 1 && !estados.some((e) => e === 'perdida' || e === 'media_perdida')) {
    avisos.push('La apuesta está perdida pero ninguna selección está marcada como fallada.')
  }

  return avisos
}
