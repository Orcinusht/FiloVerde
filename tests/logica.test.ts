// Pruebas de la lógica de apuestas: cuotas, importes, fechas, cálculos,
// validación del formulario y conversión de lo que devuelve la IA.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuotaADecimal, cuotaATexto } from '../src/lib/apuestas/cuotas.ts'
import { centimosATexto, textoACentimos } from '../src/lib/apuestas/dinero.ts'
import { isoALocal, localAIso } from '../src/lib/apuestas/fechas.ts'
import { avisosCoherencia, resultadoPropuesto } from '../src/lib/apuestas/calculos.ts'
import { validarFormulario, valoresVacios } from '../src/lib/apuestas/formulario.ts'
import { esquemaPropuestaIA, propuestaARevision } from '../src/lib/apuestas/propuesta.ts'

test('cuotas: decimal, fraccionaria y americana → decimal', () => {
  assert.equal(cuotaADecimal('1.85'), 1.85)
  assert.equal(cuotaADecimal('1,85'), 1.85)
  assert.equal(cuotaADecimal('@2.5'), 2.5)
  assert.equal(cuotaADecimal('6/4'), 2.5)
  assert.equal(cuotaADecimal('1/3'), 1.333333)
  assert.equal(cuotaADecimal('Evens'), 2)
  assert.equal(cuotaADecimal('+150'), 2.5)
  assert.equal(cuotaADecimal('-200'), 1.5)
  assert.equal(cuotaADecimal(''), null)
  assert.equal(cuotaADecimal('0.5'), undefined)
  assert.equal(cuotaADecimal('abc'), undefined)
  assert.equal(cuotaATexto(2.5), '2,50')
  assert.equal(cuotaATexto(1.333333), '1,333')
})

test('importes: texto en euros → céntimos', () => {
  assert.equal(textoACentimos('10'), 1000)
  assert.equal(textoACentimos('10,5'), 1050)
  assert.equal(textoACentimos('10.50 €'), 1050)
  assert.equal(textoACentimos('1.234,56'), 123456)
  assert.equal(textoACentimos('1,234.56'), 123456)
  assert.equal(textoACentimos('1.000'), 100000)
  assert.equal(textoACentimos(''), null)
  assert.equal(textoACentimos('-5'), undefined)
  assert.equal(textoACentimos('-5,25', { permitirNegativo: true }), -525)
  assert.equal(textoACentimos('diez'), undefined)
  assert.equal(centimosATexto(-525), '-5,25')
})

test('fechas: hora de España ↔ UTC (verano e invierno)', () => {
  assert.equal(localAIso('2026-07-15T20:00'), '2026-07-15T18:00:00.000Z')
  assert.equal(localAIso('2026-12-15T20:00'), '2026-12-15T19:00:00.000Z')
  assert.equal(isoALocal('2026-12-15T19:00:00.000Z'), '2026-12-15T20:00')
  assert.equal(localAIso(''), null)
  assert.equal(localAIso('mañana'), undefined)
})

test('resultado económico según el estado', () => {
  const base = { importe: 1000, cuota: 2.5, gananciaPotencial: 2500 }
  assert.equal(resultadoPropuesto({ ...base, estado: 'ganada' }), 1500)
  assert.equal(resultadoPropuesto({ ...base, gananciaPotencial: null, estado: 'ganada' }), 1500)
  assert.equal(resultadoPropuesto({ ...base, estado: 'perdida' }), -1000)
  assert.equal(resultadoPropuesto({ ...base, estado: 'anulada' }), 0)
  assert.equal(resultadoPropuesto({ ...base, estado: 'media_ganada' }), 750)
  assert.equal(resultadoPropuesto({ ...base, estado: 'media_perdida' }), -500)
  assert.equal(resultadoPropuesto({ ...base, estado: 'cash_out', recuperado: 1800 }), 800)
  assert.equal(resultadoPropuesto({ ...base, estado: 'cash_out' }), null)
  assert.equal(resultadoPropuesto({ ...base, estado: 'pendiente' }), null)
})

test('avisos de coherencia (no bloquean)', () => {
  const ok = avisosCoherencia({ tipo: 'simple', importe: 1000, cuotaTotal: 2, gananciaPotencial: 2000, cuotasSelecciones: [2] })
  assert.deepEqual(ok, [])
  const mal = avisosCoherencia({ tipo: 'simple', importe: 1000, cuotaTotal: 2, gananciaPotencial: 3000, cuotasSelecciones: [2] })
  assert.equal(mal.length, 1)
  const comb = avisosCoherencia({ tipo: 'combinada', importe: 1000, cuotaTotal: 5, gananciaPotencial: 5000, cuotasSelecciones: [1.5, 2] })
  assert.equal(comb.length, 1)
})

test('validación del formulario', () => {
  const v = {
    ...valoresVacios(),
    importe: '10',
    cuota_total: '',
    estado: 'ganada',
    selecciones: [{ evento: 'Betis - Sevilla', liga: '', deporte: 'Fútbol', mercado: '1X2', pronostico: 'Betis', cuota: '2,10', estado: 'ganada' }],
  }
  const r = validarFormulario(v)
  assert.ok(r.ok)
  assert.equal(r.datos.importe, 1000)
  assert.equal(r.datos.cuota_total, 2.1, 'en una simple vale la cuota de la selección')
  assert.equal(r.datos.resultado_economico, 1100, 'resultado calculado')

  const malo = validarFormulario({ ...v, importe: '', casa_id: "1' or 1=1", tipo: 'otro', selecciones: [] })
  assert.equal(malo.ok, false)
  assert.ok(!malo.ok && malo.errores.importe && malo.errores.casa_id && malo.errores.tipo && malo.errores.selecciones)

  const cash = validarFormulario({ ...v, estado: 'cash_out' })
  assert.ok(!cash.ok && cash.errores.importe_recuperado, 'cash out pide lo recuperado')

  assert.equal(validarFormulario(null).ok, false)
  assert.equal(validarFormulario({ ...v, tipo: 'simple', selecciones: [v.selecciones[0], v.selecciones[0]] }).ok, false)
})

test('propuesta de la IA → formulario (cuotas convertidas, dudosos, estado)', () => {
  const p = esquemaPropuestaIA.parse({
    es_apuesta: true,
    motivo: null,
    casa: 'Bet365',
    tipo: 'combinada',
    fecha: '2026-10-31T21:00',
    importe: 5,
    cuota_total: '+300',
    ganancia_potencial: 20,
    estado: 'ganada',
    importe_cobrado: 20,
    selecciones: [
      { evento: 'A - B', liga: null, deporte: 'Fútbol', mercado: '1X2', pronostico: 'A', cuota: '1/1', estado: 'ganada' },
      { evento: 'C - D', liga: null, deporte: 'Fútbol', mercado: '1X2', pronostico: 'C', cuota: '???', estado: 'ganada' },
    ],
    dudosos: ['fecha', 'selecciones[1].pronostico', 'cualquier cosa'],
  })
  const r = propuestaARevision(p)
  assert.equal(r.valores.cuota_total, '4,00')
  assert.equal(r.valores.selecciones[0].cuota, '2,00')
  assert.equal(r.valores.selecciones[1].cuota, '', 'no se inventa')
  assert.ok(r.dudosos.includes('selecciones.1.cuota'))
  assert.ok(r.dudosos.includes('selecciones.1.pronostico'))
  assert.ok(!r.dudosos.includes('cualquier cosa'))
  assert.equal(r.valores.estado, 'ganada')
  assert.equal(r.valores.resultado_economico, '15,00')
  assert.equal(r.valores.fecha, '2026-10-31T21:00')
  assert.equal(r.casaDetectada, 'Bet365')
  assert.ok(validarFormulario(r.valores).ok)
})

test('la IA devuelve algo que no cumple el esquema → se rechaza', () => {
  assert.equal(esquemaPropuestaIA.safeParse({ es_apuesta: 'sí' }).success, false)
  assert.equal(esquemaPropuestaIA.safeParse({ ...{}, estado: 'ganadísima' }).success, false)
})
