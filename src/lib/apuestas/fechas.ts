// Fechas: en la base de datos van en UTC (timestamptz). En el formulario se
// escriben en hora de España, en el formato de <input type="datetime-local">.
export const ZONA_HORARIA = 'Europe/Madrid'

function partes(fecha: Date, zona: string) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return { y: v('year'), m: v('month'), d: v('day'), h: v('hour'), min: v('minute'), s: v('second') }
}

// ISO (UTC) → "2026-11-01T18:30" en hora de España.
export function isoALocal(iso: string | null | undefined, zona = ZONA_HORARIA): string {
  if (!iso) return ''
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return ''
  const { y, m, d, h, min } = partes(f, zona)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${y}-${dos(m)}-${dos(d)}T${dos(h)}:${dos(min)}`
}

// "2026-11-01T18:30" (o "2026-11-01") en hora de España → ISO UTC. Inválida → undefined.
export function localAIso(local: string, zona = ZONA_HORARIA): string | null | undefined {
  const t = local.trim()
  if (t === '') return null
  const r = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(t)
  if (!r) return undefined
  const [y, m, d, h, min] = [r[1], r[2], r[3], r[4] ?? '12', r[5] ?? '00'].map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return undefined
  // Se calcula el desfase de la zona en ese momento (cambia en verano/invierno).
  const comoUtc = Date.UTC(y, m - 1, d, h, min)
  const p = partes(new Date(comoUtc), zona)
  const desfase = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - comoUtc
  const real = new Date(comoUtc - desfase)
  if (Number.isNaN(real.getTime()) || y < 2000 || y > 2100) return undefined
  return real.toISOString()
}

// ISO → "1 nov 2026, 18:30" en hora de España.
export function formatoFecha(iso: string, { conHora = true } = {}): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA_HORARIA,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso))
}

// Día del evento "YYYY-MM-DD". '' → null · no válido → undefined.
export function validarDia(t: string): string | null | undefined {
  const v = t.trim()
  if (v === '') return null
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!r) return undefined
  const [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])]
  const f = new Date(Date.UTC(y, m - 1, d))
  if (y < 2000 || y > 2100 || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return undefined
  return v
}

// Hora del evento "HH:MM" (también acepta "HH:MM:SS" de la base de datos). '' → null.
export function validarHora(t: string): string | null | undefined {
  const v = t.trim()
  if (v === '') return null
  const r = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v)
  if (!r || Number(r[1]) > 23 || Number(r[2]) > 59) return undefined
  return `${r[1].padStart(2, '0')}:${r[2]}`
}

// "2026-11-02" + "21:00" → "2 nov, 21:00" (sin hora: "2 nov").
export function formatoEvento(dia: string | null, hora: string | null): string {
  if (!dia) return ''
  const [y, m, d] = dia.split('-').map(Number)
  const txt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
  return hora ? `${txt}, ${hora.slice(0, 5)}` : txt
}
