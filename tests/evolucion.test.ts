// Pruebas de "Evolución en el tiempo" (Fase 3): beneficio acumulado (orden y desempates), caídas
// desde un máximo, anuladas y pendientes fuera, meses y días en hora de España (medianoche y cambios
// de hora), filtro de fechas, curva del saldo (Global y por casa, traspasos, retiradas, ajustes,
// apuestas sin casa, fecha futura), crédito, detalle = fila, más de 1000 apuestas y que un usuario
// no ve datos de otro.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalle, enMadrid, enRango, metricas, rangoPeriodo, type ApuestaAnalisis } from '../src/lib/analisis/calculos.ts'
import { MAX_PUNTOS_POR_APUESTA, caidas, curvaBeneficio, curvaSaldo, porDiaSemana, porMes, type ApuestaSaldo } from '../src/lib/analisis/evolucion.ts'
import { calcularBankroll, type Movimiento } from '../src/lib/bankroll/calculos.ts'
import { leerTodoBankroll } from '../src/lib/bankroll/leer.ts'

let sec = 0
function ap(extra: Partial<ApuestaAnalisis> = {}): ApuestaAnalisis {
  sec++
  const f = new Date(Date.UTC(2026, 9, 1) + sec * 3_600_000).toISOString()
  return {
    id: `a${String(sec).padStart(5, '0')}`,
    fecha: f,
    created_at: f,
    tipo: 'simple',
    estado: 'ganada',
    importe: 1000,
    divisa: 'EUR',
    cuota_total: 2,
    resultado_economico: 1000,
    casa: 'Bet365',
    estrategia: null,
    deporte: 'Fútbol',
    en_directo: false,
    viendo_partido: false,
    precipitada: false,
    promo_tipo: null,
    selecciones: [],
    ...extra,
  }
}
const r = (resultado: number, extra: Partial<ApuestaAnalisis> = {}) =>
  ap({ estado: resultado > 0 ? 'ganada' : resultado < 0 ? 'perdida' : 'cash_out', resultado_economico: resultado, ...extra })

// ---------- Beneficio acumulado ----------

test('beneficio acumulado: orden por fecha, luego creación, luego id; empieza en 0 y acaba en el beneficio neto', () => {
  const f = '2026-10-10T10:00:00.000Z'
  const lista = [
    r(300, { id: 'c', fecha: f, created_at: '2026-10-10T09:00:00.000Z' }),
    r(-100, { id: 'b', fecha: f, created_at: '2026-10-10T08:00:00.000Z' }),
    r(50, { id: 'a', fecha: f, created_at: '2026-10-10T09:00:00.000Z' }), // misma fecha y creación que "c": va antes por id
    r(-500, { id: 'z', fecha: '2026-10-09T10:00:00.000Z', created_at: '2026-10-11T00:00:00.000Z' }),
  ]
  const { puntos, porDia } = curvaBeneficio(lista)
  assert.equal(porDia, false)
  assert.deepEqual(
    puntos.map((p) => p.valor),
    [-500, -600, -550, -250],
  )
  assert.equal(puntos[puntos.length - 1].valor, metricas(lista).beneficio)
})

test('beneficio acumulado: anuladas, pendientes y resueltas sin resultado no cuentan; crédito sí suma', () => {
  const lista = [
    r(1000),
    ap({ estado: 'anulada', resultado_economico: 0 }),
    ap({ estado: 'pendiente', resultado_economico: null }),
    ap({ estado: 'ganada', resultado_economico: null }),
    r(400, { promo_tipo: 'credito', importe: 500 }),
    r(-200),
  ]
  const { puntos } = curvaBeneficio(lista)
  assert.deepEqual(
    puntos.map((p) => p.valor),
    [1000, 1400, 1200],
  )
  const m = metricas(lista)
  assert.equal(m.beneficio, 1200, 'el crédito suma al beneficio')
  assert.equal(m.importe, 2000, 'pero no al importe apostado')
})

test(`beneficio acumulado: con más de ${MAX_PUNTOS_POR_APUESTA} apuestas, un punto por día (hora de España) con el valor al final del día`, () => {
  const lista: ApuestaAnalisis[] = []
  // 70 apuestas en 7 días: 10 por día, a las 23:xx de España del día (21:xx UTC en verano / 22:xx en invierno no aplica: octubre 1-7 es verano)
  for (let d = 1; d <= 7; d++) for (let k = 0; k < 10; k++) lista.push(r(d * 10, { fecha: `2026-10-0${d}T21:${String(k * 5).padStart(2, '0')}:00.000Z` }))
  const exactas = lista.slice(0, MAX_PUNTOS_POR_APUESTA)
  assert.equal(curvaBeneficio(exactas).porDia, false, `con ${MAX_PUNTOS_POR_APUESTA} todavía una por apuesta`)
  const { puntos, porDia } = curvaBeneficio(lista)
  assert.equal(porDia, true)
  assert.equal(puntos.length, 7)
  assert.deepEqual(
    puntos.map((p) => p.dia),
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'],
  )
  assert.ok(puntos.every((p) => p.n === 10))
  assert.equal(puntos[6].valor, metricas(lista).beneficio)
  assert.equal(puntos[0].valor, 100)
})

// ---------- Caídas ----------

test('caídas: mayor caída y actual, con fechas; el 0 inicial es el primer máximo', () => {
  const f = (d: number) => `2026-10-${String(d).padStart(2, '0')}T12:00:00.000Z`
  // 0 → -300 → -100 → +500 → +200 → +350 → -50 → +100
  const lista = [r(-300, { fecha: f(1) }), r(200, { fecha: f(2) }), r(600, { fecha: f(3) }), r(-300, { fecha: f(4) }), r(150, { fecha: f(5) }), r(-400, { fecha: f(6) }), r(150, { fecha: f(7) })]
  const c = caidas(lista)!
  assert.equal(c.maxima.importe, 550, 'de +500 a -50')
  assert.equal(c.maxima.desde, f(3))
  assert.equal(c.maxima.hasta, f(6))
  assert.equal(c.actual.importe, 400, 'de +500 a +100')
  assert.equal(c.actual.desde, f(3))
  assert.equal(c.actual.hasta, f(7))
})

test('caídas: si se empieza perdiendo, el máximo previo es el inicio del periodo (0)', () => {
  const c = caidas([r(-300), r(-200), r(100)])!
  assert.equal(c.maxima.importe, 500)
  assert.equal(c.maxima.desde, null)
  assert.equal(c.actual.importe, 400)
})

test('caídas: solo ganancias → 0; sin datos → null ("—"); anuladas y pendientes no cuentan', () => {
  const c = caidas([r(100), r(200), ap({ estado: 'anulada', resultado_economico: 0 }), ap({ estado: 'pendiente', resultado_economico: null }), r(0)])!
  assert.deepEqual(c.maxima, { importe: 0, desde: null, hasta: null })
  assert.deepEqual(c.actual, { importe: 0, desde: null, hasta: null })
  assert.equal(caidas([]), null)
  assert.equal(caidas([ap({ estado: 'pendiente', resultado_economico: null }), ap({ estado: 'anulada', resultado_economico: 0 })]), null)
})

// ---------- Meses y días de la semana ----------

test('hora de España: medianoche, cambio de mes y cambios de hora', () => {
  // Invierno (UTC+1)
  assert.deepEqual(enMadrid('2026-10-31T22:59:00Z'), { dia: '2026-10-31', mes: '2026-10', diaSemana: 6 }) // sábado 23:59
  assert.deepEqual(enMadrid('2026-10-31T23:00:00Z'), { dia: '2026-11-01', mes: '2026-11', diaSemana: 7 }) // domingo 00:00
  // Verano (UTC+2): las 22:30 UTC del 30 de junio ya son 1 de julio
  assert.deepEqual(enMadrid('2026-06-30T22:30:00Z'), { dia: '2026-07-01', mes: '2026-07', diaSemana: 3 })
  assert.deepEqual(enMadrid('2026-06-30T21:59:00Z'), { dia: '2026-06-30', mes: '2026-06', diaSemana: 2 })
  // Paso a verano (29-03-2026, 02:00 → 03:00)
  assert.equal(enMadrid('2026-03-28T22:59:00Z').dia, '2026-03-28')
  assert.equal(enMadrid('2026-03-28T23:00:00Z').dia, '2026-03-29')
  assert.equal(enMadrid('2026-03-29T21:59:00Z').dia, '2026-03-29') // 23:59 de verano
  assert.equal(enMadrid('2026-03-29T22:00:00Z').dia, '2026-03-30') // 00:00 del lunes
  assert.equal(enMadrid('2026-03-29T22:00:00Z').diaSemana, 1)
  // Paso a invierno (25-10-2026, 03:00 → 02:00)
  assert.equal(enMadrid('2026-10-24T21:59:00Z').dia, '2026-10-24')
  assert.equal(enMadrid('2026-10-24T22:00:00Z').dia, '2026-10-25')
  assert.equal(enMadrid('2026-10-25T22:59:00Z').dia, '2026-10-25')
  assert.equal(enMadrid('2026-10-25T23:00:00Z').dia, '2026-10-26')
  // Fin de año
  assert.deepEqual(enMadrid('2026-12-31T23:30:00Z'), { dia: '2027-01-01', mes: '2027-01', diaSemana: 5 })
})

test('por mes y por día: métricas, orden, "muestra pequeña" y una apuesta en un solo grupo', () => {
  const lista = [
    r(1000, { fecha: '2026-10-31T22:30:00Z' }), // sábado 31-oct
    r(-500, { fecha: '2026-10-31T23:30:00Z' }), // domingo 1-nov (en UTC aún es octubre)
    r(200, { fecha: '2026-11-02T10:00:00Z' }), // lunes
    r(0, { fecha: '2026-11-02T11:00:00Z' }), // lunes, resultado 0: fuera del acierto, dentro del importe
    r(300, { fecha: '2026-11-03T10:00:00Z', promo_tipo: 'credito' }), // martes, crédito
    ap({ estado: 'anulada', resultado_economico: 0, fecha: '2026-11-04T10:00:00Z' }),
    ap({ estado: 'pendiente', resultado_economico: null, fecha: '2026-11-04T10:00:00Z' }),
  ]
  const meses = porMes(lista)
  assert.deepEqual(
    meses.map((m) => [m.etiqueta, m.n]),
    [
      ['noviembre 2026', 4],
      ['octubre 2026', 1],
    ],
  )
  const nov = meses[0]
  assert.equal(nov.beneficio, -500 + 200 + 0 + 300)
  assert.equal(nov.importe, 3000, 'el crédito no entra en el importe')
  assert.equal(nov.yield, (-500 + 200 + 0) / 3000)
  assert.equal(nov.acierto, 1 / 2, 'resultado 0 fuera del acierto; crédito fuera')
  assert.ok(nov.muestraPequena)
  const dias = porDiaSemana(lista)
  assert.deepEqual(
    dias.map((d) => [d.etiqueta, d.n]),
    [
      ['Lunes', 2],
      ['Martes', 1],
      ['Sábado', 1],
      ['Domingo', 1],
    ],
  )
  assert.equal(dias[0].yield, 200 / 2000)
  assert.equal(dias[1].yield, null, 'solo crédito: sin importe → "—"')
  assert.equal(dias[1].acierto, null)
  assert.equal(
    dias.reduce((s, d) => s + d.n, 0),
    5,
  )
})

test('detalle de un mes o un día: mismas apuestas (y número) que la fila', () => {
  const lista: ApuestaAnalisis[] = []
  for (let i = 0; i < 120; i++) lista.push(r(i % 3 === 0 ? -100 : 150, { fecha: new Date(Date.UTC(2026, 0, 1) + i * 2.9 * 86_400_000).toISOString() }))
  lista.push(ap({ estado: 'anulada', resultado_economico: 0 }), ap({ estado: 'pendiente', resultado_economico: null }))
  for (const [seg, filas] of [
    ['mes', porMes(lista)],
    ['dia', porDiaSemana(lista)],
  ] as const) {
    assert.equal(
      filas.reduce((s, f) => s + f.n, 0),
      120,
    )
    for (const f of filas) {
      const d = detalle(lista, { vista: 'seg', seg, clave: f.clave })!
      assert.equal(d.n, f.n, `${seg} ${f.etiqueta}`)
      assert.deepEqual([...d.ids].sort(), [...f.ids].sort())
      assert.equal(d.titulo, `${seg === 'mes' ? 'Mes' : 'Día de la semana'}: ${f.etiqueta}`)
      assert.equal(f.muestraPequena, f.n < 10)
    }
  }
  assert.equal(porDiaSemana(lista).length, 7)
})

test('filtro de fechas: solo las apuestas del periodo (en hora de España) entran en curva, caídas y tablas', () => {
  const ahora = new Date('2026-11-06T10:00:00Z')
  const lista = [r(500, { fecha: '2026-10-31T22:59:00Z' }), r(-200, { fecha: '2026-10-31T23:00:00Z' }), r(100, { fecha: '2026-11-05T12:00:00Z' })]
  const rango = rangoPeriodo('mes', '', '', ahora)
  const delMes = lista.filter((a) => enRango(a.fecha, rango))
  assert.equal(delMes.length, 2)
  const { puntos } = curvaBeneficio(delMes)
  assert.deepEqual(
    puntos.map((p) => p.valor),
    [-200, -100],
  )
  assert.equal(caidas(delMes)!.maxima.importe, 200)
  assert.deepEqual(
    porMes(delMes).map((m) => m.etiqueta),
    ['noviembre 2026'],
  )
})

test('más de 1000 apuestas: la curva acaba en el beneficio neto y las tablas suman todas', () => {
  const lista: ApuestaAnalisis[] = []
  for (let i = 0; i < 2500; i++) lista.push(r(i % 4 === 0 ? -1000 : 400, { fecha: new Date(Date.UTC(2024, 0, 1) + i * 7 * 3_600_000).toISOString() }))
  const { puntos, porDia } = curvaBeneficio(lista)
  assert.equal(porDia, true)
  assert.equal(puntos[puntos.length - 1].valor, metricas(lista).beneficio)
  assert.equal(
    puntos.reduce((s, p) => s + p.n, 0),
    2500,
  )
  assert.equal(
    porMes(lista).reduce((s, m) => s + m.n, 0),
    2500,
  )
  assert.equal(
    porDiaSemana(lista).reduce((s, m) => s + m.n, 0),
    2500,
  )
  assert.ok(caidas(lista)!.maxima.importe >= 1000)
})

// ---------- Curva del saldo (Bankroll) ----------

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
let nm = 0
const mov = (tipo: Movimiento['tipo'], importe: number, fecha: string, casa_id = A, casa_destino_id: string | null = null): Movimiento => {
  nm++
  return { id: `m${nm}`, fecha, tipo, importe, casa_id, casa_destino_id, notas: null, created_at: fecha, updated_at: fecha }
}
let na = 0
const apS = (estado: string, resultado: number | null, fecha: string, casa_id: string | null = A, importe = 1000) => {
  na++
  return { id: `s${na}`, fecha, created_at: fecha, casa_id, estado, importe, resultado_economico: resultado }
}

const AHORA = new Date('2026-11-06T10:00:00Z') // viernes 6-nov, 11:00 en España
const movs = [
  mov('deposito', 10000, '2026-10-01T10:00:00Z'),
  mov('deposito', 5000, '2026-10-01T11:00:00Z', B),
  mov('traspaso', 2000, '2026-10-05T10:00:00Z', A, B),
  mov('retirada', 3000, '2026-10-20T10:00:00Z', B),
  mov('ajuste', -250, '2026-11-02T10:00:00Z'),
]
const apus = [
  apS('ganada', 800, '2026-10-03T10:00:00Z'),
  apS('perdida', -1000, '2026-10-10T10:00:00Z', B),
  apS('ganada', 600, '2026-10-12T10:00:00Z', null), // sin casa: solo en el global
  apS('anulada', 0, '2026-10-13T10:00:00Z'),
  apS('pendiente', null, '2026-10-14T10:00:00Z'),
  apS('media_ganada', 300, '2026-10-31T23:30:00Z'), // 1-nov en España
  apS('ganada', 900, '2026-11-20T10:00:00Z'), // fecha futura: suma hoy
  apS('ganada', 400, '2026-11-04T10:00:00Z', A, 500), // con crédito: suma igual al saldo
]

test('curva del saldo, todo: Global ignora traspasos; cada casa los cuenta; último punto = saldo de hoy', () => {
  const b = calcularBankroll([A, B], movs, apus)
  const g = curvaSaldo({ movimientos: movs, apuestas: apus, casaId: null, ahora: AHORA })
  const a = curvaSaldo({ movimientos: movs, apuestas: apus, casaId: A, ahora: AHORA })
  const bb = curvaSaldo({ movimientos: movs, apuestas: apus, casaId: B, ahora: AHORA })
  assert.equal(g[g.length - 1].valor, b.global.saldo)
  assert.equal(a[a.length - 1].valor, b.porCasa.get(A)!.saldo)
  assert.equal(bb[bb.length - 1].valor, b.porCasa.get(B)!.saldo)
  for (const c of [g, a, bb]) {
    assert.equal(c[0].inicial, true)
    assert.equal(c[0].valor, 0)
    assert.equal(c[0].dia, '2026-09-30', 'el inicial es el día anterior al primero')
    assert.equal(c[c.length - 1].dia, '2026-11-06', 'acaba hoy')
    for (let i = 1; i < c.length; i++) assert.ok(c[i].dia > c[i - 1].dia, 'un punto por día, en orden')
  }
  const dia = (c: typeof g, d: string) => c.find((p) => p.dia === d)!
  assert.equal(dia(g, '2026-10-01').valor, 15000)
  assert.equal(dia(g, '2026-10-01').depositos, 15000)
  assert.equal(g.find((p) => p.dia === '2026-10-05'), undefined, 'el traspaso no mueve el global (ni crea punto)')
  assert.equal(dia(a, '2026-10-05').valor, 10000 + 800 - 2000)
  assert.equal(dia(bb, '2026-10-05').valor, 5000 + 2000)
  assert.equal(dia(bb, '2026-10-20').retiradas, 3000)
  assert.equal(dia(g, '2026-10-20').retiradas, 3000)
  assert.equal(dia(a, '2026-10-20' as string), undefined, 'la retirada de B no es de A')
  assert.equal(dia(g, '2026-10-12').valor - dia(g, '2026-10-10').valor, 600, 'sin casa: en el global')
  assert.equal(a.find((p) => p.dia === '2026-10-12'), undefined, 'sin casa: no en A')
  assert.equal(dia(g, '2026-11-02').valor - dia(g, '2026-11-01').valor, -250, 'el ajuste resta')
  assert.equal(dia(g, '2026-11-06').valor - dia(g, '2026-11-04').valor, 900, 'fecha futura: suma hoy')
})

test('curva del saldo con periodo: parte del saldo anterior y acaba hoy aunque el periodo siga', () => {
  const r = rangoPeriodo('mes', '', '', AHORA)
  const g = curvaSaldo({ movimientos: movs, apuestas: apus, casaId: null, desdeDia: r.desdeDia, hastaDia: r.hastaDia, ahora: AHORA })
  const antes = 15000 + 800 - 1000 + 600 - 3000 // hasta el 31-oct (la de las 23:30 UTC es 1-nov)
  assert.equal(g[0].dia, '2026-10-31')
  assert.equal(g[0].valor, antes)
  assert.equal(g[1].dia, '2026-11-01')
  assert.equal(g[1].valor, antes + 300)
  assert.equal(g[g.length - 1].dia, '2026-11-06')
  assert.equal(g[g.length - 1].valor, calcularBankroll([A, B], movs, apus).global.saldo)
  // Periodo personalizado pasado: acaba en su último día, sin lo posterior
  const p = curvaSaldo({ movimientos: movs, apuestas: apus, casaId: B, desdeDia: '2026-10-04', hastaDia: '2026-10-15', ahora: AHORA })
  assert.deepEqual(
    p.map((x) => [x.dia, x.valor]),
    [
      ['2026-10-03', 5000],
      ['2026-10-05', 7000],
      ['2026-10-10', 6000],
      ['2026-10-15', 6000],
    ],
  )
  // Periodo futuro o sin datos
  assert.deepEqual(curvaSaldo({ movimientos: movs, apuestas: apus, casaId: null, desdeDia: '2026-12-01', hastaDia: '2026-12-31', ahora: AHORA }), [])
  assert.deepEqual(curvaSaldo({ movimientos: [], apuestas: [], casaId: null, ahora: AHORA }), [])
})

test('curva del saldo: un día con depósito y retirada lleva las dos marcas; el saldo al final del día', () => {
  const m = [mov('deposito', 1000, '2026-11-03T08:00:00Z'), mov('retirada', 400, '2026-11-03T18:00:00Z'), mov('ajuste', 50, '2026-11-03T19:00:00Z')]
  const g = curvaSaldo({ movimientos: m, apuestas: [], casaId: null, ahora: AHORA })
  assert.deepEqual(g[1], { dia: '2026-11-03', valor: 650, depositos: 1000, retiradas: 400 })
  assert.equal(g[g.length - 1].dia, '2026-11-06')
})

// ---------- Lectura: más de 1000 apuestas y aislamiento entre usuarios ----------

function clienteFalso(sesion: string, tablas: Record<string, Record<string, unknown>[]>) {
  const consultas: { tabla: string; filtros: [string, string, unknown][] }[] = []
  return {
    consultas,
    cliente: {
      from(tabla: string) {
        const q = { tabla, filtros: [] as [string, string, unknown][], orden: [] as [string, boolean][] }
        consultas.push(q)
        const b = {
          select: () => b,
          order: (c: string, o?: { ascending?: boolean }) => (q.orden.push([c, o?.ascending !== false]), b),
          eq: (c: string, v: unknown) => (q.filtros.push(['eq', c, v]), b),
          in: (c: string, v: unknown[]) => (q.filtros.push(['in', c, v]), b),
          async range(desde: number, hasta: number) {
            let filas = (tablas[tabla] ?? []).filter((f) => f.user_id === sesion) // imita RLS
            for (const [op, c, v] of q.filtros) {
              if (op === 'eq') filas = filas.filter((f) => f[c] === v)
              if (op === 'in') filas = filas.filter((f) => (v as unknown[]).includes(f[c]))
            }
            filas = [...filas].sort((x, y) => {
              for (const [c, asc] of q.orden) {
                const r = String(x[c]).localeCompare(String(y[c]))
                if (r) return asc ? r : -r
              }
              return 0
            })
            return { data: filas.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null }
          },
        }
        return b
      },
    } as never,
  }
}

function tablas(n: number) {
  const apuestas: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    const f = new Date(Date.UTC(2025, 0, 1) + i * 5 * 3_600_000).toISOString()
    apuestas.push({ id: `ana-${String(i).padStart(5, '0')}`, user_id: 'ana', fecha: f, created_at: f, casa_id: 'ca', estado: i % 2 ? 'ganada' : 'perdida', importe: 1000, resultado_economico: i % 2 ? 900 : -1000 })
  }
  apuestas.push({ id: 'beto-1', user_id: 'beto', fecha: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', casa_id: 'cbeto', estado: 'ganada', importe: 1, resultado_economico: 777777 })
  const f0 = '2024-12-31T10:00:00Z'
  return {
    apuestas,
    movimientos_bankroll: [
      { id: 'm-ana', user_id: 'ana', fecha: f0, created_at: f0, updated_at: f0, tipo: 'deposito', importe: 2_000_000, casa_id: 'ca', casa_destino_id: null, notas: null },
      { id: 'm-beto', user_id: 'beto', fecha: f0, created_at: f0, updated_at: f0, tipo: 'deposito', importe: 999_999, casa_id: 'cbeto', casa_destino_id: null, notas: null },
    ],
    casas_apuestas: [
      { id: 'ca', user_id: 'ana', nombre: 'Casa A' },
      { id: 'cbeto', user_id: 'beto', nombre: 'Casa de Beto' },
    ],
  }
}

test('lectura: más de 1000 apuestas, todas con fecha, y la curva acaba en el saldo de la tarjeta', async () => {
  const { cliente } = clienteFalso('ana', tablas(2600))
  const { casas, movimientos, apuestas } = await leerTodoBankroll(cliente, 'ana')
  assert.equal(apuestas.length, 2600)
  assert.ok(apuestas.every((a) => a.id && a.fecha && a.created_at))
  const b = calcularBankroll(
    casas.map((c) => c.id),
    movimientos,
    apuestas,
  )
  const g = curvaSaldo({ movimientos, apuestas: apuestas as ApuestaSaldo[], casaId: null, ahora: AHORA })
  const a = curvaSaldo({ movimientos, apuestas: apuestas as ApuestaSaldo[], casaId: 'ca', ahora: AHORA })
  assert.equal(g[g.length - 1].valor, b.global.saldo)
  assert.equal(a[a.length - 1].valor, b.porCasa.get('ca')!.saldo)
  assert.equal(b.global.saldo, 2_000_000 + 1300 * 900 - 1300 * 1000)
})

test('un usuario no ve datos de otro: la curva de Beto solo tiene lo suyo y todas las consultas filtran por su id', async () => {
  const { cliente, consultas } = clienteFalso('beto', tablas(50))
  const deAna = await leerTodoBankroll(cliente, 'ana')
  assert.deepEqual([deAna.movimientos.length, deAna.apuestas.length], [0, 0])
  assert.deepEqual(curvaSaldo({ movimientos: deAna.movimientos, apuestas: deAna.apuestas as ApuestaSaldo[], casaId: null, ahora: AHORA }), [])
  const propio = await leerTodoBankroll(cliente, 'beto')
  const g = curvaSaldo({ movimientos: propio.movimientos, apuestas: propio.apuestas as ApuestaSaldo[], casaId: null, ahora: AHORA })
  assert.equal(g[g.length - 1].valor, 999_999 + 777_777)
  for (const q of consultas) assert.ok(q.filtros.some(([op, c]) => op === 'eq' && c === 'user_id'), `la consulta a ${q.tabla} filtra por user_id`)
})

test('enlaces: el detalle de un mes o un día se pide bien y «← Análisis» vuelve sin ese "seg"', async () => {
  const { enlaceAnalisis, enlaceDetalleSegmento, leerPeticionDetalle } = await import('../src/lib/analisis/direccion.ts')
  const url = enlaceDetalleSegmento({ periodo: 'ano', seg: 'liga' }, 'mes', '#2026-11')
  const q = new URL(url, 'http://x').searchParams
  assert.deepEqual(leerPeticionDetalle(q), { vista: 'seg', seg: 'mes', clave: '#2026-11' })
  assert.equal(enlaceAnalisis(q), '/analisis?periodo=ano')
  assert.deepEqual(leerPeticionDetalle(new URLSearchParams('vista=seg&seg=dia&clave=%237')), { vista: 'seg', seg: 'dia', clave: '#7' })
  assert.equal(leerPeticionDetalle(new URLSearchParams('vista=seg&seg=semana&clave=%231')), null)
})
