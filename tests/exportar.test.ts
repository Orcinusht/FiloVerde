// Pruebas de la copia de seguridad en CSV: formato para Excel en español, escapado,
// protección contra fórmulas, lectura en tandas (> 1000 filas), usuario sin apuestas y
// que la lectura siempre se limita al usuario de la sesión.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOM,
  COLUMNAS_APUESTAS,
  COLUMNAS_SELECCIONES,
  celdaCuota,
  celdaDinero,
  celdaFechaHora,
  celdaHora,
  celdaTexto,
  generarCsv,
  leerTodo,
  nombreArchivo,
  ordenarSelecciones,
  type ApuestaExportar,
  type SeleccionExportar,
} from '../src/lib/exportar/csv.ts'
import { exportarApuestas, exportarSelecciones } from '../src/lib/exportar/leer.ts'

const apuesta = (extra: Partial<ApuestaExportar> = {}): ApuestaExportar => ({
  id: 'a1',
  fecha: '2026-11-04T17:30:00Z',
  casa: 'Bet365',
  estrategia: null,
  tipo: 'simple',
  deporte: 'Fútbol',
  importe: 1000,
  divisa: 'EUR',
  cuota_total: 1.85,
  ganancia_potencial: 1850,
  estado: 'perdida',
  resultado_economico: -1250,
  notas: null,
  en_directo: false,
  viendo_partido: false,
  precipitada: true,
  recuperar_perdidas: false,
  precipitada_momento: 'al_registrar',
  promo_tipo: null,
  promo_cuota_original: null,
  promo_aumento: null,
  promo_base: null,
  promo_credito: null,
  created_at: '2026-11-04T17:31:00Z',
  updated_at: '2026-11-04T17:32:00Z',
  ...extra,
})

test('importes: céntimos → euros con coma decimal y 2 decimales (también negativos)', () => {
  assert.equal(celdaDinero(1250), '12,50')
  assert.equal(celdaDinero(-1250), '-12,50')
  assert.equal(celdaDinero(5), '0,05')
  assert.equal(celdaDinero(-5), '-0,05')
  assert.equal(celdaDinero(0), '0,00')
  assert.equal(celdaDinero(123456789), '1234567,89')
  assert.equal(celdaDinero('2500'), '25,00') // bigint puede llegar como texto
  assert.equal(celdaDinero(null), '')
})

test('cuotas: coma decimal, mínimo 2 decimales y sin redondear', () => {
  assert.equal(celdaCuota(1.85), '1,85')
  assert.equal(celdaCuota(2), '2,00')
  assert.equal(celdaCuota(1.5), '1,50')
  assert.equal(celdaCuota(1.333333), '1,333333')
  assert.equal(celdaCuota('1.850000'), '1,85')
  assert.equal(celdaCuota(null), '')
})

test('fechas: AAAA-MM-DD HH:MM en hora de España (invierno y verano)', () => {
  assert.equal(celdaFechaHora('2026-11-04T17:30:00Z'), '2026-11-04 18:30')
  assert.equal(celdaFechaHora('2026-07-01T10:00:00+00:00'), '2026-07-01 12:00')
  assert.equal(celdaFechaHora('2026-12-31T23:30:00Z'), '2027-01-01 00:30')
  assert.equal(celdaFechaHora(null), '')
  assert.equal(celdaHora('18:30:00'), '18:30')
  assert.equal(celdaHora(null), '')
  assert.equal(nombreArchivo('apuestas', new Date('2026-11-04T10:00:00Z')), 'filoverde-apuestas-2026-11-04.csv')
  assert.equal(nombreArchivo('selecciones', new Date('2026-11-04T23:30:00Z')), 'filoverde-selecciones-2026-11-05.csv')
})

test('textos: comillas, ";" y saltos de línea quedan bien escapados', () => {
  assert.equal(celdaTexto('Betis - Sevilla'), 'Betis - Sevilla')
  assert.equal(celdaTexto('Betis; Sevilla'), '"Betis; Sevilla"')
  assert.equal(celdaTexto('Dijo "hola"'), '"Dijo ""hola"""')
  assert.equal(celdaTexto('línea 1\nlínea 2'), '"línea 1\nlínea 2"')
  assert.equal(celdaTexto('a\r\nb'), '"a\r\nb"')
  assert.equal(celdaTexto(' con espacio'), '" con espacio"')
  assert.equal(celdaTexto('Año ñandú acción'), 'Año ñandú acción')
  assert.equal(celdaTexto(null), '')
})

test('protección de fórmulas: solo en texto libre que empieza por = + - @', () => {
  assert.equal(celdaTexto('=SUMA(A1:A9)'), "'=SUMA(A1:A9)")
  assert.equal(celdaTexto('+34 600'), "'+34 600")
  assert.equal(celdaTexto('-1,5 hándicap'), "'-1,5 hándicap")
  assert.equal(celdaTexto('@casa'), "'@casa")
  assert.equal(celdaTexto('\t=1+1'), "'\t=1+1")
  assert.equal(celdaTexto('=A1;B1'), `"'=A1;B1"`) // protegida Y entre comillas
  assert.equal(celdaTexto('Más de 2,5'), 'Más de 2,5')
})

test('en el archivo: un resultado de -12,50 sigue siendo número y una nota con "=" lleva apóstrofo', () => {
  const csv = generarCsv(COLUMNAS_APUESTAS, [
    apuesta({ notas: '=HYPERLINK("http://x";"clic")', promo_tipo: 'aumento', promo_aumento: -300, promo_cuota_original: 1.9, promo_base: 'cuota_original' }),
  ])
  const [cab, fila] = csv.slice(1).split('\r\n')
  const celdas = Object.fromEntries(cab.split(';').map((c, i) => [c, i]))
  // La nota lleva comillas internas y ";": se parte respetando las comillas (como Excel).
  const partes: string[] = []
  let actual = ''
  let dentro = false
  for (const ch of fila) {
    if (ch === '"') dentro = !dentro
    if (ch === ';' && !dentro) {
      partes.push(actual)
      actual = ''
    } else actual += ch
  }
  partes.push(actual)
  assert.equal(partes[celdas.resultado_economico], '-12,50', 'sin apóstrofo: Excel lo lee como número')
  assert.equal(partes[celdas.promo_aumento], '-3,00')
  assert.equal(partes[celdas.importe], '10,00')
  assert.equal(partes[celdas.cuota_total], '1,85')
  assert.equal(partes[celdas.ganancia_potencial], '18,50')
  assert.equal(partes[celdas.notas], `"'=HYPERLINK(""http://x"";""clic"")"`)
  assert.equal(partes[celdas.fecha], '2026-11-04 18:30')
  assert.equal(partes[celdas.precipitada], 'sí')
  assert.equal(partes[celdas.en_directo], 'no')
  assert.equal(partes[celdas.casa], 'Bet365')
  assert.equal(partes[celdas.estrategia], '')
  assert.equal(partes.length, COLUMNAS_APUESTAS.length)
})

test('archivo: BOM UTF-8, separador ";", cabecera y fin de línea de Windows', () => {
  const csv = generarCsv(COLUMNAS_APUESTAS, [apuesta(), apuesta({ id: 'a2' })])
  assert.ok(csv.startsWith(BOM))
  assert.equal(Buffer.from(csv, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf')
  const lineas = csv.slice(1).split('\r\n')
  assert.equal(lineas.length, 4) // cabecera + 2 filas + línea final vacía
  assert.equal(lineas[3], '')
  assert.ok(lineas[0].startsWith('id;fecha;casa;estrategia;tipo;deporte;importe;divisa;cuota_total;'))
  for (const c of ['notas', 'en_directo', 'viendo_partido', 'precipitada', 'recuperar_perdidas', 'precipitada_momento', 'promo_tipo', 'promo_credito', 'creada', 'modificada']) {
    assert.ok(lineas[0].split(';').includes(c), `falta la columna ${c}`)
  }
  assert.ok(COLUMNAS_SELECCIONES.map((c) => c.cabecera).join(';').startsWith('apuesta_id;id;orden;evento;deporte;liga;mercado;pronostico;cuota;evento_fecha;evento_hora;estado'))
})

test('lectura en tandas: lee TODAS las filas aunque pasen de 1000', async () => {
  for (const total of [0, 1, 999, 1000, 1001, 2000, 2500]) {
    const datos = Array.from({ length: total }, (_, i) => i)
    const pedidas: [number, number][] = []
    const filas = await leerTodo(async (desde, hasta) => {
      pedidas.push([desde, hasta])
      return datos.slice(desde, Math.min(hasta + 1, desde + 1000)) // como Supabase: máx. 1000
    })
    assert.deepEqual(filas, datos, `${total} filas`)
    assert.equal(pedidas.length, Math.floor(total / 1000) + 1)
  }
})

test('selecciones: en el orden de sus apuestas y, dentro, por su orden en el resguardo', () => {
  const s = (id: string, apuesta_id: string, orden: number) => ({ id, apuesta_id, orden }) as SeleccionExportar
  const r = ordenarSelecciones([s('x', 'B', 1), s('y', 'A', 0), s('z', 'B', 0), s('w', 'C', 0)], ['B', 'A'])
  assert.deepEqual(r.map((x) => x.id), ['z', 'x', 'y', 'w'])
})

// ---------- Lectura con un cliente de Supabase falso ----------
// Imita la base de datos con RLS: cada usuario solo ve sus filas, y como Supabase devuelve como
// mucho 1000 por consulta. Además apunta si la consulta filtraba por usuario.
function clienteFalso(sesion: string, tablas: Record<string, Record<string, unknown>[]>) {
  const consultas: { tabla: string; filtros: [string, unknown][] }[] = []
  const cliente = {
    from(tabla: string) {
      const q = { tabla, filtros: [] as [string, unknown][] }
      consultas.push(q)
      const b = {
        select: () => b,
        order: () => b,
        eq(col: string, v: unknown) {
          q.filtros.push([col, v])
          return b
        },
        async range(desde: number, hasta: number) {
          let filas = (tablas[tabla] ?? []).filter((f) => f.user_id === sesion) // RLS
          for (const [c, v] of q.filtros) filas = filas.filter((f) => f[c] === v)
          return { data: filas.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null }
        },
      }
      return b
    },
  }
  return { cliente: cliente as never, consultas }
}

const ANA = 'ana'
const BETO = 'beto'

function datosDePrueba(nAna: number) {
  const apuestas = Array.from({ length: nAna }, (_, i) => ({
    ...apuesta({ id: `ana-${i}`, fecha: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }),
    user_id: ANA,
    casa_id: 'casa-ana',
    estrategia_id: null,
  }))
  apuestas.push({ ...apuesta({ id: 'beto-1', notas: 'secreto de Beto' }), user_id: BETO, casa_id: 'casa-beto', estrategia_id: null })
  const selecciones = apuestas.flatMap((a) =>
    [0, 1].map((orden) => ({ id: `${a.id}-s${orden}`, apuesta_id: a.id, orden, user_id: a.user_id, evento: 'Betis - Sevilla', estado: 'pendiente' })),
  )
  return {
    apuestas,
    selecciones,
    casas_apuestas: [
      { id: 'casa-ana', nombre: 'Casa de Ana', user_id: ANA },
      { id: 'casa-beto', nombre: 'Casa de Beto', user_id: BETO },
    ],
    estrategias: [],
  }
}

test('exportar: más de 1000 apuestas salen TODAS, con la casa por nombre', async () => {
  const { cliente } = clienteFalso(ANA, datosDePrueba(2345))
  const r = await exportarApuestas(cliente, ANA)
  assert.equal(r.filas, 2345)
  const lineas = r.csv.slice(1).trimEnd().split('\r\n')
  assert.equal(lineas.length, 2346)
  assert.ok(lineas[1].startsWith('ana-0;2026-01-01 01:00;Casa de Ana;'))
  assert.ok(lineas[2345].startsWith('ana-2344;'))
  const s = await exportarSelecciones(cliente, ANA)
  assert.equal(s.filas, 4690)
  assert.ok(s.csv.includes('\r\nana-0;ana-0-s0;0;Betis - Sevilla;'))
})

test('exportar: un usuario sin apuestas no recibe archivo (0 filas)', async () => {
  const { cliente } = clienteFalso('nadie', datosDePrueba(3))
  assert.deepEqual(await exportarApuestas(cliente, 'nadie'), { csv: '', filas: 0 })
  assert.deepEqual(await exportarSelecciones(cliente, 'nadie'), { csv: '', filas: 0 })
})

test('exportar: un usuario NO obtiene datos de otro y todas las consultas filtran por su id', async () => {
  // Beto, con su sesión, aunque se pidiera el id de Ana: RLS no le deja ver nada de ella.
  const { cliente, consultas } = clienteFalso(BETO, datosDePrueba(5))
  const intento = await exportarApuestas(cliente, ANA)
  assert.equal(intento.filas, 0)
  const propio = await exportarApuestas(cliente, BETO)
  assert.equal(propio.filas, 1)
  assert.ok(!propio.csv.includes('ana-'))
  assert.ok(!propio.csv.includes('Casa de Ana'))
  assert.ok(propio.csv.includes('Casa de Beto'))
  const sel = await exportarSelecciones(cliente, BETO)
  assert.equal(sel.filas, 2)
  assert.ok(!sel.csv.includes('ana-'))
  assert.ok(consultas.length > 0)
  for (const q of consultas) assert.ok(q.filtros.some(([c]) => c === 'user_id'), `la consulta a ${q.tabla} filtra por user_id`)
})
