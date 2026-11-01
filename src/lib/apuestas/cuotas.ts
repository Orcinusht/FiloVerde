// Cuotas: SIEMPRE en decimal en la base de datos (numeric(12,6)).
// Aquí se convierten las americanas (+150, -200) y fraccionarias (6/4, evens).

const MAX_CUOTA = 999_999

function redondear(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

// Texto de cuota en cualquier formato → decimal. '' → null. No válida → undefined.
export function cuotaADecimal(texto: string | null | undefined): number | null | undefined {
  if (texto == null) return null
  const t = texto.trim().replace(/\s/g, '').toLowerCase()
  if (t === '') return null

  if (t === 'evs' || t === 'evens' || t === 'ev') return 2

  // Fraccionaria: 6/4 → 1 + 6/4 = 2.5
  const frac = /^(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(t)
  if (frac) {
    const num = Number(frac[1].replace(',', '.'))
    const den = Number(frac[2].replace(',', '.'))
    if (!(den > 0)) return undefined
    return comprobar(1 + num / den)
  }

  // Americana: +150 → 2.5 · -200 → 1.5 (siempre con signo y sin decimales)
  const amer = /^([+-])(\d{3,6})$/.exec(t)
  if (amer) {
    const n = Number(amer[2])
    if (n < 100) return undefined
    return comprobar(amer[1] === '+' ? 1 + n / 100 : 1 + 100 / n)
  }

  // Decimal: 2.50 · 2,50 · @2.5
  const dec = /^@?(\d{1,6}(?:[.,]\d{1,6})?)$/.exec(t)
  if (dec) return comprobar(Number(dec[1].replace(',', '.')))

  return undefined
}

function comprobar(n: number): number | undefined {
  if (!Number.isFinite(n) || n < 1 || n > MAX_CUOTA) return undefined
  return redondear(n)
}

// Decimal → texto corto para mostrar o editar: 2.5 → "2,50"; 1.333333 → "1,333".
export function cuotaATexto(cuota: number | string | null | undefined): string {
  if (cuota == null || cuota === '') return ''
  const n = typeof cuota === 'string' ? Number(cuota) : cuota
  if (!Number.isFinite(n)) return ''
  const conDos = n.toFixed(2)
  const txt = Math.abs(Number(conDos) - n) < 1e-9 ? conDos : String(Number(n.toFixed(3)))
  return txt.replace('.', ',')
}
