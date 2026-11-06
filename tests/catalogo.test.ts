// Pruebas de la gestión de deportes y ligas (Fase 3, segunda ronda, parte 2): nombres (repetidos y
// reservados; la liga, solo dentro de su deporte), uso y borrado, selecciones afectadas por un
// renombrado, archivadas (fuera del catálogo de la IA pero reconocidas en la revisión) y el
// detector de posibles errores.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogoParaIA, type Catalogo } from '../src/lib/apuestas/catalogo.ts'
import {
  afectadas,
  clavePartido,
  detectarPosiblesErrores,
  motivoNoBorrable,
  textoAviso,
  uso,
  usoCatalogo,
  validarNombreCatalogo,
  type SeleccionCatalogo,
} from '../src/lib/apuestas/catalogo-gestion.ts'
import { esquemaPropuestaIA, propuestaARevisiones } from '../src/lib/apuestas/propuesta.ts'

const CAT: Catalogo = {
  deportes: [
    { id: 'f', nombre: 'Fútbol' },
    { id: 'v', nombre: 'Voleibol' },
    { id: 'b', nombre: 'Béisbol', archivada: true },
  ],
  ligas: [
    { id: 'lf', nombre: 'Superliga', deporte_id: 'f' },
    { id: 'lv', nombre: 'Superliga', deporte_id: 'v' },
    { id: 'll', nombre: 'LaLiga', deporte_id: 'f' },
    { id: 'lc', nombre: 'Champions League', deporte_id: 'f', archivada: true },
    { id: 'lm', nombre: 'MLB', deporte_id: 'b' },
  ],
}

const s = (apuesta_id: string, deporte: string | null, liga: string | null, extra: Partial<SeleccionCatalogo> = {}): SeleccionCatalogo => ({ apuesta_id, deporte, liga, ...extra })

test('nombres: repetidos sin mayúsculas, tildes ni espacios; la liga solo dentro de su deporte', () => {
  const v = validarNombreCatalogo('deporte', '  FUTBOL ', CAT.deportes)
  assert.equal(v.ok, false)
  assert.equal((v as { error: string }).error, 'Ya tienes un deporte llamado «Fútbol». No se mezclan: elige otro nombre.')
  const ligasF = CAT.ligas.filter((l) => l.deporte_id === 'f')
  assert.equal(validarNombreCatalogo('liga', 'la liga', ligasF).ok, true, '"la liga" ≠ "LaLiga" (espacio)')
  assert.equal(validarNombreCatalogo('liga', 'laliga', ligasF).ok, false)
  // Mismo nombre en OTRO deporte: permitido.
  assert.equal(validarNombreCatalogo('liga', 'LaLiga', CAT.ligas.filter((l) => l.deporte_id === 'v')).ok, true)
  // Archivada: lo dice y devuelve la existente.
  const arch = validarNombreCatalogo('liga', 'champions league', ligasF)
  assert.equal((arch as { existente?: { id: string } }).existente?.id, 'lc')
  assert.equal((arch as { error: string }).error, 'Ya tienes una liga en este deporte archivada llamada «Champions League». Recupérala en lugar de crear otra.')
  // Al renombrar, la propia no cuenta.
  assert.equal(validarNombreCatalogo('liga', 'LALIGA', ligasF, 'll').ok, true)
  assert.match((validarNombreCatalogo('liga', 'Superliga', ligasF, 'll') as { error: string }).error, /No se mezclan/)
})

test('nombres reservados: deportes Mixto, Sin dato y Varios; ligas Sin dato y Varios', () => {
  for (const r of ['Mixto', 'mixto', 'Sin dato', 'SIN DATO', 'Varios', 'várIos']) {
    assert.match((validarNombreCatalogo('deporte', r, []) as { error: string }).error, /reservado/, r)
  }
  for (const r of ['Sin dato', 'varios']) assert.match((validarNombreCatalogo('liga', r, []) as { error: string }).error, /reservado/, r)
  assert.equal(validarNombreCatalogo('liga', 'Mixto', []).ok, true, 'una liga sí puede llamarse Mixto')
  assert.match((validarNombreCatalogo('deporte', 'x'.repeat(61), []) as { error: string }).error, /60/)
  assert.match((validarNombreCatalogo('liga', 'x'.repeat(81), []) as { error: string }).error, /80/)
  assert.match((validarNombreCatalogo('liga', '  ', []) as { error: string }).error, /Escribe un nombre/)
})

test('selecciones afectadas: la liga solo en SU deporte; N y M del aviso', () => {
  const sel = [
    s('a1', 'Fútbol', 'superliga'),
    s('a1', 'futbol', 'SUPERLIGA'),
    s('a2', 'Fútbol', 'Superliga'),
    s('a3', 'Voleibol', 'Superliga'),
    s('a4', 'Fútbol', 'LaLiga'),
    s('a5', null, 'Superliga'),
  ]
  const fut = afectadas('liga', CAT.ligas.find((l) => l.id === 'lf')!, CAT, sel)
  assert.deepEqual(uso(fut), { selecciones: 3, apuestas: 2 }, 'las de voleibol y sin deporte no')
  assert.deepEqual(uso(afectadas('liga', CAT.ligas.find((l) => l.id === 'lv')!, CAT, sel)), { selecciones: 1, apuestas: 1 })
  assert.deepEqual(uso(afectadas('deporte', CAT.deportes[0], CAT, sel)), { selecciones: 4, apuestas: 3 })
  assert.equal(textoAviso({ selecciones: 3, apuestas: 2 }), 'Afecta a 3 selecciones en 2 apuestas: también cambia en ellas.')
  assert.equal(textoAviso({ selecciones: 1, apuestas: 1 }), 'Afecta a 1 selección en 1 apuesta: también cambia en ellas.')
  assert.equal(textoAviso({ selecciones: 0, apuestas: 0 }), 'No afecta a ninguna apuesta.')
  const u = usoCatalogo(CAT, sel)
  assert.deepEqual(u.get('ll'), { selecciones: 1, apuestas: 1 })
  assert.deepEqual(u.get('lc'), { selecciones: 0, apuestas: 0 })
})

test('borrar solo sin uso', () => {
  assert.equal(motivoNoBorrable('liga', { selecciones: 0, apuestas: 0 }), null)
  assert.equal(motivoNoBorrable('liga', { selecciones: 3, apuestas: 2 }), 'Esta liga está en 3 selecciones de 2 apuestas: no se puede borrar. Puedes renombrarla o archivarla.')
  assert.match(motivoNoBorrable('deporte', { selecciones: 1, apuestas: 1 })!, /Este deporte está en 1 selección de 1 apuesta/)
})

test('archivadas: fuera del catálogo que se envía a la IA…', () => {
  const txt = catalogoParaIA(CAT)
  assert.equal(txt, '{"Fútbol":["Superliga","LaLiga"],"Voleibol":["Superliga"]}')
  assert.ok(!txt.includes('Champions') && !txt.includes('Béisbol') && !txt.includes('MLB'), 'ni las ligas de un deporte archivado')
})

test('…pero una liga o un deporte ARCHIVADO leído en una captura se reconoce como existente (no «nueva»)', () => {
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      {
        casa: null, tipo: 'combinada', fecha: null, importe: 10, cuota_total: '3', ganancia_potencial: 30,
        estado: null, importe_cobrado: null, dudosos: [], incompleta: false,
        promo_tipo: null, promo_cuota_original: null, promo_aumento: null, promo_credito: null,
        selecciones: [
          { evento: 'Galatasaray SK - VfB Stuttgart', liga: 'champions league', deporte: 'futbol', mercado: '1X2', pronostico: '1', cuota: '1.5', estado: null, evento_fecha_texto: null, sustituto: null },
          { evento: 'Yankees - Red Sox', liga: 'mlb', deporte: 'beisbol', mercado: 'Ganador', pronostico: 'Yankees', cuota: '2', estado: null, evento_fecha_texto: null, sustituto: null },
        ],
      },
    ],
  })
  const [r] = propuestaARevisiones(p, CAT)
  const [a, b] = r.valores.selecciones
  assert.deepEqual([a.deporte, a.liga], ['Fútbol', 'Champions League'], 'con la escritura del catálogo')
  assert.deepEqual([b.deporte, b.liga], ['Béisbol', 'MLB'])
  for (const k of ['selecciones.0.liga', 'selecciones.1.deporte', 'selecciones.1.liga']) assert.notEqual(r.dudosos[k], 'nueva', `${k}: no se ofrece crear otra`)
})

test('detector: clave del partido sin mayúsculas ni tildes, con «vs» y «-» iguales', () => {
  assert.equal(clavePartido('Galatasaray SK - VfB Stuttgart'), 'galatasaray sk - vfb stuttgart')
  assert.equal(clavePartido('GALATASARAY SK vs VfB Stuttgart'), 'galatasaray sk - vfb stuttgart')
  assert.equal(clavePartido('Galatasaray SK  vs.  VfB   Stuttgart'), 'galatasaray sk - vfb stuttgart')
  assert.equal(clavePartido('Deportivo de A Coruña – Osasuna'), 'deportivo de a coruna - osasuna')
  assert.equal(clavePartido('Vasco da Gama - Flamengo'), 'vasco da gama - flamengo', '"vs" dentro de una palabra no cuenta')
  assert.equal(clavePartido(null), '')
})

test('detector: grupos con ligas distintas (casos reales); sin falsos positivos con ligas iguales ni sin fecha', () => {
  const G = 'Galatasaray SK - VfB Stuttgart'
  const D = 'Deportivo de A Coruña - Osasuna'
  const sel = [
    // Galatasaray, 2026-11-03: Champions y Europa League.
    s('g1', 'Fútbol', 'Champions League', { evento: G, evento_fecha: '2026-11-03' }),
    s('g2', 'Fútbol', 'Europa League', { evento: 'galatasaray sk vs vfb stuttgart', evento_fecha: '2026-11-03' }),
    s('g3', 'Fútbol', 'Champions League', { evento: G, evento_fecha: '2026-11-03' }),
    // Galatasaray, 2026-11-04 (otra fecha): una sin liga y otra con liga → otro grupo.
    s('g4', 'Fútbol', null, { evento: G, evento_fecha: '2026-11-04' }),
    s('g5', 'Fútbol', 'Champions League', { evento: G, evento_fecha: '2026-11-04' }),
    // Depor - Osasuna: LaLiga y LaLiga Hypermotion.
    s('d1', 'Fútbol', 'LaLiga', { evento: D, evento_fecha: '2026-11-08' }),
    s('d2', 'Fútbol', 'LaLiga Hypermotion', { evento: 'Deportivo de A Coruña vs Osasuna', evento_fecha: '2026-11-08' }),
    // Sin falsos positivos: mismas ligas (escritas distinto), sin fecha, o partidos distintos.
    s('x1', 'Fútbol', 'LaLiga', { evento: 'Betis - Sevilla', evento_fecha: '2026-11-09' }),
    s('x2', 'futbol', 'laliga', { evento: 'BETIS vs SEVILLA', evento_fecha: '2026-11-09' }),
    s('y1', 'Fútbol', 'LaLiga', { evento: 'Getafe - Girona', evento_fecha: null }),
    s('y2', 'Fútbol', 'Premier League', { evento: 'Getafe - Girona', evento_fecha: null }),
    s('z1', 'Fútbol', 'LaLiga', { evento: 'Getafe - Girona', evento_fecha: '2026-11-10' }),
    s('z2', 'Fútbol', 'Premier League', { evento: 'Arsenal - Chelsea', evento_fecha: '2026-11-10' }),
    // Mismo partido con DEPORTES distintos.
    s('t1', 'Tenis', 'ATP', { evento: 'Alcaraz - Sinner', evento_fecha: '2026-11-11' }),
    s('t2', 'Pádel', 'ATP', { evento: 'Alcaraz - Sinner', evento_fecha: '2026-11-11' }),
  ]
  const grupos = detectarPosiblesErrores(sel)
  assert.deepEqual(
    grupos.map((g) => [g.partido, g.fecha]),
    [
      ['Alcaraz - Sinner', '2026-11-11'],
      [D, '2026-11-08'],
      [G, '2026-11-04'],
      [G, '2026-11-03'],
    ],
  )
  const g3 = grupos.find((g) => g.fecha === '2026-11-03')!
  assert.deepEqual(g3.ligas.map((l) => [l.liga, l.selecciones]), [['Champions League', 2], ['Europa League', 1]])
  assert.deepEqual(g3.apuestas.sort(), ['g1', 'g2', 'g3'])
  assert.deepEqual(g3.porApuesta.g2, ['Europa League · Fútbol'])
  const g4 = grupos.find((g) => g.fecha === '2026-11-04')!
  assert.deepEqual(g4.ligas.map((l) => l.liga).sort(), ['Champions League', 'Sin liga'], '«Sin liga» cuenta como distinta')
  assert.deepEqual(grupos.find((g) => g.partido === D)!.ligas.map((l) => l.liga), ['LaLiga', 'LaLiga Hypermotion'])
  assert.equal(grupos.find((g) => g.partido === 'Alcaraz - Sinner')!.ligas.length, 2, 'deportes distintos')
  assert.equal(detectarPosiblesErrores([]).length, 0)
})
