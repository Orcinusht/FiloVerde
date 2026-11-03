// Pruebas de la lógica de apuestas: cuotas, importes, fechas, cálculos,
// validación del formulario y conversión de lo que devuelve la IA.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuotaADecimal, cuotaATexto } from '../src/lib/apuestas/cuotas.ts'
import { centimosATexto, textoACentimos } from '../src/lib/apuestas/dinero.ts'
import { isoALocal, localAIso } from '../src/lib/apuestas/fechas.ts'
import { avisosCoherencia, resultadoPropuesto } from '../src/lib/apuestas/calculos.ts'
import { ajustarPorTipo, seleccionVacia, validarFormulario, valoresVacios } from '../src/lib/apuestas/formulario.ts'
import { esquemaPropuestaIA, propuestaARevisiones } from '../src/lib/apuestas/propuesta.ts'
import { validarDia, validarHora } from '../src/lib/apuestas/fechas.ts'

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

const sel = (extra = {}) => ({ ...seleccionVacia(), evento: 'Betis - Sevilla', deporte: 'Fútbol', mercado: '1X2', pronostico: 'Betis', ...extra })

test('validación del formulario', () => {
  const v = { ...valoresVacios(), importe: '10', cuota_total: '', estado: 'ganada', selecciones: [sel({ cuota: '2,10', estado: 'ganada' })] }
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
})

test('mínimo de selecciones por tipo', () => {
  const base = { ...valoresVacios(), importe: '5', cuota_total: '3' }
  const una = [sel({ cuota: '1,5' })]
  const dos = [sel({ cuota: '1,5' }), sel({ evento: 'A - B', cuota: '2' })]
  assert.ok(!validarFormulario({ ...base, tipo: 'simple', selecciones: dos }).ok, 'simple con 2')
  assert.ok(!validarFormulario({ ...base, tipo: 'combinada', selecciones: una }).ok, 'combinada con 1')
  assert.ok(validarFormulario({ ...base, tipo: 'combinada', selecciones: dos }).ok)
  assert.ok(!validarFormulario({ ...base, tipo: 'sistema', selecciones: dos }).ok, 'sistema con 2')
  assert.ok(!validarFormulario({ ...base, tipo: 'mismo_partido', selecciones: una }).ok, 'mismo partido con 1')
})

test('mismo partido: sin cuota por selección, datos del partido comunes, sin comparar productos', () => {
  const v = {
    ...valoresVacios(),
    tipo: 'mismo_partido',
    importe: '10',
    cuota_total: '4,50',
    ganancia_potencial: '45',
    selecciones: [
      sel({ evento: 'Real Madrid - Barcelona', liga: 'LaLiga', evento_fecha: '2026-11-08', evento_hora: '21:00', mercado: 'Resultado', pronostico: 'Real Madrid', cuota: '1,9' }),
      sel({ evento: '', liga: '', mercado: 'Ambos marcan', pronostico: 'Sí', cuota: '1,7' }),
    ],
  }
  const r = validarFormulario(v)
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errores))
  assert.deepEqual(r.datos.selecciones.map((s) => s.cuota), [null, null], 'cuotas propias quitadas')
  assert.deepEqual(r.datos.selecciones.map((s) => s.evento), ['Real Madrid - Barcelona', 'Real Madrid - Barcelona'])
  assert.deepEqual(r.datos.selecciones.map((s) => [s.evento_fecha, s.evento_hora]), [['2026-11-08', '21:00'], ['2026-11-08', '21:00']])
  assert.equal(r.datos.cuota_total, 4.5)
  assert.deepEqual(r.avisos, [], 'no compara con el producto de las selecciones')
  const mal = validarFormulario({ ...v, ganancia_potencial: '60' })
  assert.equal(mal.avisos.length, 1, 'sí avisa si importe × cuota total no cuadra')
})

test('avisos: selección anulada en combinada y perdida sin selecciones falladas', () => {
  const base = { ...valoresVacios(), tipo: 'combinada', importe: '5', cuota_total: '3' }
  const anulada = validarFormulario({ ...base, selecciones: [sel({ cuota: '1,5' }), sel({ evento: 'A - B', cuota: '2', estado: 'anulada' })] })
  assert.ok(anulada.avisos.some((a) => a.includes('anulada')))
  const perdida = validarFormulario({ ...base, estado: 'perdida', selecciones: [sel({ cuota: '1,5' }), sel({ evento: 'A - B', cuota: '2' })] })
  assert.ok(perdida.ok, 'no bloquea')
  assert.ok(perdida.avisos.some((a) => a.includes('ninguna selección')))
  const conFallada = validarFormulario({ ...base, estado: 'perdida', selecciones: [sel({ cuota: '1,5', estado: 'perdida' }), sel({ evento: 'A - B', cuota: '2' })] })
  assert.ok(!conFallada.avisos.some((a) => a.includes('ninguna selección')))
})

test('fecha y hora del evento', () => {
  assert.equal(validarDia('2026-02-30'), undefined)
  assert.equal(validarDia('2026-11-08'), '2026-11-08')
  assert.equal(validarHora('9:05'), '09:05')
  assert.equal(validarHora('21:00:00'), '21:00')
  assert.equal(validarHora('25:00'), undefined)
  const r = validarFormulario({ ...valoresVacios(), importe: '1', cuota_total: '2', selecciones: [sel({ evento_hora: '20:00' })] })
  assert.ok(!r.ok && r.errores['selecciones.0.evento_hora'], 'hora sin día')
})

test('ajustarPorTipo: la simple guarda la cuota total en su selección', () => {
  const v = ajustarPorTipo({ ...valoresVacios(), cuota_total: '1,85', selecciones: [sel({ cuota: '' })] })
  assert.equal(v.selecciones[0].cuota, '1,85')
})

const apuestaIA = (extra = {}) => ({
  casa: 'Bet365', tipo: 'simple', fecha: null, importe: 10, cuota_total: '1.85', ganancia_potencial: 18.5,
  estado: null, importe_cobrado: null, dudosos: [],
  selecciones: [{ evento: 'A - B', liga: 'LaLiga', deporte: 'Fútbol', mercado: '1X2', pronostico: 'A', cuota: '1.85', estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' }],
  ...extra,
})

test('IA: varias apuestas en una captura, cuotas convertidas, dudosos con motivo', () => {
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      apuestaIA({
        tipo: 'combinada', importe: 5, cuota_total: '+300', ganancia_potencial: 20, estado: 'ganada', importe_cobrado: 20,
        selecciones: [
          { evento: 'A - B', liga: null, deporte: 'Fútbol', mercado: '1X2', pronostico: 'A', cuota: '1/1', estado: 'ganada', evento_fecha: null, evento_hora: null },
          { evento: 'C - D', liga: 'Serie A', deporte: 'Fútbol', mercado: '1X2', pronostico: 'C', cuota: '???', estado: 'ganada', evento_fecha: '2026-10-31', evento_hora: null },
        ],
        dudosos: [{ campo: 'selecciones[1].liga', motivo: 'deducido' }, { campo: 'cualquier cosa', motivo: 'borroso' }],
      }),
      apuestaIA(),
    ],
  })
  const [r, r2] = propuestaARevisiones(p)
  assert.equal(propuestaARevisiones(p).length, 2)
  assert.equal(r.valores.cuota_total, '4,00')
  assert.equal(r.valores.selecciones[0].cuota, '2,00')
  assert.equal(r.valores.selecciones[1].cuota, '', 'no se inventa')
  assert.equal(r.dudosos['selecciones.1.cuota'], 'borroso')
  assert.equal(r.dudosos['selecciones.1.liga'], 'deducido')
  assert.equal(r.dudosos['selecciones.0.evento_fecha'], 'no_visible', 'fecha del evento no visible → a revisar')
  assert.equal(r.dudosos['selecciones.1.evento_hora'], 'no_visible')
  assert.ok(!('cualquier cosa' in r.dudosos))
  assert.equal(r.valores.estado, 'ganada')
  assert.equal(r.valores.resultado_economico, '15,00')
  assert.ok(validarFormulario(r.valores).ok)
  // La simple bien leída no lleva NINGUNA marca.
  assert.deepEqual(r2.dudosos, {})
  assert.equal(r2.valores.selecciones[0].evento_hora, '21:00')
})

test('IA: mismo partido sin cuotas por selección', () => {
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true, motivo: null,
    apuestas: [apuestaIA({
      tipo: 'mismo_partido', cuota_total: '5.50', importe: 10, ganancia_potencial: 55,
      selecciones: [
        { evento: 'A - B', liga: 'LaLiga', deporte: 'Fútbol', mercado: 'Resultado', pronostico: 'A', cuota: null, estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' },
        { evento: 'A - B', liga: 'LaLiga', deporte: 'Fútbol', mercado: 'Más/menos goles', pronostico: 'Más de 2.5', cuota: null, estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' },
      ],
    })],
  })
  const [r] = propuestaARevisiones(p)
  assert.equal(r.valores.tipo, 'mismo_partido')
  assert.deepEqual(r.dudosos, {})
  const v = validarFormulario(r.valores)
  assert.ok(v.ok && v.avisos.length === 0)
})

test('IA: imagen sin apuestas → lista vacía', () => {
  assert.deepEqual(propuestaARevisiones({ hay_apuestas: false, motivo: 'Es un perro', apuestas: [] }), [])
})

test('la IA devuelve algo que no cumple el esquema → se rechaza', () => {
  assert.equal(esquemaPropuestaIA.safeParse({ hay_apuestas: 'sí' }).success, false)
  assert.equal(
    esquemaPropuestaIA.safeParse({ hay_apuestas: true, motivo: null, apuestas: [{ ...apuestaIA(), dudosos: [{ campo: 'x', motivo: 'quizá' }] }] }).success,
    false,
  )
})

// ---------- Catálogo de deportes y ligas ----------
import { catalogoParaIA, deporteResumen, normalizar, type Catalogo } from '../src/lib/apuestas/catalogo.ts'

const CAT: Catalogo = {
  deportes: [
    { id: 'f', nombre: 'Fútbol' },
    { id: 't', nombre: 'Tenis' },
  ],
  ligas: [
    { id: 'l1', nombre: 'LaLiga', deporte_id: 'f' },
    { id: 'l2', nombre: 'ATP', deporte_id: 't' },
    { id: 'l3', nombre: 'WTA', deporte_id: 't' },
  ],
}

test('normalizar: sin mayúsculas, tildes ni espacios de más', () => {
  assert.equal(normalizar('  FÚTBOL  americano '), 'futbol americano')
  assert.equal(normalizar('Fútbol'), normalizar('futbol'))
})

test('deporte resumen: uno, varios = Mixto, ninguno', () => {
  assert.equal(deporteResumen(['Tenis', 'tenis', 'Tenis', 'TENIS', 'Tenis']), 'Tenis')
  assert.equal(deporteResumen(['Tenis', 'Fútbol']), 'Mixto')
  assert.equal(deporteResumen(['', null]), '')
})

test('el formulario pide el deporte de cada selección y no acepta «Mixto»', () => {
  const base = { ...valoresVacios(), importe: '5', cuota_total: '2' }
  const sinDeporte = validarFormulario({ ...base, selecciones: [sel({ deporte: '' })] })
  assert.ok(!sinDeporte.ok && sinDeporte.errores['selecciones.0.deporte'])
  const mixto = validarFormulario({ ...base, selecciones: [sel({ deporte: 'mixto' })] })
  assert.ok(!mixto.ok && mixto.errores['selecciones.0.deporte'])
})

test('IA + catálogo: nombre del catálogo, "nueva", "no visible" y "deducido"', () => {
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      apuestaIA({
        tipo: 'combinada', cuota_total: '3.00',
        selecciones: [
          { evento: 'Alcaraz - Sinner', liga: 'atp', deporte: 'tenis', mercado: 'Ganador', pronostico: 'Alcaraz', cuota: '1.5', estado: null, evento_fecha: '2026-11-08', evento_hora: '15:00' },
          { evento: 'Betis - Sevilla', liga: 'Liga Portugal', deporte: 'Fútbol', mercado: '1X2', pronostico: 'Betis', cuota: '2', estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' },
          { evento: 'A - B', liga: null, deporte: 'Pádel', mercado: 'Ganador', pronostico: 'A', cuota: '1', estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' },
          { evento: 'C - D', liga: 'WTA', deporte: null, mercado: 'Ganador', pronostico: 'C', cuota: '1', estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' },
        ],
        dudosos: [{ campo: 'selecciones.0.deporte', motivo: 'deducido' }],
      }),
    ],
  })
  const [r] = propuestaARevisiones(p, CAT)
  const s = r.valores.selecciones
  assert.equal(s[0].deporte, 'Tenis', 'con la escritura del catálogo')
  assert.equal(s[0].liga, 'ATP')
  assert.equal(r.dudosos['selecciones.0.deporte'], 'deducido', 'se mantiene el motivo de la IA si está en el catálogo')
  assert.equal(r.dudosos['selecciones.0.liga'], undefined, 'liga leída y en el catálogo: sin ámbar')
  assert.equal(r.dudosos['selecciones.1.liga'], 'nueva', 'liga que no está en el catálogo')
  assert.equal(r.dudosos['selecciones.1.deporte'], undefined)
  assert.equal(r.dudosos['selecciones.2.deporte'], 'nueva', 'deporte que no está en el catálogo')
  assert.equal(r.dudosos['selecciones.2.liga'], 'no_visible')
  assert.equal(r.dudosos['selecciones.3.deporte'], 'no_visible', 'sin deporte: vacío y en ámbar')
  assert.equal(r.dudosos['selecciones.3.liga'], 'nueva', 'una liga de otro deporte no vale para un deporte vacío')
  assert.equal(deporteResumen(s.map((x) => x.deporte)), 'Mixto')
})

test('catálogo para la IA: compacto y con tope de tamaño', () => {
  assert.equal(catalogoParaIA(CAT), '{"Fútbol":["LaLiga"],"Tenis":["ATP","WTA"]}')
  const grande: Catalogo = {
    deportes: [{ id: 'f', nombre: 'Fútbol' }],
    ligas: Array.from({ length: 2000 }, (_, i) => ({ id: `l${i}`, nombre: `Liga número ${i}`, deporte_id: 'f' })),
  }
  const txt = catalogoParaIA(grande)
  assert.ok(txt.length <= 4000, `${txt.length} caracteres`)
  assert.ok(JSON.parse(txt).Fútbol.length > 0)
})

// ---------- En directo y precipitada ----------

test('casillas de conducta: solo "true" de verdad, y subcasillas solo con su casilla', () => {
  const base = { ...valoresVacios(), importe: '5', cuota_total: '2', selecciones: [sel()] }
  const ok = validarFormulario({ ...base, en_directo: true, viendo_partido: true, precipitada: true, recuperar_perdidas: true })
  assert.ok(ok.ok)
  assert.deepEqual(
    [ok.datos.en_directo, ok.datos.viendo_partido, ok.datos.precipitada, ok.datos.recuperar_perdidas],
    [true, true, true, true],
  )
  const raro = validarFormulario({ ...base, en_directo: 'sí', viendo_partido: true, precipitada: false, recuperar_perdidas: true })
  assert.ok(raro.ok)
  assert.deepEqual(
    [raro.datos.en_directo, raro.datos.viendo_partido, raro.datos.precipitada, raro.datos.recuperar_perdidas],
    [false, false, false, false],
    'lo que no sea true no cuenta, y sin casilla principal no hay subcasilla',
  )
  assert.equal('precipitada_momento' in ok.datos, false, 'el momento nunca sale del navegador')
})

test('la IA nunca marca directo ni precipitada (por defecto: pre-partido y normal)', () => {
  const p = esquemaPropuestaIA.parse({ hay_apuestas: true, motivo: null, apuestas: [apuestaIA({ estado: 'ganada', importe_cobrado: 18.5 })] })
  const [r] = propuestaARevisiones(p)
  assert.deepEqual(
    [r.valores.en_directo, r.valores.viendo_partido, r.valores.precipitada, r.valores.recuperar_perdidas],
    [false, false, false, false],
  )
  assert.ok(!('en_directo' in esquemaPropuestaIA.shape.apuestas.element.shape), 'sin campos nuevos en el esquema de la IA')
})

// ---------- Emojis de deporte ----------
import { emojiDeporte } from '../src/lib/apuestas/emojis.ts'

test('emojis de deporte por nombre (sin mayúsculas ni tildes)', () => {
  assert.equal(emojiDeporte('Fútbol'), '⚽')
  assert.equal(emojiDeporte('FUTBOL'), '⚽')
  assert.equal(emojiDeporte('fútbol americano'), '🏈')
  assert.equal(emojiDeporte('Béisbol'), '⚾')
  assert.equal(emojiDeporte('MMA/Boxeo'), '🥊')
  assert.equal(emojiDeporte('Ciclismo'), '🏅')
  assert.equal(emojiDeporte('eSports'), '🏅')
  assert.equal(emojiDeporte('Pádel'), '🏅')
  assert.equal(emojiDeporte('Mixto'), '🔀')
  assert.equal(emojiDeporte(''), '')
})

// ---------- Apuestas duplicadas (copia calcada) ----------
import { claveHuella, esCalcada, type HuellaApuesta } from '../src/lib/apuestas/duplicadas.ts'

const huella = (extra: Partial<HuellaApuesta> = {}): HuellaApuesta => ({
  casa_id: 'c1',
  tipo: 'combinada',
  importe: 1000,
  cuota_total: 3,
  ganancia_potencial: 3000,
  selecciones: [
    { evento: 'Real Betis - Sevilla', mercado: '1X2', pronostico: 'Betis', cuota: 1.5, evento_fecha: '2026-11-08' },
    { evento: 'Getafe - Girona', mercado: '1X2', pronostico: 'Girona', cuota: 2, evento_fecha: null },
  ],
  ...extra,
})

test('duplicadas: idéntica, orden distinto y mayúsculas/tildes/espacios → calcada', () => {
  assert.ok(esCalcada(huella(), huella()))
  const h = huella()
  assert.ok(esCalcada(h, { ...h, selecciones: [...h.selecciones].reverse() }), 'orden distinto')
  const m = huella({
    selecciones: [
      { evento: '  REAL betis -  SEVILLA ', mercado: '1x2', pronostico: 'betis', cuota: 1.5, evento_fecha: '2026-11-08' },
      { evento: 'getafe - gírona', mercado: '1X2', pronostico: 'GIRONA', cuota: 2.0, evento_fecha: null },
    ],
  })
  assert.ok(esCalcada(huella(), m), 'mayúsculas, tildes y espacios')
  assert.equal(claveHuella(huella()), claveHuella({ ...h, selecciones: [...h.selecciones].reverse() }))
})

test('duplicadas: cualquier cambio en lo comparado → NO calcada', () => {
  const h = huella()
  assert.ok(!esCalcada(h, huella({ importe: 1001 })), 'importe')
  assert.ok(!esCalcada(h, huella({ cuota_total: 3.01 })), 'cuota total')
  assert.ok(!esCalcada(h, huella({ casa_id: 'c2' })), 'casa')
  assert.ok(!esCalcada(h, huella({ casa_id: null })), 'con casa vs sin casa')
  assert.ok(!esCalcada(h, huella({ tipo: 'sistema' })), 'tipo')
  assert.ok(!esCalcada(h, huella({ ganancia_potencial: 3100 })), 'ganancia distinta')
  assert.ok(esCalcada(h, huella({ ganancia_potencial: null })), 'ganancia solo en una: no cuenta')
  const otraSel = huella({ selecciones: [h.selecciones[0], { ...h.selecciones[1], pronostico: 'Getafe' }] })
  assert.ok(!esCalcada(h, otraSel), 'una selección distinta')
  const cuotaSel = huella({ selecciones: [h.selecciones[0], { ...h.selecciones[1], cuota: 2.05 }] })
  assert.ok(!esCalcada(h, cuotaSel), 'cuota de una selección')
  const extra = huella({ selecciones: [...h.selecciones, { ...h.selecciones[1], evento: 'Celta - Alavés' }] })
  assert.ok(!esCalcada(h, extra), 'selección extra')
  const fecha = huella({ selecciones: [{ ...h.selecciones[0], evento_fecha: '2026-11-09' }, h.selecciones[1]] })
  assert.ok(!esCalcada(h, fecha), 'las dos tienen fecha del evento y no coincide')
  const sinFecha = huella({ selecciones: [{ ...h.selecciones[0], evento_fecha: null }, h.selecciones[1]] })
  assert.ok(esCalcada(h, sinFecha), 'fecha solo en una: no cuenta')
})

test('duplicadas: mismo partido con cuotas nulas', () => {
  const mp = (extra: Partial<HuellaApuesta> = {}) =>
    huella({
      tipo: 'mismo_partido',
      cuota_total: 5.5,
      ganancia_potencial: 5500,
      selecciones: [
        { evento: 'Real Madrid - Barcelona', mercado: 'Resultado', pronostico: 'Real Madrid', cuota: null, evento_fecha: '2026-11-08' },
        { evento: 'Real Madrid - Barcelona', mercado: 'Ambos marcan', pronostico: 'Sí', cuota: null, evento_fecha: '2026-11-08' },
      ],
      ...extra,
    })
  assert.ok(esCalcada(mp(), mp()))
  const conCuota = mp()
  conCuota.selecciones = [{ ...conCuota.selecciones[0], cuota: 1.9 }, conCuota.selecciones[1]]
  assert.ok(!esCalcada(mp(), conCuota), 'nula frente a 1,90')
})
