// Pruebas del registro: fecha de la apuesta = día del último partido, y "partidos conocidos"
// (rellenar día, hora, liga y deporte con un partido que ya registraste o de la misma tanda).
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_RECIENTES,
  agruparConocidos,
  claveConocida,
  conocidosDeTanda,
  diaSegunPartido,
  instanteDelPartido,
  proponerPartido,
  textoDiaHora,
  ultimoPartido,
  type SeleccionConocida,
} from '../src/lib/apuestas/partidos.ts'
import { fechaDeLaApuesta, validarFormulario, valoresVacios, type ValoresFormulario } from '../src/lib/apuestas/formulario.ts'
import { leerPartidosConocidos } from '../src/lib/apuestas/partidos-leer.ts'

// ---------- Fecha de la apuesta ----------

test('último partido: el más tardío (día y hora); sin hora cuenta como 12:00; sin días → null', () => {
  assert.deepEqual(
    ultimoPartido([
      { evento_fecha: '2026-11-08', evento_hora: '21:00' },
      { evento_fecha: '2026-11-09', evento_hora: '' },
      { evento_fecha: '2026-11-09', evento_hora: '11:30' },
      { evento_fecha: '', evento_hora: '' },
    ]),
    { dia: '2026-11-09', hora: '' },
    'el 9 sin hora (12:00) va después del 9 a las 11:30',
  )
  assert.deepEqual(
    ultimoPartido([
      { evento_fecha: '2026-11-09', evento_hora: '' },
      { evento_fecha: '2026-11-09', evento_hora: '18:45' },
    ]),
    { dia: '2026-11-09', hora: '18:45' },
  )
  assert.equal(ultimoPartido([{ evento_fecha: '', evento_hora: '' }]), null)
  assert.equal(ultimoPartido([]), null)
  assert.equal(textoDiaHora({ dia: '2026-11-08', hora: '21:00' }), '8 nov, 21:00')
})

test('fecha de la apuesta: el día y la hora del último partido (hora de España)', () => {
  const ahora = new Date('2026-11-08T10:00:00Z')
  // Con hora: ese instante en España (invierno, UTC+1)
  assert.equal(fechaDeLaApuesta('2026-11-12', null, ahora, { dia: '2026-11-12', hora: '21:00' }), '2026-11-12T20:00:00.000Z')
  // Sin hora: las 12:00
  assert.equal(fechaDeLaApuesta('2026-11-12', null, ahora, { dia: '2026-11-12', hora: '' }), '2026-11-12T11:00:00.000Z')
  // Partido de madrugada (00:30 del día 9): la apuesta es del día 9 (aunque en UTC sean las 23:30 del 8)
  assert.equal(fechaDeLaApuesta('2026-11-09', null, ahora, { dia: '2026-11-09', hora: '00:30' }), '2026-11-08T23:30:00.000Z')
  // Hoy con partido hoy: la hora del partido, no la de ahora
  assert.equal(fechaDeLaApuesta('2026-11-08', null, ahora, { dia: '2026-11-08', hora: '18:00' }), '2026-11-08T17:00:00.000Z')
  // Sin partido (o el día no es el del partido): como antes
  assert.equal(fechaDeLaApuesta('2026-11-08', null, ahora, null), ahora.toISOString())
  assert.equal(fechaDeLaApuesta('2026-11-05', null, ahora, { dia: '2026-11-12', hora: '21:00' }), '2026-11-05T11:00:00.000Z')
})

test('fecha de la apuesta en los cambios de hora: verano (UTC+2), marzo y octubre; el día nunca cambia', () => {
  const ahora = new Date('2026-11-08T10:00:00Z')
  assert.equal(fechaDeLaApuesta('2026-07-01', null, ahora, { dia: '2026-07-01', hora: '21:00' }), '2026-07-01T19:00:00.000Z')
  // 29-03-2026: a las 02:00 pasan a ser las 03:00
  assert.equal(instanteDelPartido({ dia: '2026-03-29', hora: '03:30' }), '2026-03-29T01:30:00.000Z')
  assert.equal(instanteDelPartido({ dia: '2026-03-29', hora: '01:30' }), '2026-03-29T00:30:00.000Z')
  const inexistente = instanteDelPartido({ dia: '2026-03-29', hora: '02:30' })!
  assert.equal(inexistente, '2026-03-29T01:30:00.000Z', '02:30 no existe: pasa a las 03:30 del mismo día')
  // 25-10-2026 a las 00:30 todavía es verano (UTC+2)
  assert.equal(instanteDelPartido({ dia: '2026-10-25', hora: '00:30' }), '2026-10-24T22:30:00.000Z')
  // 25-10-2026: a las 03:00 vuelven a ser las 02:00
  assert.equal(instanteDelPartido({ dia: '2026-10-25', hora: '18:00' }), '2026-10-25T17:00:00.000Z')
  assert.equal(instanteDelPartido({ dia: '2026-10-24', hora: '18:00' }), '2026-10-24T16:00:00.000Z')
  for (const p of [{ dia: '2026-03-29', hora: '00:30' }, { dia: '2026-10-25', hora: '00:30' }, { dia: '2026-10-25', hora: '02:30' }]) {
    const iso = fechaDeLaApuesta(p.dia, null, ahora, p)!
    assert.equal(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(iso)), p.dia, JSON.stringify(p))
  }
})

test('editar una apuesta guardada no cambia su fecha; «Usar la fecha del partido» sí', () => {
  const guardada = '2026-11-01T09:15:00.000Z' // 1-nov, 10:15 en España
  const ahora = new Date('2026-11-08T10:00:00Z')
  const partido = { dia: '2026-11-12', hora: '21:00' }
  // Sin tocar el día: se conserva tal cual aunque el partido sea otro día
  assert.equal(fechaDeLaApuesta('2026-11-01', guardada, ahora, partido), guardada)
  // El formulario de edición no la mueve sola
  assert.equal(diaSegunPartido({ fecha: '2026-11-01', nueva: false, manual: false, partido }), '2026-11-01')
  // Botón «Usar la fecha del partido» = pone el día del partido → el servidor usa su hora
  assert.equal(fechaDeLaApuesta('2026-11-12', guardada, ahora, partido), '2026-11-12T20:00:00.000Z')
})

test('apuesta nueva: la fecha sigue al partido mientras no se cambie a mano', () => {
  const p1 = { dia: '2026-11-12', hora: '21:00' }
  assert.equal(diaSegunPartido({ fecha: '2026-11-08', nueva: true, manual: false, partido: p1 }), '2026-11-12')
  // Cambia el partido (otra selección más tardía): la fecha la sigue
  assert.equal(diaSegunPartido({ fecha: '2026-11-12', nueva: true, manual: false, partido: { dia: '2026-11-15', hora: '' } }), '2026-11-15')
  // Cambiada a mano: ya no se pisa aunque cambien las selecciones
  assert.equal(diaSegunPartido({ fecha: '2026-11-10', nueva: true, manual: true, partido: { dia: '2026-11-15', hora: '' } }), '2026-11-10')
  // Sin día de partido: se queda la que hay (hoy)
  assert.equal(diaSegunPartido({ fecha: '2026-11-08', nueva: true, manual: false, partido: null }), '2026-11-08')
})

function apuesta(sels: Partial<ValoresFormulario['selecciones'][number]>[], extra: Partial<ValoresFormulario> = {}): ValoresFormulario {
  const v = valoresVacios()
  return {
    ...v,
    tipo: sels.length > 1 ? 'combinada' : 'simple',
    estado: 'pendiente',
    importe: '10',
    cuota_total: '2',
    selecciones: sels.map((s) => ({ ...v.selecciones[0], deporte: 'Fútbol', pronostico: 'X', cuota: sels.length > 1 ? '1,5' : '', ...s })),
    ...extra,
  }
}

test('el servidor guarda el día y la hora del último partido (y no se fía del navegador para la hora)', () => {
  const v = apuesta(
    [
      { evento: 'Betis - Sevilla', evento_fecha: '2026-11-12', evento_hora: '18:30' },
      { evento: 'Getafe - Girona', evento_fecha: '2026-11-13', evento_hora: '00:30' },
    ],
    { fecha: '2026-11-13' },
  )
  const r = validarFormulario(v)
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errores))
  assert.equal(r.ok && r.datos.fecha, '2026-11-12T23:30:00.000Z', '00:30 del 13 en España')
  // Si el usuario puso otro día a mano, ese día a las 12:00
  const otro = validarFormulario({ ...v, fecha: '2025-11-10' })
  assert.equal(otro.ok && otro.datos.fecha, '2025-11-10T11:00:00.000Z')
})

// ---------- Partidos conocidos ----------

test('normalización: mayúsculas, tildes, espacios, "vs" y guiones; solo eventos con dos lados', () => {
  const c = claveConocida('Atlético de Madrid - Real Betis')
  assert.ok(c)
  for (const v of ['atletico de madrid vs real betis', '  ATLÉTICO DE MADRID  –  REAL BETIS ', 'Atletico de Madrid v Real Betis', 'Atlético de Madrid vs. Real Betis']) assert.equal(claveConocida(v), c, v)
  for (const v of ['Sinner', 'Goles', '', null, 'A - B - C']) assert.equal(claveConocida(v), '', String(v))
  assert.notEqual(claveConocida('Real Betis - Atlético de Madrid'), c, 'al revés no es el mismo partido')
})

const HOY = '2026-11-08'
const sel = (evento: string, extra: Partial<SeleccionConocida> = {}): SeleccionConocida => ({
  evento,
  evento_fecha: '2026-11-08',
  evento_hora: '21:00',
  liga: 'LaLiga',
  deporte: 'Fútbol',
  creada: '2026-11-01T00:00:00Z',
  ...extra,
})
const vacia = (evento: string, extra: Partial<{ evento_fecha: string; evento_hora: string; liga: string; deporte: string }> = {}) => ({
  evento,
  evento_fecha: '',
  evento_hora: '',
  liga: '',
  deporte: '',
  ...extra,
})

test('una sola fecha registrada: propone día, hora, liga y deporte', () => {
  const conocidos = agruparConocidos([sel('Betis - Sevilla'), sel('betis vs sevilla', { creada: '2026-11-02T00:00:00Z' })])
  const p = proponerPartido(vacia('BETIS - SEVILLA'), conocidos, HOY)!
  assert.deepEqual(p.cambios, { evento_fecha: '2026-11-08', evento_hora: '21:00', liga: 'LaLiga', deporte: 'Fútbol' })
  assert.deepEqual(p.otrosDias, [])
  assert.equal(p.origen.n, 2)
})

test('varias fechas: propone la más reciente (o futura) y deja las demás recientes para elegir', () => {
  const conocidos = agruparConocidos([
    sel('Betis - Sevilla', { evento_fecha: '2026-11-01', evento_hora: '16:15' }),
    sel('Betis - Sevilla', { evento_fecha: '2026-11-15', evento_hora: '21:00' }),
    sel('Betis - Sevilla', { evento_fecha: '2026-10-20', evento_hora: '18:00' }),
    sel('Betis - Sevilla', { evento_fecha: '2025-04-01', evento_hora: '18:00', liga: 'Copa del Rey' }), // antiguo: no se ofrece
  ])
  const p = proponerPartido(vacia('Betis - Sevilla'), conocidos, HOY)!
  assert.equal(p.cambios.evento_fecha, '2026-11-15')
  assert.equal(p.cambios.evento_hora, '21:00')
  assert.deepEqual(
    p.otrosDias.map((d) => d.dia),
    ['2026-11-01', '2026-10-20'],
  )
})

test(`antigüedad: día y hora solo de partidos de los últimos ${DIAS_RECIENTES} días o futuros; liga y deporte también de antiguos`, () => {
  const antiguos = agruparConocidos([sel('Betis - Sevilla', { evento_fecha: '2026-09-01', evento_hora: '20:00', liga: 'LaLiga', deporte: 'Fútbol' })])
  const p = proponerPartido(vacia('Betis - Sevilla'), antiguos, HOY)!
  assert.deepEqual(p.cambios, { liga: 'LaLiga', deporte: 'Fútbol' }, 'sin día ni hora de un partido de hace más de 30 días')
  assert.equal(p.origen.dia, '2026-09-01', 'el aviso dice de qué partido sale')
  // Justo en el límite (hace 30 días) sí vale
  const limite = agruparConocidos([sel('Betis - Sevilla', { evento_fecha: '2026-10-09' })])
  assert.equal(proponerPartido(vacia('Betis - Sevilla'), limite, HOY)!.cambios.evento_fecha, '2026-10-09')
  const fuera = agruparConocidos([sel('Betis - Sevilla', { evento_fecha: '2026-10-08' })])
  assert.equal(proponerPartido(vacia('Betis - Sevilla'), fuera, HOY)!.cambios.evento_fecha, undefined)
  // Con día en la captura, un partido antiguo de ese mismo día sí da la hora
  assert.equal(proponerPartido(vacia('Betis - Sevilla', { evento_fecha: '2026-09-01' }), antiguos, HOY)!.cambios.evento_hora, '20:00')
})

test('con día en la captura: solo datos de un partido conocido de ESE día', () => {
  const conocidos = agruparConocidos([
    sel('Betis - Sevilla', { evento_fecha: '2026-11-08', evento_hora: '21:00', liga: 'LaLiga' }),
    sel('Betis - Sevilla', { evento_fecha: '2026-11-15', evento_hora: '18:00', liga: 'Copa del Rey' }),
  ])
  const p = proponerPartido(vacia('Betis - Sevilla', { evento_fecha: '2026-11-15' }), conocidos, HOY)!
  assert.deepEqual(p.cambios, { evento_hora: '18:00', liga: 'Copa del Rey', deporte: 'Fútbol' })
  assert.equal(proponerPartido(vacia('Betis - Sevilla', { evento_fecha: '2026-11-20' }), conocidos, HOY), null, 'otro día: nada')
})

test('nunca pisa lo que trae la captura: solo rellena campos vacíos', () => {
  const conocidos = agruparConocidos([sel('Betis - Sevilla', { evento_hora: '21:00', liga: 'LaLiga', deporte: 'Fútbol' })])
  const p = proponerPartido(vacia('Betis - Sevilla', { evento_fecha: '2026-11-08', evento_hora: '20:45', liga: 'Primera División' }), conocidos, HOY)!
  assert.deepEqual(p.cambios, { deporte: 'Fútbol' })
  const completa = vacia('Betis - Sevilla', { evento_fecha: '2026-11-08', evento_hora: '20:45', liga: 'X', deporte: 'Fútbol' })
  assert.equal(proponerPartido(completa, conocidos, HOY), null, 'todo rellenado: nada que proponer')
  assert.equal(proponerPartido(vacia('Sinner'), conocidos, HOY), null, 'sin dos lados: nada')
  assert.equal(proponerPartido(vacia('Getafe - Girona'), conocidos, HOY), null, 'partido desconocido: nada')
})

test('en un mismo día, la hora, la liga y el deporte más repetidos (empate: el más reciente)', () => {
  const conocidos = agruparConocidos([
    sel('Betis - Sevilla', { evento_hora: '21:00', liga: 'LaLiga', creada: '2026-11-01T00:00:00Z' }),
    sel('Betis - Sevilla', { evento_hora: '21:00', liga: 'Primera', creada: '2026-11-03T00:00:00Z' }),
    sel('Betis - Sevilla', { evento_hora: '', liga: 'LaLiga', creada: '2026-11-02T00:00:00Z' }),
  ])
  const d = conocidos.get(claveConocida('Betis - Sevilla'))![0]
  assert.equal(d.hora, '21:00')
  assert.equal(d.liga, 'LaLiga')
  const empate = agruparConocidos([sel('A - B', { liga: 'Vieja', creada: '2026-11-01T00:00:00Z' }), sel('A - B', { liga: 'Nueva', creada: '2026-11-05T00:00:00Z' })])
  assert.equal(empate.get(claveConocida('A - B'))![0].liga, 'Nueva')
})

test('tanda: lo confirmado o editado en las apuestas anteriores rellena el mismo partido', () => {
  const anteriores = [
    { selecciones: [{ evento: 'Betis - Sevilla', evento_fecha: '2026-11-09', evento_hora: '21:00', liga: 'LaLiga', deporte: 'Fútbol' }] },
    { selecciones: [{ evento: 'Getafe - Girona', evento_fecha: '', evento_hora: '', liga: '', deporte: 'Fútbol' }] },
  ]
  const tanda = agruparConocidos(conocidosDeTanda(anteriores))
  const p = proponerPartido(vacia('betis vs sevilla'), tanda, HOY)!
  assert.deepEqual(p.cambios, { evento_fecha: '2026-11-09', evento_hora: '21:00', liga: 'LaLiga', deporte: 'Fútbol' })
  // Sin día en la anterior, no se aprende nada de ese partido
  assert.equal(proponerPartido(vacia('Getafe - Girona'), tanda, HOY), null)
  // Misma regla: no pisa lo que trae la captura
  assert.deepEqual(proponerPartido(vacia('Betis - Sevilla', { evento_hora: '20:00' }), tanda, HOY)!.cambios, { evento_fecha: '2026-11-09', liga: 'LaLiga', deporte: 'Fútbol' })
  // La más cercana a la actual gana en un empate
  const dos = agruparConocidos(
    conocidosDeTanda([
      { selecciones: [{ evento: 'A - B', evento_fecha: '2026-11-09', evento_hora: '18:00', liga: 'L1', deporte: 'Fútbol' }] },
      { selecciones: [{ evento: 'A - B', evento_fecha: '2026-11-09', evento_hora: '20:00', liga: 'L2', deporte: 'Fútbol' }] },
    ]),
  )
  assert.equal(dos.get(claveConocida('A - B'))![0].hora, '20:00')
})

// ---------- Lectura: solo mis partidos ----------

function clienteFalso(sesion: string, filas: Record<string, unknown>[]) {
  const consultas: [string, string, unknown][][] = []
  return {
    consultas,
    cliente: {
      from() {
        const f: [string, string, unknown][] = []
        consultas.push(f)
        const b = {
          select: () => b,
          order: () => b,
          eq: (c: string, v: unknown) => (f.push(['eq', c, v]), b),
          async range(desde: number, hasta: number) {
            let r = filas.filter((x) => x.user_id === sesion) // imita RLS
            for (const [, c, v] of f) r = r.filter((x) => x[c] === v)
            return { data: r.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null }
          },
        }
        return b
      },
    } as never,
  }
}

test('un usuario no usa partidos de otro; lectura en tandas (más de 1000 selecciones)', async () => {
  const filas: Record<string, unknown>[] = []
  for (let i = 0; i < 2300; i++)
    filas.push({ user_id: 'ana', evento: `Equipo ${i} - Rival ${i}`, evento_fecha: '2026-11-01', evento_hora: '20:00', liga: 'L', deporte: 'Fútbol', created_at: '2026-11-01T00:00:00Z' })
  filas.push({ user_id: 'ana', evento: 'Betis - Sevilla', evento_fecha: '2026-11-09', evento_hora: '21:00', liga: 'LaLiga', deporte: 'Fútbol', created_at: '2026-11-02T00:00:00Z' })
  filas.push({ user_id: 'beto', evento: 'Getafe - Girona', evento_fecha: '2026-11-09', evento_hora: '16:00', liga: 'Secreta', deporte: 'Fútbol', created_at: '2026-11-02T00:00:00Z' })
  const { cliente, consultas } = clienteFalso('ana', filas)
  const r = await leerPartidosConocidos(cliente, 'ana', ['betis vs sevilla', 'Getafe - Girona', 'Equipo 2299 - Rival 2299', 'Sinner'])
  assert.deepEqual(Object.keys(r).sort(), [claveConocida('Betis - Sevilla'), claveConocida('Equipo 2299 - Rival 2299')].sort(), 'el de Beto no aparece')
  assert.equal(r[claveConocida('Betis - Sevilla')][0].hora, '21:00')
  assert.ok(consultas.every((f) => f.some(([op, c, v]) => op === 'eq' && c === 'user_id' && v === 'ana')), 'todas las consultas filtran por el usuario de la sesión')
  // Con la sesión de Beto y el id de Ana: nada
  const deBeto = clienteFalso('beto', filas)
  assert.deepEqual(await leerPartidosConocidos(deBeto.cliente, 'ana', ['Betis - Sevilla']), {})
  // Nada que buscar: no consulta
  const vacio = clienteFalso('ana', filas)
  assert.deepEqual(await leerPartidosConocidos(vacio.cliente, 'ana', ['Sinner', '']), {})
  assert.equal(vacio.consultas.length, 0)
})
