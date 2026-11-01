// Importes: en la base de datos van en CÉNTIMOS (enteros). En pantalla, en euros.

const MAX_CENTIMOS = 100_000_000_00 // 100 millones: tope de cordura

// "10,50" · "10.50" · "1.234,56" · "1,234.56" · "10 €" → céntimos. '' → null.
// Devuelve undefined si el texto no es un importe válido.
export function textoACentimos(texto: string, { permitirNegativo = false } = {}): number | null | undefined {
  let t = texto.trim().replace(/[€$£\s]/g, '').replace(/eur|usd|gbp/gi, '')
  if (t === '') return null
  let signo = 1
  if (t.startsWith('-') || t.startsWith('−')) {
    if (!permitirNegativo) return undefined
    signo = -1
    t = t.slice(1)
  } else if (t.startsWith('+')) {
    t = t.slice(1)
  }
  if (!/^[\d.,]+$/.test(t)) return undefined

  const ultimaComa = t.lastIndexOf(',')
  const ultimoPunto = t.lastIndexOf('.')
  const posDecimal = Math.max(ultimaComa, ultimoPunto)
  let entera = t
  let decimales = ''
  // Si el último separador tiene 1 o 2 cifras detrás, es el decimal.
  if (posDecimal >= 0 && t.length - posDecimal - 1 <= 2) {
    entera = t.slice(0, posDecimal)
    decimales = t.slice(posDecimal + 1)
  }
  entera = entera.replace(/[.,]/g, '')
  if (entera === '' && decimales === '') return undefined
  const centimos = Number(entera || '0') * 100 + Number((decimales + '00').slice(0, 2))
  if (!Number.isSafeInteger(centimos) || centimos > MAX_CENTIMOS) return undefined
  return signo * centimos
}

// Número en euros (p. ej. de la IA: 12.5) → céntimos.
export function eurosACentimos(euros: number | null | undefined): number | null {
  if (euros == null || !Number.isFinite(euros)) return null
  const c = Math.round(euros * 100)
  return Math.abs(c) > MAX_CENTIMOS ? null : c
}

// Céntimos → texto para un campo de formulario: 1050 → "10,50".
export function centimosATexto(centimos: number | null | undefined): string {
  if (centimos == null) return ''
  const signo = centimos < 0 ? '-' : ''
  const abs = Math.abs(centimos)
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

// Céntimos → texto bonito: 1050 → "10,50 €".
export function formatoImporte(centimos: number | null | undefined, divisa = 'EUR', { conSigno = false } = {}): string {
  if (centimos == null) return '—'
  const txt = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: divisa,
    minimumFractionDigits: 2,
    signDisplay: conSigno ? 'exceptZero' : 'auto',
  }).format(centimos / 100)
  return txt
}
