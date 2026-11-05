// Pruebas del Bankroll (Fase 3): saldos por casa y global, traspasos, ajustes, apuestas sin casa,
// anuladas y pendientes, crédito, en juego y disponible, ROI, validación de movimientos (también
// fechas futuras), lectura en tandas (> 1000), CSV de movimientos y que un usuario no ve los de otro.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularBankroll,
  efectoEnCasa,
  efectoGlobal,
  fechaDelMovimiento,
  ordenarMovimientos,
  validarMovimiento,
  type ApuestaBankroll,
  type Movimiento,
} from '../src/lib/bankroll/calculos.ts'
import { leerTodoBankroll } from '../src/lib/bankroll/leer.ts'
import { exportarMovimientos } from '../src/lib/exportar/leer.ts'
import { rutaVueltaSegura } from '../src/lib/navegador/volver-a-lista.ts'

const A = '11111111-1111-4111-8111-111111111111' // casa A
const B = '22222222-2222-4222-8222-222222222222' // casa B
let n = 0
const mov = (tipo: Movimiento['tipo'], importe: number, casa_id = A, casa_destino_id: string | null = null, extra: Partial<Movimiento> = {}): Movimiento => {
  n++
  const f = new Date(Date.UTC(2026, 9, 1) + n * 60_000).toISOString()
  return { id: `m${String(n).padStart(5, '0')}`, fecha: f, tipo, importe, casa_id, casa_destino_id, notas: null, created_at: f, updated_at: f, ...extra }
}
const ap = (estado: string, importe: number, resultado: number | null, casa_id: string | null = A): ApuestaBankroll => ({ estado, importe, resultado_economico: resultado, casa_id })

test('saldo por casa y global: depósitos, retiradas, ajustes (también negativos) y beneficio de apuestas', () => {
  const b = calcularBankroll(
    [A, B],
    [mov('deposito', 10000), mov('retirada', 3000), mov('ajuste', -250), mov('ajuste', 100), mov('deposito', 5000, B)],
    [ap('ganada', 1000, 850), ap('perdida', 500, -500), ap('ganada', 2000, 1000, B)],
  )
  const a = b.porCasa.get(A)!
  assert.equal(a.saldo, 10000 - 3000 - 250 + 100 + 850 - 500)
  assert.equal(a.depositado, 10000)
  assert.equal(a.retirado, 3000)
  assert.equal(a.ajustes, -150)
  assert.equal(a.beneficio, 350)
  assert.equal(b.porCasa.get(B)!.saldo, 6000)
  assert.equal(b.global.saldo, 15000 - 3000 - 150 + 350 + 1000)
  assert.equal(b.global.depositado, 15000, 'los ajustes no cuentan como depósito')
  assert.equal(b.global.retirado, 3000)
})

test('traspaso: resta en el origen, suma en el destino y suma cero en el global', () => {
  const sin = calcularBankroll([A, B], [mov('deposito', 10000)], [])
  const con = calcularBankroll([A, B], [mov('deposito', 10000), mov('traspaso', 4000, A, B)], [])
  assert.equal(con.porCasa.get(A)!.saldo, 6000)
  assert.equal(con.porCasa.get(B)!.saldo, 4000)
  assert.equal(con.global.saldo, sin.global.saldo, 'el global no cambia')
  assert.equal(con.global.depositado, 10000, 'un traspaso no es depósito')
  assert.equal(con.global.retirado, 0, 'ni retirada')
  assert.equal(con.porCasa.get(B)!.depositado, 0)
  assert.equal(con.porCasa.get(B)!.traspasosRecibidos, 4000)
  assert.equal(con.porCasa.get(A)!.traspasosEnviados, 4000)
  const t = mov('traspaso', 4000, A, B)
  assert.deepEqual([efectoEnCasa(t, A), efectoEnCasa(t, B), efectoGlobal(t)], [-4000, 4000, 0])
  assert.equal(efectoEnCasa(mov('retirada', 700), A), -700)
})

test('ROI sobre bankroll: beneficio / depositado; sin depósitos «—» (también si solo recibe traspasos)', () => {
  const b = calcularBankroll([A, B], [mov('deposito', 10000), mov('traspaso', 2000, A, B)], [ap('ganada', 1000, 500), ap('ganada', 1000, 300, B)])
  assert.equal(b.global.roi, 800 / 10000)
  assert.equal(b.porCasa.get(A)!.roi, 500 / 10000)
  assert.equal(b.porCasa.get(B)!.roi, null, 'B solo recibe traspasos')
  assert.equal(b.porCasa.get(B)!.soloTraspasos, true)
  assert.equal(b.porCasa.get(A)!.soloTraspasos, false)
  const sinDepositos = calcularBankroll([A], [], [ap('ganada', 1000, 500)])
  assert.equal(sinDepositos.global.roi, null)
  assert.equal(sinDepositos.global.saldo, 500)
})

test('anuladas y pendientes no suman beneficio; las pendientes van a «en juego» y al disponible', () => {
  const b = calcularBankroll(
    [A],
    [mov('deposito', 10000)],
    [ap('anulada', 3000, 0), ap('pendiente', 1500, null), ap('pendiente', 500, null), ap('ganada', 1000, 900), ap('cash_out', 1000, -200), ap('media_ganada', 1000, 250), ap('media_perdida', 1000, -500)],
  )
  const a = b.porCasa.get(A)!
  assert.equal(a.beneficio, 900 - 200 + 250 - 500)
  assert.equal(a.enJuego, 2000)
  assert.equal(a.saldo, 10000 + 450)
  assert.equal(a.disponible, 10000 + 450 - 2000)
  assert.equal(a.nResueltas, 4)
  assert.equal(a.nPendientes, 2)
  assert.deepEqual([b.global.enJuego, b.global.disponible], [2000, 8450])
})

test('apuesta con crédito: su resultado suma al saldo', () => {
  const b = calcularBankroll([A], [mov('deposito', 1000)], [ap('ganada', 500, 750), ap('perdida', 500, 0)])
  assert.equal(b.porCasa.get(A)!.saldo, 1750)
  assert.equal(b.global.beneficio, 750)
})

test('apuestas sin casa: cuentan en el global pero no en el saldo de ninguna casa', () => {
  const b = calcularBankroll([A], [mov('deposito', 10000)], [ap('ganada', 1000, 600, null), ap('pendiente', 400, null, null), ap('perdida', 1000, -1000)])
  assert.equal(b.porCasa.get(A)!.saldo, 9000)
  assert.equal(b.global.saldo, 9600)
  assert.equal(b.global.enJuego, 400)
  assert.ok(b.sinCasa)
  assert.equal(b.sinCasa!.saldo, null, '«Sin casa» no tiene saldo')
  assert.equal(b.sinCasa!.disponible, null)
  assert.equal(b.sinCasa!.beneficio, 600)
  assert.equal(b.sinCasa!.enJuego, 400)
  assert.equal(calcularBankroll([A], [], [ap('ganada', 1, 1)]).sinCasa, null, 'sin apuestas sin casa, no aparece')
  assert.equal(calcularBankroll([A], [], [ap('anulada', 1, 0, null)]).sinCasa, null, 'una anulada sin casa no cuenta')
})

test('todo a 0 y casas sin nada: cifras a 0 y ROI «—»', () => {
  const b = calcularBankroll([A, B], [], [])
  assert.deepEqual([b.global.saldo, b.global.enJuego, b.global.disponible, b.global.roi], [0, 0, 0, null])
  assert.equal(b.porCasa.size, 2)
})

test('validación: casas iguales en traspaso, importe 0 o negativo, casa de otro, notas', () => {
  const casas = new Set([A, B])
  const ahora = new Date('2026-11-06T10:00:00Z')
  const base = { tipo: 'deposito', dia: '2026-11-01', importe: 1000, casa_id: A }
  const ok = validarMovimiento(base, casas, ahora)
  assert.ok(ok.ok && ok.datos.importe === 1000 && ok.datos.casa_destino_id === null)
  const err = (e: object) => {
    const r = validarMovimiento({ ...base, ...e }, casas, ahora)
    assert.equal(r.ok, false, JSON.stringify(e))
    return (r as { errores: Record<string, string> }).errores
  }
  assert.ok(err({ tipo: 'traspaso', casa_destino_id: A }).casa_destino_id?.includes('distinta'))
  assert.ok(err({ tipo: 'traspaso' }).casa_destino_id)
  assert.ok(err({ importe: 0 }).importe)
  assert.ok(err({ importe: -500 }).importe)
  assert.ok(err({ importe: 10.5 }).importe, 'céntimos enteros')
  assert.ok(err({ casa_id: '33333333-3333-4333-8333-333333333333' }).casa_id, 'casa de otro usuario')
  assert.ok(err({ casa_id: '' }).casa_id)
  assert.ok(err({ tipo: 'regalo' }).tipo)
  assert.ok(err({ notas: 'x'.repeat(501) }).notas)
  assert.ok(err({ tipo: 'traspaso', casa_destino_id: '33333333-3333-4333-8333-333333333333' }).casa_destino_id)
  const traspaso = validarMovimiento({ ...base, tipo: 'traspaso', casa_destino_id: B }, casas, ahora)
  assert.ok(traspaso.ok && traspaso.datos.casa_destino_id === B)
  const deposConDestino = validarMovimiento({ ...base, casa_destino_id: B }, casas, ahora)
  assert.ok(deposConDestino.ok && deposConDestino.datos.casa_destino_id === null, 'fuera de traspaso se ignora')
  const ajusteResta = validarMovimiento({ ...base, tipo: 'ajuste', signo: '-' }, casas, ahora)
  assert.ok(ajusteResta.ok && ajusteResta.datos.importe === -1000, 'ajuste negativo')
  const depositoConSigno = validarMovimiento({ ...base, signo: '-' }, casas, ahora)
  assert.ok(depositoConSigno.ok && depositoConSigno.datos.importe === 1000, 'el signo solo vale en ajustes')
  const notas = validarMovimiento({ ...base, notas: '  =SUMA(A1)  ' }, casas, ahora)
  assert.ok(notas.ok && notas.datos.notas === '=SUMA(A1)')
})

test('fechas: hoy guarda la hora actual, otro día las 12:00 de España; NADA futuro', () => {
  const casas = new Set([A])
  const ahora = new Date('2026-11-06T10:00:00Z') // 11:00 en España
  assert.equal(fechaDelMovimiento('2026-11-06', ahora), ahora.toISOString())
  assert.equal(fechaDelMovimiento('2026-11-01', ahora), '2026-11-01T11:00:00.000Z', '12:00 de España (UTC+1)')
  assert.equal(fechaDelMovimiento('2026-07-01', ahora), '2026-07-01T10:00:00.000Z', '12:00 de España (UTC+2)')
  assert.equal(fechaDelMovimiento('basura', ahora), null)
  // Al editar sin cambiar el día se conserva la fecha guardada.
  assert.equal(fechaDelMovimiento('2026-10-01', ahora, '2026-10-01T18:45:00.000Z'), '2026-10-01T18:45:00.000Z')
  const v = (dia: string, cuando = ahora) => validarMovimiento({ tipo: 'deposito', dia, importe: 100, casa_id: A }, casas, cuando)
  assert.equal(v('2026-11-06').ok, true, 'hoy')
  assert.equal(v('2020-01-01').ok, true, 'fechas antiguas (saldo inicial)')
  const futuro = v('2026-11-09')
  assert.equal(futuro.ok, false)
  assert.match((futuro as { errores: Record<string, string> }).errores.fecha!, /no puede ser futura/)
  assert.equal(v('2026-11-08').ok, false, 'pasado mañana: 12:00 queda a más de un día')
  // A las 00:30 de España (23:30 UTC del día anterior), "hoy" es el nuevo día y no es futuro.
  assert.equal(v('2026-11-07', new Date('2026-11-06T23:30:00Z')).ok, true)
  assert.equal(v('').ok, false)
})

test('orden de la lista: más recientes primero (fecha, creación, id)', () => {
  const x = mov('deposito', 1, A, null, { fecha: '2026-10-01T10:00:00Z', created_at: '2026-10-02T00:00:00Z' })
  const y = mov('deposito', 1, A, null, { fecha: '2026-10-01T10:00:00Z', created_at: '2026-10-03T00:00:00Z' })
  const z = mov('deposito', 1, A, null, { fecha: '2026-10-05T10:00:00Z' })
  assert.deepEqual(ordenarMovimientos([x, z, y]).map((m) => m.id), [z.id, y.id, x.id])
})

test('?volver= también acepta /bankroll (con la misma regla estricta)', () => {
  for (const r of ['/bankroll', '/bankroll?casa=x&tipo=ajuste&pagina=2', '/bankroll/casa/11111111-1111-4111-8111-111111111111', '/bankroll/casa/sin?pagina=1'])
    assert.equal(rutaVueltaSegura(r), r)
  for (const r of ['/bankrollx', '/bankroll@evil.com', '//evil.com/bankroll', '/bankroll%2F%2Fevil.com', '/\\evil.com', 'https://evil.com/bankroll'])
    assert.equal(rutaVueltaSegura(r, '/bankroll'), '/bankroll', r)
})

// ---------- Lectura y CSV con un cliente de Supabase falso ----------
// Imita RLS (cada usuario solo ve lo suyo), el límite de 1000 filas por consulta y eq/in.
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
            let filas = (tablas[tabla] ?? []).filter((f) => f.user_id === sesion)
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

function datos(nMov: number) {
  const movimientos: Record<string, unknown>[] = []
  for (let i = 0; i < nMov; i++) {
    const f = new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString()
    const tipo = i % 4 === 0 ? 'retirada' : i % 4 === 1 ? 'traspaso' : 'deposito'
    movimientos.push({
      id: `ana-${String(i).padStart(5, '0')}`, user_id: 'ana', fecha: f, created_at: f, updated_at: f, tipo, importe: tipo === 'retirada' ? 100 : 1000,
      casa_id: 'ca', casa_destino_id: tipo === 'traspaso' ? 'cb' : null, notas: i === 0 ? '=HIPERVINCULO("x"); ojo' : i === 2 ? '-50 de bono' : null,
    })
  }
  movimientos.push({ id: 'beto-1', user_id: 'beto', fecha: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', tipo: 'deposito', importe: 99999, casa_id: 'cbeto', casa_destino_id: null, notas: 'secreto de Beto' })
  return {
    movimientos_bankroll: movimientos,
    casas_apuestas: [
      { id: 'ca', user_id: 'ana', nombre: 'Casa A' },
      { id: 'cb', user_id: 'ana', nombre: 'Casa B' },
      { id: 'cbeto', user_id: 'beto', nombre: 'Casa de Beto' },
    ],
    apuestas: [
      { id: 'x1', user_id: 'ana', casa_id: 'ca', estado: 'ganada', importe: 1000, resultado_economico: 500, fecha: '1', created_at: '1' },
      { id: 'x2', user_id: 'ana', casa_id: 'ca', estado: 'anulada', importe: 1000, resultado_economico: 0, fecha: '2', created_at: '2' },
      { id: 'x3', user_id: 'beto', casa_id: 'cbeto', estado: 'ganada', importe: 1000, resultado_economico: 7777, fecha: '3', created_at: '3' },
    ],
  }
}

test('lectura: más de 1000 movimientos, todos, y saldos correctos', async () => {
  const { cliente } = clienteFalso('ana', datos(2500))
  const { casas, movimientos, apuestas } = await leerTodoBankroll(cliente, 'ana')
  assert.equal(movimientos.length, 2500)
  assert.equal(movimientos[0].id, 'ana-02499', 'más recientes primero')
  assert.equal(apuestas.length, 1, 'sin anuladas')
  assert.deepEqual(casas.map((c) => c.nombre), ['Casa A', 'Casa B'])
  const b = calcularBankroll(casas.map((c) => c.id), movimientos, apuestas)
  const nRet = 625, nTras = 625, nDep = 1250
  assert.equal(b.global.depositado, nDep * 1000)
  assert.equal(b.global.retirado, nRet * 100)
  assert.equal(b.global.saldo, nDep * 1000 - nRet * 100 + 500)
  assert.equal(b.porCasa.get('cb')!.saldo, nTras * 1000)
  assert.equal(b.porCasa.get('ca')!.saldo! + b.porCasa.get('cb')!.saldo!, b.global.saldo)
})

test('un usuario no ve movimientos de otro y todas las consultas filtran por su id', async () => {
  const { cliente, consultas } = clienteFalso('beto', datos(10))
  const deAna = await leerTodoBankroll(cliente, 'ana')
  assert.deepEqual([deAna.casas.length, deAna.movimientos.length, deAna.apuestas.length], [0, 0, 0], 'con el id de Ana no obtiene nada')
  const propio = await leerTodoBankroll(cliente, 'beto')
  assert.deepEqual(propio.movimientos.map((m) => m.id), ['beto-1'])
  for (const q of consultas) assert.ok(q.filtros.some(([op, c]) => op === 'eq' && c === 'user_id'), `la consulta a ${q.tabla} filtra por user_id`)
  const csv = await exportarMovimientos(cliente, 'beto')
  assert.equal(csv.filas, 1)
  assert.ok(!csv.csv.includes('Casa A'))
})

test('CSV de movimientos: formato para Excel, todas las filas y protección de fórmulas', async () => {
  const { cliente } = clienteFalso('ana', datos(1205))
  const r = await exportarMovimientos(cliente, 'ana')
  assert.equal(r.filas, 1205)
  assert.ok(r.csv.startsWith('﻿'))
  const lineas = r.csv.slice(1).split('\r\n')
  assert.equal(lineas[0], 'id;fecha;tipo;importe;casa;casa_destino;notas;creada;modificada')
  assert.equal(lineas[1], `ana-00000;2025-01-01 01:00;retirada;1,00;Casa A;;"'=HIPERVINCULO(""x""); ojo";2025-01-01 01:00;2025-01-01 01:00`)
  assert.equal(lineas[2].split(';').slice(2, 6).join(';'), 'traspaso;10,00;Casa A;Casa B')
  assert.ok(lineas[3].includes(";'-50 de bono;"), 'nota que empieza por "-" protegida')
  assert.equal(lineas.length, 1205 + 2)
  const vacio = await exportarMovimientos(clienteFalso('nadie', datos(3)).cliente, 'nadie')
  assert.deepEqual(vacio, { csv: '', filas: 0 })
  // Un ajuste negativo sigue siendo número.
  const conAjuste = datos(1)
  ;(conAjuste.movimientos_bankroll[0] as Record<string, unknown>).tipo = 'ajuste'
  ;(conAjuste.movimientos_bankroll[0] as Record<string, unknown>).importe = -1250
  const r2 = await exportarMovimientos(clienteFalso('ana', conAjuste).cliente, 'ana')
  assert.ok(r2.csv.includes(';ajuste;-12,50;'), 'sin apóstrofo')
})
