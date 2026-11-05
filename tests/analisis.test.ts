// Pruebas de la pantalla "Análisis" (Fase 2): reglas de cálculo, segmentos, rachas, filtro de
// fechas en hora de España, lectura en tandas (> 1000) y que un usuario no ve datos de otro.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MUESTRA_MINIMA,
  aciertosPorMercado,
  atribuir,
  claveSegmento,
  dividir,
  enRango,
  metricas,
  porcentaje,
  rachas,
  rangoCuota,
  rangoPeriodo,
  resumen,
  segmentar,
  type ApuestaAnalisis,
  type SeleccionAnalisis,
} from '../src/lib/analisis/calculos.ts'
import { leerApuestasAnalisis } from '../src/lib/analisis/leer.ts'

let sec = 0
const sel = (extra: Partial<SeleccionAnalisis> = {}): SeleccionAnalisis => ({ deporte: 'Fútbol', liga: 'LaLiga', mercado: '1X2', estado: 'ganada', ...extra })
function ap(extra: Partial<ApuestaAnalisis> = {}): ApuestaAnalisis {
  sec++
  return {
    id: `a${String(sec).padStart(5, '0')}`,
    fecha: new Date(Date.UTC(2026, 9, 1) + sec * 3_600_000).toISOString(),
    created_at: new Date(Date.UTC(2026, 9, 1) + sec * 3_600_000).toISOString(),
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
    selecciones: [sel()],
    ...extra,
  }
}
const ganada = (importe = 1000, r = 1000, extra: Partial<ApuestaAnalisis> = {}) => ap({ estado: 'ganada', importe, resultado_economico: r, ...extra })
const perdida = (importe = 1000, extra: Partial<ApuestaAnalisis> = {}) => ap({ estado: 'perdida', importe, resultado_economico: -importe, selecciones: [sel({ estado: 'perdida' })], ...extra })

test('anuladas y pendientes quedan fuera de las métricas; pendientes en «En juego»', () => {
  const datos = [
    ganada(1000, 850),
    perdida(500),
    ap({ estado: 'anulada', importe: 2000, resultado_economico: 0 }),
    ap({ estado: 'pendiente', importe: 700, resultado_economico: null }),
    ap({ estado: 'pendiente', importe: 300, resultado_economico: null }),
  ]
  const r = resumen(datos)
  assert.equal(r.n, 2)
  assert.equal(r.importe, 1500)
  assert.equal(r.beneficio, 350)
  assert.equal(r.yield, 350 / 1500)
  assert.equal(r.acierto, 0.5)
  assert.deepEqual(r.enJuego, { n: 2, importe: 1000 })
  assert.equal(r.cuotaMedia, 2)
  assert.equal(r.importeMedio, 750)
})

test('resultado 0 cuenta en resueltas, importe y yield, pero no en el % de acierto', () => {
  const datos = [ganada(1000, 500), perdida(1000), ap({ estado: 'cash_out', importe: 1000, resultado_economico: 0 })]
  const m = metricas(datos)
  assert.equal(m.n, 3)
  assert.equal(m.importe, 3000)
  assert.equal(m.beneficio, -500)
  assert.equal(m.yield, -500 / 3000)
  assert.equal(m.acierto, 0.5, '1 de 2: el 0 no está ni arriba ni abajo')
})

test('división por cero → «—», nunca 0 ni NaN', () => {
  assert.equal(dividir(5, 0), null)
  assert.equal(porcentaje(null), '—')
  const solo0 = resumen([ap({ estado: 'cash_out', importe: 1000, resultado_economico: 0 })])
  assert.equal(solo0.acierto, null)
  assert.equal(porcentaje(solo0.acierto), '—')
  const vacio = resumen([])
  assert.equal(vacio.n, 0)
  assert.equal(vacio.yield, null)
  assert.equal(vacio.cuotaMedia, null)
  assert.equal(vacio.importeMedio, null)
  assert.equal(porcentaje(0.12345), '12,3 %')
})

test('medias y cash out cuentan con el importe COMPLETO', () => {
  const datos = [
    ap({ estado: 'media_ganada', importe: 2000, resultado_economico: 500 }),
    ap({ estado: 'media_perdida', importe: 2000, resultado_economico: -1000 }),
    ap({ estado: 'cash_out', importe: 1000, resultado_economico: -400 }),
  ]
  const m = metricas(datos)
  assert.equal(m.importe, 5000)
  assert.equal(m.beneficio, -900)
  assert.equal(m.acierto, 1 / 3)
})

test('apuestas con crédito: suman al beneficio, pero no al importe, yield ni acierto', () => {
  const datos = [
    ganada(1000, 1000),
    perdida(1000),
    ap({ estado: 'ganada', importe: 500, resultado_economico: 750, promo_tipo: 'credito' }),
    ap({ estado: 'perdida', importe: 500, resultado_economico: 0, promo_tipo: 'credito' }),
    ap({ estado: 'ganada', importe: 1000, resultado_economico: 1200, promo_tipo: 'aumento' }), // otras promos: normales
  ]
  const r = resumen(datos)
  assert.equal(r.n, 5)
  assert.equal(r.beneficio, 1000 - 1000 + 750 + 0 + 1200, 'el beneficio neto SÍ suma las de crédito')
  assert.equal(r.importe, 3000, 'sin las de crédito')
  assert.equal(r.yield, 1200 / 3000, 'numerador y denominador sin crédito')
  assert.equal(r.acierto, 2 / 3)
  assert.equal(r.nCredito, 2)
  assert.equal(r.beneficioCredito, 750)
  assert.equal(r.importeMedio, 1000, 'importe sin crédito / resueltas sin crédito')
  // Igual dentro de cada segmento.
  const [bet365] = segmentar(datos, 'casa')
  assert.equal(bet365.yield, 1200 / 3000)
  assert.equal(bet365.nCredito, 2)
})

test('rachas: por fecha, con resultados 0 y anuladas entre medias que ni rompen ni suman', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 10, h)).toISOString()
  const datos = [
    ganada(1000, 100, { fecha: t(1) }),
    ganada(1000, 100, { fecha: t(2) }),
    ap({ estado: 'cash_out', resultado_economico: 0, fecha: t(3) }),
    ap({ estado: 'anulada', resultado_economico: 0, fecha: t(4) }),
    ganada(1000, 100, { fecha: t(5) }),
    perdida(1000, { fecha: t(6) }),
    perdida(1000, { fecha: t(7) }),
    ap({ estado: 'pendiente', resultado_economico: null, fecha: t(8) }),
    ganada(1000, 100, { fecha: t(9) }),
    ganada(1000, 100, { fecha: t(10) }),
  ]
  // Desordenadas a propósito: el cálculo ordena por fecha.
  const r = rachas([...datos].reverse())
  assert.deepEqual(r.actual, { signo: 'ganadas', n: 2 })
  assert.equal(r.mejor, 3, 'G G (0) (anulada) G = 3 seguidas')
  assert.equal(r.peor, 2)
  // Misma fecha: desempata la fecha de creación y luego el id.
  const misma = t(12)
  const r2 = rachas([
    perdida(1000, { fecha: misma, created_at: t(14), id: 'b' }),
    ganada(1000, 100, { fecha: misma, created_at: t(13), id: 'z' }),
  ])
  assert.deepEqual(r2.actual, { signo: 'perdidas', n: 1 })
  assert.equal(rachas([]).actual, null)
})

test('atribución por selecciones: todas iguales → ese valor; mezcla → «Varios»; sin datos → «Sin dato»', () => {
  assert.deepEqual(atribuir(['1X2', '1x2 ', '1X2']), { clave: '1x2', texto: '1X2' })
  assert.equal(atribuir(['1X2', 'Goles']).texto, 'Varios')
  assert.equal(atribuir([null, '']).texto, 'Sin dato')
  assert.equal(atribuir([]).texto, 'Sin dato')
  assert.equal(atribuir(['1X2', null]).texto, 'Varios', 'dato + sin dato = Varios')
  // Liga = deporte + liga.
  const combi = ap({ selecciones: [sel(), sel({ liga: 'Premier League' })] })
  assert.equal(claveSegmento(combi, 'liga').texto, 'Varios')
  const misma = ap({ selecciones: [sel(), sel({ liga: 'laliga' })] })
  assert.equal(claveSegmento(misma, 'liga').texto, 'Fútbol · LaLiga')
  const volei = ap({ deporte: 'Voleibol', selecciones: [sel({ deporte: 'Voleibol', liga: 'Superliga' })] })
  const futbol = ap({ selecciones: [sel({ liga: 'Superliga' })] })
  assert.notEqual(claveSegmento(volei, 'liga').clave, claveSegmento(futbol, 'liga').clave, 'la Superliga de voleibol no es la de fútbol')
  assert.equal(claveSegmento(ap({ selecciones: [sel({ liga: null })] }), 'liga').texto, 'Sin dato')
  // Segmentos fijos.
  assert.equal(claveSegmento(ap({ en_directo: true, viendo_partido: true }), 'directo').texto, 'Directo viendo')
  assert.equal(claveSegmento(ap({ en_directo: true }), 'directo').texto, 'Directo sin ver')
  assert.equal(claveSegmento(ap(), 'directo').texto, 'Pre-partido')
  assert.equal(claveSegmento(ap({ precipitada: true }), 'precipitada').texto, 'Sí')
  assert.equal(claveSegmento(ap({ casa: null }), 'casa').texto, 'Sin casa')
  assert.equal(claveSegmento(ap({ estrategia: null }), 'estrategia').texto, 'Sin estrategia')
  assert.equal(claveSegmento(ap({ deporte: 'Mixto' }), 'deporte').texto, 'Mixto')
  assert.equal(claveSegmento(ap({ tipo: 'mismo_partido' }), 'tipo').texto, 'Mismo partido')
})

test('mercados: se agrupan sin mayúsculas, tildes ni espacios y se muestra la forma más usada', () => {
  const datos = [
    ganada(1000, 100, { selecciones: [sel({ mercado: 'Más de 2,5' })] }),
    ganada(1000, 100, { selecciones: [sel({ mercado: 'mas de  2,5' })] }),
    ganada(1000, 100, { selecciones: [sel({ mercado: 'Más de 2,5' })] }),
  ]
  const filas = segmentar(datos, 'mercado')
  assert.equal(filas.length, 1)
  assert.equal(filas[0].etiqueta, 'Más de 2,5')
  assert.equal(filas[0].n, 3)
})

test('rangos de cuota con límites <= (1,50 · 1,51 · 2,00 · 2,01 · 3,00 · 3,01)', () => {
  assert.equal(rangoCuota(1.0), 'Hasta 1,50')
  assert.equal(rangoCuota(1.01), 'Hasta 1,50')
  assert.equal(rangoCuota(1.5), 'Hasta 1,50')
  assert.equal(rangoCuota(1.51), '1,51 – 2,00')
  assert.equal(rangoCuota(2.0), '1,51 – 2,00')
  assert.equal(rangoCuota(2.01), '2,01 – 3,00')
  assert.equal(rangoCuota(3.0), '2,01 – 3,00')
  assert.equal(rangoCuota(3.01), 'Más de 3,00')
  assert.equal(rangoCuota(null), 'Sin dato')
})

test(`segmentos: «Muestra pequeña» con n < ${MUESTRA_MINIMA}, orden por beneficio o por nº`, () => {
  const datos = [
    ...Array.from({ length: MUESTRA_MINIMA }, () => perdida(1000, { casa: 'Codere' })),
    ...Array.from({ length: MUESTRA_MINIMA - 1 }, () => ganada(1000, 500, { casa: 'Bet365' })),
  ]
  const porBeneficio = segmentar(datos, 'casa')
  assert.deepEqual(porBeneficio.map((f) => f.etiqueta), ['Bet365', 'Codere'])
  assert.equal(porBeneficio[0].muestraPequena, true, `${MUESTRA_MINIMA - 1} < ${MUESTRA_MINIMA}`)
  assert.equal(porBeneficio[1].muestraPequena, false, `${MUESTRA_MINIMA} no es pequeña`)
  assert.deepEqual(segmentar(datos, 'casa', 'n').map((f) => f.etiqueta), ['Codere', 'Bet365'])
  assert.equal(porBeneficio[1].yield, -1)
  assert.equal(porBeneficio[1].acierto, 0)
  // Anuladas y pendientes no aparecen en ningún segmento.
  const conOtras = [...datos, ap({ estado: 'anulada', casa: 'Bwin', resultado_economico: 0 }), ap({ estado: 'pendiente', casa: 'Bwin', resultado_economico: null })]
  assert.ok(!segmentar(conOtras, 'casa').some((f) => f.etiqueta === 'Bwin'))
})

test('aciertos por mercado: solo selecciones ganadas o perdidas de apuestas resueltas, filtro por tipo', () => {
  const datos = [
    ap({ tipo: 'mismo_partido', estado: 'perdida', resultado_economico: -1000, selecciones: [sel({ mercado: 'Goles', estado: 'ganada' }), sel({ mercado: 'Córners', estado: 'perdida' }), sel({ mercado: 'Goles', estado: 'anulada' })] }),
    ap({ tipo: 'simple', estado: 'ganada', selecciones: [sel({ mercado: 'Goles', estado: 'ganada' })] }),
    ap({ tipo: 'simple', estado: 'anulada', resultado_economico: 0, selecciones: [sel({ mercado: 'Goles', estado: 'perdida' })] }),
    ap({ tipo: 'simple', estado: 'pendiente', resultado_economico: null, selecciones: [sel({ mercado: 'Goles', estado: 'perdida' })] }),
    ap({ tipo: 'simple', estado: 'media_ganada', resultado_economico: 300, selecciones: [sel({ mercado: 'Hándicap', estado: 'media_ganada' })] }),
  ]
  const todas = aciertosPorMercado(datos)
  const goles = todas.find((f) => f.etiqueta === 'Goles')!
  assert.deepEqual([goles.verdes, goles.rojas, goles.n, goles.pctVerdes, goles.muestraPequena], [2, 0, 2, 1, true])
  assert.ok(!todas.some((f) => f.etiqueta === 'Hándicap'), 'media_ganada propia no cuenta')
  const mp = aciertosPorMercado(datos, 'mismo_partido')
  assert.deepEqual(mp.map((f) => [f.etiqueta, f.verdes, f.rojas]), [['Córners', 0, 1], ['Goles', 1, 0]])
})

test('filtro de fechas en hora de España (cambio de horario incluido)', () => {
  // 5 nov 2026 a las 00:30 en España = 4 nov 23:30 UTC.
  const ahora = new Date('2026-11-04T23:30:00Z')
  const mes = rangoPeriodo('mes', '', '', ahora)
  assert.equal(mes.desde, '2026-10-31T23:00:00.000Z', '1 nov 00:00 en España (UTC+1)')
  assert.equal(mes.hasta, '2026-11-30T23:00:00.000Z', '1 dic 00:00 en España')
  const d30 = rangoPeriodo('30d', '', '', ahora)
  assert.equal(d30.desdeDia, '2026-10-07', '30 días contando hoy (5 nov)')
  assert.equal(d30.desde, '2026-10-06T22:00:00.000Z', '7 oct 00:00 en España (aún UTC+2)')
  assert.equal(d30.hasta, '2026-11-05T23:00:00.000Z')
  const ano = rangoPeriodo('ano', '', '', ahora)
  assert.equal(ano.desde, '2025-12-31T23:00:00.000Z')
  assert.equal(ano.hasta, '2026-12-31T23:00:00.000Z')
  const p = rangoPeriodo('personalizado', '2026-11-10', '2026-11-01', ahora)
  assert.equal(p.desdeDia, '2026-11-01', 'al revés se da la vuelta')
  assert.equal(p.hasta, '2026-11-10T23:00:00.000Z', 'el día «hasta» está incluido')
  assert.deepEqual(rangoPeriodo('personalizado', 'basura', '', ahora).desde, null)
  assert.equal(rangoPeriodo('todo').desde, null)
  // Una apuesta del 31 oct a las 23:30 en España (22:30 UTC) es de octubre, no de noviembre.
  assert.equal(enRango('2026-10-31T22:30:00Z', mes), false)
  assert.equal(enRango('2026-10-31T23:00:00Z', mes), true)
  assert.equal(enRango('2026-11-30T22:59:59Z', mes), true)
  assert.equal(enRango('2026-11-30T23:00:00Z', mes), false)
})

// ---------- Lectura con un cliente de Supabase falso ----------
// Imita RLS (cada usuario solo ve lo suyo), el límite de 1000 filas por consulta y los filtros
// eq/in/gte/lt. Apunta si cada consulta filtra por user_id.
function clienteFalso(sesion: string, tablas: Record<string, Record<string, unknown>[]>) {
  const consultas: { tabla: string; filtros: [string, string, unknown][] }[] = []
  return {
    consultas,
    cliente: {
      from(tabla: string) {
        const q = { tabla, filtros: [] as [string, string, unknown][] }
        consultas.push(q)
        const b = {
          select: () => b,
          order: () => b,
          eq: (c: string, v: unknown) => (q.filtros.push(['eq', c, v]), b),
          in: (c: string, v: unknown[]) => (q.filtros.push(['in', c, v]), b),
          gte: (c: string, v: unknown) => (q.filtros.push(['gte', c, v]), b),
          lt: (c: string, v: unknown) => (q.filtros.push(['lt', c, v]), b),
          async range(desde: number, hasta: number) {
            let filas = (tablas[tabla] ?? []).filter((f) => f.user_id === sesion)
            for (const [op, c, v] of q.filtros) {
              if (op === 'eq') filas = filas.filter((f) => f[c] === v)
              if (op === 'in') filas = filas.filter((f) => (v as unknown[]).includes(f[c]))
              if (op === 'gte') filas = filas.filter((f) => String(f[c]) >= String(v))
              if (op === 'lt') filas = filas.filter((f) => String(f[c]) < String(v))
            }
            return { data: filas.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null }
          },
        }
        return b
      },
    } as never,
  }
}

function base(n: number) {
  const apuestas: Record<string, unknown>[] = []
  const selecciones: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    const id = `ana-${String(i).padStart(5, '0')}`
    const fecha = new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString()
    const estado = i % 10 === 0 ? 'anulada' : i % 10 === 1 ? 'pendiente' : i % 2 ? 'ganada' : 'perdida'
    apuestas.push({
      id, user_id: 'ana', fecha, created_at: fecha, tipo: 'combinada', estado, importe: 1000, divisa: 'EUR', cuota_total: 2,
      resultado_economico: estado === 'ganada' ? 1000 : estado === 'perdida' ? -1000 : estado === 'anulada' ? 0 : null,
      casa_id: 'c1', estrategia_id: null, deporte: 'Fútbol', en_directo: false, viendo_partido: false, precipitada: false, promo_tipo: null,
    })
    for (const k of [0, 1]) selecciones.push({ id: `${id}-${k}`, apuesta_id: id, user_id: 'ana', deporte: 'Fútbol', liga: 'LaLiga', mercado: '1X2', estado: 'ganada' })
  }
  apuestas.push({ ...apuestas[2], id: 'beto-1', user_id: 'beto', casa_id: 'c2', importe: 99999 })
  selecciones.push({ id: 'beto-1-0', apuesta_id: 'beto-1', user_id: 'beto', deporte: 'Tenis', liga: 'ATP', mercado: 'Ganador', estado: 'ganada' })
  return {
    apuestas,
    selecciones,
    casas_apuestas: [{ id: 'c1', user_id: 'ana', nombre: 'Casa de Ana' }, { id: 'c2', user_id: 'beto', nombre: 'Casa de Beto' }],
    estrategias: [],
  }
}

test('lectura: más de 1000 apuestas, con sus selecciones, sin anuladas', async () => {
  const { cliente } = clienteFalso('ana', base(2500))
  const datos = await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null })
  assert.equal(datos.length, 2250, '2500 − 250 anuladas')
  assert.ok(datos.every((a) => a.selecciones.length === 2), 'cada una con sus 2 selecciones')
  assert.ok(datos.every((a) => a.casa === 'Casa de Ana'))
  const r = resumen(datos)
  assert.equal(r.n, 2000)
  assert.equal(r.enJuego.n, 250)
  assert.equal(r.importe, 2_000_000)
  assert.equal(r.beneficio, 0)
  assert.equal(r.acierto, 0.5)
})

test('lectura: el filtro de fechas se aplica en la consulta', async () => {
  const { cliente } = clienteFalso('ana', base(100))
  const datos = await leerApuestasAnalisis(cliente, 'ana', { desde: '2026-01-01T10:00:00.000Z', hasta: '2026-01-01T20:00:00.000Z' })
  assert.equal(datos.length, 9, 'de las 10:00 a las 19:00, sin la anulada de las 10:00')
  assert.ok(datos.every((a) => enRango(a.fecha, { desde: '2026-01-01T10:00:00.000Z', hasta: '2026-01-01T20:00:00.000Z' })))
})

test('lectura: un usuario NO ve datos de otro y todas las consultas filtran por su id', async () => {
  const { cliente, consultas } = clienteFalso('beto', base(30))
  assert.deepEqual(await leerApuestasAnalisis(cliente, 'ana', { desde: null, hasta: null }), [], 'con el id de Ana no obtiene nada')
  const propias = await leerApuestasAnalisis(cliente, 'beto', { desde: null, hasta: null })
  assert.equal(propias.length, 1)
  assert.equal(propias[0].casa, 'Casa de Beto')
  assert.deepEqual(propias[0].selecciones.map((s) => s.mercado), ['Ganador'])
  for (const q of consultas) assert.ok(q.filtros.some(([op, c]) => op === 'eq' && c === 'user_id'), `la consulta a ${q.tabla} filtra por user_id`)
})

// ---------- Retoques: aciertos por liga, detalle de cada cifra y direcciones ----------

import { aciertos, aciertosPorLiga, detalle, SEGMENTOS, type Segmento } from '../src/lib/analisis/calculos.ts'
import { enlaceAnalisis, enlaceDetalleAcierto, enlaceDetalleSegmento, leerPeticionDetalle } from '../src/lib/analisis/direccion.ts'
import { rutaVueltaSegura } from '../src/lib/navegador/volver-a-lista.ts'

test('aciertos por liga: deporte + liga, sin mayúsculas, tildes ni espacios; «Sin dato»; filtro por tipo', () => {
  const datos = [
    ap({ tipo: 'combinada', estado: 'perdida', resultado_economico: -1000, selecciones: [
      sel({ liga: 'LaLiga', estado: 'ganada' }),
      sel({ liga: ' laliga ', estado: 'perdida' }),
      sel({ deporte: 'Fútbol', liga: 'Premier League', estado: 'ganada' }),
    ] }),
    ap({ tipo: 'simple', selecciones: [sel({ deporte: 'futbol', liga: 'LALIGA', estado: 'ganada' })] }),
    ap({ tipo: 'simple', deporte: 'Voleibol', selecciones: [sel({ deporte: 'Voleibol', liga: 'Superliga', estado: 'ganada' })] }),
    ap({ tipo: 'simple', selecciones: [sel({ liga: 'Superliga', estado: 'perdida' })] }),
    ap({ tipo: 'simple', selecciones: [sel({ liga: null, estado: 'perdida' })] }),
    ap({ tipo: 'simple', estado: 'anulada', resultado_economico: 0, selecciones: [sel({ liga: 'LaLiga', estado: 'perdida' })] }),
  ]
  const filas = aciertosPorLiga(datos)
  const laliga = filas.find((f) => f.clave === 'futbol · laliga')!
  assert.deepEqual([laliga.verdes, laliga.rojas, laliga.n, laliga.ids.length], [2, 1, 3, 2], 'tildes y mayúsculas juntas; la anulada no cuenta')
  assert.equal(laliga.pctVerdes, 2 / 3)
  assert.equal(laliga.muestraPequena, true)
  assert.equal(filas.filter((f) => f.etiqueta.endsWith('Superliga')).length, 2, 'la Superliga de voleibol no es la de fútbol')
  assert.ok(filas.some((f) => f.etiqueta === 'Sin dato' && f.rojas === 1))
  const soloCombinadas = aciertosPorLiga(datos, 'combinada')
  assert.deepEqual(soloCombinadas.map((f) => [f.clave, f.n]), [['futbol · laliga', 2], ['futbol · premier league', 1]])
})

// Datos variados para comprobar que la lista del detalle cuadra SIEMPRE con la cifra.
function variado() {
  const out: ApuestaAnalisis[] = []
  const casas = ['Bet365', 'bet365 ', 'Codere', null]
  const mercados = ['1X2', 'Goles', 'Jugador - Remates a puerta', null]
  const estados = ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida', 'anulada', 'pendiente']
  for (let i = 0; i < 140; i++) {
    const estado = estados[i % estados.length]
    const nSel = 1 + (i % 3)
    const selecciones = Array.from({ length: nSel }, (_, k) =>
      sel({
        mercado: mercados[(i + (i % 5 === 0 ? k : 0)) % mercados.length],
        liga: i % 7 === 0 ? null : k % 2 && i % 4 === 0 ? 'Premier League' : 'LaLiga',
        estado: ['ganada', 'perdida', 'anulada', 'media_ganada'][(i + k) % 4],
      }),
    )
    out.push(
      ap({
        estado,
        tipo: ['simple', 'combinada', 'mismo_partido', 'sistema'][i % 4],
        casa: casas[i % casas.length],
        estrategia: i % 3 ? 'Valor' : null,
        deporte: i % 6 ? 'Fútbol' : 'Mixto',
        cuota_total: [1.2, 1.5, 1.51, 2, 2.01, 3, 3.01, null][i % 8],
        en_directo: i % 5 === 0,
        viendo_partido: i % 10 === 0,
        precipitada: i % 4 === 0,
        promo_tipo: i % 13 === 0 ? 'credito' : null,
        importe: 500 + i,
        resultado_economico: estado === 'pendiente' ? null : estado === 'anulada' ? 0 : [700, -500, 0, 200, -250][i % 5],
        selecciones,
      }),
    )
  }
  return out
}

test('detalle: el recuento de la lista es IGUAL a la cifra en todos los segmentos (incluidos «Varios» y «Sin dato»)', () => {
  const datos = variado()
  const resueltas = new Set(datos.filter((a) => ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida'].includes(a.estado)).map((a) => a.id))
  const vistas = new Set<string>()
  for (const seg of Object.keys(SEGMENTOS) as Segmento[]) {
    const filas = segmentar(datos, seg)
    assert.equal(filas.reduce((s, f) => s + f.n, 0), resueltas.size, `${seg}: cada resuelta en una sola fila`)
    for (const f of filas) {
      const d = detalle(datos, { vista: 'seg', seg, clave: f.clave })!
      assert.equal(d.ids.length, f.n, `${seg} · ${f.etiqueta}`)
      assert.equal(new Set(d.ids).size, d.ids.length, 'sin repetidas')
      assert.ok(d.ids.every((id) => resueltas.has(id)), 'solo resueltas (ni anuladas ni pendientes)')
      assert.equal(d.titulo, `${SEGMENTOS[seg]}: ${f.etiqueta}`)
      vistas.add(f.etiqueta)
    }
  }
  for (const e of ['Varios', 'Sin dato', 'Sin casa', 'Sin estrategia', 'Mixto']) assert.ok(vistas.has(e), `hay fila «${e}»`)
  assert.equal(detalle(datos, { vista: 'seg', seg: 'casa', clave: 'no-existe' }), null)
})

test('detalle de aciertos: N selecciones en M apuestas, con Todas / Verdes / Rojas', () => {
  const datos = variado()
  for (const por of ['mercado', 'liga'] as const) {
    for (const f of aciertos(datos, por)) {
      const todas = detalle(datos, { vista: 'aciertos', por, clave: f.clave, color: 'todas' })!
      const verdes = detalle(datos, { vista: 'aciertos', por, clave: f.clave, color: 'verdes' })!
      const rojas = detalle(datos, { vista: 'aciertos', por, clave: f.clave, color: 'rojas' })!
      assert.deepEqual([todas.selecciones, verdes.selecciones, rojas.selecciones], [f.n, f.verdes, f.rojas], `${por} · ${f.etiqueta}`)
      // M apuestas, calculado aparte: las resueltas con alguna selección de esa fila.
      const conColor = (estado: string) =>
        datos.filter((a) => ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida'].includes(a.estado) &&
          a.selecciones.some((s) => s.estado === estado && aciertos([{ ...a, selecciones: [s] }], por)[0]?.clave === f.clave)).length
      assert.equal(verdes.ids.length, conColor('ganada'))
      assert.equal(rojas.ids.length, conColor('perdida'))
      assert.equal(todas.ids.length, new Set([...verdes.ids, ...rojas.ids]).size)
    }
  }
})

test('detalle: respeta el filtro de fechas y el de tipo', () => {
  const datos = variado()
  const r = { desde: datos[40].fecha, hasta: datos[90].fecha }
  const periodo = datos.filter((a) => enRango(a.fecha, r)) // lo que devuelve la consulta con el filtro
  const filaTodo = segmentar(datos, 'tipo').find((f) => f.etiqueta === 'Combinada')!
  const filaPeriodo = segmentar(periodo, 'tipo').find((f) => f.etiqueta === 'Combinada')!
  const d = detalle(periodo, { vista: 'seg', seg: 'tipo', clave: filaPeriodo.clave })!
  assert.equal(d.ids.length, filaPeriodo.n)
  assert.ok(filaPeriodo.n < filaTodo.n, 'el periodo reduce la lista')
  assert.ok(d.ids.every((id) => enRango(periodo.find((a) => a.id === id)!.fecha, r)))
  const f = aciertos(datos, 'mercado', 'mismo_partido')[0]
  const conTipo = detalle(datos, { vista: 'aciertos', por: 'mercado', clave: f.clave, tipo: 'mismo_partido', color: 'todas' })!
  assert.equal(conTipo.selecciones, f.n)
  assert.ok(conTipo.ids.every((id) => datos.find((a) => a.id === id)!.tipo === 'mismo_partido'))
  const sinTipo = detalle(datos, { vista: 'aciertos', por: 'mercado', clave: f.clave, color: 'todas' })!
  assert.ok(sinTipo.ids.length >= conTipo.ids.length)
  // En conjunto, el filtro de tipo deja fuera apuestas de otros tipos.
  const total = (tipo?: string) => aciertos(datos, 'mercado', tipo).reduce((s, x) => s + x.ids.length, 0)
  assert.ok(total('mismo_partido') < total(), 'el filtro de tipo reduce el detalle')
})

test('detalle: un usuario no ve apuestas de otro', async () => {
  const { cliente } = clienteFalso('beto', base(50))
  const deBeto = await leerApuestasAnalisis(cliente, 'beto', { desde: null, hasta: null })
  for (const seg of Object.keys(SEGMENTOS) as Segmento[]) {
    for (const f of segmentar(deBeto, seg)) {
      const d = detalle(deBeto, { vista: 'seg', seg, clave: f.clave })!
      assert.ok(d.ids.every((id) => id.startsWith('beto-')), 'solo apuestas de Beto')
    }
  }
  // Aunque pida la clave de una fila de Ana, con sus datos no hay nada.
  assert.equal(detalle(deBeto, { vista: 'seg', seg: 'casa', clave: 'casa de ana' }), null)
})

test('direcciones: valores bien codificados y decodificados (Varios, Sin dato, tildes, espacios y símbolos)', () => {
  const sp = { periodo: 'personalizado', desde: '2026-10-01', hasta: '2026-11-05', seg: 'mercado', orden: 'n', tipo: 'mismo_partido', ac: 'liga', otro: 'x' }
  for (const clave of ['#Varios', '#Sin dato', 'jugador - remates a puerta', 'fútbol · laliga', 'más de 2,5 & 1x2/ambos? #1 %20 +'] ) {
    const url = new URL(enlaceDetalleSegmento(sp, 'mercado', clave), 'http://x')
    assert.equal(url.pathname, '/analisis/detalle')
    assert.deepEqual(leerPeticionDetalle(url.searchParams), { vista: 'seg', seg: 'mercado', clave }, clave)
    assert.equal(url.searchParams.get('periodo'), 'personalizado', 'conserva el periodo')
    assert.equal(url.searchParams.get('otro'), null, 'solo parámetros conocidos')
    const urlA = new URL(enlaceDetalleAcierto(sp, 'liga', clave, 'rojas'), 'http://x')
    assert.deepEqual(leerPeticionDetalle(urlA.searchParams), { vista: 'aciertos', por: 'liga', clave, tipo: 'mismo_partido', color: 'rojas' })
    // Y la dirección del detalle vale como ?volver= de una apuesta.
    assert.equal(rutaVueltaSegura(url.pathname + url.search), url.pathname + url.search)
  }
  // De la fila real al detalle y vuelta: misma fila.
  const datos = [ganada(1000, 500, { selecciones: [sel({ mercado: 'Jugador - Remates a puerta' })] }), ganada(1000, 500, { selecciones: [sel({ mercado: '1X2' }), sel({ mercado: 'Goles' })] })]
  for (const f of segmentar(datos, 'mercado')) {
    const p = leerPeticionDetalle(new URL(enlaceDetalleSegmento({}, 'mercado', f.clave), 'http://x').searchParams)!
    assert.equal(detalle(datos, p)!.etiqueta, f.etiqueta)
  }
  assert.equal(enlaceAnalisis(sp), '/analisis?periodo=personalizado&desde=2026-10-01&hasta=2026-11-05&seg=mercado&orden=n&ac=liga&tipo=mismo_partido')
  assert.equal(enlaceAnalisis({}), '/analisis')
  assert.equal(leerPeticionDetalle({ seg: 'mercado' }), null, 'sin clave')
  assert.equal(leerPeticionDetalle({ seg: 'inventado', clave: 'x' }), null)
  assert.equal(leerPeticionDetalle({ vista: 'aciertos', ac: 'inventado', clave: 'x' }), null)
})

test('volver: solo rutas internas de /apuestas y /analisis', () => {
  const buenas = [
    '/apuestas',
    '/apuestas?estado=ganada&casa=sin',
    '/analisis',
    '/analisis?periodo=mes&seg=mercado',
    '/analisis/detalle?vista=seg&seg=mercado&clave=jugador+-+remates+a+puerta',
    '/analisis/detalle?clave=over%2Funder', // "/" codificada dentro de un VALOR: es un parámetro
    '/analisis/',
  ]
  for (const r of buenas) assert.equal(rutaVueltaSegura(r), r, r)
  const malas = [
    '//evil.com', '//evil.com/analisis', '/\\evil.com', '/\\/evil.com', '\\\\evil.com',
    '/analisisx', '/analisis@evil.com', '/analisis@evil.com/x', '/apuestasx', '/apuestas/x',
    '/%2Fevil.com', '/%2fevil.com', '/%5Cevil.com', '/%5cevil.com', '/analisis%2F%2Fevil.com', '/analisis%5Cevil.com',
    '/analisis%40evil.com', '/%2F%2Fevil.com', '/analisis/%2F%2Fevil.com', '/analisis/..%2F..%2Fevil',
    'https://evil.com', 'http://evil.com/analisis', 'javascript:alert(1)', 'evil.com', '', ' /analisis',
    '/analisis?x=1#frag', '/analisis?x=\\evil', '/ANALISIS', '/analisis/Detalle', '/analisis/../evil',
  ]
  for (const r of malas) assert.equal(rutaVueltaSegura(r), '/apuestas', `rechaza ${r}`)
  assert.equal(rutaVueltaSegura(null), '/apuestas')
  assert.equal(rutaVueltaSegura('//evil.com', '/analisis'), '/analisis')
})
