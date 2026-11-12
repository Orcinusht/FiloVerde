// Pruebas del selector de periodo de Análisis (diseño "tipo + navegador") y del balance diario de la
// semana: las direcciones de antes dan EXACTAMENTE el mismo rango; Día, Semana, Mes y Año con sus
// flechas, títulos y "Volver a…"; el paso a Gráficas; la semana en curso con hoy lunes, martes y
// domingo, la anterior y las más antiguas (límite de la primera apuesta); una apuesta a las 23:30
// de España en su día; la semana del cambio de hora; día sin apuestas; total = suma de filas =
// apuestas del detalle = beneficio de Análisis para ese rango.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enRango, rangoPeriodo, resumen, type ApuestaAnalisis, type Periodo } from '../src/lib/analisis/calculos.ts'
import {
  cambiosPara,
  hoyEnEspana,
  navegacionPeriodo,
  periodoParaGraficas,
  rangoAnalisis,
  tituloPeriodo,
} from '../src/lib/analisis/periodo.ts'
import { balanceSemana, filaDia, leerBsem, rangoDia, semana, semanasHastaPrimera } from '../src/lib/analisis/semana.ts'
import { enlaceBalance, enlaceDetalleDia, vueltaDetalle } from '../src/lib/analisis/direccion.ts'

// Jueves 12 nov 2026, 10:00 en España (la semana va del lunes 9 al domingo 15).
const JUEVES = new Date('2026-11-12T09:00:00Z')
const HOY = '2026-11-12'

const solo = (r: { desde: string | null; hasta: string | null; desdeDia: string; hastaDia: string }) => [r.desde, r.hasta, r.desdeDia, r.hastaDia]

// ---------- Selector: periodos de antes ----------

test('las direcciones de antes dan exactamente el mismo rango (varios días, también con cambio de hora)', () => {
  const momentos = [
    JUEVES,
    new Date('2026-11-09T00:30:00Z'), // lunes
    new Date('2026-03-29T10:00:00Z'), // domingo del cambio de hora de marzo
    new Date('2026-10-25T23:30:00Z'), // lunes 26 a las 00:30, tras el cambio de octubre
    new Date('2026-01-01T00:10:00Z'), // 1 de enero
    new Date('2026-12-31T22:59:00Z'), // 31 de diciembre a las 23:59
  ]
  const periodos: Periodo[] = ['hoy', 'ayer', '7d', 'mes', '30d', 'ano', 'todo']
  for (const ahora of momentos) {
    for (const p of periodos) assert.deepEqual(solo(rangoAnalisis(p, {}, ahora)), solo(rangoPeriodo(p, '', '', ahora)), `${p} ${ahora.toISOString()}`)
    for (const [d, h] of [
      ['2026-10-01', '2026-10-15'],
      ['2026-10-15', '2026-10-01'],
      ['2026-10-01', ''],
      ['', '2026-10-15'],
      ['', ''],
    ])
      assert.deepEqual(solo(rangoAnalisis('personalizado', { desde: d, hasta: h }, ahora)), solo(rangoPeriodo('personalizado', d, h, ahora)))
  }
  // Un periodo desconocido es "Todo", como antes.
  assert.deepEqual(solo(rangoAnalisis('xyz', {}, JUEVES)), [null, null, '', ''])
})

test('Día, Mes y Año del periodo actual = Hoy, Este mes y Este año', () => {
  assert.deepEqual(solo(rangoAnalisis('dia', { ref: HOY }, JUEVES)).slice(0, 2), solo(rangoPeriodo('hoy', '', '', JUEVES)).slice(0, 2))
  assert.deepEqual(solo(rangoAnalisis('mes', { ref: '2026-11-03' }, JUEVES)), solo(rangoPeriodo('mes', '', '', JUEVES)))
  assert.deepEqual(solo(rangoAnalisis('ano', { ref: '2026-02-03' }, JUEVES)), solo(rangoPeriodo('ano', '', '', JUEVES)))
})

test('Semana, un mes y un año pasados: lunes a domingo y meses enteros en hora de España', () => {
  const s = rangoAnalisis('semana', { ref: '2026-11-11' }, JUEVES) // un día cualquiera de la semana
  assert.deepEqual(solo(s), ['2026-11-08T23:00:00.000Z', '2026-11-15T23:00:00.000Z', '2026-11-09', '2026-11-15'])
  assert.equal(s.ref, '2026-11-09')
  // Semana del cambio de hora: lunes 19 (CEST) a lunes 26 (CET) = 169 horas
  const c = rangoAnalisis('semana', { ref: '2026-10-25' }, JUEVES)
  assert.deepEqual(solo(c), ['2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z', '2026-10-19', '2026-10-25'])
  const oct = rangoAnalisis('mes', { ref: '2026-10-20' }, JUEVES)
  assert.deepEqual(solo(oct), ['2026-09-30T22:00:00.000Z', '2026-10-31T23:00:00.000Z', '2026-10-01', '2026-10-31'])
  const a25 = rangoAnalisis('ano', { ref: '2025-06-01' }, JUEVES)
  assert.deepEqual(solo(a25), ['2024-12-31T23:00:00.000Z', '2025-12-31T23:00:00.000Z', '2025-01-01', '2025-12-31'])
  // Un periodo futuro no se navega: vuelve al actual
  assert.equal(rangoAnalisis('semana', { ref: '2026-12-01' }, JUEVES).ref, '2026-11-09')
  assert.equal(rangoAnalisis('dia', { ref: '2026-11-20' }, JUEVES).desdeDia, HOY)
  assert.deepEqual(solo(rangoAnalisis('mes', { ref: '2027-01-01' }, JUEVES)), solo(rangoPeriodo('mes', '', '', JUEVES)))
  // ref mal escrito: el periodo actual
  assert.equal(rangoAnalisis('semana', { ref: '2026-13-45' }, JUEVES).ref, '2026-11-09')
})

test('títulos del periodo', () => {
  const t = (p: string, o = {}) => tituloPeriodo(rangoAnalisis(p, o, JUEVES), HOY)
  assert.equal(t('hoy'), 'Hoy · jue 12 nov')
  assert.equal(t('ayer'), 'Ayer · mié 11 nov')
  assert.equal(t('dia', { ref: '2026-11-09' }), 'Lun 9 nov')
  assert.equal(t('semana'), 'Semana del 9 al 15 nov')
  assert.equal(t('semana', { ref: '2026-10-28' }), 'Semana del 26 oct al 1 nov')
  assert.equal(t('semana', { ref: '2025-12-31' }), 'Semana del 29 dic 2025 al 4 ene 2026')
  assert.equal(t('semana', { ref: '2025-11-12' }), 'Semana del 10 al 16 nov 2025')
  assert.equal(t('mes'), 'Noviembre 2026')
  assert.equal(t('mes', { ref: '2026-10-01' }), 'Octubre 2026')
  assert.equal(t('ano'), '2026')
  assert.equal(t('todo'), 'Todo el historial')
  assert.equal(t('7d'), 'Últimos 7 días (6 nov – 12 nov)')
  assert.equal(t('30d'), 'Últimos 30 días (14 oct – 12 nov)')
  assert.equal(t('personalizado', { desde: '2026-11-10', hasta: '2026-11-13' }), 'Del 10 al 13 nov')
  assert.equal(t('personalizado', { desde: '2026-11-10', hasta: '2026-11-10' }), 'El martes 10 nov')
})

test('flechas: › apagada si el siguiente empieza después de hoy; «Volver a…» solo si te has alejado', () => {
  const nav = (p: string, o = {}) => navegacionPeriodo(rangoAnalisis(p, o, JUEVES), HOY)
  // Semana en curso
  const s0 = nav('semana')
  assert.equal(s0.tipo, 'semana')
  assert.equal(s0.siguiente, null)
  assert.equal(s0.volver, null)
  assert.deepEqual(s0.anterior, { periodo: 'semana', ref: '2026-11-02', desde: '', hasta: '' })
  // Semana anterior: › lleva a la actual y aparece «Volver a esta semana»
  const s1 = nav('semana', { ref: '2026-11-02' })
  assert.deepEqual(s1.siguiente, { periodo: 'semana', ref: '2026-11-09', desde: '', hasta: '' })
  assert.equal(s1.volver?.texto, 'Volver a esta semana')
  // Día: hoy ⇄ ayer con las direcciones de antes
  const d0 = nav('hoy')
  assert.equal(d0.tipo, 'dia')
  assert.equal(d0.siguiente, null)
  assert.deepEqual(d0.anterior, { periodo: 'ayer', ref: '', desde: '', hasta: '' })
  const d1 = nav('ayer')
  assert.deepEqual(d1.siguiente, { periodo: 'hoy', ref: '', desde: '', hasta: '' })
  assert.equal(d1.volver?.texto, 'Volver a hoy')
  assert.deepEqual(d1.anterior, { periodo: 'dia', ref: '2026-11-10', desde: '', hasta: '' })
  // Mes y año
  const m0 = nav('mes')
  assert.equal(m0.siguiente, null)
  assert.deepEqual(m0.anterior, { periodo: 'mes', ref: '2026-10-01', desde: '', hasta: '' })
  assert.deepEqual(nav('mes', { ref: '2026-10-01' }).siguiente, { periodo: 'mes', ref: '', desde: '', hasta: '' })
  assert.equal(nav('mes', { ref: '2026-10-01' }).volver?.texto, 'Volver a este mes')
  assert.deepEqual(nav('mes', { ref: '2025-12-01' }).siguiente, { periodo: 'mes', ref: '2026-01-01', desde: '', hasta: '' })
  assert.deepEqual(nav('ano').anterior, { periodo: 'ano', ref: '2025-01-01', desde: '', hasta: '' })
  assert.equal(nav('ano').siguiente, null)
  // Todo, atajos y personalizado: sin flechas
  for (const n of [nav('todo'), nav('7d'), nav('30d'), nav('personalizado', { desde: '2026-11-01', hasta: '2026-11-05' })]) {
    assert.equal(n.anterior, null)
    assert.equal(n.siguiente, null)
    assert.equal(n.volver, null)
  }
  assert.equal(nav('todo').tipo, 'todo')
  assert.equal(nav('7d').tipo, null)
  assert.equal(nav('7d').atajos.find((a) => a.clave === '7d')?.activo, true)
  // Botones de tipo: el periodo actual de cada tipo
  assert.deepEqual(s0.tipos.dia, { periodo: 'hoy', ref: '', desde: '', hasta: '' })
  assert.deepEqual(s0.tipos.semana, { periodo: 'semana', ref: '2026-11-09', desde: '', hasta: '' })
  assert.deepEqual(s0.tipos.mes, { periodo: 'mes', ref: '', desde: '', hasta: '' })
  assert.deepEqual(s0.tipos.todo, { periodo: '', ref: '', desde: '', hasta: '' })
  // Fin de año: el siguiente año empezaría después de hoy
  assert.equal(navegacionPeriodo(rangoAnalisis('ano', {}, new Date('2026-12-31T22:00:00Z')), '2026-12-31').siguiente, null)
  assert.deepEqual(cambiosPara('dia', '2026-11-12', HOY), { periodo: 'hoy', ref: '', desde: '', hasta: '' })
})

test('hora de España para «hoy»: a las 00:30 del día 9 ya es el 9', () => {
  assert.equal(hoyEnEspana(new Date('2026-11-08T23:30:00Z')), '2026-11-09')
  assert.equal(hoyEnEspana(new Date('2026-07-31T22:30:00Z')), '2026-08-01') // verano, +2
})

test('volver a Gráficas desde el detalle: los periodos nuevos van como personalizado', () => {
  assert.deepEqual(periodoParaGraficas('semana', '', '', '2026-11-02', JUEVES), { periodo: 'personalizado', desde: '2026-11-02', hasta: '2026-11-08' })
  assert.deepEqual(periodoParaGraficas('mes', '', '', '2026-10-01', JUEVES), { periodo: 'personalizado', desde: '2026-10-01', hasta: '2026-10-31' })
  assert.deepEqual(periodoParaGraficas('dia', '', '', HOY, JUEVES), { periodo: 'hoy', desde: '', hasta: '' })
  assert.deepEqual(periodoParaGraficas('mes', '', '', '2026-11-01', JUEVES), { periodo: 'mes', desde: '', hasta: '' })
  assert.deepEqual(periodoParaGraficas('7d', '', '', '', JUEVES), { periodo: '7d', desde: '', hasta: '' })
  assert.deepEqual(periodoParaGraficas('personalizado', '2026-10-01', '2026-10-05', '', JUEVES), { periodo: 'personalizado', desde: '2026-10-01', hasta: '2026-10-05' })
  const hoy = hoyEnEspana()
  const ref = rangoAnalisis('semana', { ref: hoy }).ref
  const v = vueltaDetalle({ periodo: 'semana', ref, volver: '/graficas?seg=tipo&periodo=7d' })
  assert.ok(v.href.startsWith('/graficas?seg=tipo&periodo=personalizado&desde='), v.href)
  assert.equal(v.texto, '← Gráficas')
})

// ---------- Balance de la semana ----------

let sec = 0
function ap(fecha: string, extra: Partial<ApuestaAnalisis> = {}): ApuestaAnalisis {
  sec++
  return {
    id: `b${String(sec).padStart(4, '0')}`,
    fecha,
    created_at: fecha,
    tipo: 'simple',
    estado: 'ganada',
    importe: 1000,
    divisa: 'EUR',
    cuota_total: 2,
    resultado_economico: 1000,
    casa: null,
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

test('semana en curso: hoy lunes, martes y domingo; la anterior siempre con los 7 días', () => {
  assert.deepEqual(semana(0, '2026-11-09', null).dias, ['2026-11-09'])
  assert.deepEqual(semana(0, '2026-11-10', null).dias, ['2026-11-09', '2026-11-10'])
  assert.equal(semana(0, '2026-11-15', null).dias.length, 7)
  const s = semana(0, HOY, '2026-01-05')
  assert.equal(s.titulo, 'Esta semana')
  assert.equal(s.tramo, 'del 9 al 15 nov')
  assert.equal(s.haySiguiente, false)
  for (const hoy of ['2026-11-09', '2026-11-10', '2026-11-15']) {
    const a = semana(-1, hoy, '2026-01-05')
    assert.equal(a.titulo, 'Semana anterior')
    assert.deepEqual(a.dias, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    assert.equal(a.haySiguiente, true)
  }
  assert.equal(semana(-2, HOY, '2026-01-05').titulo, 'Semana del 26 oct al 1 nov')
})

test('flecha ‹ del balance: se apaga en la semana de tu primera apuesta; sin apuestas no se va atrás', () => {
  assert.equal(semanasHastaPrimera(HOY, '2026-10-28'), 2) // semana del 26 oct
  assert.equal(semana(-1, HOY, '2026-10-28').hayAnterior, true)
  assert.equal(semana(-2, HOY, '2026-10-28').hayAnterior, false)
  assert.equal(semana(-10, HOY, '2026-10-28').bsem, -2, 'una dirección más antigua se queda en el límite')
  assert.equal(semana(0, HOY, null).hayAnterior, false)
  assert.equal(semana(-3, HOY, null).bsem, 0)
  assert.equal(semana(0, HOY, '2026-11-10').hayAnterior, false, 'primera apuesta de esta semana')
  assert.equal(semana(3, HOY, null).bsem, 0, 'el futuro no existe')
  assert.equal(leerBsem('-3'), -3)
  assert.equal(leerBsem('2'), 0)
  assert.equal(leerBsem('abc'), 0)
  assert.equal(leerBsem(undefined), 0)
})

test('balance: 23:30 de España en su día, día sin apuestas, solo resueltas y total = filas = detalle = Análisis', () => {
  const ap1 = ap('2026-11-10T22:30:00Z', { resultado_economico: 1500 }) // martes 10 a las 23:30 (CET)
  const ap2 = ap('2026-11-10T23:30:00Z', { estado: 'perdida', resultado_economico: -1000 }) // miércoles 11 a las 00:30
  const ap3 = ap('2026-11-09T08:00:00Z', { estado: 'cash_out', resultado_economico: 250 })
  const ap4 = ap('2026-11-09T09:00:00Z', { estado: 'media_perdida', resultado_economico: -500 })
  const ap5 = ap('2026-11-11T10:00:00Z', { estado: 'media_ganada', resultado_economico: 400 })
  const ap6 = ap('2026-11-11T11:00:00Z', { promo_tipo: 'credito', resultado_economico: 900 }) // con crédito: suma
  const fuera = [
    ap('2026-11-10T10:00:00Z', { estado: 'anulada', resultado_economico: 0 }),
    ap('2026-11-10T11:00:00Z', { estado: 'pendiente', resultado_economico: null }),
    ap('2026-11-10T12:00:00Z', { estado: 'ganada', resultado_economico: null }), // resuelta sin resultado: no cuenta
    ap('2026-11-08T22:59:00Z', { resultado_economico: 7777 }), // domingo 8 a las 23:59: semana anterior
    ap('2026-11-13T10:00:00Z', { resultado_economico: 5555 }), // viernes: después de hoy
  ]
  const todas = [ap1, ap2, ap3, ap4, ap5, ap6, ...fuera]
  const s = semana(0, HOY, '2026-01-01')
  // Lo que lee el servidor: las apuestas de la semana
  const leidas = todas.filter((a) => enRango(a.fecha, s))
  const { filas, total } = balanceSemana(leidas, s)
  assert.deepEqual(
    filas.map((f) => [f.dia, f.n, f.beneficio]),
    [
      ['2026-11-09', 2, -250],
      ['2026-11-10', 1, 1500],
      ['2026-11-11', 3, -1000 + 400 + 900],
      ['2026-11-12', 0, 0], // hoy, sin apuestas
    ],
  )
  assert.equal(total.n, filas.reduce((t, f) => t + f.n, 0))
  assert.equal(total.beneficio, filas.reduce((t, f) => t + f.beneficio, 0))
  assert.equal(total.beneficio, -250 + 1500 + 300)
  // Pulsar un día: el detalle lee solo ese día y usa la misma función → mismas apuestas
  for (const f of filas) {
    const delDia = todas.filter((a) => enRango(a.fecha, rangoDia(f.dia)))
    assert.deepEqual(filaDia(delDia, f.dia).ids, f.ids)
  }
  assert.deepEqual(filas[1].ids, [ap1.id], 'la de las 23:30 cae en el martes')
  assert.ok(filas[2].ids.includes(ap2.id), 'la de las 00:30 cae en el miércoles')
  // = beneficio neto de Análisis para el mismo rango (lunes a hoy)
  const analisis = rangoAnalisis('personalizado', { desde: '2026-11-09', hasta: HOY }, JUEVES)
  assert.equal(resumen(todas.filter((a) => enRango(a.fecha, analisis))).beneficio, total.beneficio)
  assert.equal(resumen(todas.filter((a) => enRango(a.fecha, analisis))).n, total.n)
})

test('balance en la semana del cambio de hora (19 al 25 oct 2026)', () => {
  const s = semana(-1, '2026-10-28', '2026-01-01')
  assert.deepEqual([s.lunes, s.domingo, s.desde, s.hasta], ['2026-10-19', '2026-10-25', '2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z'])
  const sab = ap('2026-10-24T21:30:00Z', { resultado_economico: 100 }) // sábado 24 a las 23:30 (CEST, +2)
  const dom = ap('2026-10-25T22:30:00Z', { resultado_economico: 200 }) // domingo 25 a las 23:30 (CET, +1)
  const lun = ap('2026-10-25T23:15:00Z', { resultado_economico: 400 }) // lunes 26 a las 00:15: otra semana
  const lunesAntes = ap('2026-10-18T21:59:00Z', { resultado_economico: 800 }) // domingo 18 a las 23:59
  const leidas = [sab, dom, lun, lunesAntes].filter((a) => enRango(a.fecha, s))
  assert.deepEqual(leidas.map((a) => a.id), [sab.id, dom.id])
  const { filas, total } = balanceSemana(leidas, s)
  assert.equal(filas.length, 7)
  assert.equal(filas.find((f) => f.dia === '2026-10-24')?.beneficio, 100)
  assert.equal(filas.find((f) => f.dia === '2026-10-25')?.beneficio, 200)
  assert.equal(total.beneficio, 300)
  // = Análisis con Semana de esa semana
  const r = rangoAnalisis('semana', { ref: '2026-10-21' }, new Date('2026-10-28T10:00:00Z'))
  assert.equal(resumen([sab, dom, lun, lunesAntes].filter((a) => enRango(a.fecha, r))).beneficio, total.beneficio)
})

test('direcciones del balance: bsem sin tocar el periodo; el día al detalle con todo lo de Análisis', () => {
  const sp = { periodo: 'mes', ref: '2026-10-01', seg: 'tipo', bsem: '-1' }
  assert.equal(enlaceBalance(sp, -2), '/analisis?periodo=mes&ref=2026-10-01&seg=tipo&bsem=-2')
  assert.equal(enlaceBalance(sp, 0), '/analisis?periodo=mes&ref=2026-10-01&seg=tipo')
  assert.equal(enlaceDetalleDia(sp, '2026-11-10'), '/analisis/detalle?periodo=mes&ref=2026-10-01&seg=tipo&bsem=-1&vista=dia&dia=2026-11-10')
  assert.equal(vueltaDetalle({ ...sp, vista: 'dia', dia: '2026-11-10' }).href, '/analisis?periodo=mes&ref=2026-10-01&seg=tipo&bsem=-1')
})
