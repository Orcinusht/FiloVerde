// Pruebas de la lógica de apuestas: cuotas, importes, fechas, cálculos,
// validación del formulario y conversión de lo que devuelve la IA.
// Ejecutar:  npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuotaADecimal, cuotaATexto } from '../src/lib/apuestas/cuotas.ts'
import { centimosATexto, textoACentimos } from '../src/lib/apuestas/dinero.ts'
import { isoALocal, localAIso } from '../src/lib/apuestas/fechas.ts'
import { avisosCoherencia, resultadoPropuesto } from '../src/lib/apuestas/calculos.ts'
import { ajustarPorTipo, fechaDeLaApuesta, seleccionVacia, validarFormulario, valoresVacios } from '../src/lib/apuestas/formulario.ts'
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
  assert.ok(r.ok, JSON.stringify(r))
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
  const r = validarFormulario({ ...valoresVacios(), importe: '1', cuota_total: '2', selecciones: [sel({ evento_hora: '20:00' , sustituto: null })] })
  assert.ok(!r.ok && r.errores['selecciones.0.evento_hora'], 'hora sin día')
})

test('ajustarPorTipo: la simple guarda la cuota total en su selección', () => {
  const v = ajustarPorTipo({ ...valoresVacios(), cuota_total: '1,85', selecciones: [sel({ cuota: '' })] })
  assert.equal(v.selecciones[0].cuota, '1,85')
})

const apuestaIA = (extra = {}) => ({
  casa: 'Bet365', tipo: 'simple', fecha: null, importe: 10, cuota_total: '1.85', ganancia_potencial: 18.5,
  estado: null, importe_cobrado: null, dudosos: [], incompleta: false, casa_distinta: false,
  promo_tipo: null, promo_cuota_original: null, promo_aumento: null, promo_credito: null,
  selecciones: [{ evento: 'A - B', liga: 'LaLiga', deporte: 'Fútbol', mercado: '1X2', pronostico: 'A', cuota: '1.85', estado: null, evento_fecha_texto: '2026-11-08 21:00', sustituto: null }],
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
          { evento: 'A - B', liga: null, deporte: 'Fútbol', mercado: '1X2', pronostico: 'A', cuota: '1/1', estado: 'ganada', evento_fecha_texto: null , sustituto: null },
          { evento: 'C - D', liga: 'Serie A', deporte: 'Fútbol', mercado: '1X2', pronostico: 'C', cuota: '???', estado: 'ganada', evento_fecha_texto: '2026-10-31' , sustituto: null },
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
        { evento: 'A - B', liga: 'LaLiga', deporte: 'Fútbol', mercado: 'Resultado', pronostico: 'A', cuota: null, estado: null, evento_fecha_texto: '2026-11-08 21:00' , sustituto: null },
        { evento: 'A - B', liga: 'LaLiga', deporte: 'Fútbol', mercado: 'Más/menos goles', pronostico: 'Más de 2.5', cuota: null, estado: null, evento_fecha_texto: '2026-11-08 21:00' , sustituto: null },
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
          { evento: 'Alcaraz - Sinner', liga: 'atp', deporte: 'tenis', mercado: 'Ganador', pronostico: 'Alcaraz', cuota: '1.5', estado: null, evento_fecha_texto: '2026-11-08 15:00' , sustituto: null },
          { evento: 'Betis - Sevilla', liga: 'Liga Portugal', deporte: 'Fútbol', mercado: '1X2', pronostico: 'Betis', cuota: '2', estado: null, evento_fecha_texto: '2026-11-08 21:00' , sustituto: null },
          { evento: 'A - B', liga: null, deporte: 'Pádel', mercado: 'Ganador', pronostico: 'A', cuota: '1', estado: null, evento_fecha_texto: '2026-11-08 21:00' , sustituto: null },
          { evento: 'C - D', liga: 'WTA', deporte: null, mercado: 'Ganador', pronostico: 'C', cuota: '1', estado: null, evento_fecha_texto: '2026-11-08 21:00' , sustituto: null },
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

// ---------- Promociones ----------
import { calcularAumento, porCuota } from '../src/lib/apuestas/promociones.ts'
import { NO_PROMOCION, REGLAS_PROMOCION, SI_PROMOCION } from '../src/lib/apuestas/promociones-ia.ts'
import { sincronizarPromo, cuotaDeLaApuesta } from '../src/lib/apuestas/formulario.ts'
import { completarPropuestaAntigua } from '../src/lib/apuestas/propuesta.ts'

test('Promoción: importe × cuota en céntimos sin errores de coma flotante', () => {
  assert.equal(porCuota(1000, 1.85), 1850)
  assert.equal(porCuota(1005, 1.5), 1508) // 1507,5 → redondeo hacia arriba
  assert.equal(porCuota(333, 3.3), 1099) // 1098,9
  assert.equal(porCuota(1, 1.005), 1)
  assert.equal(porCuota(1999, 1.15), 2299) // 2298,85 (en coma flotante sale 2298.8499…)
  assert.equal(porCuota(70, 1.15), 81) // 80,5 → 81 (1.15 × 70 = 80.49999… en coma flotante)
})

test('Superaumento: con la cuota original leída se calcula el aumento', () => {
  const c = calcularAumento({ importe: 1000, cuotaTotal: 2.5, gananciaPotencial: 2500, cuotaOriginal: 2, aumento: null, base: 'cuota_original' })
  assert.deepEqual([c.gananciaSin, c.gananciaCon, c.aumento, c.base, c.falta, c.avisos], [2000, 2500, 500, 'cuota_original', false, []])
  // Sin ganancia potencial: importe × cuota total.
  const d = calcularAumento({ importe: 1000, cuotaTotal: 2.5, gananciaPotencial: null, cuotaOriginal: 2, aumento: null })
  assert.equal(d.aumento, 500)
})

test('Superaumento: con el aumento leído se calcula la cuota original', () => {
  const c = calcularAumento({ importe: 1000, cuotaTotal: 2.5, gananciaPotencial: 2500, cuotaOriginal: null, aumento: 500, base: 'aumento' })
  assert.deepEqual([c.cuotaOriginal, c.gananciaSin, c.base, c.falta], [2, 2000, 'aumento', false])
  const r = calcularAumento({ importe: 300, cuotaTotal: 2, gananciaPotencial: 600, cuotaOriginal: null, aumento: 50 })
  assert.equal(r.cuotaOriginal, 1.833333)
})

test('Superaumento: sin ninguno de los dos, la cuota original «falta»', () => {
  const c = calcularAumento({ importe: 1000, cuotaTotal: 2.5, gananciaPotencial: 2500, cuotaOriginal: null, aumento: null })
  assert.deepEqual([c.cuotaOriginal, c.aumento, c.base, c.falta, c.gananciaCon, c.gananciaSin], [null, null, null, true, 2500, null])
})

test('Superaumento: los dos leídos e incoherentes se conservan y avisan (tolerancia 2 céntimos)', () => {
  const ok = calcularAumento({ importe: 1000, cuotaTotal: 2.5, gananciaPotencial: 2500, cuotaOriginal: 2, aumento: 502, base: 'ambos' })
  assert.deepEqual([ok.cuotaOriginal, ok.aumento, ok.avisos.length], [2, 502, 0])
  const mal = calcularAumento({ importe: 1000, cuotaTotal: 2.5, gananciaPotencial: 2500, cuotaOriginal: 2, aumento: 503, base: 'ambos' })
  assert.deepEqual([mal.cuotaOriginal, mal.aumento], [2, 503])
  assert.match(mal.avisos.join(' '), /no cuadran/)
})

test('Superaumento: avisos sin bloquear (cuota original mayor que la pagada, aumento negativo)', () => {
  const c = calcularAumento({ importe: 1000, cuotaTotal: 2, gananciaPotencial: 2000, cuotaOriginal: 2.2, aumento: null })
  assert.equal(c.aumento, -200)
  assert.match(c.avisos.join(' '), /mayor que la cuota pagada/)
  assert.match(c.avisos.join(' '), /negativo/)
  const v = validarFormulario({ ...valoresVacios(), importe: '10', cuota_total: '2', selecciones: [sel()], promo: true, promo_tipo: 'superaumento', promo_cuota_original: '2,2', promo_base: 'cuota_original' })
  assert.equal(v.ok, true, 'no bloquea')
  assert.ok(v.ok, JSON.stringify(v))
  if (v.ok) assert.equal(v.datos.promo_aumento, -200)
})

test('Promoción: el servidor recalcula el dato derivado en cada guardado (no se fía del navegador)', () => {
  const base = { ...valoresVacios(), importe: '10', cuota_total: '2,5', ganancia_potencial: '25', selecciones: [sel()], promo: true, promo_tipo: 'superaumento' }
  // Base = cuota original: el aumento que mande el navegador se ignora y se recalcula.
  const a = validarFormulario({ ...base, promo_cuota_original: '2', promo_aumento: '999', promo_base: 'cuota_original' })
  assert.ok(a.ok)
  assert.ok(a.ok, JSON.stringify(a))
  if (a.ok) assert.deepEqual([a.datos.promo_cuota_original, a.datos.promo_aumento, a.datos.promo_base], [2, 500, 'cuota_original'])
  // Se edita el importe (20 € a 2,5 → 50 €): el aumento sigue a la cuota original.
  const b = validarFormulario({ ...base, importe: '20', ganancia_potencial: '50', promo_cuota_original: '2', promo_aumento: '5', promo_base: 'cuota_original' })
  assert.ok(b.ok, JSON.stringify(b))
  if (b.ok) assert.equal(b.datos.promo_aumento, 1000)
  // Base = aumento: la cuota original se recalcula.
  const c = validarFormulario({ ...base, importe: '20', ganancia_potencial: '50', promo_cuota_original: '2', promo_aumento: '5', promo_base: 'aumento' })
  assert.ok(c.ok, JSON.stringify(c))
  if (c.ok) assert.deepEqual([c.datos.promo_aumento, c.datos.promo_cuota_original], [500, 2.25])
  // Sin ganancia potencial ni cuota total → no se puede calcular: queda vacío.
  const d = validarFormulario({ ...base, cuota_total: '', ganancia_potencial: '', promo_aumento: '5', promo_base: 'aumento' })
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) assert.deepEqual([d.datos.promo_aumento, d.datos.promo_cuota_original], [500, null])
})

test('Promoción: en el formulario el dato derivado se rellena al momento', () => {
  const v = sincronizarPromo({ ...valoresVacios(), importe: '10', cuota_total: '2,5', selecciones: [sel()], promo: true, promo_tipo: 'superaumento', promo_cuota_original: '2', promo_base: 'cuota_original' })
  assert.equal(v.promo_aumento, '5,00')
  const w = sincronizarPromo({ ...v, promo_aumento: '2,5', promo_base: 'aumento' })
  assert.equal(w.promo_cuota_original, '2,25')
  assert.equal(cuotaDeLaApuesta({ cuota_total: '', tipo: 'simple', selecciones: [sel({ cuota: '1,9' })] }), 1.9)
})

test('Aumento: ganada = ganancia potencial − importe; media ganada/perdida sin aumento; sin aviso de coherencia', () => {
  const comun = { importe: 1000, cuota: 2.5, gananciaPotencial: 2600, promo: 'aumento' }
  assert.equal(resultadoPropuesto({ ...comun, estado: 'ganada' }), 1600)
  assert.equal(resultadoPropuesto({ ...comun, estado: 'media_ganada' }), 750)
  assert.equal(resultadoPropuesto({ ...comun, estado: 'media_perdida' }), -500)
  const aviso = (promo: string | null) =>
    avisosCoherencia({ tipo: 'simple', importe: 1000, cuotaTotal: 2, gananciaPotencial: 2600, cuotasSelecciones: [2], promo }).length
  assert.equal(aviso(null), 1, 'sin promoción sí avisa')
  assert.equal(aviso('superaumento'), 0)
  assert.equal(aviso('aumento'), 0)
  assert.equal(aviso('credito'), 0)
  assert.equal(aviso('asegurada'), 1)
})

test('Asegurada: perdida = −importe; el crédito se guarda aparte (por defecto, el importe)', () => {
  assert.equal(resultadoPropuesto({ estado: 'perdida', importe: 1000, cuota: 2, gananciaPotencial: null, promo: 'asegurada' }), -1000)
  const base = { ...valoresVacios(), importe: '10', cuota_total: '2', estado: 'perdida', selecciones: [sel({ estado: 'perdida' })], promo: true, promo_tipo: 'asegurada' }
  const sinTope = validarFormulario(base)
  assert.ok(sinTope.ok, JSON.stringify(sinTope))
  if (sinTope.ok) assert.deepEqual([sinTope.datos.resultado_economico, sinTope.datos.promo_credito], [-1000, 1000])
  const conTope = validarFormulario({ ...base, promo_credito: '5' })
  assert.ok(conTope.ok, JSON.stringify(conTope))
  if (conTope.ok) assert.deepEqual([conTope.datos.resultado_economico, conTope.datos.promo_credito], [-1000, 500])
  assert.equal(validarFormulario({ ...base, promo_credito: '-5' }).ok, false, 'crédito negativo no')
})

test('Crédito: ganada solo la ganancia; perdida, media perdida y anulada 0; media ganada; cash out todo lo recuperado', () => {
  const r = (estado: Parameters<typeof resultadoPropuesto>[0]['estado'], extra = {}) =>
    resultadoPropuesto({ estado, importe: 1000, cuota: 2, gananciaPotencial: 2000, promo: 'credito', ...extra })
  assert.equal(r('ganada'), 1000, '10 € a 2,00 = +10 €')
  assert.equal(r('perdida'), 0)
  assert.equal(r('media_perdida'), 0)
  assert.equal(r('anulada'), 0)
  assert.equal(r('media_ganada'), 500)
  assert.equal(r('cash_out', { recuperado: 730 }), 730)
  assert.equal(r('ganada', { cuota: 1.85 }), 850)
  const v = validarFormulario({ ...valoresVacios(), importe: '10', cuota_total: '2', estado: 'ganada', selecciones: [sel({ estado: 'ganada' })], promo: true, promo_tipo: 'credito' })
  assert.ok(v.ok, JSON.stringify(v))
  if (v.ok) assert.equal(v.datos.resultado_economico, 1000)
})

test('Promoción: sin marcar (o al quitarla) todos los datos van vacíos; marcada sin tipo, error', () => {
  const v = validarFormulario({ ...valoresVacios(), importe: '10', cuota_total: '2', selecciones: [sel()], promo: false, promo_tipo: 'aumento', promo_cuota_original: '1,8', promo_credito: '5' })
  assert.ok(v.ok)
  assert.ok(v.ok, JSON.stringify(v))
  if (v.ok) {
    assert.deepEqual(
      [v.datos.promo_tipo, v.datos.promo_cuota_original, v.datos.promo_aumento, v.datos.promo_credito, v.datos.promo_base],
      [null, null, null, null, null],
    )
    assert.ok('promo_tipo' in v.datos, 'siempre se envía (para vaciar al editar)')
  }
  const sinTipo = validarFormulario({ ...valoresVacios(), importe: '10', cuota_total: '2', selecciones: [sel()], promo: true, promo_tipo: '' })
  assert.equal(sinTipo.ok, false)
  // Solo se guardan los datos de su tipo.
  const otra = validarFormulario({ ...valoresVacios(), importe: '10', cuota_total: '2', selecciones: [sel()], promo: true, promo_tipo: 'credito', promo_cuota_original: '1,8', promo_credito: '5' })
  assert.ok(otra.ok, JSON.stringify(otra))
  if (otra.ok) assert.deepEqual([otra.datos.promo_cuota_original, otra.datos.promo_credito], [null, null])
})

test('IA: lee la promoción sin calcular; el tipo a confirmar; la cuota original que falta, en ámbar', () => {
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      apuestaIA({ cuota_total: '2.50', ganancia_potencial: 25, promo_tipo: 'superaumento', promo_cuota_original: '2.00', promo_aumento: null, promo_credito: null }),
      apuestaIA({ cuota_total: '2.50', ganancia_potencial: 25, promo_tipo: 'aumento', promo_cuota_original: null, promo_aumento: null, promo_credito: null }),
      apuestaIA({ promo_tipo: 'asegurada', promo_cuota_original: null, promo_aumento: null, promo_credito: null }),
      apuestaIA({ estado: 'ganada', importe_cobrado: 8.5, promo_tipo: 'credito', promo_cuota_original: null, promo_aumento: null, promo_credito: null }),
      apuestaIA({ promo_tipo: null, promo_cuota_original: null, promo_aumento: null, promo_credito: null }),
    ],
  })
  const [sup, aum, ase, cre, nada] = propuestaARevisiones(p)
  assert.deepEqual([sup.valores.promo, sup.valores.promo_tipo, sup.valores.promo_cuota_original, sup.valores.promo_aumento, sup.valores.promo_base], [true, 'superaumento', '2,00', '', 'cuota_original'])
  assert.equal(sup.dudosos.promo_tipo, 'propuesta')
  assert.equal(sincronizarPromo(sup.valores).promo_aumento, '5,00', 'el aumento lo calcula el código, no la IA')
  // Aumento de ganancias: la cuota original es la única cuota de la captura (dato leído, sin marca).
  assert.deepEqual([aum.valores.promo_cuota_original, aum.valores.promo_aumento, aum.valores.promo_base], ['2,50', '', 'cuota_original'])
  assert.equal(aum.dudosos.promo_cuota_original, undefined, 'sin marca')
  assert.equal(ase.valores.promo_credito, '10,00', 'asegurada: por defecto, el importe')
  assert.equal(cre.valores.resultado_economico, '8,50', 'con crédito, el resultado es todo lo cobrado')
  assert.equal(nada.valores.promo, false)
})

test('Retomar una lectura antigua (sin campos de promoción) sigue funcionando', () => {
  const { promo_tipo, promo_cuota_original, promo_aumento, promo_credito, ...vieja } = apuestaIA()
  void [promo_tipo, promo_cuota_original, promo_aumento, promo_credito]
  const antigua = { hay_apuestas: true, motivo: null, apuestas: [vieja] }
  assert.equal(esquemaPropuestaIA.safeParse(antigua).success, false)
  const r = esquemaPropuestaIA.safeParse(completarPropuestaAntigua(antigua))
  assert.equal(r.success, true)
})

test('Hora de la apuesta: no se pide; hoy = hora actual, otro día = 12:00, al editar se conserva', () => {
  const ahora = new Date('2026-11-04T15:24:37Z') // 16:24 en Madrid
  assert.equal(fechaDeLaApuesta('2026-11-04', null, ahora), ahora.toISOString(), 'hoy → la hora actual')
  assert.equal(fechaDeLaApuesta('', null, ahora), ahora.toISOString(), 'vacío → hoy, ahora')
  assert.equal(fechaDeLaApuesta('2026-10-30', null, ahora), '2026-10-30T11:00:00.000Z', 'otro día → 12:00 de España (UTC+1)')
  assert.equal(fechaDeLaApuesta('2026-08-15', null, ahora), '2026-08-15T10:00:00.000Z', 'en verano 12:00 = 10:00 UTC')
  assert.equal(fechaDeLaApuesta('2026-12-01', null, ahora), '2026-12-01T11:00:00.000Z', 'futuro: no se bloquea')
  const original = '2026-10-30T19:47:12.000Z'
  assert.equal(fechaDeLaApuesta('2026-10-30', original, ahora), original, 'mismo día al editar → se conserva la hora guardada')
  assert.equal(fechaDeLaApuesta('2026-10-31', original, ahora), '2026-10-31T11:00:00.000Z', 'cambia el día → 12:00')
  assert.equal(fechaDeLaApuesta('31/10', null, ahora), undefined, 'formato no válido')
  // Cerca de medianoche: las 00:30 en Madrid ya son el día siguiente.
  const noche = new Date('2026-11-04T23:30:00Z')
  assert.equal(fechaDeLaApuesta('2026-11-05', null, noche), noche.toISOString())
  assert.equal(validarHora('14:32'), '14:32')
})

// ---------- IA: reintentos y errores ----------
import {
  MAX_INTENTOS,
  clasificarErrorApi,
  esTemporal,
  esperaAntesDeReintentar,
  leerRetryAfter,
  pausaLoteTrasLimite,
} from '../src/lib/apuestas/reintentos-ia.ts'

test('IA: clasifica los errores (saturada, límite, sin crédito, permanentes)', () => {
  assert.equal(clasificarErrorApi({ status: 529, tipo: 'overloaded_error' }), 'saturado')
  assert.equal(clasificarErrorApi({ status: 503 }), 'saturado')
  assert.equal(clasificarErrorApi({ status: 429, tipo: 'rate_limit_error' }), 'limite')
  assert.equal(clasificarErrorApi({ status: 429, codigoDetalle: 'enforced_spend_limit_reached' }), 'sin_credito')
  assert.equal(clasificarErrorApi({ status: 400, mensaje: 'You have reached your specified API usage limits' }), 'sin_credito')
  assert.equal(clasificarErrorApi({ status: 401 }), 'clave_invalida')
  assert.equal(clasificarErrorApi({ status: 400, mensaje: 'Could not process image' }), 'imagen_invalida')
  assert.equal(clasificarErrorApi({ esTimeout: true }), 'timeout')
  assert.equal(clasificarErrorApi({ esConexion: true }), 'conexion')
  for (const c of ['saturado', 'limite', 'timeout', 'conexion']) assert.equal(esTemporal(c), true, c)
  for (const c of ['clave_invalida', 'sin_credito', 'imagen_invalida', 'json_invalido', 'rechazo', 'desconocido']) assert.equal(esTemporal(c), false, c)
})

test('IA: 3 intentos en total, esperas de ~2 y ~5 s con azar y respetando retry-after', () => {
  assert.equal(MAX_INTENTOS, 3)
  assert.equal(esperaAntesDeReintentar({ intento: 1, azar: 0.5 }), 2000)
  assert.equal(esperaAntesDeReintentar({ intento: 1, azar: 0 }), 1500)
  assert.equal(esperaAntesDeReintentar({ intento: 1, azar: 1 }), 2500)
  assert.equal(esperaAntesDeReintentar({ intento: 2, azar: 0.5 }), 5000)
  assert.equal(esperaAntesDeReintentar({ intento: 3, azar: 0.5 }), null, 'tras el 3.º, no hay 4.º')
  assert.equal(esperaAntesDeReintentar({ intento: 1, retryAfterS: 8, azar: 0.5 }), 8000, 'retry-after manda si es mayor')
  assert.equal(esperaAntesDeReintentar({ intento: 2, retryAfterS: 1, azar: 0.5 }), 5000)
  assert.equal(esperaAntesDeReintentar({ intento: 1, retryAfterS: 120 }), null, 'si pide esperar demasiado, se avisa')
  assert.equal(leerRetryAfter('7'), 7)
  assert.equal(leerRetryAfter(null), null)
  assert.equal(leerRetryAfter('basura'), null)
  assert.equal(leerRetryAfter(new Date(Date.UTC(2026, 0, 1, 0, 0, 30)).toUTCString(), Date.UTC(2026, 0, 1)), 30)
  assert.equal(pausaLoteTrasLimite(12), 12000)
  assert.equal(pausaLoteTrasLimite(null), 10000)
  assert.equal(pausaLoteTrasLimite(300), 60000)
})

test('IA v5: el sustituto va a las notas (el pronóstico es el jugador elegido)', () => {
  const sel = { evento: 'Galatasaray SK - VfB Stuttgart', liga: null, deporte: 'Fútbol', mercado: 'Jugador - Remates a puerta', pronostico: 'Baris Yilmaz - Más de 1,5', cuota: '6.00', estado: 'perdida', evento_fecha_texto: null }
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      apuestaIA({ importe: 4.88, cuota_total: '6.00', ganancia_potencial: 29.28, estado: 'perdida', importe_cobrado: 0, selecciones: [{ ...sel, sustituto: 'Rafael Leao' }] }),
      apuestaIA({ selecciones: [{ ...sel, sustituto: null }] }),
    ],
  })
  const [con, sin] = propuestaARevisiones(p)
  assert.equal(con.valores.notas, 'Sustituto: Rafael Leao')
  assert.equal(con.valores.selecciones[0].pronostico, 'Baris Yilmaz - Más de 1,5')
  assert.equal(con.valores.resultado_economico, '-4,88')
  assert.equal(con.dudosos['selecciones.0.pronostico'], undefined, 'sin ámbar si se lee bien')
  assert.equal(sin.valores.notas, '')
  // Lecturas anteriores a la v5 (sin "sustituto") se retoman igual.
  const { sustituto, ...vieja } = { ...sel, sustituto: null }
  void sustituto
  const antigua = { hay_apuestas: true, motivo: null, apuestas: [{ ...apuestaIA(), selecciones: [vieja] }] }
  assert.equal(esquemaPropuestaIA.safeParse(completarPropuestaAntigua(antigua)).success, true)
})

// ---------- v6: fecha del evento, apuestas válidas y cola ----------
import { resolverFechaEvento } from '../src/lib/apuestas/fecha-evento.ts'
import { esApuestaValida, revisionesDeCaptura } from '../src/lib/apuestas/propuesta.ts'
import { estadoCola, marcadasPorDefecto, resumenCola, siguientePendiente, paraDescartarTodas } from '../src/lib/apuestas/cola.ts'

const SUBIDA = new Date('2026-11-04T15:00:00Z') // miércoles 4 nov 2026, 16:00 en Madrid

test('Fecha del evento: textos reales de las capturas', () => {
  assert.deepEqual(resolverFechaEvento('Dom 8 nov / 17:00', SUBIDA), { dia: '2026-11-08', hora: '17:00' }, 'domingo 8 nov = 2026, sin ámbar')
  assert.deepEqual(resolverFechaEvento('Hoy 21:00', SUBIDA), { dia: '2026-11-04', hora: '21:00', motivoDia: 'deducido', motivoHora: 'deducido' })
  assert.deepEqual(resolverFechaEvento('Mañana 18:30', SUBIDA), { dia: '2026-11-05', hora: '18:30', motivoDia: 'deducido', motivoHora: 'deducido' })
  assert.deepEqual(resolverFechaEvento('08/11 21:00', SUBIDA), { dia: '2026-11-08', hora: '21:00', motivoDia: 'deducido', motivoHora: 'deducido' }, 'sin año ni día de la semana: deducida')
  // 15 nov 2026 cae en domingo y no hay ningún sábado 15 nov en la ventana de ±6 meses → 2026,
  // en ámbar ("el día de la semana no coincide"), nunca 2025 sin aviso.
  assert.deepEqual(resolverFechaEvento('Sáb 15 nov, 9:00 PM', SUBIDA), { dia: '2026-11-15', hora: '21:00', motivoDia: 'dia_semana', motivoHora: 'dia_semana' })
  assert.deepEqual(resolverFechaEvento('21:00', SUBIDA), { dia: null, hora: null, motivoDia: 'falta_dia', motivoHora: 'falta_dia' }, 'hora suelta sin día')
})

test('Fecha del evento: año escrito, meses en español, 12 h, medianoche y formatos raros', () => {
  assert.deepEqual(resolverFechaEvento('8 de noviembre de 2026', SUBIDA), { dia: '2026-11-08', hora: null, motivoHora: 'no_visible' })
  assert.deepEqual(resolverFechaEvento('08/11/26 12:30 AM', SUBIDA), { dia: '2026-11-08', hora: '00:30' })
  assert.equal(resolverFechaEvento('Sáb 7 nov 12:00 PM', SUBIDA).hora, '12:00')
  for (const [t, m] of [['3 ene', 1], ['3 feb', 2], ['3 abr', 4], ['3 may', 5], ['3 jun', 6], ['3 jul', 7], ['3 ago', 8], ['3 sep', 9], ['3 sept', 9], ['3 oct', 10], ['3 dic', 12], ['3 marzo', 3]] as const) {
    assert.equal(Number(resolverFechaEvento(t, SUBIDA).dia?.slice(5, 7)), m, t)
  }
  assert.equal(resolverFechaEvento('Mar 10 nov 20:45', SUBIDA).dia, '2026-11-10', '«Mar» al principio es martes')
  assert.equal(resolverFechaEvento('Dom 8 nov', SUBIDA).motivoDia, undefined)
  assert.equal(resolverFechaEvento('Mié 8 nov', new Date('2026-11-04T12:00Z')).motivoDia, 'dia_semana', 'el día de la semana no cuadra')
  // Ventana ±6 meses: "Dom 9 nov" (domingo en 2025) subido el 4 nov 2026 está a casi un año → 2026, en ámbar.
  assert.deepEqual(resolverFechaEvento('Dom 9 nov', SUBIDA), { dia: '2026-11-09', hora: null, motivoDia: 'dia_semana', motivoHora: 'no_visible' })
  // Dentro de la ventana sí vale otro año: "Lun 5 ene" (lunes en 2026) subido el 20 dic 2025 → 2026, sin ámbar.
  assert.equal(resolverFechaEvento('Lun 5 ene', new Date('2025-12-20T12:00Z')).dia, '2026-01-05')
  assert.equal(resolverFechaEvento('Lun 5 ene', new Date('2025-12-20T12:00Z')).motivoDia, undefined)
  // "Hoy" a las 00:30 de Madrid (23:30 UTC del día anterior) ya es el día siguiente.
  assert.equal(resolverFechaEvento('Hoy 21:00', new Date('2026-11-04T23:30:00Z')).dia, '2026-11-05')
  assert.deepEqual(resolverFechaEvento('Próximamente', SUBIDA), { dia: null, hora: null, motivoDia: 'no_entendida', motivoHora: 'no_entendida' })
  assert.deepEqual(resolverFechaEvento(null, SUBIDA), { dia: null, hora: null, motivoDia: 'no_visible', motivoHora: 'no_visible' })
  assert.deepEqual(resolverFechaEvento('2026-11-08 21:00', SUBIDA), { dia: '2026-11-08', hora: '21:00' }, 'lecturas antiguas (ISO)')
})

test('IA v6: solo cuentan las apuestas con selección legible; los índices no cambian', () => {
  const s0 = { evento: 'Villarreal - PSG', liga: null, deporte: 'Fútbol', mercado: 'Jugador - Remates', pronostico: 'Pape Gueye - Más de 0.5', cuota: '1.57', estado: 'ganada', evento_fecha_texto: null, sustituto: null }
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [
      apuestaIA({ incompleta: true, selecciones: [] }), // cortada arriba
      apuestaIA({ importe: 10, cuota_total: '1.57', selecciones: [s0] }),
      apuestaIA({ selecciones: [{ ...s0, pronostico: '' }] }), // sin pronóstico
      apuestaIA({ incompleta: true, selecciones: [{ ...s0, pronostico: 'Resultado final: Inter de…' }] }), // texto cortado
    ],
  })
  const r = revisionesDeCaptura(p, undefined, SUBIDA)
  assert.equal(r.validas.length, 1)
  assert.equal(r.validas[0].indice, 1, 'conserva su posición en la lectura')
  assert.equal(r.ignoradas, 3)
  assert.equal(esApuestaValida(p.apuestas[1]), true)
  // La fecha completa por el campo antiguo se ignora: solo vale el texto traducido.
  const conCampoViejo = esquemaPropuestaIA.parse({
    hay_apuestas: true,
    motivo: null,
    apuestas: [apuestaIA({ selecciones: [{ ...s0, evento_fecha: '2030-01-01', evento_hora: '10:00', evento_fecha_texto: 'Dom 8 nov / 17:00' }] })],
  })
  const v = revisionesDeCaptura(conCampoViejo, undefined, SUBIDA).validas[0].revision
  assert.deepEqual([v.valores.selecciones[0].evento_fecha, v.valores.selecciones[0].evento_hora], ['2026-11-08', '17:00'])
  assert.equal(v.dudosos['selecciones.0.evento_fecha'], undefined, 'absoluta y clara: sin ámbar')
  // Hoy/Mañana: en ámbar como deducida.
  const rel = revisionesDeCaptura(
    esquemaPropuestaIA.parse({ hay_apuestas: true, motivo: null, apuestas: [apuestaIA({ selecciones: [{ ...s0, evento_fecha_texto: 'Mañana 18:30' }] })] }),
    undefined,
    SUBIDA,
  ).validas[0].revision
  assert.equal(rel.dudosos['selecciones.0.evento_fecha'], 'deducido')
  // Lecturas anteriores a la v6 (evento_fecha/evento_hora, sin "incompleta") se retoman igual.
  const antigua = {
    hay_apuestas: true,
    motivo: null,
    apuestas: [{ ...apuestaIA(), incompleta: undefined, selecciones: [{ evento: 'A - B', liga: null, deporte: 'Fútbol', mercado: '1X2', pronostico: 'A', cuota: '1.85', estado: null, evento_fecha: '2026-11-08', evento_hora: '21:00' }] }],
  }
  const ant = esquemaPropuestaIA.safeParse(completarPropuestaAntigua(JSON.parse(JSON.stringify(antigua))))
  assert.ok(ant.success)
  if (ant.success) {
    const rv = revisionesDeCaptura(ant.data, undefined, SUBIDA).validas[0].revision
    assert.deepEqual([rv.valores.selecciones[0].evento_fecha, rv.valores.selecciones[0].evento_hora], ['2026-11-08', '21:00'])
  }
})

test('Cola: estados, siguiente pendiente, resumen y marcadas por defecto', () => {
  assert.equal(estadoCola({ paso: 'lista' }), 'pendiente')
  assert.equal(estadoCola({ paso: 'lista', estado: 'guardada' }), 'guardada')
  assert.equal(estadoCola({ paso: 'leyendo' }), 'leyendo')
  assert.equal(estadoCola({ paso: 'eligiendo' }), 'eligiendo')
  assert.equal(estadoCola({ paso: 'error' }), 'error')
  const e = ['guardada', 'pendiente', 'descartada', 'pendiente'] as const
  assert.equal(siguientePendiente([...e], 1), 3)
  assert.equal(siguientePendiente([...e], 3), 1, 'si no hay después, vuelve a la primera sin terminar')
  assert.equal(siguientePendiente([...e], 3, { soloDespues: true }), null)
  assert.equal(siguientePendiente(['guardada', 'descartada'], 1), null, 'todo hecho → resumen')
  assert.deepEqual(resumenCola([...e]), { guardadas: 1, descartadas: 1, pendientes: 2 })
  assert.deepEqual(marcadasPorDefecto([{ indice: 1, yaRegistrada: false }, { indice: 4, yaRegistrada: true }, { indice: 5, yaRegistrada: false }]), [1, 5])
})

// ---------- Retoques del registro 2: promociones ----------

test('Aumento de ganancias (tus capturas): aumento = ganancias (retorno total) − importe × cuota original', () => {
  // 10 € a 3,20 con «Ganancias» 38,60 → sin promoción 32,00 → aumento 6,60.
  const c = calcularAumento({ tipo: 'aumento', importe: 1000, cuotaTotal: 3.2, gananciaPotencial: 3860, cuotaOriginal: 3.2, aumento: null, base: 'cuota_original' })
  assert.equal(c.aumento, 660)
  assert.equal(calcularAumento({ tipo: 'aumento', importe: 1500, cuotaTotal: 2.5, gananciaPotencial: 4313, cuotaOriginal: 2.5, aumento: null, base: 'cuota_original' }).aumento, 563)
  // Superaumento: 10 €, original 2,30 (tachada), ganancias 28,75 → aumento 5,75.
  assert.equal(calcularAumento({ tipo: 'superaumento', importe: 1000, cuotaTotal: 2.875, gananciaPotencial: 2875, cuotaOriginal: 2.3, aumento: null, base: 'cuota_original' }).aumento, 575)
})

test('Aumento de ganancias SIN ganancias en la captura: el aumento queda vacío y «falta» (nunca 0)', () => {
  const c = calcularAumento({ tipo: 'aumento', importe: 1000, cuotaTotal: 3.2, gananciaPotencial: null, cuotaOriginal: 3.2, aumento: null, base: 'cuota_original' })
  assert.equal(c.aumento, null)
  assert.equal(c.faltaAumento, true)
  const v = sincronizarPromo({ ...valoresVacios(), importe: '10', cuota_total: '3,2', selecciones: [sel()], promo: true, promo_tipo: 'aumento', promo_cuota_original: '3,20', promo_base: 'cuota_original' })
  assert.equal(v.promo_aumento, '')
  // En un superaumento la cuota mostrada ya lleva la mejora: sin ganancias se calcula con ella.
  assert.equal(calcularAumento({ tipo: 'superaumento', importe: 1000, cuotaTotal: 2.875, gananciaPotencial: null, cuotaOriginal: 2.3, aumento: null }).aumento, 575)
})

test('IA: superaumento sin cuota tachada → cuota original vacía (en ámbar «falta»), nunca un valor por defecto', () => {
  const p = esquemaPropuestaIA.parse({ hay_apuestas: true, motivo: null, apuestas: [apuestaIA({ cuota_total: '2.87', ganancia_potencial: 28.7, promo_tipo: 'superaumento', promo_cuota_original: null, promo_aumento: null, promo_credito: null })] })
  const [r] = propuestaARevisiones(p)
  assert.equal(r.valores.promo_cuota_original, '')
  assert.ok(!/1[.,]80/.test(JSON.stringify(r.valores)), 'ningún 1,80')
  const c = calcularAumento({ tipo: 'superaumento', importe: 1000, cuotaTotal: 2.87, gananciaPotencial: 2870, cuotaOriginal: null, aumento: null })
  assert.equal(c.falta, true)
})

test('Borrar «Cuota original» o «Aumento» deja vacío SOLO ese campo: el otro no se recalcula', () => {
  const lleno = sincronizarPromo({ ...valoresVacios(), importe: '10', cuota_total: '2,875', ganancia_potencial: '28,75', selecciones: [sel()], promo: true, promo_tipo: 'superaumento', promo_cuota_original: '2,30', promo_base: 'cuota_original' })
  assert.equal(lleno.promo_aumento, '5,75')
  // Con la tecla de borrar en el móvil: "3,20" → "3,2" → "3," (aún no es un número) → "3" → "".
  let m = sincronizarPromo({ ...valoresVacios(), importe: '10,00', cuota_total: '3,20', ganancia_potencial: '38,60', selecciones: [sel()], promo: true, promo_tipo: 'aumento', promo_cuota_original: '3,20', promo_base: 'cuota_original' })
  for (const t of ['3,2', '3,', '3', '']) {
    m = sincronizarPromo({ ...m, promo_cuota_original: t, promo_base: t ? 'cuota_original' : '' })
    assert.equal(m.promo_cuota_original, t, `tras borrar queda «${t}» (nunca vuelve el valor anterior)`)
  }
  // Borrar la cuota original letra a letra hasta vaciarla (como en el móvil).
  let v = lleno
  for (const t of ['2,3', '2,', '2', '']) v = sincronizarPromo({ ...v, promo_cuota_original: t, promo_base: t ? 'cuota_original' : '' })
  assert.equal(v.promo_cuota_original, '', 'se queda vacío (antes volvía a aparecer el valor)')
  const aumentoAntes = v.promo_aumento
  assert.equal(sincronizarPromo(v).promo_aumento, aumentoAntes, 'vacío: el aumento ya no se recalcula')
  // Borrarla de golpe: el aumento se queda exactamente como estaba.
  const g = sincronizarPromo({ ...lleno, promo_cuota_original: '', promo_base: '' })
  assert.deepEqual([g.promo_cuota_original, g.promo_aumento], ['', '5,75'])
  // Borrar el aumento: la cuota original se queda como estaba.
  const w = sincronizarPromo({ ...lleno, promo_aumento: '', promo_base: '' })
  assert.deepEqual([w.promo_cuota_original, w.promo_aumento], ['2,30', ''])
  // Al volver a escribir un valor, sí se recalcula el otro.
  assert.equal(sincronizarPromo({ ...w, promo_aumento: '6', promo_base: 'aumento' }).promo_cuota_original, '2,275')
})

// ---------- IA v8: qué es y qué no es promoción ----------

test('IA v8: las promociones reales siguen en las instrucciones (no se pierden)', () => {
  for (const t of ['Aumento de ganancias', 'Superaumento', 'Cuota mejorada', 'Apuesta gratuita', 'Free bet', 'Apuesta con crédito', 'Reembolso', 'Apuesta sin riesgo', 'Apuesta asegurada'])
    assert.ok(REGLAS_PROMOCION.includes(t), t)
  for (const t of SI_PROMOCION) assert.ok(!NO_PROMOCION.some((n) => n.toLowerCase() === t.toLowerCase()), t)
  assert.match(REGLAS_PROMOCION, /"superaumento"/)
  assert.match(REGLAS_PROMOCION, /"aumento"/)
  assert.match(REGLAS_PROMOCION, /"asegurada": [^\n]*Apuesta sin riesgo/)
  assert.match(REGLAS_PROMOCION, /"credito": [^\n]*Apuesta gratuita/)
})

test('IA v8: «goles de ventaja», «pago anticipado» y «sustituto» NO son promoción; «otra» solo con promoción, bono u oferta', () => {
  for (const t of ['2 goles de ventaja', 'Pago anticipado', 'Sustituto']) assert.ok(REGLAS_PROMOCION.includes(`"${t}"`), t)
  assert.match(REGLAS_PROMOCION, /NO son promociones/)
  assert.match(REGLAS_PROMOCION, /"Pago anticipado - 2 goles de ventaja" en verde → promo_tipo null/)
  assert.match(REGLAS_PROMOCION, /"otra": SOLO si la captura usa expresamente la palabra "promoción", "bono" u "oferta"/)
  assert.match(REGLAS_PROMOCION, /no la deduzcas ni pongas ningún valor por defecto/)
})

test('IA v8: una lectura sin promoción (goles de ventaja) no marca la apuesta como promoción', () => {
  const p = esquemaPropuestaIA.parse({
    hay_apuestas: true, motivo: null,
    apuestas: [apuestaIA({ promo_tipo: null, promo_cuota_original: null, promo_aumento: null, promo_credito: null })],
  })
  const [r] = propuestaARevisiones(p)
  assert.equal(r.valores.promo, false)
  assert.deepEqual([r.valores.promo_tipo, r.valores.promo_cuota_original, r.valores.promo_aumento], ['', '', ''])
})

// ---------- Descartar todas (cola de revisión) ----------

test('«Descartar todas»: solo las sin guardar (pendientes, fallidas y por elegir); guardadas y descartadas no se tocan', () => {
  const items = [
    { clave: 'a', paso: 'lista', estado: 'guardada', indice: 0 },
    { clave: 'b', paso: 'lista', estado: 'pendiente', indice: 1 },
    { clave: 'c', paso: 'manual', indice: 0 },
    { clave: 'd', paso: 'error' },
    { clave: 'e', paso: 'eligiendo', opciones: [{ indice: 0 }, { indice: 2 }] },
    { clave: 'f', paso: 'lista', estado: 'descartada', indice: 3 },
  ]
  const r = paraDescartarTodas(items)
  assert.deepEqual(r.lista.map((x) => x.clave), ['b', 'c', 'd', 'e'])
  assert.deepEqual(r.lista.find((x) => x.clave === 'e')?.indices, [0, 2])
  assert.equal(r.apuestas, 5)
  assert.equal(r.leyendo, false)
  assert.equal(paraDescartarTodas([...items, { clave: 'g', paso: 'leyendo' }]).leyendo, true, 'con una captura leyéndose, se avisa')
  assert.equal(paraDescartarTodas([{ clave: 'a', paso: 'lista', estado: 'guardada' }]).apuestas, 0)
})
