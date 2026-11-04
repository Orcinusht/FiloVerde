// Fecha y hora del EVENTO a partir del texto que la IA copia tal cual de la captura
// ("Dom 8 nov / 17:00", "Hoy 21:00", "08/11 21:00", "Sáb 15 nov, 9:00 PM"…).
// La IA no calcula fechas: este código las resuelve con el día de referencia (el de la subida),
// en hora de España. Función pura y probada (tests/logica.test.ts).
//
// Reglas:
//  · Año escrito → sin ámbar.
//  · Sin año pero con día de la semana → el año cercano (anterior, actual o siguiente) en el que
//    ese día cae en ese día de la semana, sin ámbar; si no cuadra con ninguno, el más cercano y en
//    ámbar ("deducido").
//  · Sin año ni día de la semana → el año que deja la fecha más cerca de hoy, en ámbar ("deducido").
//  · "Hoy", "Mañana", "Ayer", "Pasado mañana" → respecto al día de subida, en ámbar ("deducido").
//  · Solo hora, sin día → día y hora vacíos y en ámbar ("falta_dia"): no puede haber hora sin día.
//  · Formato que no se entiende → vacío y en ámbar ("no_entendida"). Nunca se inventa.

export const ZONA = 'Europe/Madrid'

export type MotivoFecha = 'deducido' | 'falta_dia' | 'no_entendida' | 'no_visible'

export type FechaEvento = {
  dia: string | null // "YYYY-MM-DD"
  hora: string | null // "HH:MM"
  motivoDia?: MotivoFecha
  motivoHora?: MotivoFecha
}

type Dia = { y: number; m: number; d: number }

const dos = (n: number) => String(n).padStart(2, '0')
const aTexto = (f: Dia) => `${f.y}-${dos(f.m)}-${dos(f.d)}`

// Día de hoy en España para un instante dado (las 00:30 de Madrid ya son "mañana" en UTC-).
export function diaEnMadrid(instante: Date): Dia {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante)
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return { y: v('year'), m: v('month'), d: v('day') }
}

function esValida(f: Dia): boolean {
  if (f.m < 1 || f.m > 12 || f.d < 1 || f.d > 31 || f.y < 2000 || f.y > 2100) return false
  const x = new Date(Date.UTC(f.y, f.m - 1, f.d))
  return x.getUTCMonth() === f.m - 1 && x.getUTCDate() === f.d
}
const sumarDias = (f: Dia, n: number): Dia => {
  const x = new Date(Date.UTC(f.y, f.m - 1, f.d + n))
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }
}
const diaSemana = (f: Dia) => new Date(Date.UTC(f.y, f.m - 1, f.d)).getUTCDay() // 0 = domingo
const distancia = (a: Dia, b: Dia) => Math.abs(Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d))

const MESES: [RegExp, number][] = [
  [/^ene(ro)?$|^jan(uary)?$/, 1],
  [/^feb(rero)?$|^feb(ruary)?$/, 2],
  [/^mar(zo)?$|^mar(ch)?$/, 3],
  [/^abr(il)?$|^apr(il)?$/, 4],
  [/^may(o)?$/, 5],
  [/^jun(io)?$|^june?$/, 6],
  [/^jul(io)?$|^july?$/, 7],
  [/^ago(sto)?$|^aug(ust)?$/, 8],
  [/^sep(t)?(iembre)?$|^setiembre$|^sept?(ember)?$/, 9],
  [/^oct(ubre)?$|^oct(ober)?$/, 10],
  [/^nov(iembre)?$|^nov(ember)?$/, 11],
  [/^dic(iembre)?$|^dec(ember)?$/, 12],
]
const SEMANA: [RegExp, number][] = [
  [/^dom(ingo)?$|^sun(day)?$/, 0],
  [/^lun(es)?$|^mon(day)?$/, 1],
  [/^mar(tes)?$|^tue(s|sday)?$/, 2],
  [/^mie(rcoles)?$|^wed(nesday)?$/, 3],
  [/^jue(ves)?$|^thu(rs|rsday)?$/, 4],
  [/^vie(rnes)?$|^fri(day)?$/, 5],
  [/^sab(ado)?$|^sat(urday)?$/, 6],
]
const buscar = (tabla: [RegExp, number][], palabra: string) => tabla.find(([r]) => r.test(palabra))?.[1]

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

// Hora: "17:00", "9:00 PM", "9 pm", "21h", "21h30". Devuelve la hora y el texto sin ella.
function sacarHora(t: string): { hora: string | null; resto: string } {
  const patrones = [
    /\b(\d{1,2})[:h](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?=\s|$|[,·|)])/,
    /\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?=\s|$|[,·|)])/,
    /\b(\d{1,2})h(?=\s|$|[,·|)])/,
  ]
  for (const [i, p] of patrones.entries()) {
    const r = p.exec(t)
    if (!r) continue
    let h = Number(r[1])
    const min = i === 0 ? Number(r[2]) : 0
    const sufijo = (i === 0 ? r[3] : i === 1 ? r[2] : '') ?? ''
    if (sufijo) {
      if (h < 1 || h > 12) continue
      const pm = sufijo.startsWith('p')
      if (h === 12) h = pm ? 12 : 0
      else if (pm) h += 12
    }
    if (h > 23 || min > 59) continue
    return { hora: `${dos(h)}:${dos(min)}`, resto: (t.slice(0, r.index) + ' ' + t.slice(r.index + r[0].length)).trim() }
  }
  return { hora: null, resto: t }
}

// Día del texto (sin la hora): { fecha, motivo } o null si no hay día reconocible.
function sacarDia(t: string, hoy: Dia): { fecha: Dia; motivo?: MotivoFecha } | null | 'no_entendida' {
  const s = t.replace(/[,·|]/g, ' ').replace(/\s\/\s/g, ' ').replace(/\s+/g, ' ').trim()
  if (s === '') return null
  if (/\bpasado manana\b/.test(s)) return { fecha: sumarDias(hoy, 2), motivo: 'deducido' }
  if (/\bmanana\b|\btomorrow\b/.test(s)) return { fecha: sumarDias(hoy, 1), motivo: 'deducido' }
  if (/\bhoy\b|\btoday\b/.test(s)) return { fecha: hoy, motivo: 'deducido' }
  if (/\bayer\b|\byesterday\b/.test(s)) return { fecha: sumarDias(hoy, -1), motivo: 'deducido' }

  // ISO "2026-11-08"
  let r = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s)
  if (r) {
    const f = { y: +r[1], m: +r[2], d: +r[3] }
    return esValida(f) ? { fecha: f } : 'no_entendida'
  }

  const palabras = s.split(' ')
  // Día de la semana: solo si es la primera palabra (así "mar" de martes no se confunde con marzo).
  const ds = buscar(SEMANA, palabras[0].replace(/\.$/, ''))
  const sinSemana = ds !== undefined && palabras.length > 1 ? palabras.slice(1).join(' ') : s

  let d: number | undefined
  let m: number | undefined
  let y: number | undefined
  // Numérica: "08/11", "8-11-2026", "08.11.26" (día/mes, como en España).
  r = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(sinSemana)
  if (r) {
    d = +r[1]
    m = +r[2]
    if (r[3]) y = r[3].length === 2 ? 2000 + +r[3] : +r[3]
  } else {
    // Con nombre de mes: "8 nov", "8 de noviembre de 2026", "nov 8".
    const w = sinSemana.split(' ').filter((x) => x !== 'de' && x !== 'del').map((x) => x.replace(/\.$/, ''))
    for (let i = 0; i < w.length; i++) {
      const mes = buscar(MESES, w[i])
      if (mes === undefined) continue
      const antes = /^\d{1,2}$/.test(w[i - 1] ?? '') ? +w[i - 1] : undefined
      const despues = /^\d{1,2}$/.test(w[i + 1] ?? '') ? +w[i + 1] : undefined
      const dia = antes ?? despues
      if (dia === undefined) continue
      d = dia
      m = mes
      const anio = w.slice(i + 1).find((x) => /^\d{4}$/.test(x))
      if (anio) y = +anio
      break
    }
  }
  if (d === undefined || m === undefined) return ds !== undefined || /\d/.test(s) ? 'no_entendida' : 'no_entendida'

  if (y !== undefined) {
    const f = { y, m, d }
    return esValida(f) ? { fecha: f } : 'no_entendida'
  }
  const candidatos = [hoy.y - 1, hoy.y, hoy.y + 1].map((anio) => ({ y: anio, m: m!, d: d! })).filter(esValida)
  if (!candidatos.length) return 'no_entendida'
  const cercano = (lista: Dia[]) => lista.reduce((a, b) => (distancia(b, hoy) < distancia(a, hoy) ? b : a))
  if (ds !== undefined) {
    const cuadran = candidatos.filter((f) => diaSemana(f) === ds)
    if (cuadran.length) return { fecha: cercano(cuadran) }
  }
  return { fecha: cercano(candidatos), motivo: 'deducido' }
}

export function resolverFechaEvento(texto: string | null | undefined, referencia: Date): FechaEvento {
  const t = normalizar(texto ?? '')
  if (!t) return { dia: null, hora: null, motivoDia: 'no_visible', motivoHora: 'no_visible' }
  const hoy = diaEnMadrid(referencia)
  const { hora, resto } = sacarHora(t)
  const dia = sacarDia(resto, hoy)
  if (dia === 'no_entendida') return { dia: null, hora: null, motivoDia: 'no_entendida', motivoHora: 'no_entendida' }
  if (dia === null) {
    // Solo hora (sin día): no se puede guardar hora sin día.
    return hora
      ? { dia: null, hora: null, motivoDia: 'falta_dia', motivoHora: 'falta_dia' }
      : { dia: null, hora: null, motivoDia: 'no_entendida', motivoHora: 'no_entendida' }
  }
  return {
    dia: aTexto(dia.fecha),
    hora,
    ...(dia.motivo ? { motivoDia: dia.motivo } : {}),
    ...(hora ? (dia.motivo ? { motivoHora: dia.motivo } : {}) : { motivoHora: 'no_visible' as const }),
  }
}
