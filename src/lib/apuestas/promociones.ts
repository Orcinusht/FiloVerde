// Promociones de una apuesta (aumentos, apuestas aseguradas y apuestas con crédito).
// Funciones puras, en CÉNTIMOS: las usa el formulario (para enseñar el resumen al momento) y
// OTRA VEZ el servidor al guardar, que es el que cuenta.

export const TIPOS_PROMO = ['superaumento', 'aumento', 'asegurada', 'credito', 'otra'] as const
export type TipoPromo = (typeof TIPOS_PROMO)[number]

export const NOMBRE_PROMO: Record<TipoPromo, string> = {
  superaumento: 'Superaumento de ganancias',
  aumento: 'Aumento de ganancias',
  asegurada: 'Apuesta asegurada',
  credito: 'Apuesta con crédito',
  otra: 'Otra promoción',
}

export const esTipoPromo = (t: unknown): t is TipoPromo => (TIPOS_PROMO as readonly unknown[]).includes(t)
// Superaumento y aumento funcionan igual (solo cambia el nombre que les da la casa).
export const esPromoAumento = (t: unknown): t is 'superaumento' | 'aumento' => t === 'superaumento' || t === 'aumento'

// Cuál de los dos datos (cuota original o aumento) se leyó o escribió; el otro se calcula.
export const BASES_PROMO = ['cuota_original', 'aumento', 'ambos'] as const
export type BasePromo = (typeof BASES_PROMO)[number]
export const esBasePromo = (b: unknown): b is BasePromo => (BASES_PROMO as readonly unknown[]).includes(b)

export const TOLERANCIA_AUMENTO = 2 // céntimos

// importe (céntimos) × cuota, redondeado al céntimo, SIN errores de coma flotante.
export function porCuota(importe: number, cuota: number): number {
  const micro = BigInt(Math.round(cuota * 1_000_000))
  const p = BigInt(importe) * micro
  const medio = BigInt(500_000)
  const r = (p >= BigInt(0) ? p + medio : p - medio) / BigInt(1_000_000)
  return Number(r)
}

const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',')
const cuotaTxt = (c: number) => c.toFixed(2).replace('.', ',')

export type CalculoAumento = {
  gananciaCon: number | null // ganancia potencial con la promoción (retorno total)
  gananciaSin: number | null // lo que habría dado sin la promoción
  cuotaOriginal: number | null
  aumento: number | null // céntimos (puede salir negativo: se avisa, no se bloquea)
  base: BasePromo | null
  falta: boolean // no hay cuota original ni forma de calcularla
  avisos: string[]
}

// Superaumento / aumento de ganancias.
//  · ganancia con promoción = ganancia potencial (si falta, importe × cuota total)
//  · con la cuota original: aumento = ganancia con promoción − importe × cuota original
//  · con el aumento: cuota original = (ganancia con promoción − aumento) / importe
//  · con los dos: se conservan tal cual y se avisa si no cuadran (más de 2 céntimos)
export function calcularAumento(a: {
  importe: number | null
  cuotaTotal: number | null
  gananciaPotencial: number | null
  cuotaOriginal: number | null
  aumento: number | null
  base?: string | null
}): CalculoAumento {
  const { importe, cuotaTotal } = a
  const avisos: string[] = []
  const gananciaCon =
    a.gananciaPotencial ?? (importe != null && cuotaTotal != null ? porCuota(importe, cuotaTotal) : null)

  // Qué dato manda: el indicado, si existe; si no, el que haya.
  let base: BasePromo | null = null
  const hayC = a.cuotaOriginal != null
  const hayA = a.aumento != null
  if (a.base === 'cuota_original' && hayC) base = 'cuota_original'
  else if (a.base === 'aumento' && hayA) base = 'aumento'
  else if (hayC && hayA) base = 'ambos'
  else if (hayC) base = 'cuota_original'
  else if (hayA) base = 'aumento'

  let cuotaOriginal: number | null = null
  let aumento: number | null = null
  if (base === 'cuota_original') {
    cuotaOriginal = a.cuotaOriginal
    aumento = gananciaCon != null && importe ? gananciaCon - porCuota(importe, cuotaOriginal!) : null
  } else if (base === 'aumento') {
    aumento = a.aumento
    if (gananciaCon != null && importe) {
      const c = Math.round(((gananciaCon - aumento!) / importe) * 1_000_000) / 1_000_000
      if (c >= 1) cuotaOriginal = c
      else avisos.push('Con ese aumento, la cuota original saldría menor que 1: revisa el aumento.')
    }
  } else if (base === 'ambos') {
    cuotaOriginal = a.cuotaOriginal
    aumento = a.aumento
    if (gananciaCon != null && importe) {
      const esperado = gananciaCon - porCuota(importe, cuotaOriginal!)
      if (Math.abs(esperado - aumento!) > TOLERANCIA_AUMENTO) {
        avisos.push(
          `La cuota original y el aumento no cuadran: con la cuota original ${cuotaTxt(cuotaOriginal!)} el aumento sería ${euros(esperado)} € (no ${euros(aumento!)} €). Se guardan los dos como están; revísalos.`,
        )
      }
    }
  }

  if (cuotaOriginal != null && cuotaTotal != null && cuotaOriginal > cuotaTotal) {
    avisos.push(
      `La cuota original (${cuotaTxt(cuotaOriginal)}) es mayor que la cuota pagada (${cuotaTxt(cuotaTotal)}): revisa los datos.`,
    )
  }
  if (aumento != null && aumento < 0) avisos.push(`El aumento sale negativo (${euros(aumento)} €): revisa la cuota original.`)

  const gananciaSin =
    gananciaCon != null && aumento != null
      ? gananciaCon - aumento
      : importe != null && cuotaOriginal != null
        ? porCuota(importe, cuotaOriginal)
        : null

  return { gananciaCon, gananciaSin, cuotaOriginal, aumento, base, falta: cuotaOriginal == null, avisos }
}

export const TEXTO_CREDITO = 'Con crédito: si pierdes no baja tu dinero; si ganas sube solo la ganancia.'
