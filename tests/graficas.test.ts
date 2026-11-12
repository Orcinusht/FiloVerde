// Pruebas de la pestaña Gráficas (Fase 3): series por segmento = filas de Análisis, filtro de casa,
// "Varios", periodos Hoy / Ayer / Últimos 7 días (medianoche y cambios de hora), color, "Ver más" de
// 8 en 8, detalle con casa y mismo recuento, ?volver= con /graficas, punto más cercano al dedo,
// más de 1000 apuestas y que un usuario no ve datos de otro.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEGMENTOS, detalle, enRango, metricas, rangoPeriodo, segmentar, type ApuestaAnalisis, type SeleccionAnalisis, type Segmento } from '../src/lib/analisis/calculos.ts'
import { curvaBeneficio } from '../src/lib/analisis/evolucion.ts'
import { leerApuestasAnalisis } from '../src/lib/analisis/leer.ts'
import { enlaceDetalleGraficas, leerPeticionDetalle, vueltaDetalle } from '../src/lib/analisis/direccion.ts'
import { rutaVueltaSegura } from '../src/lib/navegador/volver-a-lista.ts'
import { CASA_SIN, curvaGrafica, dominioFechas, escalaComun, filtrarCasa, leerCasa, seriesPorSegmento, seriesVisibles } from '../src/lib/graficas/series.ts'
import { marcasEje, puntoMasCercano, tonoDe, vecinos } from '../src/lib/graficas/geometria.ts'

const CA = '11111111-1111-4111-8111-111111111111'
const CB = '22222222-2222-4222-8222-222222222222'
let sec = 0
const sel = (extra: Partial<SeleccionAnalisis> = {}): SeleccionAnalisis => ({ deporte: 'Fútbol', liga: 'LaLiga', mercado: '1X2', estado: 'ganada', ...extra })
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
    casa: 'Casa A',
    casa_id: CA,
    estrategia: null,
    deporte: 'Fútbol',
    en_directo: false,
    viendo_partido: false,
    precipitada: false,
    promo_tipo: null,
    selecciones: [sel()],
    ...extra,
  }
}

// Datos variados: casas A, B y sin casa; cuotas, tipos, ligas (con "Varios" y "Sin dato"),
// anuladas, pendientes, crédito y resultado 0.
function variado(n = 150): ApuestaAnalisis[] {
  const out: ApuestaAnalisis[] = []
  for (let i = 0; i < n; i++) {
    const casa = i % 3 === 0 ? { casa: 'Casa A', casa_id: CA } : i % 3 === 1 ? { casa: 'Casa B', casa_id: CB } : { casa: null, casa_id: null }
    const estado = i % 11 === 0 ? 'anulada' : i % 13 === 0 ? 'pendiente' : i % 2 ? 'ganada' : 'perdida'
    const res = estado === 'anulada' ? 0 : estado === 'pendiente' ? null : i % 17 === 0 ? 0 : estado === 'ganada' ? 300 + i : -(200 + i)
    const sels =
      i % 7 === 0
        ? [sel({ liga: 'LaLiga' }), sel({ liga: 'Premier League', deporte: 'Fútbol' })] // → Varios
        : i % 9 === 0
          ? [sel({ liga: null as unknown as string })] // → Sin dato
          : [sel({ liga: i % 2 ? 'LaLiga' : 'Serie A', mercado: i % 4 ? '1X2' : 'Goles' })]
    out.push(
      ap({
        ...casa,
        estado,
        resultado_economico: res,
        cuota_total: i % 5 === 0 ? null : 1.2 + (i % 6) * 0.5,
        tipo: i % 7 === 0 ? 'combinada' : 'simple',
        estrategia: i % 4 === 0 ? 'Valor' : null,
        promo_tipo: i % 19 === 0 ? 'credito' : null,
        en_directo: i % 6 === 0,
        precipitada: i % 8 === 0,
        selecciones: sels,
      }),
    )
  }
  return out
}

test('cada serie acaba exactamente en el beneficio de su fila de Análisis (los 9 segmentos, casa «Todas»)', () => {
  const datos = variado()
  const inicio = dominioFechas(datos)![0]
  for (const seg of Object.keys(SEGMENTOS) as Segmento[]) {
    const filas = segmentar(datos, seg, 'n')
    const { series, total } = seriesPorSegmento(datos, seg, 'n', inicio)
    assert.equal(total, filas.length, seg)
    for (const [i, s] of series.entries()) {
      assert.equal(s.clave, filas[i].clave, `${seg}: mismo orden que la fila`)
      assert.equal(s.curva.final, filas[i].beneficio, `${seg} · ${s.etiqueta}: final = beneficio de la fila`)
      assert.equal(s.n, filas[i].n)
      assert.deepEqual(s.ids, filas[i].ids, 'mismos ids')
      assert.equal(s.curva.puntos[0].y, 0, 'empieza en 0')
      assert.equal(s.curva.puntos[0].x, inicio, 'en el inicio del eje común')
    }
  }
})

test('atribución «Varios»: una apuesta con selecciones de ligas distintas va a «Varios», no se reparte', () => {
  const a = ap({ selecciones: [sel({ liga: 'LaLiga' }), sel({ liga: 'Premier League' })], resultado_economico: 500 })
  const b = ap({ selecciones: [sel({ liga: 'LaLiga' }), sel({ liga: 'laliga ' })], resultado_economico: -100 })
  const { series } = seriesPorSegmento([a, b], 'liga', 'n', dominioFechas([a, b])![0])
  const varios = series.find((s) => s.etiqueta === 'Varios')!
  assert.deepEqual(varios.ids, [a.id])
  assert.equal(varios.curva.final, 500)
  assert.equal(series.find((s) => s.etiqueta !== 'Varios')!.curva.final, -100)
})

test('filtro de casa: una apuesta sin casa solo sale en «Todas» y en «Sin casa»', () => {
  const datos = variado(60)
  const sinCasa = datos.filter((a) => !a.casa_id)
  assert.equal(filtrarCasa(datos, '').length, datos.length)
  assert.deepEqual(filtrarCasa(datos, CASA_SIN), sinCasa)
  for (const c of [CA, CB]) assert.ok(filtrarCasa(datos, c).every((a) => a.casa_id === c))
  assert.equal(filtrarCasa(datos, CA).length + filtrarCasa(datos, CB).length + filtrarCasa(datos, CASA_SIN).length, datos.length)
  const s = sinCasa[0]
  assert.ok(!filtrarCasa(datos, CA).includes(s) && !filtrarCasa(datos, CB).includes(s))
  // ?casa= que no es ni "sin" ni un id → todas
  for (const malo of ['x', "'; drop", '../', 'SIN ']) assert.equal(leerCasa(malo), '')
  assert.equal(leerCasa('sin'), 'sin')
  assert.equal(leerCasa(CA.toUpperCase()), CA)
  // Beneficio total por casas = beneficio de "Todas"
  const total = (xs: ApuestaAnalisis[]) => curvaGrafica(xs, 0).final
  assert.equal(total(filtrarCasa(datos, CA)) + total(filtrarCasa(datos, CB)) + total(filtrarCasa(datos, CASA_SIN)), total(datos))
  assert.equal(total(datos), metricas(datos).beneficio)
})

test('curva: apuesta a apuesta con hora en la etiqueta; por día con más de 60; caídas como en Evolución', () => {
  const pocas = [ap({ resultado_economico: 500, fecha: '2026-11-03T18:30:00Z' }), ap({ resultado_economico: -800, fecha: '2026-11-03T19:45:00Z' })]
  const c = curvaGrafica(pocas, dominioFechas(pocas)![0])
  assert.equal(c.porDia, false)
  assert.deepEqual(
    c.puntos.map((p) => p.y),
    [0, 500, -300],
  )
  assert.match(c.puntos[1].texto, /19:30 · apuesta 1 de 2\nAcumulado: \+5,00\s€/)
  assert.match(c.puntos[2].texto, /20:45 · apuesta 2 de 2\nAcumulado: [-−]3,00\s€/)
  assert.equal(c.caidaMaxima, 800)
  assert.equal(c.caidaActual, 800)
  assert.equal(c.tono, 'negativo')
  assert.equal(c.puntos[1].x, Date.parse('2026-11-03T18:30:00Z'), 'cada punto en su fecha')
  const muchas = variado(200)
  const cm = curvaGrafica(muchas, 0)
  assert.equal(cm.porDia, curvaBeneficio(muchas).porDia)
  assert.equal(cm.final, metricas(muchas).beneficio)
  // Una sola apuesta: el 0 de partida y su punto
  const una = curvaGrafica([ap({ resultado_economico: 250 })], 0)
  assert.equal(una.puntos.length, 2)
  assert.equal(una.final, 250)
  // Sin apuestas: sin caídas ("—") y sin eje
  assert.equal(curvaGrafica([], 0).caidaMaxima, null)
  assert.equal(dominioFechas([ap({ estado: 'pendiente', resultado_economico: null }), ap({ estado: 'anulada', resultado_economico: 0 })]), null)
})

test('eje de fechas común: desde las 00:00 (España) del día de la primera apuesta hasta la última', () => {
  const datos = [ap({ fecha: '2026-11-03T23:30:00Z' }), ap({ fecha: '2026-11-05T10:00:00Z' }), ap({ fecha: '2026-11-08T10:00:00Z', estado: 'pendiente', resultado_economico: null })]
  const [x0, x1] = dominioFechas(datos)!
  assert.equal(new Date(x0).toISOString(), '2026-11-03T23:00:00.000Z', '00:00 del 4-nov en España (las 23:30 UTC del 3 ya son el 4)')
  assert.equal(new Date(x1).toISOString(), '2026-11-05T10:00:00.000Z', 'la pendiente no alarga el eje')
})

test('color: verde si el final es > 0, rojo si < 0, neutro si 0', () => {
  assert.equal(tonoDe(1), 'positivo')
  assert.equal(tonoDe(-1), 'negativo')
  assert.equal(tonoDe(0), 'neutro')
  assert.equal(curvaGrafica([ap({ resultado_economico: 300 }), ap({ estado: 'perdida', resultado_economico: -300 })], 0).tono, 'neutro')
})

test('«Ver más»: de 8 en 8, nunca más de las que hay', () => {
  assert.equal(seriesVisibles(20, ''), 8)
  assert.equal(seriesVisibles(20, '16'), 16)
  assert.equal(seriesVisibles(20, '24'), 20)
  assert.equal(seriesVisibles(20, '9'), 16, 'se redondea a la tanda siguiente')
  assert.equal(seriesVisibles(5, ''), 5)
  assert.equal(seriesVisibles(20, '-3'), 8)
  assert.equal(seriesVisibles(20, 'abc'), 8)
  const datos = variado(150)
  const todas = seriesPorSegmento(datos, 'mercado', 'n', 0)
  const ocho = seriesPorSegmento(datos, 'mercado', 'n', 0, 8)
  assert.equal(ocho.total, todas.total)
  assert.deepEqual(
    ocho.series.map((s) => s.clave),
    todas.series.slice(0, 8).map((s) => s.clave),
  )
  // Orden: más apuestas primero; o por beneficio
  const porN = seriesPorSegmento(datos, 'cuota', 'n', 0).series
  for (let i = 1; i < porN.length; i++) assert.ok(porN[i - 1].n >= porN[i].n)
  const porB = seriesPorSegmento(datos, 'cuota', 'beneficio', 0).series
  for (let i = 1; i < porB.length; i++) assert.ok(porB[i - 1].beneficio >= porB[i].beneficio)
})

test('misma escala: mínimo y máximo comunes (con el 0); marcas del eje que lo cubren', () => {
  const a = curvaGrafica([ap({ resultado_economico: 5000 })], 0)
  const b = curvaGrafica([ap({ estado: 'perdida', resultado_economico: -1200 })], 0)
  assert.deepEqual(escalaComun([a, b]), [-1200, 5000])
  const m = marcasEje(-1200, 5000)
  assert.ok(m[0] <= -1200 && m[m.length - 1] >= 5000 && m.includes(0))
  assert.ok(marcasEje(0, 0).includes(0))
})

test('punto más cercano al dedo (en x e y) y aviso de puntos casi pegados', () => {
  // Tres apuestas el mismo día (casi la misma x) a distintas alturas, y otra lejos.
  const pts = [
    { x: 10, y: 80 },
    { x: 200, y: 90 },
    { x: 202, y: 40 },
    { x: 204, y: 10 },
    { x: 300, y: 50 },
  ]
  assert.equal(puntoMasCercano(pts, 201, 88), 1, 'abajo → el de abajo')
  assert.equal(puntoMasCercano(pts, 201, 45), 2, 'a media altura → el del medio')
  assert.equal(puntoMasCercano(pts, 199, 0), 3, 'arriba → el de arriba')
  assert.equal(puntoMasCercano(pts, 0, 0), 0)
  assert.equal(puntoMasCercano(pts, 1000, 50), 4)
  assert.equal(puntoMasCercano([], 1, 1), -1)
  assert.deepEqual(
    vecinos(
      pts.map((p) => p.x),
      2,
    ),
    { total: 3, posicion: 2 },
  )
  assert.deepEqual(
    vecinos(
      pts.map((p) => p.x),
      4,
    ),
    { total: 1, posicion: 1 },
  )
})

// ---------- Periodos nuevos (hora de España) ----------

const iso = (r: { desde: string | null; hasta: string | null }) => [r.desde, r.hasta]

test('Hoy, Ayer y Últimos 7 días: cerca de medianoche', () => {
  // 23:59 del viernes 6-nov en España (invierno, UTC+1)
  let ahora = new Date('2026-11-06T22:59:00Z')
  assert.deepEqual(iso(rangoPeriodo('hoy', '', '', ahora)), ['2026-11-05T23:00:00.000Z', '2026-11-06T23:00:00.000Z'])
  assert.deepEqual(iso(rangoPeriodo('ayer', '', '', ahora)), ['2026-11-04T23:00:00.000Z', '2026-11-05T23:00:00.000Z'])
  assert.deepEqual(iso(rangoPeriodo('7d', '', '', ahora)), ['2026-10-30T23:00:00.000Z', '2026-11-06T23:00:00.000Z'])
  assert.equal(rangoPeriodo('7d', '', '', ahora).desdeDia, '2026-10-31')
  // Un minuto después ya es sábado 7
  ahora = new Date('2026-11-06T23:00:00Z')
  assert.equal(rangoPeriodo('hoy', '', '', ahora).desdeDia, '2026-11-07')
  assert.equal(rangoPeriodo('ayer', '', '', ahora).desdeDia, '2026-11-06')
  // Una apuesta de las 23:30 del jueves (España) es de "ayer" el viernes, no de "hoy"
  const r = rangoPeriodo('hoy', '', '', new Date('2026-11-06T10:00:00Z'))
  assert.equal(enRango('2026-11-05T22:30:00Z', r), false)
  assert.equal(enRango('2026-11-05T23:00:00Z', r), true)
  assert.equal(enRango('2026-11-05T22:30:00Z', rangoPeriodo('ayer', '', '', new Date('2026-11-06T10:00:00Z'))), true)
})

test('Hoy, Ayer y Últimos 7 días: cambio de hora de marzo (29-03-2026) y de octubre (25-10-2026)', () => {
  // Domingo 29-mar, 12:00 de verano: el día tiene 23 horas
  let ahora = new Date('2026-03-29T10:00:00Z')
  assert.deepEqual(iso(rangoPeriodo('hoy', '', '', ahora)), ['2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z'])
  assert.deepEqual(iso(rangoPeriodo('ayer', '', '', ahora)), ['2026-03-27T23:00:00.000Z', '2026-03-28T23:00:00.000Z'])
  assert.deepEqual(iso(rangoPeriodo('7d', '', '', ahora)), ['2026-03-22T23:00:00.000Z', '2026-03-29T22:00:00.000Z'])
  // Lunes 30-mar: "ayer" es el día de 23 horas
  ahora = new Date('2026-03-30T08:00:00Z')
  assert.deepEqual(iso(rangoPeriodo('ayer', '', '', ahora)), ['2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z'])
  // Domingo 25-oct: el día tiene 25 horas
  ahora = new Date('2026-10-25T12:00:00Z')
  assert.deepEqual(iso(rangoPeriodo('hoy', '', '', ahora)), ['2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z'])
  // Lunes 26-oct a las 00:30 (España): "ayer" es el domingo de 25 horas
  ahora = new Date('2026-10-25T23:30:00Z')
  assert.equal(rangoPeriodo('hoy', '', '', ahora).desdeDia, '2026-10-26')
  assert.deepEqual(iso(rangoPeriodo('ayer', '', '', ahora)), ['2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z'])
  assert.deepEqual(iso(rangoPeriodo('7d', '', '', ahora)), ['2026-10-19T22:00:00.000Z', '2026-10-26T23:00:00.000Z'])
})

// ---------- Detalle desde Gráficas y ?volver= ----------

test('detalle de una serie con casa: mismas apuestas y recuento que la cabecera; vuelve a Gráficas', () => {
  const datos = variado(150)
  const volver = '/graficas?casa=' + CA + '&periodo=7d&seg=liga&orden=beneficio&escala=misma&mas=16'
  const sp = { casa: CA, periodo: '7d', seg: 'liga' }
  const deCasa = filtrarCasa(datos, CA)
  for (const s of seriesPorSegmento(deCasa, 'liga', 'beneficio', 0).series) {
    const url = new URL(enlaceDetalleGraficas(sp, 'liga', s.clave, volver), 'http://x')
    const q = url.searchParams
    assert.equal(url.pathname, '/analisis/detalle')
    assert.equal(q.get('casa'), CA)
    assert.equal(q.get('periodo'), '7d')
    // Lo que hace la página del detalle: filtrar por casa y calcular con la misma función
    const pet = leerPeticionDetalle(q)!
    const d = detalle(filtrarCasa(datos, leerCasa(q.get('casa'))), pet)!
    assert.equal(d.n, s.n, `${s.etiqueta}: recuento = cabecera`)
    assert.deepEqual(d.ids, s.ids)
    const v = vueltaDetalle(q)
    assert.equal(v.texto, '← Gráficas')
    assert.equal(v.href, volver.replace('&mas=16', ''), 'vuelve a Gráficas tal como estaba (sin "Ver más")')
  }
  // Si en el detalle se cambia el periodo, la vuelta lo lleva
  const q2 = new URLSearchParams({ vista: 'seg', seg: 'liga', clave: '#x', periodo: 'hoy', volver })
  assert.match(vueltaDetalle(q2).href, /periodo=hoy/)
  // Sin volver (desde Análisis): "← Análisis"
  assert.deepEqual(vueltaDetalle(new URLSearchParams('vista=seg&seg=casa&clave=%23x&periodo=mes')), { href: '/analisis?periodo=mes&seg=casa', texto: '← Análisis' })
})

test('?volver= acepta /graficas y rechaza variantes maliciosas', () => {
  for (const bueno of ['/graficas', '/graficas?casa=sin&periodo=hoy', '/graficas/?seg=liga']) assert.equal(rutaVueltaSegura(bueno, ''), bueno, bueno)
  for (const malo of [
    '//graficas',
    '//evil.com/graficas',
    '/\\evil.com',
    '/graficasx',
    '/graficas@evil.com',
    '/graficas%2F%2Fevil.com',
    '/%2Fgraficas',
    'https://evil.com/graficas',
    'javascript:alert(1)',
    '/graficas#x',
    '/GRAFICAS',
  ]) {
    assert.equal(rutaVueltaSegura(malo, ''), '', malo)
    const v = vueltaDetalle(new URLSearchParams({ vista: 'seg', seg: 'casa', clave: '#x', volver: malo }))
    assert.equal(v.texto, '← Análisis', malo)
    assert.ok(v.href.startsWith('/analisis'), malo)
  }
})

// ---------- Lectura: más de 1000 apuestas, casa y aislamiento ----------

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
          is: (c: string, v: unknown) => (q.filtros.push(['is', c, v]), b),
          gte: (c: string, v: unknown) => (q.filtros.push(['gte', c, v]), b),
          lt: (c: string, v: unknown) => (q.filtros.push(['lt', c, v]), b),
          async range(desde: number, hasta: number) {
            let filas = (tablas[tabla] ?? []).filter((f) => f.user_id === sesion) // imita RLS
            for (const [op, c, v] of q.filtros) {
              if (op === 'eq') filas = filas.filter((f) => f[c] === v)
              if (op === 'in') filas = filas.filter((f) => (v as unknown[]).includes(f[c]))
              if (op === 'is') filas = filas.filter((f) => f[c] == null)
              if (op === 'gte') filas = filas.filter((f) => String(f[c]) >= String(v))
              if (op === 'lt') filas = filas.filter((f) => String(f[c]) < String(v))
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
  const selecciones: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    const f = new Date(Date.UTC(2025, 0, 1) + i * 5 * 3_600_000).toISOString()
    const id = `ana-${String(i).padStart(5, '0')}`
    apuestas.push({
      id, user_id: 'ana', fecha: f, created_at: f, tipo: 'simple', estado: i % 2 ? 'ganada' : 'perdida', importe: 1000, divisa: 'EUR',
      cuota_total: 1.5 + (i % 4) * 0.5, resultado_economico: i % 2 ? 900 : -1000, casa_id: i % 3 === 0 ? null : i % 3 === 1 ? 'ca' : 'cb',
      estrategia_id: null, deporte: 'Fútbol', en_directo: false, viendo_partido: false, precipitada: false, promo_tipo: null,
    })
    selecciones.push({ id: `s${i}`, apuesta_id: id, user_id: 'ana', deporte: 'Fútbol', liga: i % 5 ? 'LaLiga' : 'Serie A', mercado: '1X2', estado: 'ganada', evento: 'X', orden: 0 })
  }
  apuestas.push({ id: 'beto-1', user_id: 'beto', fecha: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', tipo: 'simple', estado: 'ganada', importe: 1, divisa: 'EUR', cuota_total: 2, resultado_economico: 777777, casa_id: null, estrategia_id: null, deporte: 'Fútbol', en_directo: false, viendo_partido: false, precipitada: false, promo_tipo: null })
  selecciones.push({ id: 'sb', apuesta_id: 'beto-1', user_id: 'beto', deporte: 'Fútbol', liga: 'Secreta', mercado: '1X2', estado: 'ganada', evento: 'Y', orden: 0 })
  return {
    apuestas,
    selecciones,
    casas_apuestas: [
      { id: 'ca', user_id: 'ana', nombre: 'Casa A' },
      { id: 'cb', user_id: 'ana', nombre: 'Casa B' },
    ],
    estrategias: [],
  }
}

test('más de 1000 apuestas: series completas, filtro de casa en la consulta y series = filas', async () => {
  const { cliente } = clienteFalso('ana', tablas(2400))
  const todas = await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null })
  assert.equal(todas.length, 2400)
  const sinCasa = await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null }, 'sin')
  assert.equal(sinCasa.length, 800)
  assert.ok(sinCasa.every((a) => a.casa_id == null))
  assert.deepEqual(
    sinCasa.map((a) => a.id),
    filtrarCasa(todas, CASA_SIN).map((a) => a.id),
    'filtrar en la consulta = filtrar en memoria',
  )
  const deA = await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null }, 'ca')
  assert.equal(deA.length, 800)
  const t0 = performance.now()
  const dom = dominioFechas(todas)!
  const { series } = seriesPorSegmento(todas, 'cuota', 'n', dom[0], 8)
  const ms = performance.now() - t0
  const filas = segmentar(todas, 'cuota', 'n')
  for (const [i, s] of series.entries()) assert.equal(s.curva.final, filas[i].beneficio)
  assert.ok(series.every((s) => s.curva.porDia && s.curva.puntos.length <= 501), 'un punto por día con muchas apuestas')
  assert.ok(ms < 2000, `cálculo rápido (${Math.round(ms)} ms)`)
  assert.equal(curvaGrafica(todas, dom[0]).final, metricas(todas).beneficio)
})

test('un usuario no ve datos de otro (todas las consultas filtran por su id)', async () => {
  const { cliente, consultas } = clienteFalso('beto', tablas(30))
  assert.deepEqual(await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null }), [])
  assert.deepEqual(await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null }, 'ca'), [])
  const propias = await leerApuestasAnalisis(cliente, 'beto', { desde: null, hasta: null })
  assert.deepEqual(
    propias.map((a) => a.id),
    ['beto-1'],
  )
  const { series } = seriesPorSegmento(propias, 'liga', 'n', 0)
  assert.deepEqual(
    series.map((s) => s.etiqueta),
    ['Fútbol · Secreta'],
  )
  for (const q of consultas) assert.ok(q.filtros.some(([op, c]) => op === 'eq' && c === 'user_id'), `la consulta a ${q.tabla} filtra por user_id`)
})
