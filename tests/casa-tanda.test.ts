// Pruebas de la "Casa de esta tanda" (registro, tarea 2a): selector (sin archivadas), preselección
// de la última casa usada, casa indicada respetada, aviso solo si la IA ve CLARAMENTE otra casa,
// "Que la detecte la IA" como antes, casa de otro usuario no aceptada, versión 7 de las
// instrucciones y que un usuario no ve casas de otro.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CASA_IA,
  avisoDeCasa,
  casaIndicadaGuardada,
  casaParaIA,
  casaPreseleccionada,
  leerUltimaCasa,
  opcionesCasaTanda,
  resolverCasaIndicada,
} from '../src/lib/apuestas/casa-tanda.ts'
import { completarPropuestaAntigua, esquemaPropuestaIA, revisionesDeCaptura, type PropuestaIA } from '../src/lib/apuestas/propuesta.ts'

const BET = '11111111-1111-4111-8111-111111111111'
const WIN = '22222222-2222-4222-8222-222222222222'
const VIEJA = '33333333-3333-4333-8333-333333333333'
const DE_BETO = '44444444-4444-4444-8444-444444444444'
const casasAna = [
  { id: WIN, nombre: 'Winamax' },
  { id: BET, nombre: 'bet365' },
  { id: VIEJA, nombre: 'Casa Vieja', archivada: true },
]

test('selector: solo casas activas (las archivadas fuera), por nombre', () => {
  assert.deepEqual(
    opcionesCasaTanda(casasAna).map((c) => c.nombre),
    ['bet365', 'Winamax'],
  )
  assert.deepEqual(opcionesCasaTanda([]), [])
})

test('preselección: la casa de la última apuesta; sin apuestas (o archivada) → "Que la detecte la IA"', () => {
  assert.equal(casaPreseleccionada(casasAna, BET), BET)
  assert.equal(casaPreseleccionada(casasAna, null), CASA_IA)
  assert.equal(casaPreseleccionada(casasAna, VIEJA), CASA_IA, 'archivada: no se preselecciona')
  assert.equal(casaPreseleccionada(casasAna, DE_BETO), CASA_IA, 'una casa que no está en tu lista')
})

test('la casa que llega del navegador solo vale si es una casa activa del usuario', () => {
  assert.deepEqual(resolverCasaIndicada(BET, casasAna), { id: BET, nombre: 'bet365' })
  assert.equal(resolverCasaIndicada(DE_BETO, casasAna), null, 'de otro usuario')
  assert.equal(resolverCasaIndicada(VIEJA, casasAna), null, 'archivada')
  for (const malo of ['', 'bet365', "'; drop table", 42, null, undefined]) assert.equal(resolverCasaIndicada(malo, casasAna), null, String(malo))
  assert.equal(casaParaIA('Casa <b>rara</b>'), 'Casa brara/b')
})

const sel = { evento: 'Betis - Sevilla', liga: 'LaLiga', deporte: 'Fútbol', mercado: '1X2', pronostico: 'Betis', cuota: '1.85', estado: null, evento_fecha_texto: null, sustituto: null }
function propuesta(a: Partial<PropuestaIA['apuestas'][number]>): PropuestaIA {
  return esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      {
        casa: null, casa_distinta: false, tipo: 'simple', fecha: null, importe: 10, cuota_total: '1.85', ganancia_potencial: 18.5,
        estado: null, importe_cobrado: null, promo_tipo: null, promo_cuota_original: null, promo_aumento: null, promo_credito: null,
        selecciones: [sel], dudosos: [], incompleta: false, ...a,
      },
    ],
  })
}
const INDICADA = { id: BET, nombre: 'bet365' }

test('casa indicada respetada: va en la apuesta, sin ámbar, aunque la IA no vea la casa', () => {
  const [r] = revisionesDeCaptura(propuesta({ casa: null, dudosos: [{ campo: 'casa', motivo: 'no_visible' }] }), undefined, new Date(), INDICADA).validas
  assert.equal(r.revision.valores.casa_id, BET)
  assert.equal(r.revision.dudosos.casa_id, undefined, 'sin ámbar')
  assert.deepEqual(r.revision.casaIndicada, INDICADA)
  assert.equal(r.revision.avisoCasa, null)
  // La misma casa escrita distinto tampoco avisa
  const [igual] = revisionesDeCaptura(propuesta({ casa: 'Bet365 ', casa_distinta: true }), undefined, new Date(), INDICADA).validas
  assert.equal(igual.revision.avisoCasa, null)
})

test('aviso "La captura parece de X" solo si la IA ve con claridad otra casa', () => {
  const [clara] = revisionesDeCaptura(propuesta({ casa: 'Codere', casa_distinta: true }), undefined, new Date(), INDICADA).validas
  assert.equal(clara.revision.avisoCasa, 'Codere')
  assert.equal(clara.revision.valores.casa_id, BET, 'la casa sigue siendo la elegida hasta que el usuario pulse «Usar»')
  // La IA duda (marca la casa como dudosa) → sin aviso
  const [duda] = revisionesDeCaptura(propuesta({ casa: 'Codere', casa_distinta: true, dudosos: [{ campo: 'casa', motivo: 'borroso' }] }), undefined, new Date(), INDICADA).validas
  assert.equal(duda.revision.avisoCasa, null)
  // No dice que sea distinta → sin aviso
  const [noDistinta] = revisionesDeCaptura(propuesta({ casa: 'Codere', casa_distinta: false }), undefined, new Date(), INDICADA).validas
  assert.equal(noDistinta.revision.avisoCasa, null)
  // Distinta pero sin nombre → sin aviso
  assert.equal(avisoDeCasa({ casa: '  ', casa_distinta: true, dudosos: [] }, INDICADA), null)
})

test('"Que la detecte la IA": como antes (casa leída, sin indicada ni aviso)', () => {
  const [r] = revisionesDeCaptura(propuesta({ casa: 'Codere', casa_distinta: false }), undefined, new Date(), null).validas
  assert.equal(r.revision.valores.casa_id, '', 'el formulario la busca o propone crearla, como hoy')
  assert.equal(r.revision.casaDetectada, 'Codere')
  assert.equal(r.revision.casaIndicada, undefined)
  assert.equal(r.revision.avisoCasa, undefined)
  // Lecturas anteriores a la v7 (sin "casa_distinta") se siguen pudiendo retomar
  const { casa_distinta: _sinCampo, ...vieja } = propuesta({}).apuestas[0]
  void _sinCampo
  const antigua = { hay_apuestas: true, motivo: null, apuestas: [vieja] }
  assert.ok(esquemaPropuestaIA.safeParse(completarPropuestaAntigua(antigua)).success)
})

test('al retomar: la casa elegida se recupera de la lectura guardada (solo si es válida)', () => {
  assert.deepEqual(casaIndicadaGuardada({ apuestas: [], casa_indicada: { id: BET, nombre: 'bet365' } }), { id: BET, nombre: 'bet365' })
  assert.equal(casaIndicadaGuardada({ apuestas: [] }), null)
  assert.equal(casaIndicadaGuardada({ casa_indicada: { id: 'x', nombre: 'bet365' } }), null)
  assert.equal(casaIndicadaGuardada(null), null)
})

test('instrucciones de la IA: versión 7 con la casa indicada como dato', () => {
  const fuente = readFileSync(new URL('../src/lib/server/ia/transcribir.ts', import.meta.url), 'utf8')
  assert.match(fuente, /export const VERSION_INSTRUCCIONES = 7\b/)
  assert.match(fuente, /<casa_indicada>/)
  assert.match(fuente, /"casa_distinta": true SOLO si la captura muestra con claridad/)
})

// ---------- Lectura con la sesión: la última casa y que un usuario no ve casas de otro ----------

function clienteFalso(sesion: string, tablas: Record<string, Record<string, unknown>[]>) {
  const consultas: [string, string, unknown][][] = []
  return {
    consultas,
    cliente: {
      from(tabla: string) {
        const f: [string, string, unknown][] = []
        let orden: [string, boolean] | null = null
        consultas.push(f)
        const resultado = () => {
          let r = (tablas[tabla] ?? []).filter((x) => x.user_id === sesion) // imita RLS
          for (const [op, c, v] of f) {
            if (op === 'eq') r = r.filter((x) => x[c] === v)
            if (op === 'not-null') r = r.filter((x) => x[c] != null)
          }
          if (orden) {
            const [c, asc] = orden
            r = [...r].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (asc ? 1 : -1))
          }
          return r
        }
        const b = {
          select: () => b,
          eq: (c: string, v: unknown) => (f.push(['eq', c, v]), b),
          not: (c: string) => (f.push(['not-null', c, null]), b),
          order: (c: string, o?: { ascending?: boolean }) => ((orden = [c, o?.ascending !== false]), b),
          limit: () => b,
          async maybeSingle() {
            return { data: resultado()[0] ?? null, error: null }
          },
          then(ok: (v: unknown) => void) {
            ok({ data: resultado(), error: null })
          },
        }
        return b
      },
    } as never,
  }
}

const tablas = {
  apuestas: [
    { user_id: 'ana', casa_id: WIN, created_at: '2026-11-01T10:00:00Z' },
    { user_id: 'ana', casa_id: BET, created_at: '2026-11-08T10:00:00Z' },
    { user_id: 'ana', casa_id: null, created_at: '2026-11-09T10:00:00Z' }, // sin casa: no cuenta
    { user_id: 'beto', casa_id: DE_BETO, created_at: '2026-11-10T10:00:00Z' },
  ],
  casas_apuestas: [
    { user_id: 'ana', id: BET, nombre: 'bet365', archivada: false },
    { user_id: 'beto', id: DE_BETO, nombre: 'Casa de Beto', archivada: false },
  ],
}

test('última casa usada: la de la apuesta más reciente con casa, solo del usuario', async () => {
  const { cliente, consultas } = clienteFalso('ana', tablas)
  assert.equal(await leerUltimaCasa(cliente, 'ana'), BET)
  assert.ok(consultas.every((f) => f.some(([op, c, v]) => op === 'eq' && c === 'user_id' && v === 'ana')))
  assert.equal(await leerUltimaCasa(clienteFalso('beto', tablas).cliente, 'ana'), null, 'Beto con el id de Ana: nada')
  assert.equal(await leerUltimaCasa(clienteFalso('nadie', tablas).cliente, 'nadie'), null, 'sin apuestas')
})

test('un usuario no ve casas de otro: la casa de Beto no se acepta como casa de la tanda de Ana', async () => {
  const { cliente } = clienteFalso('ana', tablas)
  const { data } = (await (cliente as unknown as { from: (t: string) => { select: () => { eq: (c: string, v: string) => PromiseLike<{ data: { id: string; nombre: string }[] }> } } })
    .from('casas_apuestas')
    .select()
    .eq('user_id', 'ana')) as { data: { id: string; nombre: string; archivada?: boolean }[] }
  assert.deepEqual(
    data.map((c) => c.nombre),
    ['bet365'],
  )
  assert.equal(resolverCasaIndicada(DE_BETO, data), null)
  assert.deepEqual(resolverCasaIndicada(BET, data), { id: BET, nombre: 'bet365' })
})
