// Pruebas de la gestión de casas y estrategias (Fase 3, segunda ronda, parte 1): nombres
// (repetidos sin mayúsculas, tildes ni espacios; reservados), uso y borrado, archivadas en los
// desplegables, reconocimiento de una casa archivada leída por la IA, y que renombrar no cambia
// ninguna cifra de Análisis ni de Bankroll.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOMBRES_RESERVADOS,
  buscarPorNombre,
  contarUso,
  esReservado,
  motivoNoBorrable,
  opcionesVisibles,
  validarNombreOpcion,
  type OpcionGestion,
} from '../src/lib/apuestas/opciones.ts'
import { resumen, segmentar, type ApuestaAnalisis } from '../src/lib/analisis/calculos.ts'
import { calcularBankroll, type Movimiento } from '../src/lib/bankroll/calculos.ts'

const casas: OpcionGestion[] = [
  { id: 'c1', nombre: 'Bet365' },
  { id: 'c2', nombre: 'Codere España' },
  { id: 'c3', nombre: 'Betfair', archivada: true },
]

test('nombres repetidos: sin distinguir mayúsculas, tildes ni espacios', () => {
  for (const n of ['bet365', 'BET365', '  Bet365  ', 'codere espana', 'CÓDERE   ESPAÑA', 'Codere  España']) {
    const r = validarNombreOpcion('casa', n, casas)
    assert.equal(r.ok, false, n)
    assert.match((r as { error: string }).error, /Ya tienes una casa llamada/, n)
  }
  const arch = validarNombreOpcion('casa', 'betfair', casas)
  assert.equal(arch.ok, false)
  assert.equal((arch as { existente?: OpcionGestion }).existente?.id, 'c3', 'reconoce la archivada')
  assert.match((arch as { error: string }).error, /archivada.*Recupérala/)
  const ok = validarNombreOpcion('casa', '  William   Hill ', casas)
  assert.deepEqual(ok, { ok: true, nombre: 'William Hill' }, 'espacios limpiados')
  // Al renombrar, la propia entrada no cuenta como repetida (cambiar mayúsculas o tildes).
  assert.deepEqual(validarNombreOpcion('casa', 'BET365', casas, 'c1'), { ok: true, nombre: 'BET365' })
  assert.equal(validarNombreOpcion('casa', 'Codere España', casas, 'c1').ok, false, 'no puede tomar el nombre de otra')
  const est = validarNombreOpcion('estrategia', 'valor', [{ id: 'e1', nombre: 'Válor' }])
  assert.match((est as { error: string }).error, /una estrategia llamada «Válor»/)
})

test('nombres reservados, vacíos y demasiado largos', () => {
  for (const r of [...NOMBRES_RESERVADOS, 'sin casa', 'SIN ESTRATEGIA', ' sin  dato ', 'varios', 'mixto', 'Sín Cása']) {
    assert.ok(esReservado(r), r)
    for (const tipo of ['casa', 'estrategia'] as const) {
      const v = validarNombreOpcion(tipo, r, [])
      assert.equal(v.ok, false, r)
      assert.match((v as { error: string }).error, /reservado/)
    }
  }
  assert.equal(esReservado('Sin casa nueva'), false)
  assert.match((validarNombreOpcion('casa', '   ', []) as { error: string }).error, /Escribe un nombre/)
  assert.match((validarNombreOpcion('casa', 'x'.repeat(81), []) as { error: string }).error, /80/)
  assert.equal(validarNombreOpcion('casa', 'x'.repeat(80), []).ok, true)
  assert.equal(validarNombreOpcion('casa', 42, []).ok, false)
})

test('uso y borrado: solo sin apuestas (ni movimientos, en casas)', () => {
  const apuestas = [
    { casa_id: 'c1', estrategia_id: 'e1' },
    { casa_id: 'c1', estrategia_id: null },
    { casa_id: null, estrategia_id: 'e1' },
  ]
  const movimientos = [
    { casa_id: 'c2', casa_destino_id: null },
    { casa_id: 'c1', casa_destino_id: 'c2' },
  ]
  const uC = contarUso('casa', apuestas, movimientos)
  assert.deepEqual(uC.get('c1'), { apuestas: 2, movimientos: 1 })
  assert.deepEqual(uC.get('c2'), { apuestas: 0, movimientos: 2 }, 'cuenta también como destino de traspaso')
  assert.equal(uC.get('c3'), undefined)
  const uE = contarUso('estrategia', apuestas, movimientos)
  assert.deepEqual(uE.get('e1'), { apuestas: 2, movimientos: 0 })
  assert.equal(motivoNoBorrable('casa', uC.get('c1')), 'Esta casa tiene 2 apuestas y 1 movimiento: no se puede borrar. Puedes renombrarla o archivarla.')
  assert.match(motivoNoBorrable('casa', uC.get('c2'))!, /0 apuestas y 2 movimientos/)
  assert.equal(motivoNoBorrable('casa', uC.get('c3')), null, 'sin uso: se puede borrar')
  assert.equal(motivoNoBorrable('estrategia', uE.get('e1')), 'Esta estrategia tiene 2 apuestas: no se puede borrar. Puedes renombrarla o archivarla.')
  assert.equal(motivoNoBorrable('estrategia', { apuestas: 0, movimientos: 0 }), null)
})

test('archivadas: fuera de los desplegables para lo nuevo; visibles si ya están elegidas', () => {
  assert.deepEqual(opcionesVisibles(casas).map((c) => c.id), ['c1', 'c2'])
  assert.deepEqual(opcionesVisibles(casas, 'c3').map((c) => c.id), ['c1', 'c2', 'c3'], 'al editar algo antiguo que la usa')
})

test('una casa ARCHIVADA leída por la IA se reconoce como existente (no se intenta crear otra)', () => {
  assert.equal(buscarPorNombre(casas, 'BETFAIR')?.id, 'c3')
  assert.equal(buscarPorNombre(casas, 'Bet fair')?.archivada, true)
  assert.equal(buscarPorNombre(casas, 'Bet 365')?.id, 'c1')
  assert.equal(buscarPorNombre(casas, 'Codere Espana')?.id, 'c2')
  assert.equal(buscarPorNombre(casas, 'Bwin'), undefined)
  assert.equal(buscarPorNombre(casas, ''), undefined)
  assert.equal(buscarPorNombre(casas, null), undefined)
  // Y si aun así se intentara crear, la regla de nombre devuelve la existente para usarla.
  assert.equal((validarNombreOpcion('casa', 'Betfair', casas) as { existente?: OpcionGestion }).existente?.id, 'c3')
})

test('renombrar NO cambia ninguna cifra de Análisis ni de Bankroll', () => {
  const nombres = new Map([['c1', 'Bet365'], ['c2', 'Codere'], ['e1', 'Valor']])
  const ap = (i: number, casa: string | null, estrategia: string | null, estado: string, r: number | null): ApuestaAnalisis & { casa_id: string | null; estrategia_id: string | null } => ({
    id: `a${i}`, fecha: `2026-10-0${1 + (i % 9)}T10:00:00Z`, created_at: `2026-10-01T0${i % 9}:00:00Z`, tipo: 'simple', estado, importe: 1000 + i,
    divisa: 'EUR', cuota_total: 1.5 + i / 10, resultado_economico: r, casa: casa ? nombres.get(casa)! : null, estrategia: estrategia ? nombres.get(estrategia)! : null,
    deporte: 'Fútbol', en_directo: false, viendo_partido: false, precipitada: false, promo_tipo: null,
    selecciones: [{ deporte: 'Fútbol', liga: 'LaLiga', mercado: '1X2', estado: 'ganada' }], casa_id: casa, estrategia_id: estrategia,
  })
  const crudas = [
    ap(1, 'c1', 'e1', 'ganada', 800), ap(2, 'c1', null, 'perdida', -1002), ap(3, 'c2', 'e1', 'ganada', 500),
    ap(4, 'c2', null, 'pendiente', null), ap(5, null, 'e1', 'cash_out', -100), ap(6, 'c1', 'e1', 'anulada', 0),
  ]
  const movs: Movimiento[] = [
    { id: 'm1', fecha: '2026-10-01T10:00:00Z', tipo: 'deposito', importe: 10000, casa_id: 'c1', casa_destino_id: null, notas: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'm2', fecha: '2026-10-02T10:00:00Z', tipo: 'traspaso', importe: 3000, casa_id: 'c1', casa_destino_id: 'c2', notas: null, created_at: '2026-10-02T10:00:00Z', updated_at: '2026-10-02T10:00:00Z' },
  ]
  const cifras = () => {
    // Análisis y Bankroll leen el nombre ACTUAL de cada casa y estrategia por su id.
    const apuestas = crudas.map((a) => ({ ...a, casa: a.casa_id ? nombres.get(a.casa_id)! : null, estrategia: a.estrategia_id ? nombres.get(a.estrategia_id)! : null }))
    const sinEtiqueta = <T extends { etiqueta: string; clave: string }>(f: T) => {
      const { etiqueta: _e, clave: _c, ...resto } = f
      return resto
    }
    const b = calcularBankroll(['c1', 'c2'], movs, apuestas.map((a) => ({ casa_id: a.casa_id, estado: a.estado, importe: a.importe, resultado_economico: a.resultado_economico })))
    return {
      resumen: resumen(apuestas),
      casas: segmentar(apuestas, 'casa').map(sinEtiqueta).sort((x, y) => x.importe - y.importe),
      estrategias: segmentar(apuestas, 'estrategia').map(sinEtiqueta).sort((x, y) => x.importe - y.importe),
      bankroll: { global: b.global, c1: b.porCasa.get('c1'), c2: b.porCasa.get('c2'), sinCasa: b.sinCasa },
    }
  }
  const antes = cifras()
  nombres.set('c1', 'Bet365 España')
  nombres.set('c2', 'CODERE (nueva)')
  nombres.set('e1', 'Valor 2.0')
  const despues = cifras()
  assert.deepEqual(despues, antes, 'mismas cifras con los nombres nuevos')
  // Y los nombres nuevos sí salen en Análisis.
  const conNombre = crudas.map((a) => ({ ...a, casa: a.casa_id ? nombres.get(a.casa_id)! : null }))
  assert.ok(segmentar(conNombre, 'casa').some((f) => f.etiqueta === 'Bet365 España'))
})
