// Prueba de punta a punta EN LOCAL, con el simulador (sin internet, sin datos reales):
// arranca el simulador, compila y arranca la app, y la usa con un navegador
// automático en tamaño móvil, como lo harías tú. Guarda capturas de pantalla en
// .prueba-local/ para poder verlas.
//
// Uso:  npm run probar:local

import { spawn, execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Playwright viene preinstalado en el sistema (no es dependencia del proyecto).
const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = join(import.meta.dirname, '..')
const SALIDA = join(ROOT, '.prueba-local')
const APP = 'http://localhost:3100'
const ANA = { id: '00000000-0000-4000-8000-00000000000a', email: 'ana@prueba.local' }
const BETO = { id: '00000000-0000-4000-8000-00000000000b', email: 'beto@prueba.local' }

rmSync(SALIDA, { recursive: true, force: true })
mkdirSync(SALIDA, { recursive: true })

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulador',
  ANTHROPIC_API_KEY: 'sk-ant-simulador',
  ANTHROPIC_BASE_URL: 'http://localhost:54322',
  API_FOOTBALL_KEY: 'clave-api-futbol-simulada', // API-Football simulada (solo en local)
  API_FOOTBALL_BASE_URL: 'http://localhost:54323',
  FILOVERDE_MARGEN_CAPTURAS_MIN: '0', // en la prueba no hace falta esperar 2 horas para reintentar
  PORT: '3100',
}

const procesos = []
function arrancar(cmd, args, listo) {
  return new Promise((ok, mal) => {
    const p = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    procesos.push(p)
    const ver = (d) => {
      const t = d.toString()
      if (process.env.VERBOSE || /error|⨯|\[ia:|\[capturas|\[apuestas|\[exportar/i.test(t)) process.stdout.write(`   │ ${t}`)
      if (listo.test(t)) ok(p)
    }
    p.stdout.on('data', ver)
    p.stderr.on('data', ver)
    p.on('exit', (c) => mal(new Error(`${cmd} terminó (${c})`)))
  })
}
const cerrar = () =>
  procesos.forEach((p) => {
    try {
      process.kill(-p.pid) // todo el grupo (npx arranca otros procesos)
    } catch {}
  })
process.on('exit', cerrar)
let paginaActual = null
process.on('uncaughtException', async (e) => {
  console.error(e)
  await paginaActual?.screenshot({ path: join(SALIDA, 'FALLO.png'), fullPage: true }).catch(() => {})
  console.error(`Pantalla en el momento del fallo: .prueba-local/FALLO.png (${paginaActual?.url()})`)
  cerrar()
  process.exit(1)
})

const paso = (t) => console.log(`\n▶ ${t}`)
const bien = (t) => console.log(`  ✅ ${t}`)

// ---------- arrancar ----------
paso('Arrancando simulador y compilando la app (1–2 min)…')
await arrancar('node', ['scripts/simulador.mjs'], /Simulador listo/)
execSync('npx next build', { cwd: ROOT, env, stdio: 'ignore' })
await arrancar('npx', ['next', 'start', '-p', '3100'], /Ready in/)
bien('App en marcha en ' + APP)

const cola = (lista) => fetch('http://localhost:54322/__cola', { method: 'POST', body: JSON.stringify(lista) })

function cookieSesion(u) {
  const b64url = (s) => Buffer.from(s).toString('base64url')
  const ahora = Math.floor(Date.now() / 1000)
  // Mismo token que firma el simulador (HS256 con su secreto).
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const carga = b64url(JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: ahora, exp: ahora + 86400 }))
  const token = `${cab}.${carga}.${createHmac('sha256', 'secreto-solo-local').update(`${cab}.${carga}`).digest('base64url')}`
  const sesion = {
    access_token: token, refresh_token: 'simulado', token_type: 'bearer', expires_in: 86400, expires_at: ahora + 86400,
    user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  }
  return { name: 'sb-localhost-auth-token', value: `base64-${b64url(JSON.stringify(sesion))}`, domain: 'localhost', path: '/' }
}

const navegador = await chromium.launch()
const movil = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' }

// ---------- imágenes de prueba (resguardos falsos dibujados en el navegador) ----------
paso('Generando capturas de prueba')
const generador = await navegador.newPage({ viewport: { width: 1170, height: 2532 } })
async function resguardo(nombre, texto, { ancho = 1170, alto = 2532 } = {}) {
  await generador.setViewportSize({ width: ancho, height: alto })
  await generador.setContent(
    `<body style="margin:0;font:48px sans-serif;background:#0b3d2e;color:#fff;padding:60px"><h1>${texto.titulo}</h1>${texto.lineas
      .map((l) => `<p>${l}</p>`)
      .join('')}</body>`,
  )
  const ruta = join(SALIDA, nombre)
  await generador.screenshot({ path: ruta })
  return ruta
}
const capCombinada = await resguardo('cap-combinada.png', { titulo: 'Codere · Combinada', lineas: ['Valencia - Villarreal: Empate 6/4', 'Athletic - Osasuna 2.00', 'Importe 5 €'] })
const capResuelta = await resguardo('cap-resuelta.png', { titulo: 'Bet365 · GANADA', lineas: ['Getafe - Girona: Girona 2.10', 'Cobrado 42 €'] }, { ancho: 3000, alto: 5000 })
const capPerro = await resguardo('cap-perro.png', { titulo: '🐶', lineas: ['Esto no es una apuesta'] })
const capSimple = await resguardo('cap-simple.png', { titulo: 'Bet365 · Simple', lineas: ['Betis - Sevilla: Betis 1.85', '10 €'] })
await generador.close()
bien('4 capturas (una de 3000×5000 px para probar la reducción)')

// ---------- Ana ----------
const ctxAna = await navegador.newContext(movil)
await ctxAna.addCookies([cookieSesion(ANA)])
const pag = await ctxAna.newPage()
paginaActual = pag
const foto = async (n) => pag.screenshot({ path: join(SALIDA, `${n}.png`), fullPage: true })
const erroresConsola = []
pag.on('pageerror', (e) => erroresConsola.push(e.message))

// Subir capturas. Desde el 2026-11-09 hay "Casa de esta tanda" (preseleccionada la última casa
// usada): las pruebas generales usan "Que la detecte la IA" (el comportamiento de antes) salvo que
// se pida una casa.
async function subirArchivos(archivos, casa = 'Que la detecte la IA') {
  const selector = pag.getByLabel('Casa de esta tanda')
  await selector.waitFor({ timeout: 15000 })
  await selector.selectOption({ label: casa })
  await pag.locator('input[type=file][multiple]').setInputFiles(archivos)
}
paso('Lista vacía')
await pag.goto(`${APP}/apuestas`)
await pag.getByText('Aún no hay apuestas').waitFor()
await foto('01-lista-vacia')
bien('Muestra la lista vacía')

paso('Lote de 3 capturas: combinada + ya resuelta + no es apuesta')
await cola(['combinada', 'resuelta', 'no_apuesta'])
await pag.getByRole('link', { name: '+ Nueva' }).click()
await pag.getByText('Elegir de la galería').waitFor()
await foto('02-nueva')
await subirArchivos([capCombinada, capResuelta, capPerro])
await pag.getByText('Apuesta 1 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
await pag.waitForTimeout(500)
await foto('03-revision-combinada')

// Comprobaciones de la combinada
const valor = (etiqueta, n = 0) => pag.getByLabel(etiqueta, { exact: true }).nth(n).inputValue()
// Hora con dos desplegables (hora y minuto): "HH:MM" o '' (sin hora).
const leerHora = async (p, etiqueta = 'Hora', minuto = 'Minuto', n = 0) => {
  const h = await p.getByLabel(etiqueta, { exact: true }).nth(n).inputValue()
  const m = await p.getByLabel(minuto, { exact: true }).nth(n).inputValue()
  return h ? `${h}:${m}` : ''
}
const ponerHora = async (p, hhmm, etiqueta = 'Hora', minuto = 'Minuto', n = 0) => {
  const [h, m] = hhmm ? hhmm.split(':') : ['', '']
  await p.getByLabel(etiqueta, { exact: true }).nth(n).selectOption(h)
  if (h) await p.getByLabel(minuto, { exact: true }).nth(n).selectOption(m)
}
// --- Detalle: panel "Estado y resultado" + "Editar apuesta" ---
const esperarDetalle = () => pag.getByRole('button', { name: /^Editar apuesta/ }).waitFor()
const abrir = async (texto, cual = 'first') => {
  await pag.getByText(texto).filter({ visible: true })[cual]().click()
  await esperarDetalle()
}
const editar = async () => {
  const b = pag.getByRole('button', { name: /^Editar apuesta/ })
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click()
  await pag.getByRole('button', { name: 'Guardar cambios' }).waitFor()
}
const marcarEstado = async (e) => {
  if (e === 'ganada' || e === 'perdida') await pag.getByRole('button', { name: e === 'ganada' ? 'Ganada' : 'Perdida', exact: true }).click()
  else await pag.getByLabel('Otro estado').selectOption(e)
}
const estadoDetalle = async () => {
  if (await pag.getByRole('button', { name: '✓ Ganada', exact: true }).count()) return 'ganada'
  if (await pag.getByRole('button', { name: '✓ Perdida', exact: true }).count()) return 'perdida'
  return pag.getByLabel('Otro estado').inputValue()
}
// Guardar en la revisión o en el registro a mano. Si salta el aviso de duplicada (las pruebas
// generales repiten capturas a propósito), se elige "Incluir de nuevo".
const guardarRevision = async (nombre = 'Guardar') => {
  await pag.getByRole('button', { name: nombre, exact: true }).click()
  const elegir = pag.getByText('Elige Descartar o Incluir de nuevo.')
  if (await elegir.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    await pag.getByRole('alertdialog', { name: 'Apuesta duplicada' }).getByRole('button', { name: 'Incluir de nuevo' }).click()
  }
  // La última de una cola de varias: resumen con «Terminar» (las capturas se borran ahí).
  if (nombre === 'Guardar') await terminarSiResumen()
}
const terminarSiResumen = async () => {
  const terminar = pag.getByRole('button', { name: 'Terminar', exact: true })
  const fin = await Promise.race([
    pag.waitForURL((u) => u.pathname === '/apuestas', { timeout: 30000 }).then(() => 'lista'),
    terminar.waitFor({ timeout: 30000 }).then(() => 'resumen'),
  ]).catch(() => null)
  if (fin === 'resumen') await terminar.click()
}
// Captura con varias apuestas válidas: «¿Cuáles quieres guardar?» → todas.
const elegirTodas = async () => {
  await pag.getByRole('button', { name: 'Seleccionar todas' }).waitFor({ timeout: 30000 })
  await pag.getByRole('button', { name: 'Seleccionar todas' }).click()
  await pag.getByRole('button', { name: /^Revisar \d+ apuestas?$/ }).click()
}
let ultimoDetalle = null
// Guardar en el detalle (panel o "Editar") → vuelve a la lista con el aviso "Apuesta guardada".
const guardarYVolver = async (boton = 'Guardar') => {
  ultimoDetalle = pag.url()
  await pag.getByRole('button', { name: boton, exact: true }).click()
  await pag.waitForURL((u) => u.pathname === '/apuestas')
  await pag.getByRole('status').filter({ hasText: 'Apuesta guardada' }).waitFor()
}
const guardarPanel = () => guardarYVolver('Guardar')
// Volver a abrir el detalle que se acaba de guardar (o recargarlo si seguimos en él).
const recargarDetalle = async () => {
  if (/\/apuestas\/[0-9a-f-]{36}/.test(new URL(pag.url()).pathname)) await pag.reload()
  else await pag.goto(ultimoDetalle)
  await esperarDetalle()
}
const sinCaptura = async () => assert.equal(await pag.getByRole('img', { name: 'Captura de la apuesta' }).count(), 0, 'sin captura en el detalle')
const esperar = async (cond, ms = 8000) => {
  for (const fin = Date.now() + ms; Date.now() < fin; await new Promise((r) => setTimeout(r, 200))) if (await cond()) return true
  return false
}
assert.equal(await valor('Importe (€)'), '5,00')
assert.equal(await valor('Cuota total'), '5,50', '+450 americana → 5,50')
assert.equal(await valor('Cuota', 0), '2,50', '6/4 fraccionaria → 2,50')
assert.equal(await valor('Cuota', 1), '2,00')
assert.ok(await pag.getByText('revisar').count() >= 2, 'campos dudosos resaltados')
bien('Combinada rellenada: cuotas americana y fraccionaria pasadas a decimal; dudosos marcados')
assert.ok(await pag.getByText(/no coincide con el producto/).isVisible(), 'aviso de coherencia')
bien('Aviso (sin bloquear): la cuota total no es el producto de las selecciones')

// Crear la casa sugerida por la IA y corregir un dato
await pag.getByRole('button', { name: /La IA ha leído «Codere»/ }).click()
await pag.waitForFunction(() => [...document.querySelectorAll('select')].some((s) => s.selectedOptions[0]?.textContent === 'Codere'))
bien('Casa «Codere» creada sobre la marcha y elegida')
await pag.getByLabel(/^Mercado/).nth(1).fill('1X2')
await pag.getByLabel('Cuota total', { exact: true }).fill('5')
await guardarRevision('Guardar y seguir')

await pag.getByText('Apuesta 2 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
await pag.waitForTimeout(300)
await foto('04-revision-resuelta')
assert.equal(await pag.getByLabel('Estado de la apuesta').inputValue(), 'ganada')
assert.equal(await valor('Resultado económico (€)'), '22,00')
bien('Apuesta ya resuelta: propone «Ganada» y resultado +22,00 €')
await guardarRevision('Guardar y seguir')

await pag.getByText('Apuesta 3 de 3').waitFor()
await pag.getByText(/no parece una apuesta/).waitFor({ timeout: 30000 })
await foto('05-no-es-apuesta')
bien('Imagen que no es apuesta: lo dice sin romperse (con Reintentar / Rellenar a mano / Descartar)')
await pag.getByRole('button', { name: 'Descartar esta captura' }).click()
await pag.getByText('Has guardado 2 apuestas, descartado 1').waitFor()
await pag.getByRole('button', { name: 'Terminar', exact: true }).click()
await pag.waitForURL(`${APP}/apuestas`)
await pag.getByText('Codere · Combinada (2)').waitFor()
await foto('06-lista-con-2')
assert.equal(await pag.locator('main ul li').count(), 2)
bien('Lista con las 2 guardadas, la más reciente primero')

paso('Fallo de la IA → reintentar')
await cola(['error500', 'error500', 'error500', 'simple'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByText(/saturada/).first().waitFor({ timeout: 60000 })
await pag.getByText('Pendiente de reintentar', { exact: true }).waitFor({ timeout: 60000 })
await foto('07-error-ia')
bien('Mensaje claro en español; la imagen sigue visible')
await pag.getByRole('button', { name: 'Reintentar' }).click()
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
bien('Reintento correcto')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)

paso('JSON inválido de la IA → rellenar a mano sin perder la imagen')
await cola(['json_malo', 'json_malo'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByText(/datos que no se entienden/).waitFor({ timeout: 30000 })
await pag.getByRole('button', { name: 'Rellenar a mano' }).click()
await pag.getByRole('img', { name: 'Captura de la apuesta' }).waitFor()
bien('Formulario vacío con la captura encima para copiarla')
await pag.getByRole('button', { name: 'Descartar esta captura' }).click()
await pag.waitForURL(`${APP}/apuestas`)

paso('Detalle: cambiar estado (ganada, cash out, media ganada) y ver el resultado')
await abrir('Real Betis - Sevilla FC')
await sinCaptura()
assert.equal(await pag.getByText('¿Qué selecciones fallaron?').count(), 0)
await marcarEstado('perdida')
assert.equal(await valor('Resultado económico (€)'), '-10,00')
assert.equal(await pag.getByText('¿Qué selecciones fallaron?').count(), 0, 'en simples no aparece')
await marcarEstado('media_ganada')
assert.equal(await valor('Resultado económico (€)'), '4,25')
await marcarEstado('cash_out')
await pag.getByLabel('Importe recuperado con el cash out (€)').fill('14,30')
assert.equal(await valor('Resultado económico (€)'), '4,30')
await marcarEstado('ganada')
assert.equal(await pag.getByRole('button', { name: '✓ Ganada' }).count(), 1)
assert.equal(await valor('Resultado económico (€)'), '8,50')
await pag.getByLabel('Resultado económico (€)').fill('8,40')
bien('Panel: Perdida −10 · Media ganada +4,25 · Cash out (14,30 recuperados) +4,30 · Ganada +8,50 · corregible a mano')
await foto('08-panel-resultado')
await guardarPanel()
await recargarDetalle()
assert.equal(await estadoDetalle(), 'ganada')
assert.equal(await valor('Resultado económico (€)'), '8,40')
bien('Al recargar sigue ahí (ganada, +8,40 corregido a mano), sin captura')

paso('Resultado escrito a mano: avisa antes de pisarlo al cambiar el estado')
await marcarEstado('perdida')
await pag.getByRole('alertdialog', { name: 'Cambiar el estado' }).waitFor()
await foto('09-aviso-resultado-manual')
await pag.getByRole('button', { name: 'Cancelar (no cambiar el estado)' }).click()
assert.equal(await estadoDetalle(), 'ganada')
assert.equal(await valor('Resultado económico (€)'), '8,40')
await marcarEstado('media_ganada')
await pag.getByRole('alertdialog', { name: 'Cambiar el estado' }).getByRole('button', { name: 'Mantener el mío' }).click()
assert.equal(await estadoDetalle(), 'media_ganada')
assert.equal(await valor('Resultado económico (€)'), '8,40')
await marcarEstado('ganada')
await pag.getByRole('alertdialog', { name: 'Cambiar el estado' }).getByRole('button', { name: 'Recalcular', exact: true }).click()
assert.equal(await valor('Resultado económico (€)'), '8,50')
bien('Avisa; «Cancelar» no cambia nada, «Mantener el mío» conserva 8,40 y «Recalcular» pone 8,50')

paso('«Editar apuesta»: formulario completo sin captura; cambiar el importe de una resuelta avisa antes de recalcular')
await recargarDetalle()
await editar()
await sinCaptura()
for (const e of ['Casa de apuestas', 'Importe (€)', 'Cuota', 'Evento', 'Deporte', 'Liga', 'Día del evento', 'Hora', 'Notas']) {
  assert.ok((await pag.getByLabel(e, { exact: true }).count()) >= 1, e)
}
assert.equal(await pag.getByRole('checkbox', { name: 'En directo', exact: true }).count(), 1)
await pag.getByLabel('Importe (€)').fill('20')
await pag.getByRole('alertdialog', { name: 'Recalcular el resultado' }).waitFor()
await foto('10-editar-aviso-importe')
assert.equal(await valor('Resultado económico (€)'), '8,40', 'no recalcula sin preguntar')
await pag.getByRole('alertdialog', { name: 'Recalcular el resultado' }).getByRole('button', { name: 'Recalcular', exact: true }).click()
assert.equal(await valor('Resultado económico (€)'), '-1,50', 'ganancia potencial 18,50 − importe 20')
bien('Formulario completo sin captura; al cambiar el importe pregunta y, al aceptar, recalcula (18,50 − 20 = −1,50 €)')
await recargarDetalle()

paso('Filtros por estado y casa')
await pag.goto(`${APP}/apuestas`)
await pag.getByLabel('Filtrar por estado').selectOption('ganada')
await pag.waitForURL(/estado=ganada/)
await pag.waitForTimeout(500)
assert.equal(await pag.locator('main ul li').count(), 2)
await pag.getByLabel('Filtrar por estado').selectOption('pendiente')
await pag.waitForURL(/estado=pendiente/)
await pag.getByText('Codere · Combinada (2)').waitFor()
assert.equal(await pag.locator('main ul li').count(), 1)
bien('Filtro por estado funciona')
await pag.goto(`${APP}/apuestas`)

paso('Registro a mano y borrar')
await pag.goto(`${APP}/apuestas/nueva?manual=1`)
await pag.getByLabel('Importe (€)').fill('3')
await pag.getByLabel('Evento', { exact: true }).fill('Partido manual')
await guardarRevision('Guardar')
await pag.getByText('Elige el deporte.').waitFor()
bien('A mano: sin deporte no deja guardar («Elige el deporte.»)')
await pag.getByLabel('Deporte', { exact: true }).selectOption('Fútbol')
await pag.getByLabel('Cuota', { exact: true }).fill('+150') // en la simple, la única cuota
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await abrir('Partido manual')
await editar()
assert.equal(await valor('Cuota'), '2,50')
bien('Apuesta manual creada (cuota +150 guardada como 2,50)')
await pag.getByRole('button', { name: 'Borrar apuesta' }).click()
await foto('09b-confirmar-borrado')
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.waitForURL(`${APP}/apuestas`)
assert.ok(await esperar(async () => (await pag.getByText('Partido manual').filter({ visible: true }).count()) === 0))
bien('Borrada (con confirmación)')

// ======================= AJUSTES TRAS LA PRIMERA PRUEBA REAL =======================
const lecturasEsteMes = async () => {
  await pag.goto(`${APP}/ajustes`)
  const t = await pag.getByText(/lecturas?$/).first().textContent()
  return Number(/(\d+) lecturas?/.exec(t)[1])
}
const archivos = async () => (await fetch('http://localhost:54322/__archivos')).json()
const nLlamadas = async () => (await (await fetch('http://localhost:54322/__llamadas')).json()).length
const capMismo = await (async () => {
  const g = await navegador.newPage({ viewport: { width: 1170, height: 2532 } })
  await g.setContent('<body style="margin:0;font:48px sans-serif;background:#123;color:#fff;padding:60px"><h1>Crear apuesta</h1><p>Real Madrid - FC Barcelona</p><p>Resultado: Real Madrid · Ambos marcan: Sí · Tarjetas +4.5</p><p>Cuota 5.50 · 10 €</p></body>')
  const r = join(SALIDA, 'cap-mismo-partido.png')
  await g.screenshot({ path: r })
  await g.close()
  return r
})()

paso('«Crear apuesta / Mismo partido»: una cuota total, condiciones sin cuota, sin ámbar si se lee bien')
await cola(['mismo_partido'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capMismo])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await pag.waitForTimeout(300)
await foto('11-mismo-partido')
assert.equal(await pag.getByRole('button', { name: 'Crear apuesta / Mismo partido' }).getAttribute('aria-pressed'), 'true')
assert.equal(await pag.getByLabel('Cuota', { exact: true }).count(), 0, 'sin cuota por condición')
assert.equal(await valor('Cuota total'), '5,50')
assert.equal(await pag.getByText(/^Condición \d$/).count(), 3)
assert.equal(await pag.getByText('revisar').count(), 0, 'nada en ámbar: todo se leía bien')
assert.equal(await leerHora(pag), '21:00')
assert.equal(await pag.getByText(/no coincide con el producto/).count(), 0)
bien('Tipo mismo partido, cuota total 5,50, 3 condiciones sin cuota, fecha/hora del partido, ningún ámbar')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)

paso('Mismo partido perdida → elijo qué condiciones fallaron; ganada → todas en verde')
await abrir(/Mismo partido \(3\)/)
await marcarEstado('perdida')
await pag.getByText('¿Qué selecciones fallaron?').waitFor()
await pag.getByText('La apuesta está perdida pero ninguna selección está marcada como fallada.').waitFor()
bien('Sin ninguna fallada: aviso que no bloquea')
await pag.getByRole('button', { name: /Tarjetas · Más de 4.5/ }).click()
assert.equal(await pag.getByText(/ninguna selección está marcada/).count(), 0)
await foto('12-perdida-elegir-falladas')
await guardarPanel()
await recargarDetalle()
await editar()
const estadosCond = async () =>
  Promise.all([0, 1, 2].map((i) => pag.getByLabel('Estado de la condición').nth(i).inputValue()))
assert.deepEqual(await estadosCond(), ['pendiente', 'pendiente', 'perdida'])
assert.equal(await valor('Resultado económico (€)'), '-10,00')
bien('Guardada como perdida con la 3.ª condición en rojo (−10,00 €)')
await marcarEstado('ganada')
assert.deepEqual(await estadosCond(), ['ganada', 'ganada', 'ganada'])
assert.equal(await valor('Resultado económico (€)'), '45,00')
bien('Al marcar ganada, todas las condiciones pasan a verde (+45,00 €)')

paso('Cambio de tipo: simple ↔ combinada, y de combinada de 3 a simple pregunta cuál conservar')
await cola(['simple'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
assert.equal(await pag.getByLabel('Estado de la selección').count(), 1)
await pag.getByRole('button', { name: 'Combinada', exact: true }).click()
await pag.getByText('Una apuesta «Combinada» necesita al menos 2 selecciones.').count()
assert.equal(await pag.getByLabel('Estado de la selección').count(), 2, 'añade una selección vacía hasta el mínimo')
assert.equal(await valor('Cuota', 0), '1,85', 'la cuota de la simple pasa a su selección')
await guardarRevision('Guardar')
await pag.getByText(/Escribe al menos el evento/).waitFor()
bien('Pasar a combinada añade la 2.ª selección y pide rellenarla')
await pag.getByLabel('Evento', { exact: true }).nth(1).fill('Celta - Alavés')
await pag.getByLabel('Cuota', { exact: true }).nth(1).fill('2,00')
await pag.getByRole('button', { name: '+ Añadir selección' }).click()
await pag.getByLabel('Evento', { exact: true }).nth(2).fill('Mallorca - Elche')
await pag.getByLabel('Cuota', { exact: true }).nth(2).fill('1,50')
await pag.getByRole('button', { name: 'Simple', exact: true }).click()
await pag.getByText('¿Cuál conservas?').waitFor()
await foto('13-cambio-tipo-elegir')
await pag.getByRole('button', { name: 'Cancelar', exact: true }).click()
assert.equal(await pag.getByLabel('Estado de la selección').count(), 3, 'cancelar no cambia nada')
await pag.getByRole('button', { name: 'Simple', exact: true }).click()
await pag.getByRole('radio', { name: /Celta - Alavés/ }).check()
await pag.getByRole('button', { name: 'Conservar esta' }).click()
assert.equal(await pag.getByLabel('Estado de la selección').count(), 1)
assert.equal(await pag.getByLabel('Evento', { exact: true }).inputValue(), 'Celta - Alavés')
assert.equal(await valor('Cuota'), '2,00', 'la cuota pasa a ser la de la selección conservada')
bien('De combinada de 3 a simple: pregunta cuál conservar (Cancelar no toca nada) y conserva la elegida')
await pag.getByRole('button', { name: 'Descartar esta captura' }).click()
await pag.waitForURL(`${APP}/apuestas`)

paso('Captura con DOS apuestas: aviso, revisión una tras otra, misma imagen, una sola lectura')
const lecturasAntes = await lecturasEsteMes()
const llamadasAntes = await nLlamadas()
await cola(['dos_apuestas'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByText('He encontrado 2 apuestas en esta captura. ¿Cuáles quieres guardar?').waitFor({ timeout: 30000 })
await foto('14-elegir-apuestas')
await elegirTodas()
await pag.getByText('Apuesta 1 de 2').waitFor()
await foto('14-dos-apuestas')
const srcImagen1 = await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')
const rutaDos = decodeURIComponent(srcImagen1.split('ruta=')[1])
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 2 de 2').waitFor()
await new Promise((r) => setTimeout(r, 800))
assert.ok((await archivos()).includes(`capturas/${rutaDos}`), 'tras guardar la 1.ª, la captura sigue (falta la 2.ª)')
const srcImagen2 = await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')
assert.equal(srcImagen1, srcImagen2, 'las dos usan la misma captura')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await nLlamadas(), llamadasAntes + 1, 'una sola llamada a la IA')
assert.equal(await lecturasEsteMes(), lecturasAntes + 1, 'cuenta como una sola lectura en Ajustes')
bien('2 apuestas guardadas con la misma captura; en Ajustes cuenta como 1 lectura')
assert.ok(await esperar(async () => !(await archivos()).includes(`capturas/${rutaDos}`)), 'al guardar la 2.ª, la captura se borra')
bien('La captura sigue mientras queda la 2.ª por revisar y se borra al guardar la última')
await pag.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
await abrir('Real Betis - Sevilla FC')
await sinCaptura()
await editar()
await sinCaptura()
bien('El detalle y la edición no muestran captura (ni hueco)')

paso('Retomar desde Apuestas una revisión a medias, sin volver a llamar a la IA')
await cola(['dos_apuestas'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capResuelta])
await elegirTodas()
await pag.getByText('Apuesta 1 de 2').waitFor({ timeout: 30000 })
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 2 de 2').waitFor()
const llamadasMitad = await nLlamadas()
pag.once('dialog', (d) => d.accept())
await pag.goto(`${APP}/apuestas`) // "cierro la app" a mitad de la cola
await pag.getByText(/Tienes 1 apuesta leída sin revisar/).waitFor()
await foto('15-pendiente-de-revisar')
await pag.getByRole('link', { name: /Revisar/ }).click()
await pag.getByText('He encontrado 2 apuestas en esta captura.', { exact: false }).waitFor()
await pag.getByText('Esta es la 2.ª', { exact: false }).waitFor()
assert.equal(await nLlamadas(), llamadasMitad, 'no se ha vuelto a llamar a la IA')
bien('Aparece «1 apuesta leída sin revisar» y se retoma la 2.ª sin nueva lectura')
const rutaRetomada = decodeURIComponent((await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')).split('ruta=')[1])
await pag.getByRole('button', { name: 'Descartar esta apuesta' }).click()
await pag.waitForURL(`${APP}/apuestas`)
await pag.waitForTimeout(300)
assert.equal(await pag.getByText(/sin revisar/).count(), 0)
assert.ok(await esperar(async () => !(await archivos()).includes(`capturas/${rutaRetomada}`)), 'al descartar la última, la captura se borra')
bien('Descartada la última: desaparece el aviso y la captura se borra')

paso('Fallo al borrar la imagen: el guardado no falla y se reintenta después (con una captura pendiente a la vez)')
const sql = async (q) => (await fetch('http://localhost:54322/__sql', { method: 'POST', body: q })).json()
// 1) Una captura pendiente de revisar (2 apuestas, se guarda solo la 1.ª).
await cola(['dos_apuestas'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capCombinada])
await elegirTodas()
await pag.getByText('Apuesta 1 de 2').waitFor({ timeout: 30000 })
const rutaPendiente = decodeURIComponent((await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')).split('ruta=')[1])
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 2 de 2').waitFor()
// 2) Otra captura cuyo borrado falla al guardarla.
await cola(['simple'])
pag.once('dialog', (d) => d.accept())
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
const rutaFalla = decodeURIComponent((await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')).split('ruta=')[1])
// Fallan el borrado tras guardar y el primer reintento (al volver a la lista).
await fetch('http://localhost:54322/__fallar_borrado', { method: 'POST', body: '2' })
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await pag.getByText(/No se ha podido|error/i).count(), 0, 'sin mensaje de error')
await new Promise((r) => setTimeout(r, 1000))
assert.ok((await archivos()).includes(`capturas/${rutaFalla}`), 'el borrado falló: la imagen sigue')
assert.ok((await archivos()).includes(`capturas/${rutaPendiente}`))
const enlace = await sql(`select count(*)::int n from transcripciones where imagen = '${rutaFalla}'`)
assert.equal(enlace[0].n, 1, 'queda el enlace como aviso de "pendiente de borrar"')
bien('Guardado sin error aunque el borrado falló (y el primer reintento también); la imagen queda marcada para reintentar')
// 3) Al abrir la lista se reintenta (después de responder): borra la de la apuesta guardada, NO la pendiente.
await pag.reload({ waitUntil: 'networkidle' })
assert.ok(await esperar(async () => !(await archivos()).includes(`capturas/${rutaFalla}`)), 'reintento: borrada')
assert.ok((await archivos()).includes(`capturas/${rutaPendiente}`), 'la pendiente de revisar no se toca')
assert.equal((await sql(`select count(*)::int n from transcripciones where imagen = '${rutaFalla}'`))[0].n, 0)
await pag.getByText(/Tienes 1 apuesta leída sin revisar/).waitFor()
bien('El reintento borra la imagen de la apuesta guardada y deja la captura pendiente de revisar')

paso('Ajustes → Capturas guardadas: recuento y borrado (nunca las pendientes de revisar)')
await fetch('http://localhost:54322/__archivo_suelto', { method: 'POST', body: JSON.stringify({ ruta: `${ANA.id}/00000000-0000-4000-8000-0000000000a1.jpg`, apuestaEvento: 'Getafe - Girona' }) })
await fetch('http://localhost:54322/__archivo_suelto', { method: 'POST', body: JSON.stringify({ ruta: `${ANA.id}/00000000-0000-4000-8000-0000000000a2.jpg` }) })
await pag.goto(`${APP}/ajustes`)
await pag.getByText('De apuestas guardadas o descartadas').waitFor()
const fila = async (n) => (await pag.getByText(n, { exact: true }).locator('..').innerText())
assert.match(await fila('De apuestas guardadas o descartadas'), /1 · 146 KB/)
assert.match(await fila('Sin enlace en la base de datos'), /1 · 146 KB/)
assert.match(await fila('Pendientes de revisar (no se borran)'), /^Pendientes[\s\S]*1 ·/)
await pag.getByText(/Storage tiene 1 archivo que la base de datos no enlaza/).waitFor()
await foto('25-ajustes-capturas')
bien('Recuento: 1 de apuesta antigua, 1 sin enlace (lo indica) y 1 pendiente de revisar aparte')
await pag.getByRole('button', { name: /Borrar 2 capturas/ }).click()
await pag.getByText('No se puede deshacer.').waitFor()
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.getByText('Borradas 2 capturas.').waitFor()
const quedan = await archivos()
assert.ok(!quedan.some((a) => a.includes('0000000000a1') || a.includes('0000000000a2')), 'antiguas borradas')
assert.ok(quedan.includes(`capturas/${rutaPendiente}`), 'la pendiente de revisar sigue')
assert.equal((await sql(`select count(*)::int n from apuestas where imagen_origen is not null`))[0].n, 0, 'enlaces vaciados')
bien('Tras confirmar: borradas las 2 antiguas, enlaces vaciados; la pendiente de revisar intacta')
// Se descarta la pendiente para dejar la prueba limpia.
await pag.goto(`${APP}/apuestas/nueva?pendientes=1`, { waitUntil: 'networkidle' })
await pag.getByRole('button', { name: 'Descartar esta apuesta' }).click()
await pag.waitForURL(`${APP}/apuestas`)
assert.ok(await esperar(async () => !(await archivos()).includes(`capturas/${rutaPendiente}`)))

// ======================= DEPORTES Y LIGAS =======================
const deporteSel = (n = 0) => pag.getByLabel('Deporte', { exact: true }).nth(n)
const ligaSel = (n = 0) => pag.getByLabel('Liga', { exact: true }).nth(n)
const opcionesDe = (loc) => loc.locator('option').allTextContents()

paso('Deporte deducido por la IA, ligas según el deporte y cambio de deporte con liga incompatible')
await cola(['deducido'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
assert.equal(await deporteSel().inputValue(), 'Tenis')
assert.equal(await ligaSel().inputValue(), 'ATP')
assert.ok((await pag.getByText('revisar · deducido').count()) >= 1)
const ligasTenis = await opcionesDe(ligaSel())
for (const l of ['ATP', 'WTA', 'Challenger', 'ITF', 'Grand Slam']) assert.ok(ligasTenis.includes(l), l)
assert.ok(!ligasTenis.includes('LaLiga'), 'solo ligas de tenis')
await foto('16-deporte-deducido')
bien('Deporte «Tenis» y liga «ATP» rellenados en ámbar como «deducido»; en tenis salen ATP, WTA, Challenger, ITF, Grand Slam')
await deporteSel().selectOption('Fútbol')
await pag.getByText('Se ha vaciado la liga «ATP» porque no es de Fútbol.').waitFor()
assert.equal(await ligaSel().inputValue(), '')
assert.ok((await opcionesDe(ligaSel())).includes('LaLiga'))
await foto('17-liga-vaciada')
bien('Al cambiar a Fútbol, la liga ATP se vacía y avisa')
await deporteSel().selectOption('Tenis')
await ligaSel().selectOption('+ Nueva liga…')
await pag.getByPlaceholder('Nombre').fill('Laver Cup')
await pag.getByRole('button', { name: 'Crear', exact: true }).click()
await pag.waitForFunction(() => [...document.querySelectorAll('select')].some((s) => s.value === 'Laver Cup'))
bien('Liga «Laver Cup» creada al momento dentro de Tenis')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await pag.goto(`${APP}/apuestas/nueva?manual=1`, { waitUntil: 'networkidle' })
await deporteSel().selectOption('Tenis')
assert.ok((await opcionesDe(ligaSel())).includes('Laver Cup'))
bien('La liga nueva aparece en el desplegable la siguiente vez')

paso('Combinada con dos deportes → «Mixto»; el servidor lo recalcula al editar')
await cola(['dos_deportes'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capCombinada])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
assert.equal(await deporteSel(0).inputValue(), 'Tenis')
assert.equal(await deporteSel(1).inputValue(), 'Fútbol')
await pag.getByText('(selecciones de varios deportes)').waitFor()
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await pag.locator('main ul li p', { hasText: /Mixto$/ }).first().waitFor()
await foto('18-lista-mixto')
bien('Cada selección con su deporte; en la lista sale como «Mixto»')
await pag.getByLabel('Filtrar por deporte').selectOption('Mixto')
await pag.waitForURL(/deporte=Mixto/)
await pag.waitForTimeout(400)
assert.equal(await pag.locator('main ul li').count(), 1)
await pag.getByLabel('Filtrar por deporte').selectOption('Tenis')
await pag.waitForURL(/deporte=Tenis/)
await pag.waitForTimeout(400)
assert.equal(await pag.locator('main ul li').count(), 1, 'solo la de tenis (la mixta no)')
bien('Filtro por deporte: «Mixto» y «Tenis» por separado')
await pag.goto(`${APP}/apuestas?deporte=Mixto`)
await pag.locator('main ul li a').first().click()
await esperarDetalle()
await editar()
await deporteSel(1).selectOption('Tenis')
await guardarYVolver('Guardar cambios')
await pag.goto(`${APP}/apuestas?deporte=Tenis`)
await pag.waitForTimeout(300)
assert.equal(await pag.locator('main ul li').count(), 2, 'al editar, pasa de Mixto a Tenis (lo calcula el servidor)')
bien('Al editar (las dos de tenis), el servidor la recalcula como «Tenis»')

paso('Liga que no está en el catálogo → «nueva» con «Crear y usar»')
await cola(['liga_nueva'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await pag.getByText('revisar · nueva').waitFor()
await foto('19-liga-nueva')
await pag.getByRole('button', { name: /La IA ha leído «Liga Portugal»/ }).click()
await pag.waitForFunction(() => [...document.querySelectorAll('select option')].some((o) => o.textContent === 'Liga Portugal'))
assert.equal(await pag.getByText(/no está en tu catálogo/).count(), 0)
bien('Sale en ámbar como «nueva»; «Crear y usar» la añade a Fútbol')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)

paso('Ajustes → Deportes y ligas: una liga en uso no se borra; renombrar cambia también la apuesta (con aviso)')
await pag.goto(`${APP}/ajustes`)
await pag.getByRole('link', { name: /Deportes y ligas/ }).click()
await pag.waitForLoadState('networkidle')
await pag.locator('[data-deporte="Fútbol"] > button').click()
const filaLP = pag.locator('[data-fila-catalogo="Liga Portugal"]')
await filaLP.getByRole('button', { name: 'Borrar liga Liga Portugal' }).click()
await filaLP.getByText('Esta liga está en 1 selección de 1 apuesta: no se puede borrar.', { exact: false }).waitFor()
await filaLP.getByRole('button', { name: 'Renombrar' }).click()
await pag.getByLabel('Nuevo nombre de Liga Portugal').fill('Liga Portugal Betclic')
await pag.getByRole('button', { name: 'Revisar cambio' }).click()
assert.equal(await pag.locator('[data-aviso-renombrar]').innerText(), 'Afecta a 1 selección en 1 apuesta: también cambia en ellas.')
await foto('20-ajustes-deportes')
await pag.getByRole('button', { name: 'Sí, renombrar' }).click()
await pag.getByText('Renombrado a «Liga Portugal Betclic» en el catálogo y en 1 selección.').waitFor()
await pag.goto(`${APP}/apuestas`)
await abrir('Benfica - Oporto')
await editar()
assert.equal(await ligaSel().inputValue(), 'Liga Portugal Betclic', 'la apuesta también cambia')
bien('«Liga Portugal» en uso: no se borra; renombrada (aviso «1 selección en 1 apuesta») también en la apuesta')

// ======================= EN DIRECTO Y PRECIPITADA =======================
const conducta = async (evento) =>
  (await (await fetch('http://localhost:54322/__conducta')).json()).filter((r) => r.evento === evento).at(-1)
const casilla = (n) => pag.getByRole('checkbox', { name: n, exact: true })

paso('Captura de un partido EN JUEGO: «En directo» no se marca sola y se leen evento, liga y hora')
await cola(['en_juego'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
assert.equal(await casilla('En directo').isChecked(), false)
assert.equal(await casilla('Precipitada').isChecked(), false)
assert.equal(await casilla('Veía el partido').count(), 0)
assert.equal(await pag.getByLabel('Evento', { exact: true }).inputValue(), 'Girona - Villarreal')
assert.equal(await ligaSel().inputValue(), 'LaLiga')
assert.equal(await leerHora(pag), '18:30')
bien('Casillas sin marcar; evento, liga y hora leídos con normalidad')
await casilla('En directo').check()
await casilla('Veía el partido').waitFor()
await casilla('En directo').uncheck()
assert.equal(await casilla('Veía el partido').count(), 0)
bien('Marcar «En directo» muestra «Veía el partido»; desmarcarlo lo oculta')
await casilla('En directo').check()
await casilla('Veía el partido').check()
await casilla('Precipitada').check()
await casilla('Para recuperar pérdidas').waitFor()
await casilla('Precipitada').uncheck()
assert.equal(await casilla('Para recuperar pérdidas').count(), 0)
await casilla('Precipitada').check()
await foto('22-casillas-directo-precipitada')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
let c = await conducta('Girona - Villarreal')
assert.deepEqual([c.en_directo, c.viendo_partido, c.precipitada, c.recuperar_perdidas, c.precipitada_momento], [true, true, true, false, 'al_registrar'])
bien('Guardada: en directo viendo el partido, precipitada marcada al registrar (momento «al_registrar»)')

paso('Quitar «En directo» borra «Veía el partido»; guardar sin tocar conserva el momento')
await abrir('Girona - Villarreal')
await editar()
assert.equal(await casilla('Veía el partido').isChecked(), true)
await casilla('En directo').uncheck()
const casillasAntes = await pag.getByRole('checkbox').count()
const textoAntes = (await pag.locator('main').innerText()).length
await marcarEstado('ganada')
assert.equal(await pag.getByRole('checkbox').count(), casillasAntes, 'al resolver no aparece ninguna casilla ni pregunta nueva')
assert.ok((await pag.locator('main').innerText()).length - textoAntes < 120, 'solo aparece el resultado económico')
await guardarPanel()
c = await conducta('Girona - Villarreal')
assert.deepEqual([c.en_directo, c.viendo_partido, c.precipitada_momento, c.estado], [false, false, 'al_registrar', 'ganada'])
bien('Sin directo → «veía» guardado como no; resolverla sin tocar «Precipitada» conserva «al_registrar»')
await recargarDetalle()
await marcarEstado('pendiente')
await guardarPanel()
assert.equal((await conducta('Girona - Villarreal')).precipitada_momento, 'al_registrar')
bien('Al reabrirla (pendiente), el momento se conserva')
await recargarDetalle()
await casilla('Precipitada').uncheck()
await guardarPanel()
c = await conducta('Girona - Villarreal')
assert.deepEqual([c.precipitada, c.recuperar_perdidas, c.precipitada_momento], [false, false, null])
bien('Quitar «Precipitada» borra la subcasilla y el momento')

paso('Precipitada marcada SOLO al resolver, y captura en juego que ya viene resuelta')
await recargarDetalle()
await marcarEstado('perdida')
await guardarPanel()
await recargarDetalle()
await casilla('Precipitada').check()
await casilla('Para recuperar pérdidas').check()
await guardarPanel()
c = await conducta('Girona - Villarreal')
assert.deepEqual([c.precipitada, c.recuperar_perdidas, c.precipitada_momento], [true, true, 'al_resolver'])
bien('En una apuesta ya resuelta, marcar «Precipitada» guarda «al_resolver»')
await recargarDetalle()
await marcarEstado('ganada')
await casilla('Para recuperar pérdidas').uncheck()
await guardarPanel()
c = await conducta('Girona - Villarreal')
assert.deepEqual([c.estado, c.precipitada, c.recuperar_perdidas, c.precipitada_momento], ['ganada', true, false, 'al_resolver'])
bien('Estado y precipitada guardados a la vez con un solo «Guardar»')
await cola(['en_juego_resuelta'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
assert.equal(await pag.getByLabel('Estado de la apuesta').inputValue(), 'ganada', 'estado resuelto leído')
assert.equal(await leerHora(pag), '16:15')
assert.equal(await casilla('En directo').isChecked(), false)
await casilla('Precipitada').check()
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal((await conducta('Osasuna - Getafe')).precipitada_momento, 'al_resolver')
bien('Captura en juego ya resuelta: propone «Ganada», lee la hora y, marcada precipitada, cuenta «al_resolver»')

paso('Lista: filtros «En directo» y «Precipitadas», marca LIVE')
await abrir('Girona - Villarreal')
await editar()
await casilla('En directo').check()
await guardarYVolver('Guardar cambios')
await pag.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
await pag.getByRole('button', { name: 'En directo', exact: true }).click()
await pag.waitForURL(/directo=1/)
await pag.waitForTimeout(400)
assert.equal(await pag.locator('main ul li').count(), 1)
await pag.getByText('LIVE', { exact: true }).first().waitFor()
await foto('23-lista-live')
await pag.getByRole('button', { name: '✓ En directo' }).click()
await pag.waitForURL((u) => !u.search.includes('directo'))
await pag.getByRole('button', { name: 'Precipitadas', exact: true }).click()
await pag.waitForURL(/precipitada=1/)
await pag.waitForTimeout(400)
assert.equal(await pag.locator('main ul li').count(), 2)
bien('Filtro «En directo» (1, con LIVE) y «Precipitadas» (2)')
const llamadasDirecto = (await (await fetch('http://localhost:54322/__llamadas')).json()).slice(-2)
assert.ok(llamadasDirecto.every((l) => l.instruccionDirecto), 'la instrucción de ignorar señales de directo llega a la IA')
bien('La instrucción «ignorar En juego / marcador» va en cada lectura')

paso('Panel en una COMBINADA: Ganada pone las selecciones en verde; Perdida pregunta cuáles fallaron')
await pag.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
await abrir('Codere · Combinada (2)')
await marcarEstado('ganada')
await editar()
assert.deepEqual(
  await Promise.all([0, 1].map((i) => pag.getByLabel('Estado de la selección').nth(i).inputValue())),
  ['ganada', 'ganada'],
)
await marcarEstado('perdida')
await pag.getByText('¿Qué selecciones fallaron?').waitFor()
await pag.getByRole('button', { name: /Athletic - Osasuna/ }).click()
await guardarPanel()
await recargarDetalle()
assert.equal(await estadoDetalle(), 'perdida')
await editar()
assert.deepEqual(
  await Promise.all([0, 1].map((i) => pag.getByLabel('Estado de la selección').nth(i).inputValue())),
  ['pendiente', 'perdida'],
)
bien('Combinada: Ganada → todas en verde; Perdida → elijo la fallada (Athletic - Osasuna) y se guarda')

paso('Tarjeta de la lista con un evento MUY largo')
await pag.goto(`${APP}/apuestas/nueva?manual=1`, { waitUntil: 'networkidle' })
await pag.getByLabel('Importe (€)').fill('12,50')
await pag.getByLabel('Evento', { exact: true }).fill('Club Atlético de Madrid Femenino - Real Club Deportivo Espanyol de Barcelona Femenino')
await pag.getByLabel('Deporte', { exact: true }).selectOption('Fútbol')
await pag.getByLabel('Cuota', { exact: true }).fill('3,40')
await pag.getByLabel('Estado de la apuesta').selectOption('ganada')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
for (const ancho of [320, 375, 390, 430]) {
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({ ...movil, viewport: { width: ancho, height: 800 }, colorScheme: tema })
    await ctx.addCookies([cookieSesion(ANA)])
    const p = await ctx.newPage()
    await p.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
    const fallos = await p.evaluate(() => {
      const f = []
      if (document.documentElement.scrollWidth > window.innerWidth) f.push('scroll horizontal')
      for (const a of document.querySelectorAll('main ul li > a')) {
        const caja = a.getBoundingClientRect()
        if (caja.height < 44) f.push('tarjeta baja')
        const izq = a.firstElementChild.getBoundingClientRect()
        const der = a.children[1]?.getBoundingClientRect()
        if (der && izq.right > der.left + 0.5) f.push(`solape (${Math.round(izq.right)} > ${Math.round(der.left)})`)
        if (der && der.right > caja.right + 0.5) f.push('el resultado se sale')
        for (const el of a.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.width && r.right > caja.right + 0.5) f.push(`se sale: ${el.textContent.slice(0, 20)}`)
        }
      }
      return f
    })
    assert.deepEqual(fallos, [], `lista ${ancho}px ${tema}`)
    await p.screenshot({ path: join(SALIDA, `26-tarjetas-${ancho}-${tema}.png`) })
    await ctx.close()
  }
}
bien('Evento largo cortado con «…»; el resultado nunca se solapa; sin scroll horizontal en 4 anchos × 2 modos')

paso('Tras guardar en el detalle: vuelve a la MISMA lista (filtros y scroll), aviso breve, Atrás no reabre')
const listaFiltrada = `${APP}/apuestas?deporte=F%C3%BAtbol`
await pag.goto(listaFiltrada, { waitUntil: 'networkidle' })
// Desde el 2026-11-08 la fecha de una apuesta nueva es la del partido (aquí, hoy): la de Benfica
// se lleva a una fecha antigua para que quede abajo en la lista y haya que bajar hasta ella.
await sql(`update apuestas set fecha = '2026-10-01T10:00:00Z' where id in (select apuesta_id from selecciones where evento = 'Benfica - Oporto')`)
await pag.goto(listaFiltrada, { waitUntil: 'networkidle' })
const tarjetaBenfica = pag.locator('main ul li', { hasText: 'Benfica - Oporto' }).filter({ visible: true })
await tarjetaBenfica.scrollIntoViewIfNeeded()
await pag.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
const yAntes = await pag.evaluate(() => window.scrollY)
assert.ok(yAntes > 100, `la lista es larga (${yAntes})`)
await tarjetaBenfica.locator('a').click()
await esperarDetalle()
assert.ok(pag.url().includes('volver='), 'el detalle sabe a qué lista volver')
// Posición en el momento del toque (el navegador de pruebas acerca la tarjeta antes de pulsarla).
const yToque = JSON.parse(await pag.evaluate(() => sessionStorage.getItem('filoverde:scroll'))).y
assert.ok(yToque > 50, `posición recordada (${yToque})`)
await marcarEstado('anulada')
await guardarPanel()
assert.equal(pag.url(), listaFiltrada, 'misma lista, mismos filtros')
const aviso = pag.getByRole('status').filter({ hasText: 'Apuesta guardada' })
const caja = await aviso.boundingBox()
assert.ok(caja && caja.y < 120, 'el aviso va arriba: no tapa los botones de abajo')
await pag
  .locator('main ul li', { hasText: 'Benfica - Oporto' })
  .filter({ visible: true })
  .getByText('Anulada', { exact: true })
  .waitFor()
await esperar(async () => Math.abs((await pag.evaluate(() => window.scrollY)) - yToque) < 3, 3000)
const yDespues = await pag.evaluate(() => window.scrollY)
await pag.screenshot({ path: join(SALIDA, '27-vuelta-con-aviso.png') }) // sin fullPage: no mueve el scroll
assert.ok(await esperar(async () => (await aviso.count()) === 0, 5000), 'el aviso desaparece solo')
const diag = await pag.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight, sessionStorage.getItem('filoverde:scroll')])
assert.ok(Math.abs(yDespues - yToque) < 3, `scroll conservado (${yToque} → ${yDespues}) ${JSON.stringify(diag)}`)
bien(`Vuelve a la lista filtrada, aviso «Apuesta guardada» arriba que se va solo, tarjeta ya en «Anulada» y misma posición de scroll (${yToque} → ${yDespues})`)
await pag.goBack()
await pag.waitForTimeout(500)
assert.ok(!pag.url().includes('/apuestas/'), `Atrás no reabre el detalle guardado (${pag.url()})`)
bien('El botón Atrás no vuelve a abrir el formulario guardado')

paso('Guardar desde «Editar apuesta» sin cambiar nada también vuelve a la lista')
await pag.goto(`${APP}/apuestas?deporte=F%C3%BAtbol`, { waitUntil: 'networkidle' })
await abrir('Benfica - Oporto')
await editar()
await guardarYVolver('Guardar cambios')
assert.equal(pag.url(), `${APP}/apuestas?deporte=F%C3%BAtbol`)
assert.equal(
  await pag.locator('main ul li', { hasText: 'Benfica - Oporto' }).filter({ visible: true }).getByText('Anulada', { exact: true }).count(),
  1,
)
bien('Sin cambios: guarda, vuelve a la lista filtrada y la tarjeta sigue en «Anulada»')

paso('Si el guardado falla, no se cierra nada y se conserva lo escrito')
await abrir('Benfica - Oporto')
await marcarEstado('cash_out')
await pag.getByLabel('Importe recuperado con el cash out (€)').fill('7,77')
await fetch('http://localhost:54322/__fallar_guardado', { method: 'POST', body: '1' })
const urlAntesFallo = pag.url()
await guardarRevision('Guardar')
await pag.getByText('No se ha podido guardar. Inténtalo de nuevo.').waitFor()
assert.equal(pag.url(), urlAntesFallo, 'sigue en el detalle')
assert.equal(await estadoDetalle(), 'cash_out')
assert.equal(await valor('Importe recuperado con el cash out (€)'), '7,77')
await foto('28-fallo-guardado')
bien('Mensaje claro, sigue en el detalle con «Cash out» y 7,77 escritos')
await guardarPanel()
bien('Al reintentar, guarda y vuelve a la lista')

paso('Borrar con confirmación vuelve a la lista con «Apuesta borrada»')
await abrir('Benfica - Oporto')
await editar()
await pag.getByRole('button', { name: 'Borrar apuesta' }).click()
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.waitForURL(`${APP}/apuestas?deporte=F%C3%BAtbol`)
await pag.getByRole('status').filter({ hasText: 'Apuesta borrada' }).waitFor()
assert.ok(await esperar(async () => (await pag.getByText('Benfica - Oporto').filter({ visible: true }).count()) === 0))
bien('Vuelve a la lista con sus filtros, aviso «Apuesta borrada» y la apuesta ya no está')

// ======================= APUESTA DUPLICADA =======================
const avisoDup = () => pag.getByRole('alertdialog', { name: 'Apuesta duplicada' })
const hayAviso = async (ms = 2500) => avisoDup().waitFor({ timeout: ms }).then(() => true, () => false)
const sinAviso = async () => esperar(async () => (await avisoDup().count()) === 0, 3000)
const nRayo = async () => (await sql(`select count(*)::int n from selecciones where lower(evento) = 'rayo vallecano - rcd mallorca'`))[0].n
const subir = async (modos, archivosSubir) => {
  await cola(modos)
  await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
  await subirArchivos(archivosSubir)
  await pag.getByRole('button', { name: /^Guardar/ }).waitFor({ timeout: 30000 })
}

paso('Duplicadas: la primera vez no avisa; la misma captura otra vez, sí (con la que ya existe)')
await subir(['unica'], [capSimple])
assert.equal(await hayAviso(1500), false, 'primera vez: sin aviso')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await nRayo(), 1)
await subir(['unica'], [capSimple])
assert.ok(await hayAviso(), 'segunda vez: aviso al abrir')
const textoAviso = await avisoDup().innerText()
assert.match(textoAviso, /Parece que esta apuesta ya está registrada/)
assert.match(textoAviso, /Pendiente · Sin casa · 7,00\s€ · @ 2,20/)
await foto('29-aviso-duplicada')
bien('Aviso con la apuesta que ya existe (fecha · estado · casa · importe · cuota)')

paso('Duplicadas: cambiar el importe quita el aviso; volver al valor original lo trae de nuevo')
await pag.getByLabel('Importe (€)').fill('7,01')
assert.ok(await sinAviso(), 'cambia el importe → sin aviso')
await pag.getByLabel('Importe (€)').fill('7')
assert.ok(await hayAviso(), 'igual otra vez → aviso')
await pag.getByLabel('Cuota', { exact: true }).fill('2,25')
assert.ok(await sinAviso(), 'cambia la cuota → sin aviso')
await pag.getByLabel('Cuota', { exact: true }).fill('2,20')
assert.ok(await hayAviso())
await pag.getByLabel('Pronóstico').fill('Mallorca')
assert.ok(await sinAviso(), 'cambia una selección → sin aviso')
await pag.getByLabel('Pronóstico').fill('rayo vallecáno')
assert.ok(await hayAviso(), 'minúsculas y tilde de más: sigue siendo la misma')
await pag.getByLabel('Pronóstico').fill('  RAYO   vallecano ')
assert.ok(await hayAviso(), 'mayúsculas y espacios de más: sigue siendo la misma')
bien('Importe, cuota o una selección distintos → sin aviso; mayúsculas, tildes y espacios no cuentan')

paso('Duplicadas: «Descartar» no crea nada y vuelve a la lista')
await avisoDup().getByRole('button', { name: 'Descartar' }).click()
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await nRayo(), 1, 'no se ha creado nada')
bien('Descartada: sigue habiendo 1')

paso('Duplicadas: Guardar con el aviso sin resolver lo enseña y pide elegir; «Incluir de nuevo» guarda')
await subir(['unica'], [capSimple])
assert.ok(await hayAviso())
await pag.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.getByText('Elige Descartar o Incluir de nuevo.').waitFor()
assert.ok(await avisoDup().isVisible())
assert.ok(
  await esperar(async () => {
    const v = await avisoDup().boundingBox()
    return v && v.y >= 0 && v.y + v.height <= 844
  }, 3000),
  'el aviso se lleva a la vista',
)
assert.equal(await nRayo(), 1, 'no se guarda sin elegir')
await foto('30-elige-descartar-o-incluir')
await avisoDup().getByRole('button', { name: 'Incluir de nuevo' }).click()
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await nRayo(), 2, 'incluida de nuevo')
bien('El aviso sube a la vista con «Elige Descartar o Incluir de nuevo»; «Incluir de nuevo» guarda la segunda')

paso('Duplicadas: «Incluir de nuevo» al abrir no vuelve a preguntar al guardar (salvo que cambie algo)')
await subir(['unica'], [capSimple])
assert.ok(await hayAviso())
await avisoDup().getByRole('button', { name: 'Incluir de nuevo' }).click()
assert.ok(await sinAviso())
await pag.getByLabel('Notas').fill('Una nota no cuenta')
await pag.getByRole('checkbox', { name: 'Precipitada', exact: true }).check()
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await nRayo(), 3)
bien('Aceptada una vez: notas y precipitada no cuentan, guarda sin volver a preguntar')

paso('Duplicadas: en un lote, la misma apuesta dos veces; «Descartar» con una captura compartida')
await sql(`delete from apuestas a where exists (select 1 from selecciones s where s.apuesta_id = a.id and s.evento = 'Rayo Vallecano - RCD Mallorca')`)
assert.equal(await nRayo(), 0)
// Lote: captura A (1 apuesta) + captura B (la misma apuesta 2 veces) = 3 en cola.
await cola(['unica', 'dos_iguales'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple, capResuelta])
await pag.getByText('Apuesta 1 de 2').waitFor({ timeout: 30000 })
assert.equal(await hayAviso(1500), false, '1.ª del lote: nada igual todavía')
await guardarRevision('Guardar y seguir')
// La captura B trae 2 apuestas iguales a la recién guardada: salen SIN marcar («Ya registrada»).
await pag.getByRole('button', { name: 'Seleccionar todas' }).waitFor({ timeout: 30000 })
assert.equal(await pag.getByText('Ya registrada').count(), 2)
assert.equal(await pag.getByRole('checkbox', { checked: true }).count(), 0, 'las ya registradas, sin marcar')
await elegirTodas()
await pag.getByText('Apuesta 2 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
assert.ok(await hayAviso(), '2.ª del lote: igual a la 1.ª recién guardada → aviso')
const rutaB = decodeURIComponent((await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')).split('ruta=')[1])
await avisoDup().getByRole('button', { name: 'Descartar' }).click()
await pag.getByText('Apuesta 3 de 3').waitFor()
await new Promise((r) => setTimeout(r, 800))
assert.ok((await archivos()).includes(`capturas/${rutaB}`), 'Descartar la 1.ª de B no borra la captura: queda otra apuesta suya')
assert.ok(await hayAviso(), '3.ª: también igual → aviso')
await avisoDup().getByRole('button', { name: 'Incluir de nuevo' }).click()
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.getByText(/Has guardado 2 apuestas, descartado 1/).waitFor()
assert.ok((await archivos()).includes(`capturas/${rutaB}`), 'en una cola de varias, la captura sigue hasta «Terminar»')
await pag.getByRole('button', { name: 'Terminar', exact: true }).click()
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await nRayo(), 2, 'guardadas la 1.ª y la 3.ª')
assert.ok(await esperar(async () => !(await archivos()).includes(`capturas/${rutaB}`)), 'al resolver la última de B, su captura se borra')
bien('Lote: avisa con la recién guardada; Descartar sigue la cola y solo borra la captura con la última')

paso('Duplicadas: también contra apuestas resueltas o anuladas, y en el registro a mano')
await abrir('Rayo Vallecano - RCD Mallorca')
await marcarEstado('anulada')
await guardarPanel()
// La otra, ganada (directamente en la BD): las dos quedan resueltas.
await sql(`update apuestas set estado = 'ganada', resultado_economico = 840 where estado = 'pendiente' and id in (select apuesta_id from selecciones where evento = 'Rayo Vallecano - RCD Mallorca')`)
await pag.goto(`${APP}/apuestas/nueva?manual=1`, { waitUntil: 'networkidle' })
await pag.getByLabel('Importe (€)').fill('7')
await pag.getByLabel('Cuota', { exact: true }).fill('2,2')
await pag.getByLabel('Evento', { exact: true }).fill('rayo vallecano - rcd mallorca')
await pag.getByLabel('Pronóstico').fill('Rayo Vallecano')
await pag.getByLabel('Mercado').fill('1x2')
await pag.getByLabel('Deporte', { exact: true }).selectOption('Fútbol')
assert.ok(await hayAviso(), 'a mano, idéntica (en minúsculas) a una anulada → aviso')
const textoResueltas = await avisoDup().innerText()
assert.match(textoResueltas, /Anulada|Ganada/)
assert.doesNotMatch(textoResueltas, /Pendiente/)
assert.match(textoResueltas, /Hay 2 apuestas iguales/)
bien('A mano: avisa aunque las existentes estén resueltas o anuladas (y con otras mayúsculas)')
await pag.getByLabel('Cuota', { exact: true }).fill('2,3')
assert.ok(await sinAviso(), 'otra cuota → sin aviso')
bien('Cambiando la cuota, el aviso desaparece')

paso('Duplicadas: si la comprobación falla, no bloquea: se guarda con normalidad')
await fetch('http://localhost:54322/__fallar_duplicadas', { method: 'POST', body: '20' })
await pag.getByLabel('Cuota', { exact: true }).fill('2,2') // idéntica otra vez, pero la búsqueda falla
await pag.waitForTimeout(1200)
assert.equal(await avisoDup().count(), 0, 'sin respuesta válida no hay aviso')
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.waitForURL(`${APP}/apuestas`)
await fetch('http://localhost:54322/__fallar_duplicadas', { method: 'POST', body: '0' })
assert.equal(await nRayo(), 3, 'guardada aunque la comprobación fallara')
bien('Comprobación caída → se guarda igual (el error va al log del servidor)')

paso('Duplicadas: editar una apuesta guardada nunca avisa')
await abrir('Rayo Vallecano - RCD Mallorca')
await editar()
await pag.waitForTimeout(1500)
assert.equal(await avisoDup().count(), 0)
await guardarYVolver('Guardar cambios')
bien('Al editar no hay aviso y se guarda normal')

// ======================= PROMOCIONES =======================
const promoDe = async (evento) =>
  (
    await sql(
      `select a.promo_tipo, a.promo_cuota_original::float8 as cuota_original, a.promo_aumento::int as aumento, a.promo_credito::int as credito,
              a.promo_base, a.estado, a.resultado_economico::int as resultado
       from apuestas a where exists (select 1 from selecciones s where s.apuesta_id = a.id and s.evento = '${evento}')
       order by a.created_at desc limit 1`,
    )
  )[0]
const casillaPromo = () => pag.getByRole('checkbox', { name: 'Promoción', exact: true })
const resumenPromo = () => pag.getByLabel('Resumen de la promoción').innerText()
const resultadoRev = () => pag.getByLabel('Resultado económico (€)').inputValue()
const estadoRev = (e) => pag.getByLabel('Estado de la apuesta', { exact: true }).selectOption(e)
const avisosTexto = async () => (await pag.locator('ul[aria-live=polite]').count()) ? pag.locator('ul[aria-live=polite]').innerText() : ''

paso('Superaumento con la cuota original leída: casilla marcada, tipo a confirmar y resumen')
await subir(['sup_original'], [capSimple])
assert.equal(await casillaPromo().isChecked(), true)
assert.equal(await pag.getByLabel('Tipo de promoción').inputValue(), 'superaumento')
assert.ok(await pag.getByText('revisar · confírmalo').isVisible(), 'el tipo, en ámbar para confirmarlo')
assert.equal(await pag.getByLabel('Aumento (€)').inputValue(), '5,00', 'el aumento lo calcula el código')
assert.match(await resumenPromo(), /Sin promoción: 20,00\s€ · Con promoción: 25,00\s€ · Aumento: 5,00\s€/)
assert.doesNotMatch(await avisosTexto(), /no cuadra con importe × cuota/, 'sin aviso de coherencia en un aumento')
await foto('32-superaumento')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.deepEqual(await promoDe('Celta - Alavés'), { promo_tipo: 'superaumento', cuota_original: 2, aumento: 500, credito: null, promo_base: 'cuota_original', estado: 'pendiente', resultado: null })
bien('Sin promoción 20 € · con promoción 25 € · aumento 5 €; guardado con la cuota original como dato base')

paso('Superaumento con el aumento leído: se calcula la cuota original')
await subir(['sup_aumento'], [capSimple])
assert.equal(await pag.getByLabel('Cuota original').inputValue(), '2,00')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.deepEqual(await promoDe('Girona - Elche'), { promo_tipo: 'superaumento', cuota_original: 2, aumento: 500, credito: null, promo_base: 'aumento', estado: 'pendiente', resultado: null })
bien('Aumento 5 € leído → cuota original 2,00 calculada')

paso('Superaumento sin ninguno de los dos: cuota original vacía «falta»; la escribo y se calcula el aumento')
await subir(['sup_nada'], [capSimple])
assert.equal(await pag.getByLabel('Cuota original').inputValue(), '')
assert.ok(await pag.getByText('revisar · falta').isVisible())
assert.match(await resumenPromo(), /Sin promoción: —.*Aumento: —/)
await foto('33-cuota-original-falta')
await pag.getByLabel('Cuota original').fill('1,9')
assert.equal(await pag.getByLabel('Aumento (€)').inputValue(), '6,00')
assert.equal(await pag.getByText('revisar · falta').count(), 0)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.deepEqual(await promoDe('Levante - Oviedo'), { promo_tipo: 'superaumento', cuota_original: 1.9, aumento: 600, credito: null, promo_base: 'cuota_original', estado: 'pendiente', resultado: null })
bien('Escribo 1,90 → aumento 6 € (25 − 19)')

paso('Superaumento con los dos leídos y que no cuadran: se conservan y avisa sin bloquear')
await subir(['sup_incoherente'], [capSimple])
assert.equal(await pag.getByLabel('Cuota original').inputValue(), '2,00')
assert.equal(await pag.getByLabel('Aumento (€)').inputValue(), '6,00')
assert.match(await avisosTexto(), /no cuadran/)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.deepEqual(await promoDe('Espanyol - Valencia'), { promo_tipo: 'superaumento', cuota_original: 2, aumento: 600, credito: null, promo_base: 'ambos', estado: 'pendiente', resultado: null })
bien('Aviso «no cuadran» y se guarda lo leído (2,00 y 6 €)')

paso('Aumento de ganancias: ganada = ganancia potencial − importe; el servidor recalcula el aumento al editar')
await subir(['aumento'], [capSimple])
assert.match(await resumenPromo(), /Aumento: 4,00\s€/)
assert.doesNotMatch(await avisosTexto(), /no cuadra con importe × cuota/)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await abrir('Sevilla FC - Villarreal')
await marcarEstado('ganada')
assert.equal(await pag.getByLabel('Resultado económico (€)').first().inputValue(), '12,00', '22 − 10')
await guardarPanel()
assert.deepEqual(await promoDe('Sevilla FC - Villarreal'), { promo_tipo: 'aumento', cuota_original: 1.8, aumento: 400, credito: null, promo_base: 'cuota_original', estado: 'ganada', resultado: 1200 })
await abrir('Sevilla FC - Villarreal')
await editar()
await pag.getByLabel('Ganancia potencial (€)').fill('24')
await pag.getByRole('alertdialog', { name: 'Recalcular el resultado' }).getByRole('button', { name: 'Mantener el mío' }).click()
await guardarYVolver('Guardar cambios')
assert.equal((await promoDe('Sevilla FC - Villarreal')).aumento, 600, 'aumento recalculado a partir de la cuota original (24 − 18)')
bien('Ganada +12 € (22 − 10); al cambiar la ganancia a 24 € el aumento pasa a 6 € solo')

paso('Apuesta asegurada: crédito por defecto el importe (o el tope leído); perdida = −importe y el crédito aparte')
await subir(['asegurada'], [capSimple])
assert.equal(await pag.getByLabel('Crédito si se pierde (€)').inputValue(), '10,00')
await estadoRev('perdida')
assert.equal(await resultadoRev(), '-10,00')
assert.ok(await pag.getByText(/recibes 10,00 € en crédito/).isVisible())
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.deepEqual(await promoDe('Athletic - Real Sociedad'), { promo_tipo: 'asegurada', cuota_original: null, aumento: null, credito: 1000, promo_base: null, estado: 'perdida', resultado: -1000 })
await subir(['asegurada_tope'], [capSimple])
assert.equal(await pag.getByLabel('Crédito si se pierde (€)').inputValue(), '5,00')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal((await promoDe('Mallorca - Getafe')).credito, 500)
bien('Sin tope: crédito 10 €; con tope: 5 €; perdida −10 € y el crédito guardado aparte')

paso('Apuesta con crédito: ganada solo la ganancia, perdida 0, media ganada, anulada y cash out')
await subir(['credito'], [capSimple])
assert.ok(await pag.getByText('Con crédito: si pierdes no baja tu dinero; si ganas sube solo la ganancia.').first().isVisible())
assert.doesNotMatch(await avisosTexto(), /no cuadra con importe × cuota/, 'sin aviso de coherencia con crédito')
const casos = [['ganada', '10,00'], ['perdida', '0,00'], ['media_ganada', '5,00'], ['media_perdida', '0,00'], ['anulada', '0,00']]
for (const [e, r] of casos) {
  await estadoRev(e)
  assert.equal(await resultadoRev(), r, e)
}
await estadoRev('cash_out')
await pag.getByLabel('Importe recuperado con el cash out (€)').fill('7')
assert.equal(await resultadoRev(), '7,00', 'cash out con crédito: todo lo recuperado')
await estadoRev('ganada')
await foto('34-credito')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.deepEqual(await promoDe('Real Madrid - Atlético'), { promo_tipo: 'credito', cuota_original: null, aumento: null, credito: null, promo_base: null, estado: 'ganada', resultado: 1000 })
await abrir('Real Madrid - Atlético')
await marcarEstado('perdida')
assert.equal(await pag.getByLabel('Resultado económico (€)').first().inputValue(), '0,00')
await guardarPanel()
assert.equal((await promoDe('Real Madrid - Atlético')).resultado, 0)
bien('Crédito: 10 € a 2,00 ganada = +10 €; perdida 0; media ganada +5; media perdida y anulada 0; cash out = lo recuperado')

paso('Lista: filtro «Con promoción» y marcas PROMO / CRÉDITO')
await pag.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
await pag.getByRole('button', { name: 'Con promoción' }).click()
await pag.waitForURL(/promo=1/)
await pag.waitForLoadState('networkidle')
const nPromo = (await sql(`select count(*)::int n from apuestas where promo_tipo is not null`))[0].n
const tarjetas = pag.locator('ul li a[href*="/apuestas/"][href*="volver="]').filter({ visible: true })
assert.equal(await tarjetas.count(), nPromo, 'solo las que tienen promoción')
assert.equal(await tarjetas.filter({ hasText: 'PROMO' }).count(), nPromo)
assert.equal(await tarjetas.filter({ hasText: 'CRÉDITO' }).count(), 1)
await foto('35-lista-promo')
const desbordeLista = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
assert.equal(desbordeLista, false)
bien(`Filtro con ${nPromo} apuestas, todas con PROMO y una con CRÉDITO`)

paso('Quitar la promoción vacía sus datos')
await abrir('Athletic - Real Sociedad')
await editar()
assert.equal(await casillaPromo().isChecked(), true)
await casillaPromo().uncheck()
assert.equal(await pag.getByLabel('Tipo de promoción').count(), 0)
await guardarYVolver('Guardar cambios')
assert.deepEqual(await promoDe('Athletic - Real Sociedad'), { promo_tipo: null, cuota_original: null, aumento: null, credito: null, promo_base: null, estado: 'perdida', resultado: -1000 })
bien('Desmarcada: tipo, cuota original, aumento, crédito y base vacíos en la base de datos')

paso('Hora del evento con dos desplegables (14:32 se conserva); la hora de la apuesta ya no se pide')
await subir(['hora_rara'], [capSimple])
assert.equal(await leerHora(pag), '14:32', 'minuto raro: se muestra tal cual')
assert.equal(await pag.getByLabel('Hora de la apuesta').count(), 0, 'sin hora de la apuesta')
// Desde el 2026-11-08 la fecha de una apuesta nueva es la del último partido (aquí 8-nov 14:32), no
// la que la IA lea como fecha de la apuesta (1-nov).
await esperar(async () => (await pag.getByLabel('Día de la apuesta').inputValue()) === '2026-11-08')
const minutos = await pag.getByLabel('Minuto', { exact: true }).locator('option').allTextContents()
assert.ok(minutos.includes('32 min') && minutos.includes('35 min') && minutos.includes('00 min'))
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
const hr = (await sql(`select s.evento_hora::text h, to_char(a.fecha at time zone 'Europe/Madrid', 'HH24:MI') f from selecciones s join apuestas a on a.id = s.apuesta_id where s.evento = 'Alavés - Osasuna'`))[0]
assert.deepEqual(hr, { h: '14:32:00', f: '14:32' }, 'hora del evento sin redondear; la apuesta, a la hora del partido')
// A mano: hora de la apuesta 15:25, partido con día y sin hora, y hora sin día (error).
await pag.goto(`${APP}/apuestas/nueva?manual=1`, { waitUntil: 'networkidle' })
await pag.getByLabel('Importe (€)').fill('3')
await pag.getByLabel('Cuota', { exact: true }).fill('1,5')
await pag.getByLabel('Evento', { exact: true }).fill('Hora - Prueba')
await pag.getByLabel('Deporte', { exact: true }).selectOption('Fútbol')
assert.equal(await pag.getByLabel('Minuto', { exact: true }).isDisabled(), true, 'sin hora, el minuto espera')
await ponerHora(pag, '20:15')
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.getByText('Pon también el día del evento.').waitFor()
bien('Hora sin día → «Pon también el día del evento.»')
await ponerHora(pag, '')
const hoyMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const mananaMadrid = new Date(Date.parse(`${hoyMadrid}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
await pag.getByLabel('Día del evento').fill(mananaMadrid)
await esperar(async () => (await pag.getByLabel('Día de la apuesta').inputValue()) === mananaMadrid) // el día del partido
await pag.getByLabel('Día de la apuesta').fill(hoyMadrid) // a mano: hoy
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
const hm = (await sql(`select s.evento_hora::text h, s.evento_fecha::text d, to_char(a.fecha at time zone 'Europe/Madrid', 'YYYY-MM-DD') f, extract(epoch from now() - a.fecha)::int seg from selecciones s join apuestas a on a.id = s.apuesta_id where s.evento = 'Hora - Prueba'`))[0]
assert.deepEqual([hm.h, hm.d, hm.f], [null, mananaMadrid, hoyMadrid])
assert.ok(hm.seg >= 0 && hm.seg < 300, `hoy → la hora actual (hace ${hm.seg} s)`)
bien('Día del evento sin hora, sin hora; la apuesta de hoy guarda la hora actual sin pedirla')

// ======================= v6: APUESTAS VÁLIDAS, ELECCIÓN, COLA Y FECHAS =======================
const llamadas6 = async () => (await fetch('http://localhost:54322/__llamadas')).json()
const subir6 = async (modos, archivosSubir = [capSimple]) => {
  await cola(modos)
  const aceptar = (d) => d.accept().catch(() => {})
  pag.on('dialog', aceptar)
  await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
  pag.off('dialog', aceptar)
  await subirArchivos(archivosSubir)
}
const rutaVisible = async () => decodeURIComponent((await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')).split('ruta=')[1])
const sinScrollHorizontal = async () => pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

paso('bet365 (1): de 3 apuestas solo Pape Gueye es válida; las cortadas se ignoran y no hay pantalla de elección')
// La casa Bet365 ya en el catálogo (si no, una casa leída que no está en él no coincide con nada).
await sql(`insert into casas_apuestas (user_id, nombre) select '${ANA.id}', 'Bet365' where not exists (select 1 from casas_apuestas where user_id = '${ANA.id}' and lower(nombre) = 'bet365')`)
await subir6(['bet365_1'])
await pag.getByRole('button', { name: /^Guardar/ }).waitFor({ timeout: 30000 })
assert.equal(await pag.getByText('¿Cuáles quieres guardar?').count(), 0)
assert.ok(await pag.getByText('He ignorado 2 apuestas cortadas o sin selección.').isVisible())
assert.equal(await pag.getByLabel('Pronóstico').inputValue(), 'Pape Gueye - Más de 0.5')
assert.equal((await sql(`select n_apuestas from transcripciones order by created_at desc limit 1`))[0].n_apuestas, 1)
await foto('40-bet365-gueye')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
bien('Solo Pape Gueye, con «He ignorado 2 apuestas cortadas o sin selección»; cuenta 1 lectura')

paso('bet365 (2): elegir Yilmaz y no Osimhen; las no elegidas no vuelven a «sin revisar»')
await subir6(['bet365_2'])
await pag.getByText('He encontrado 2 apuestas en esta captura. ¿Cuáles quieres guardar?').waitFor({ timeout: 30000 })
await pag.getByRole('button', { name: 'Seleccionar todas' }).waitFor()
assert.ok(await pag.getByText('He ignorado 2 apuestas cortadas o sin selección.').isVisible())
const casillasElegir = pag.getByRole('list', { name: 'Apuestas de la captura' }).getByRole('checkbox')
assert.equal(await casillasElegir.count(), 2)
assert.equal(await pag.getByRole('checkbox', { checked: true }).count(), 2, 'marcadas por defecto (ninguna registrada)')
await pag.setViewportSize({ width: 320, height: 800 })
assert.ok(await sinScrollHorizontal(), 'elección a 320 px sin scroll horizontal')
await foto('41-elegir-320')
await pag.setViewportSize({ width: 390, height: 844 })
const rutaB365 = await rutaVisible()
await pag.getByText('Victor Osimhen', { exact: false }).click() // desmarca
await pag.getByRole('button', { name: 'Revisar 1 apuesta' }).click()
await pag.getByRole('button', { name: /^Guardar/ }).waitFor()
assert.equal(await pag.getByLabel('Pronóstico').inputValue(), 'Baris Yilmaz - Más de 0.5')
assert.equal(await pag.getByLabel('Notas').inputValue(), 'Sustituto: Rafael Leao')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
const tB = (await sql(`select descartadas from transcripciones order by created_at desc limit 1`))[0]
assert.deepEqual(tB.descartadas, [3], 'Osimhen (no elegida, posición 3) queda descartada: no vuelve a «sin revisar»')
assert.ok(await esperar(async () => !(await archivos()).includes(`capturas/${rutaB365}`)), 'al terminar, la captura se borra')
bien('Elegida solo Yilmaz (con la nota del sustituto); Osimhen descartada; captura borrada al terminar')

paso('bet365 (2) otra vez: Yilmaz sale «Ya registrada» y sin marcar; «Ninguna» no guarda nada')
await subir6(['bet365_2'])
await pag.getByRole('button', { name: 'Seleccionar todas' }).waitFor({ timeout: 30000 })
assert.equal(await pag.getByText('Ya registrada').count(), 1)
assert.equal(await pag.getByRole('checkbox', { checked: true }).count(), 1, 'solo Osimhen marcada')
await pag.getByRole('button', { name: 'Ninguna' }).click()
await pag.getByRole('button', { name: 'No guardar ninguna' }).click()
await pag.waitForURL(`${APP}/apuestas`)
bien('La ya registrada sale sin marcar con «Ya registrada»')

paso('bet365 (3): una sola apuesta → sin pantalla de elección; «Dom 8 nov / 17:00» → 8 nov 2026 17:00 sin ámbar')
await subir6(['bet365_3'])
await pag.getByRole('button', { name: /^Guardar/ }).waitFor({ timeout: 30000 })
assert.equal(await pag.getByText('¿Cuáles quieres guardar?').count(), 0)
assert.equal(await pag.getByLabel('Día del evento').inputValue(), '2026-11-08')
assert.equal(await leerHora(pag), '17:00')
const cabecera = (texto) => pag.locator('label', { hasText: new RegExp(`^${texto}$`) }).first().locator('..').innerText()
assert.doesNotMatch(await cabecera('Día del evento'), /revisar/, 'día claro: sin ámbar')
assert.doesNotMatch(await cabecera('Hora'), /revisar/, 'hora clara: sin ámbar')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
bien('Granada - Tenerife: 2026-11-08 17:00, sin ámbar')

paso('Fechas del evento: Hoy, Mañana, sin año, 12 h y hora suelta')
await subir6(['fechas'])
await pag.getByRole('button', { name: /^Guardar/ }).waitFor({ timeout: 30000 })
const hoyM = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const mananaM = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + 86400000))
const diaEv = (i) => pag.getByLabel('Día del evento').nth(i).inputValue()
assert.equal(await diaEv(0), hoyM)
assert.equal(await leerHora(pag, 'Hora', 'Minuto', 0), '21:00')
assert.equal(await diaEv(1), mananaM)
assert.equal(await leerHora(pag, 'Hora', 'Minuto', 1), '18:30')
assert.match(await diaEv(2), /-11-08$/)
assert.equal(await leerHora(pag, 'Hora', 'Minuto', 3), '21:00', '9:00 PM → 21:00')
assert.equal(await diaEv(4), '', 'hora suelta: día vacío')
assert.equal(await leerHora(pag, 'Hora', 'Minuto', 4), '', 'y hora vacía')
const tarjetas6 = pag.locator('form li')
assert.equal(await tarjetas6.nth(0).getByText('revisar · deducido').count(), 2, 'Hoy: día y hora en ámbar')
assert.equal(await tarjetas6.nth(1).getByText('revisar · deducido').count(), 2, 'Mañana: en ámbar')
assert.equal(await tarjetas6.nth(2).getByText('revisar · deducido').count(), 2, 'sin año: en ámbar')
assert.equal(await tarjetas6.nth(4).getByText('revisar · falta el día').count(), 2, 'hora sin día: «falta el día»')
const anioSab = Number(hoyM.slice(0, 4))
assert.equal(await diaEv(3), `${anioSab}-11-15`, '«Sáb 15 nov»: el año de hoy (no otro sin aviso)')
assert.equal(await tarjetas6.nth(3).getByText('revisar · el día de la semana no coincide').count(), 2, '«Sáb 15 nov» en ámbar')
await foto('42-fechas-evento')
const ll6 = await llamadas6()
assert.ok(!ll6.at(-1).textoPeticion.includes(hoyM), 'la fecha de hoy NO va a la IA')
bien(`Hoy → ${hoyM} · Mañana → ${mananaM} · 08/11 → ${await diaEv(2)} (ámbar) · 9:00 PM → 21:00 · hora suelta → vacía con «falta el día»`)

paso('Tanda de 3: Anterior a una guardada (se actualiza, no se duplica), descartar y recuperar, resumen y Terminar')
const ll0t = (await llamadas6()).length
await subir6(['unica', 'credito', 'aumento'], [capSimple, capCombinada, capResuelta])
await pag.getByText('Apuesta 1 de 3').waitFor({ timeout: 30000 })
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
const rutasTanda = [await rutaVisible()]
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 2 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
rutasTanda.push(await rutaVisible())
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 3 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
rutasTanda.push(await rutaVisible())
const nav = pag.getByRole('navigation', { name: 'Cola de revisión' })
assert.ok(await nav.getByLabel('Apuesta 1: guardada').isVisible())
assert.ok(await nav.getByLabel('Apuesta 3: pendiente').isVisible())
await pag.setViewportSize({ width: 320, height: 800 })
assert.ok(await sinScrollHorizontal(), 'cola a 320 px sin scroll horizontal')
const altoBotones = await nav.getByRole('button').evaluateAll((bs) => Math.min(...bs.map((b) => b.getBoundingClientRect().height)))
assert.ok(altoBotones >= 44, `Anterior/Siguiente ≥ 44 px (${altoBotones})`)
await foto('43-cola-320')
await pag.setViewportSize({ width: 390, height: 844 })
// Anterior → la 2.ª (ya guardada): su captura sigue visible y «Guardar cambios» la actualiza.
await nav.getByRole('button', { name: '‹ Anterior' }).click()
await pag.getByText('Ya guardada.', { exact: false }).waitFor()
assert.ok(await pag.getByRole('img', { name: 'Captura de la apuesta' }).isVisible(), 'la captura se sigue viendo')
const evento2 = await pag.getByLabel('Evento', { exact: true }).inputValue()
const n2 = async () => (await sql(`select count(*)::int n from selecciones where evento = '${evento2.replace(/'/g, "''")}'`))[0].n
const antes2 = await n2()
await pag.getByLabel('Notas').fill('Cambiada al volver atrás')
await pag.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
await pag.getByText('Apuesta 3 de 3').waitFor()
assert.equal(await n2(), antes2, 'actualiza la misma apuesta (no crea otra)')
assert.equal((await sql(`select count(*)::int n from apuestas where notas = 'Cambiada al volver atrás'`))[0].n, 1)
assert.ok((await archivos()).includes(`capturas/${rutasTanda[0]}`), 'las capturas siguen hasta Terminar')
// La 3.ª: descartar → resumen; «Revisar anteriores» → recuperar → guardar.
await pag.getByRole('button', { name: 'Descartar esta captura' }).click()
await pag.getByText('Has guardado 2 apuestas, descartado 1').waitFor()
await foto('44-resumen')
await pag.getByRole('button', { name: 'Revisar anteriores' }).click()
await pag.getByRole('button', { name: 'Recuperar esta apuesta' }).click()
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor()
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.ok(
  await esperar(async () => {
    const a = await archivos()
    return rutasTanda.every((r) => !a.includes(`capturas/${r}`))
  }),
  'al Terminar se borran las 3 capturas',
)
const prefijos = (await llamadas6()).slice(ll0t).map((l) => l.prefijo)
assert.equal(new Set(prefijos).size, 1, 'la parte cacheada es idéntica en las 3 lecturas (la caché no se rompe)')
bien('Anterior a la guardada: misma apuesta actualizada; descartada y recuperada; Terminar borra las 3 capturas; caché intacta')

paso('Recargar la página a mitad de la cola: se conserva el estado, sin volver a leer')
await subir6(['simple', 'combinada'], [capSimple, capCombinada])
await pag.getByText('Apuesta 1 de 2').waitFor({ timeout: 30000 })
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 2 de 2').waitFor()
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
const llAntesRecarga = (await llamadas6()).length
pag.once('dialog', (d) => d.accept().catch(() => {}))
await pag.reload({ waitUntil: 'networkidle' })
await pag.getByText('Apuesta 2 de 2').waitFor({ timeout: 15000 })
assert.ok(await pag.getByRole('navigation', { name: 'Cola de revisión' }).getByLabel('Apuesta 1: guardada').isVisible())
assert.equal((await llamadas6()).length, llAntesRecarga, 'sin nueva lectura de la IA')
// Cerrar la app a medias: lo guardado queda; la imagen sobrante la limpia el borrado automático.
const rutaRecarga = await rutaVisible()
pag.once('dialog', (d) => d.accept().catch(() => {}))
await pag.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
await pag.getByText(/Tienes \d+ apuestas? leídas? sin revisar/).waitFor()
const pendRecarga = (await sql(`select count(*)::int n from transcripciones t where t.imagen = '${rutaRecarga}' and not exists (select 1 from apuestas a where a.transcripcion_id = t.id)`))[0].n
assert.equal(pendRecarga, 1, 'la 2.ª sigue pendiente de revisar')
assert.ok((await archivos()).includes(`capturas/${rutaRecarga}`), 'la captura sin revisar se conserva')
bien('Tras recargar sigue en la 2.ª con la 1.ª guardada; al cerrar, lo no revisado queda en «sin revisar»')

// ======================= IA MÁS FIABLE: REINTENTOS =======================
const llamadasIAs = async () => (await fetch('http://localhost:54322/__llamadas')).json()
const nTrans = async () => (await sql(`select count(*)::int n from transcripciones`))[0].n
const nTransError = async () => (await sql(`select count(*)::int n from transcripciones where resultado = 'error'`))[0].n
const subirIA = async (modos, archivosSubir = [capSimple]) => {
  await cola(modos)
  const aceptar = (d) => d.accept().catch(() => {}) // salir con una captura sin guardar
  pag.on('dialog', aceptar)
  await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
  pag.off('dialog', aceptar)
  await subirArchivos(archivosSubir)
}
const formListo = () => pag.getByRole('button', { name: /^Guardar/ }).waitFor({ timeout: 60000 })

paso('IA saturada que se resuelve al 2.º intento: «Reintentando…» y sin error')
let ll0 = (await llamadasIAs()).length
let tr0 = await nTrans()
await subirIA(['error500', 'unica'])
await pag.getByText('Reintentando… (2 de 3)').waitFor({ timeout: 20000 })
assert.ok(await pag.getByText('La IA está saturada: lo intento de nuevo.').isVisible())
await foto('37-reintentando')
await formListo()
assert.equal(await pag.getByText('Pendiente de reintentar', { exact: true }).count(), 0)
assert.equal((await llamadasIAs()).length - ll0, 2, '2 llamadas: la fallida y la buena')
assert.equal((await nTrans()) - tr0, 1, 'una sola lectura (el intento saturado no cuenta)')
// Doble petición de la MISMA captura ya leída: se reutiliza la lectura (ni otra llamada ni otra fila).
const rutaIA = decodeURIComponent((await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src')).split('ruta=')[1])
const otra = await (await pag.request.post(`${APP}/api/capturas/transcribir`, { data: { ruta: rutaIA, intento: 1 } })).json()
assert.equal(otra.reutilizada, true)
assert.equal((await llamadasIAs()).length - ll0, 2, 'sin otra llamada a la IA')
assert.equal((await nTrans()) - tr0, 1, 'sin fila duplicada')
const r4 = await pag.request.post(`${APP}/api/capturas/transcribir`, { data: { ruta: rutaIA, intento: 4 } })
assert.equal(r4.status(), 400, 'más de 3 intentos seguidos: el servidor no llama a la IA')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
bien('Se reintenta sola; cuenta como UNA lectura; reintentar la misma captura no la vuelve a pagar ni duplica filas')

paso('IA saturada que se resuelve al 3.er intento')
ll0 = (await llamadasIAs()).length
await subirIA(['error500', 'error500', 'credito'])
await pag.getByText('Reintentando… (3 de 3)').waitFor({ timeout: 30000 })
await formListo()
const tiempos = (await llamadasIAs()).slice(ll0).map((l) => l.t)
assert.equal(tiempos.length, 3)
const esperas = [tiempos[1] - tiempos[0], tiempos[2] - tiempos[1]]
assert.ok(esperas[0] >= 1400 && esperas[0] < 4000, `1.ª espera ~2 s (${esperas[0]} ms)`)
assert.ok(esperas[1] >= 3700 && esperas[1] < 8000, `2.ª espera ~5 s (${esperas[1]} ms)`)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
bien(`Esperas crecientes: ${(esperas[0] / 1000).toFixed(1)} s y ${(esperas[1] / 1000).toFixed(1)} s`)

paso('IA saturada que no se resuelve: exactamente 3 intentos y mensaje claro; no suma coste')
ll0 = (await llamadasIAs()).length
tr0 = await nTrans()
const err0 = await nTransError()
await subirIA(['error500', 'error500', 'error500', 'aumento'])
await pag.getByText('Pendiente de reintentar', { exact: true }).waitFor({ timeout: 30000 })
assert.match(await pag.getByRole('alert').first().innerText(), /saturada/)
const tras = (await llamadasIAs()).slice(ll0)
assert.equal(tras.length, 3, 'exactamente 3 intentos (la librería no reintenta por su cuenta)')
assert.ok(tras.every((l) => l.reintentosSdk === '0' || l.reintentosSdk == null), 'sin reintentos de la librería')
assert.equal((await nTrans()) - tr0, 0, 'los intentos fallidos no cuentan como lectura')
assert.equal((await nTransError()) - err0, 0, 'ni como fallo cobrado')
assert.ok(await pag.getByRole('button', { name: 'Rellenar a mano' }).isVisible())
assert.ok(await pag.getByRole('img', { name: 'Captura de la apuesta' }).isVisible(), 'la captura sigue ahí')
await foto('38-saturada-tras-3')
// Doble toque en «Reintentar»: una sola lectura.
await pag.getByRole('button', { name: 'Reintentar' }).dblclick()
await formListo()
assert.equal((await llamadasIAs()).length - ll0, 4, 'el doble toque no lanza dos lecturas')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
bien('3 intentos, «Pendiente de reintentar» con la captura, Reintentar y Rellenar a mano; doble toque = 1 lectura')

paso('Límite 429 con retry-after: espera lo que pide y lo distingue de «saturada»')
ll0 = (await llamadasIAs()).length
await subirIA(['error429:3', 'asegurada'])
await pag.getByText('Límite de lecturas por minuto: espero y lo intento de nuevo.').waitFor({ timeout: 10000 })
await formListo()
const t429 = (await llamadasIAs()).slice(ll0).map((l) => l.t)
assert.ok(t429[1] - t429[0] >= 2900, `respeta retry-after de 3 s (${t429[1] - t429[0]} ms)`)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await subirIA(['error429:1', 'error429:1', 'error429:1'])
await pag.getByText('Pendiente de reintentar', { exact: true }).waitFor({ timeout: 30000 })
assert.match(await pag.getByRole('alert').first().innerText(), /Has alcanzado el límite de lecturas de la IA por minuto/)
assert.doesNotMatch(await pag.getByRole('alert').first().innerText(), /saturada/)
bien('429: espera el retry-after; si no se resuelve, «Has alcanzado el límite… espera un minuto»')

paso('Error permanente (clave inválida): sin reintentos')
ll0 = (await llamadasIAs()).length
await subirIA(['error401', 'simple'])
await pag.getByText(/La clave de la IA no es válida/).waitFor({ timeout: 15000 })
assert.equal((await llamadasIAs()).length - ll0, 1, 'una sola llamada')
assert.equal(await pag.getByText('Pendiente de reintentar', { exact: true }).count(), 0)
bien('Clave inválida: una llamada, mensaje propio, sin reintentar')

paso('Lote de 5 con un fallo intermedio: las demás siguen y la fallida queda pendiente de reintentar')
ll0 = (await llamadasIAs()).length
const capsLote = [capSimple, capCombinada, capResuelta, capSimple, capCombinada]
const tLote = Date.now()
await subirIA(['sup_original', 'error500', 'error500', 'error500', 'sup_aumento', 'hora_rara', 'aumento'], capsLote)
await pag.getByText('Apuesta 1 de 5').waitFor({ timeout: 60000 })
await formListo()
// Espera a que el lote termine de leerse (las 7 llamadas).
assert.ok(await esperar(async () => (await llamadasIAs()).length - ll0 >= 7, 60000), 'el lote sigue tras el fallo')
const tl = (await llamadasIAs()).slice(ll0).map((l) => l.t)
const duracionLote = ((tl.at(-1) - tLote) / 1000).toFixed(1)
await guardarRevision('Guardar y seguir')
await pag.getByText('Apuesta 2 de 5').waitFor()
await pag.getByText('Pendiente de reintentar', { exact: true }).waitFor()
await foto('39-lote-fallo-intermedio')
await cola(['liga_nueva'])
await pag.getByRole('button', { name: 'Reintentar' }).click()
await formListo()
for (let i = 2; i <= 5; i++) {
  await guardarRevision(i < 5 ? 'Guardar y seguir' : 'Guardar')
  if (i < 5) await pag.getByText(`Apuesta ${i + 1} de 5`).waitFor({ timeout: 30000 })
}
await pag.waitForURL(`${APP}/apuestas`)
bien(`Lote de 5 leído de una en una (con 2 reintentos de la 2.ª) en ${duracionLote} s; la fallida se reintentó y se guardaron las 5`)

paso('Lote: ante un 429 que agota los intentos, espera el retry-after antes de la siguiente captura')
ll0 = (await llamadasIAs()).length
await subirIA(['error429:2', 'error429:2', 'error429:2', 'unica'], [capSimple, capCombinada])
await pag.getByText('Apuesta 1 de 2').waitFor({ timeout: 60000 })
assert.ok(await esperar(async () => (await llamadasIAs()).length - ll0 >= 4, 60000))
const tp = (await llamadasIAs()).slice(ll0).map((l) => l.t)
assert.ok(tp[3] - tp[2] >= 1900, `pausa del lote tras el 429 (${tp[3] - tp[2]} ms)`)
bien(`Pausa de ${((tp[3] - tp[2]) / 1000).toFixed(1)} s antes de la siguiente captura`)

paso('Instrucciones v7 (con la regla del sustituto y la casa indicada) y caché en CADA lectura')
const todas = await llamadasIAs()
assert.ok(todas.every((l) => l.instruccionSustituto), 'la regla del sustituto va en todas')
assert.ok(todas.every((l) => l.cacheSistema && l.cacheCatalogo), 'caché en instrucciones y catálogo')
assert.ok(todas.every((l) => l.orden === 'catalogo,imagen,texto'), 'orden: parte fija, catálogo, imagen')
const v = await sql(`select distinct version_instrucciones v from transcripciones where created_at > now() - interval '1 hour'`)
assert.deepEqual(v.map((x) => x.v), [7])
bien(`${todas.length} llamadas: todas con la v7, la caché y el orden fijo → catálogo → imagen`)

const rellenarRayo = async (p) => {
  await p.goto(`${APP}/apuestas/nueva?manual=1`, { waitUntil: 'networkidle' })
  await p.getByLabel('Importe (€)').fill('7')
  await p.getByLabel('Evento', { exact: true }).fill('Rayo Vallecano - RCD Mallorca')
  await p.getByLabel('Pronóstico').fill('Rayo Vallecano')
  await p.getByLabel('Mercado').fill('1X2')
  await p.getByLabel('Deporte', { exact: true }).selectOption('Fútbol')
  await p.getByLabel('Cuota', { exact: true }).fill('2,2')
}

paso('Maquetación: 320, 375, 390 y 430 px, modo claro y oscuro')
for (const ancho of [320, 375, 390, 430]) {
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({ ...movil, viewport: { width: ancho, height: 800 }, colorScheme: tema })
    await ctx.addCookies([cookieSesion(ANA)])
    const p = await ctx.newPage()
    await p.goto(`${APP}/apuestas/nueva?manual=1`, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Crear apuesta / Mismo partido' }).click()
    await p.getByLabel('Deporte', { exact: true }).first().selectOption('Fútbol')
    await p.getByLabel('Día del partido').fill('2026-11-08')
    await ponerHora(p, '21:00')
    await p.getByRole('checkbox', { name: 'En directo', exact: true }).check()
    await p.getByRole('checkbox', { name: 'Precipitada', exact: true }).check()
    await p.getByRole('checkbox', { name: 'Promoción', exact: true }).check()
    await p.getByLabel('Tipo de promoción').selectOption('superaumento')
    await p.getByLabel('Importe (€)').fill('10')
    await p.getByLabel('Cuota total').fill('2,5')
    await p.getByLabel('Cuota original').fill('2')
    const problemas = await p.evaluate(() => {
      const fallos = []
      for (const l of document.querySelectorAll('form label:has(input[type=checkbox])')) {
        const r = l.getBoundingClientRect()
        if (r.height < 44) fallos.push(`casilla «${l.textContent}» baja (${r.height}px)`)
        const caja = l.closest('fieldset').getBoundingClientRect()
        if (r.right > caja.right + 0.5) fallos.push(`casilla «${l.textContent}» se sale`)
      }
      if (document.documentElement.scrollWidth > window.innerWidth) fallos.push(`scroll horizontal ${document.documentElement.scrollWidth}`)
      for (const el of document.querySelectorAll('form input, form select, form textarea, form button')) {
        const r = el.getBoundingClientRect()
        const caja = el.closest('li, fieldset')?.getBoundingClientRect()
        if (r.width === 0) continue
        if (caja && (r.right > caja.right + 0.5 || r.left < caja.left - 0.5)) fallos.push(`${el.tagName}#${el.id} se sale (${Math.round(r.right)} > ${Math.round(caja.right)})`)
        if (r.right > window.innerWidth + 0.5) fallos.push(`${el.tagName}#${el.id} se sale de la pantalla`)
      }
      // Hora y minuto: cada uno en su mitad, sin solaparse, y de al menos 44 px de alto.
      for (const m of document.querySelectorAll('select[aria-label^="Minuto"]')) {
        const hora = m.previousElementSibling.getBoundingClientRect()
        const min = m.getBoundingClientRect()
        if (hora.right > min.left) fallos.push(`hora y minuto se solapan (${Math.round(hora.right)} > ${Math.round(min.left)})`)
        if (Math.abs(hora.width - min.width) > 1) fallos.push(`hora y minuto no miden lo mismo (${hora.width} vs ${min.width})`)
        if (hora.height < 44 || min.height < 44) fallos.push(`hora/minuto bajos (${hora.height}px)`)
      }
      if (!document.querySelector('input[type=date]')) fallos.push('falta el control de día')
      if (document.querySelector('input[type=time], input[type=datetime-local]')) fallos.push('queda un control nativo de hora')
      return fallos
    })
    assert.deepEqual(problemas, [], `${ancho}px ${tema}`)
    await p.getByLabel('Día del partido').scrollIntoViewIfNeeded()
    await p.screenshot({ path: join(SALIDA, `21-maqueta-${ancho}-${tema}.png`) })
    await p.getByRole('checkbox', { name: 'En directo', exact: true }).scrollIntoViewIfNeeded()
    await p.screenshot({ path: join(SALIDA, `24-casillas-${ancho}-${tema}.png`) })
    await p.getByLabel('Resumen de la promoción').scrollIntoViewIfNeeded()
    await p.screenshot({ path: join(SALIDA, `36-promo-${ancho}-${tema}.png`) })
    // Aviso de apuesta duplicada
    await rellenarRayo(p)
    const aviso = p.getByRole('alertdialog', { name: 'Apuesta duplicada' })
    await aviso.waitFor({ timeout: 5000 })
    await aviso.scrollIntoViewIfNeeded()
    const fallosAviso = await aviso.evaluate((el) => {
      const f = []
      const caja = el.getBoundingClientRect()
      if (caja.right > window.innerWidth + 0.5 || caja.left < -0.5) f.push('el aviso se sale de la pantalla')
      for (const b of el.querySelectorAll('button')) {
        const r = b.getBoundingClientRect()
        if (r.height < 44) f.push(`botón «${b.textContent}» bajo (${r.height}px)`)
        if (r.right > caja.right + 0.5) f.push(`botón «${b.textContent}» se sale`)
      }
      if (document.documentElement.scrollWidth > window.innerWidth) f.push('scroll horizontal')
      return f
    })
    assert.deepEqual(fallosAviso, [], `aviso ${ancho}px ${tema}`)
    await p.screenshot({ path: join(SALIDA, `31-aviso-${ancho}-${tema}.png`) })
    await p.goto(`${APP}/apuestas?directo=1&precipitada=1`, { waitUntil: 'networkidle' })
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    assert.equal(desborde, false, `lista ${ancho}px ${tema}`)
    await ctx.close()
  }
}
bien('Sin desbordes ni scroll horizontal en los 4 anchos y los 2 modos; día y hora, cada uno en su mitad; aviso de duplicada con botones ≥ 44 px')

paso('Ajustes: coste de la IA')
await pag.goto(`${APP}/ajustes`)
await pag.getByText('Coste medio por captura').waitFor()
await foto('10-ajustes-coste')
const llamadas = await (await fetch('http://localhost:54322/__llamadas')).json()
bien(`${llamadas.length} llamadas a la IA registradas; modelo ${llamadas[0].model}, esfuerzo ${llamadas[0].effort}, formato ${llamadas[0].formato}`)
assert.ok(llamadas.every((l) => l.model === 'claude-sonnet-5-5'))
assert.ok(llamadas.every((l) => l.maxTokens === 16000), 'max_tokens holgado para varias apuestas')
const conCatalogo = llamadas.filter((l) => l.catalogo)
assert.ok(conCatalogo.length === llamadas.length, 'el catálogo va en todas las llamadas')
assert.ok(conCatalogo.every((l) => l.catalogo.length <= 4000 + 21), 'con tope de tamaño')
bien(`Catálogo enviado como datos: ${conCatalogo[0].catalogo.length} caracteres (≈ ${Math.round(conCatalogo[0].catalogo.length / 3)} tokens)`)
const grande = llamadas.find((l) => l.bytesImagen > 0 && l.bytesImagen < 600_000) ?? llamadas[1]
assert.ok(grande.bytesImagen < 600_000, `imagen reducida: ${grande.bytesImagen} bytes`)
bien(`La captura de 3000×5000 llegó a la IA reducida (${Math.round(grande.bytesImagen / 1024)} KB)`)

// ---------- Copia de seguridad en CSV ----------
paso('Copia de seguridad: descargar apuestas y selecciones en CSV')
// Lee un CSV como Excel: separador ";", comillas dobles, saltos de línea dentro de comillas.
function leerCsv(texto) {
  assert.ok(texto.startsWith('﻿'), 'con BOM UTF-8')
  const filas = []
  let fila = []
  let celda = ''
  let dentro = false
  const t = texto.slice(1)
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (dentro) {
      if (ch === '"' && t[i + 1] === '"') { celda += '"'; i++ } else if (ch === '"') dentro = false
      else celda += ch
    } else if (ch === '"') dentro = true
    else if (ch === ';') { fila.push(celda); celda = '' }
    else if (ch === '\r' && t[i + 1] === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; i++ }
    else celda += ch
  }
  const [cab, ...resto] = filas
  return resto.map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i]])))
}
async function descargarCsv(p, boton) {
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: boton }).click()])
  const ruta = join(SALIDA, descarga.suggestedFilename())
  await descarga.saveAs(ruta)
  return { nombre: descarga.suggestedFilename(), filas: leerCsv(readFileSync(ruta, 'utf8')) }
}

await pag.goto(`${APP}/ajustes`)
await pag.getByRole('heading', { name: 'Copia de seguridad' }).waitFor()
const csvAna = await descargarCsv(pag, 'Descargar apuestas (CSV)')
assert.equal(csvAna.nombre, `filoverde-apuestas-${hoyMadrid}.csv`)
const [{ n: nAna }] = await sql(`select count(*)::int n from apuestas where user_id = '${ANA.id}'`)
assert.equal(csvAna.filas.length, nAna, 'una fila por apuesta')
await pag.getByText(`Descargado filoverde-apuestas-${hoyMadrid}.csv (${nAna} apuestas).`).waitFor()
assert.ok(csvAna.filas.every((f) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(f.fecha)), 'fechas AAAA-MM-DD HH:MM')
assert.ok(csvAna.filas.every((f) => /^\d+,\d{2}$/.test(f.importe)), 'importes con coma y 2 decimales')
assert.ok(csvAna.filas.some((f) => f.casa === 'Codere'), 'la casa sale por nombre')
const fechasAna = csvAna.filas.map((f) => f.fecha)
assert.deepEqual(fechasAna, [...fechasAna].sort(), 'ordenadas por fecha')
await foto('70-copia-seguridad')
const selAna = await descargarCsv(pag, 'Descargar selecciones (CSV)')
assert.equal(selAna.nombre, `filoverde-selecciones-${hoyMadrid}.csv`)
const [{ n: nSelAna }] = await sql(`select count(*)::int n from selecciones where user_id = '${ANA.id}'`)
assert.equal(selAna.filas.length, nSelAna)
const combinada = csvAna.filas.find((f) => f.tipo === 'combinada')
assert.ok(combinada, 'Ana tiene una combinada')
assert.ok(selAna.filas.filter((s) => s.apuesta_id === combinada.id).length >= 2, 'la combinada tiene varias filas con su id')
bien(`Ana: ${nAna} apuestas y ${nSelAna} selecciones; la combinada sale en varias filas con el mismo id de apuesta`)

// Carla: más de 1000 apuestas (Supabase y el simulador cortan en 1000 por consulta).
const CARLA = { id: '00000000-0000-4000-8000-00000000000c', email: 'carla@prueba.local' }
await sql(`insert into apuestas (user_id, tipo, fecha, importe, divisa, cuota_total, estado, resultado_economico, notas)
  select '${CARLA.id}', 'simple', timestamptz '2026-01-01 12:00+01' + g * interval '1 hour', 1000 + g, 'EUR', 1.85,
         case when g = 1 then 'perdida' else 'pendiente' end, case when g = 1 then -1250 end,
         case when g = 1 then '=HIPERVINCULO("x"); ojo' when g = 2 then 'Línea 1' || chr(10) || 'Línea 2 con ñ' end
  from generate_series(1, 1205) g`)
await sql(`insert into selecciones (apuesta_id, user_id, orden, evento, deporte, mercado, pronostico, cuota, estado)
  select id, user_id, 0, 'Betis - Sevilla', 'Fútbol', '1X2', '-1 hándicap', 1.85, 'pendiente' from apuestas where user_id = '${CARLA.id}'`)
const ctxCarla = await navegador.newContext({ ...movil, acceptDownloads: true })
await ctxCarla.addCookies([cookieSesion(CARLA)])
const pagCarla = await ctxCarla.newPage()
pagCarla.on('pageerror', (e) => erroresConsola.push(e.message))
await pagCarla.goto(`${APP}/ajustes`)
const csvCarla = await descargarCsv(pagCarla, 'Descargar apuestas (CSV)')
assert.equal(csvCarla.filas.length, 1205, 'las 1205 apuestas, no solo 1000')
assert.equal(csvCarla.filas[0].resultado_economico, '-12,50', 'resultado negativo como número, sin apóstrofo')
assert.equal(csvCarla.filas[0].notas, `'=HIPERVINCULO("x"); ojo`, 'nota con "=" protegida')
assert.equal(csvCarla.filas[1].notas, 'Línea 1\nLínea 2 con ñ', 'salto de línea y ñ dentro de la celda')
assert.equal(csvCarla.filas[0].fecha, '2026-01-01 13:00')
assert.equal(csvCarla.filas[1204].importe, '22,05')
assert.equal(csvCarla.filas[0].cuota_total, '1,85')
const selCarla = await descargarCsv(pagCarla, 'Descargar selecciones (CSV)')
assert.equal(selCarla.filas.length, 1205)
assert.equal(selCarla.filas[0].pronostico, "'-1 hándicap", 'pronóstico que empieza por "-" protegido')
assert.equal(selCarla.filas[0].cuota, '1,85', 'la cuota sigue siendo número')
assert.equal(selCarla.filas[0].apuesta_id, csvCarla.filas[0].id, 'mismo orden que las apuestas')
assert.ok(!selCarla.filas.some((s) => csvAna.filas.some((a) => a.id === s.apuesta_id)), 'nada de Ana')
bien('Carla: 1205 apuestas y 1205 selecciones (más de 1000), negativos como número y fórmulas protegidas')

// ---------- Fase 2 · Análisis ----------
paso('Análisis: métricas de las apuestas resueltas (comparadas con la base de datos)')
const eur = (c, conSigno = false) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, signDisplay: conSigno ? 'exceptZero' : 'auto' }).format(c / 100)
const pct = (v) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v * 100)} %`
const valorTarjeta = (p, t) => p.locator(`[data-tarjeta="${t}"] p`).nth(1).innerText()
const RESUELTOS = `('ganada','perdida','cash_out','media_ganada','media_perdida')`
async function esperado(userId, extra = '') {
  const [f] = await sql(`select
      count(*) filter (where estado in ${RESUELTOS})::int n,
      coalesce(sum(importe) filter (where estado in ${RESUELTOS} and promo_tipo is distinct from 'credito'), 0)::bigint importe,
      coalesce(sum(resultado_economico) filter (where estado in ${RESUELTOS}), 0)::bigint beneficio,
      coalesce(sum(resultado_economico) filter (where estado in ${RESUELTOS} and promo_tipo is distinct from 'credito'), 0)::bigint propio,
      count(*) filter (where estado in ${RESUELTOS} and promo_tipo is distinct from 'credito' and resultado_economico > 0)::int g,
      count(*) filter (where estado in ${RESUELTOS} and promo_tipo is distinct from 'credito' and resultado_economico < 0)::int p,
      count(*) filter (where estado = 'pendiente')::int pend
    from apuestas where user_id = '${userId}' ${extra}`)
  // «En juego» (desde el 2026-11-09): TODAS las pendientes, sin filtro de fechas.
  f.pendTodas = (await sql(`select count(*)::int n from apuestas where user_id = '${userId}' and estado = 'pendiente'`))[0].n
  return { ...f, importe: Number(f.importe), beneficio: Number(f.beneficio), propio: Number(f.propio) }
}
async function comprobarTarjetas(p, e) {
  assert.equal(await valorTarjeta(p, 'Apuestas resueltas'), String(e.n))
  assert.equal(await valorTarjeta(p, 'En juego'), String(e.pendTodas), 'En juego = todas las pendientes')
  assert.equal(await p.locator('[data-tarjeta="En juego"] [data-aviso="en-juego"]').innerText(), 'Todas tus pendientes, sin filtro de fechas')
  assert.equal(await valorTarjeta(p, 'Importe apostado'), eur(e.importe))
  assert.equal(await valorTarjeta(p, 'Beneficio neto'), eur(e.beneficio, true))
  assert.equal(await valorTarjeta(p, 'Yield'), e.importe ? pct(e.propio / e.importe) : '—')
  assert.equal(await valorTarjeta(p, '% de acierto'), e.g + e.p ? pct(e.g / (e.g + e.p)) : '—')
}
// Filtro de periodo (fichas): pulsa la ficha y, en Personalizado, escribe los días.
async function elegirPeriodo(p, valor, { desde, hasta, dentro = 'main' } = {}) {
  await p.locator(`${dentro} [role="group"][aria-label="Periodo"]:visible [data-periodo="${valor}"]`).click()
  if (valor === 'personalizado') {
    await p.getByLabel('Desde').fill(desde)
    await p.getByLabel('Hasta').fill(hasta)
    await p.getByRole('button', { name: 'Ver', exact: true }).click()
    await p.waitForURL(new RegExp(`desde=${desde}`))
  } else if (valor === 'todo') await p.waitForURL((u) => !new URL(u).searchParams.has('periodo'))
  else await p.waitForURL(new RegExp(`periodo=${valor}`))
}
await pag.goto(`${APP}/analisis`)
assert.equal(await pag.getByRole('link', { name: 'Análisis' }).getAttribute('aria-current'), 'page')
const eAna = await esperado(ANA.id)
assert.ok(eAna.n > 0, 'Ana tiene apuestas resueltas')
await comprobarTarjetas(pag, eAna)
await pag.getByText('Muestra pequeña').first().waitFor()
await pag.getByText('Rachas (solo con las apuestas del periodo elegido)').waitFor()
await pag.getByText('Lo no marcado como directo cuenta como pre-partido', { exact: false }).waitFor()
await foto('80-analisis')
bien(`Ana: ${eAna.n} resueltas, ${eurTxt(eAna.beneficio)} de beneficio, yield y acierto como en la BD; ${eAna.pend} en juego`)
function eurTxt(c) { return eur(c, true) }
// Cambiar de segmento y de orden.
await pag.getByLabel('Segmento', { exact: true }).selectOption('cuota')
await pag.waitForURL(/seg=cuota/)
await pag.getByText('Hasta 1,50').or(pag.getByText('1,51 – 2,00')).or(pag.getByText('2,01 – 3,00')).or(pag.getByText('Más de 3,00')).first().waitFor()
await pag.getByLabel('Ordenar', { exact: true }).selectOption('n')
await pag.waitForURL(/orden=n/)
await pag.getByLabel('Tipo de apuesta', { exact: true }).selectOption('mismo_partido')
await pag.waitForURL(/tipo=mismo_partido/)
await foto('81-analisis-segmento')
// Filtro: este mes (en hora de España) y un periodo sin apuestas.
await elegirPeriodo(pag, 'mes')
const eMes = await esperado(ANA.id, `and fecha >= (date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
  and fecha < ((date_trunc('month', now() at time zone 'Europe/Madrid') + interval '1 month') at time zone 'Europe/Madrid')`)
if (eMes.n > 0) await comprobarTarjetas(pag, eMes)
else await pag.getByText('No hay apuestas resueltas en este periodo').waitFor()
await elegirPeriodo(pag, 'personalizado', { desde: '2020-01-01', hasta: '2020-12-31' })
await pag.getByText('No hay apuestas resueltas en este periodo').waitFor()
// Periodos nuevos en Análisis: Hoy, Ayer y Últimos 7 días (en hora de España).
const condDia = (desdeDias, hastaDias) => `and fecha >= ((date_trunc('day', now() at time zone 'Europe/Madrid') - interval '${desdeDias} day') at time zone 'Europe/Madrid')
  and fecha < ((date_trunc('day', now() at time zone 'Europe/Madrid') - interval '${hastaDias} day') at time zone 'Europe/Madrid')`
const CONDS = { hoy: condDia(0, -1), ayer: condDia(1, 0), '7d': condDia(6, -1) }
for (const [per, cond] of Object.entries(CONDS)) {
  await elegirPeriodo(pag, per)
  const e = await esperado(ANA.id, cond)
  if (e.n > 0) await comprobarTarjetas(pag, e)
  else await pag.getByText('No hay apuestas resueltas en este periodo').waitFor()
}
bien('Periodos nuevos en Análisis: Hoy, Ayer y Últimos 7 días cuadran con la BD (hora de España)')
bien(`Filtro de fechas: «Este mes» = ${eMes.n} resueltas (como la BD en hora de España); 2020 → sin apuestas`)

// Carla: más de 1000 resueltas (Supabase corta en 1000 por consulta).
await sql(`with x as (select id, row_number() over (order by fecha, id) rn from apuestas where user_id = '${CARLA.id}' and estado = 'pendiente')
  update apuestas a set estado = case when x.rn % 2 = 0 then 'ganada' else 'perdida' end,
    resultado_economico = case when x.rn % 2 = 0 then round(a.importe * 0.85) else -a.importe end
  from x where a.id = x.id and x.rn <= 1199`)
await pagCarla.goto(`${APP}/analisis`)
const eCarla = await esperado(CARLA.id)
assert.equal(eCarla.n, 1200)
assert.equal(eCarla.pend, 5)
await comprobarTarjetas(pagCarla, eCarla)
assert.equal(await pagCarla.getByText('En cifras', { exact: true }).count(), 0, 'el bloque «En cifras» ya no está')
bien('Carla: 1200 resueltas y 5 en juego (más de 1000), cifras iguales que en la BD')

// ---------- Retoques: detalle de cada cifra y aciertos por liga ----------
paso('Análisis: cada fila abre las apuestas que la forman (mismo recuento) y se vuelve al mismo sitio')
const filasDe = (p, tabla) => p.locator(`[data-tabla="${tabla}"] > li`)
const numeroDato = async (fila, nombre) =>
  Number((await fila.locator('dt', { hasText: new RegExp(`^${nombre}$`) }).locator('xpath=following-sibling::dd').innerText()).trim())
async function abrirYContar(p, fila, { esperado, selecciones, etiqueta }) {
  const desde = p.url()
  etiqueta ??= (await fila.locator('p').first().innerText()).trim()
  await fila.locator('a').click()
  await p.waitForURL(/\/analisis\/detalle\?/)
  // Espera a que se vea el detalle de ESTA fila (la dirección cambia antes que la pantalla).
  const fin = new RegExp(`: ${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  await p.locator('[data-detalle="titulo"]', { hasText: fin }).waitFor()
  const recuento = await p.locator('[data-detalle="recuento"]').innerText()
  const nTarjetas = await p.locator('[data-detalle="lista"] > li').count()
  const m = /(\d+) (?:apuesta|apuestas)$/.exec(recuento)
  assert.ok(m, recuento)
  const nApuestas = Number(m[1])
  if (esperado != null) assert.equal(nApuestas, esperado, `recuento = cifra de la fila (${recuento}) · ${desde} → ${p.url()}`)
  if (selecciones != null) assert.ok(recuento.startsWith(`${selecciones} selecci`), recuento)
  assert.equal(nTarjetas, Math.min(50, nApuestas), 'tarjetas en la lista')
  return { desde, recuento, nApuestas }
}
// Segmentos de Ana: casa, mercado (con «Varios»/«Sin dato» si los hay) y directo.
const verificadas = []
for (const seg of ['casa', 'mercado', 'directo', 'liga']) {
  await pag.goto(`${APP}/analisis?periodo=mes&seg=${seg}&orden=n`)
  const filas = filasDe(pag, 'segmentos')
  const n = await filas.count()
  for (let i = 0; i < Math.min(n, 3); i++) {
    const fila = filasDe(pag, 'segmentos').nth(i)
    const etiqueta = (await fila.locator('p').first().innerText()).trim()
    const cifra = await numeroDato(fila, 'Apuestas')
    const { desde } = await abrirYContar(pag, fila, { esperado: cifra, etiqueta })
    assert.ok((await pag.locator('[data-detalle="titulo"]').innerText()).endsWith(etiqueta))
    await pag.getByRole('link', { name: '← Análisis' }).click()
    await pag.waitForURL(desde)
    verificadas.push(`${seg}: ${etiqueta} (${cifra})`)
  }
}
assert.ok(verificadas.some((v) => /Varios|Sin dato|Sin casa/.test(v)), `se abrió alguna fila «Varios»/«Sin…»: ${verificadas.join(' | ')}`)
bien(`Filas abiertas con su recuento exacto y vuelta al mismo periodo/segmento/orden: ${verificadas.length}`)

// Aciertos: Mercado / Liga con sus columnas, y detalle con Todas / Verdes / Rojas.
await pag.goto(`${APP}/analisis`)
await pag.getByLabel('Agrupar aciertos por', { exact: true }).selectOption('liga')
await pag.waitForURL(/ac=liga/)
await pag.getByRole('heading', { name: /Aciertos por selección · Liga/ }).waitFor()
const filaLiga = filasDe(pag, 'aciertos').first()
for (const col of ['Verdes', 'Rojas', '% verdes', 'Total']) await filaLiga.locator('dt', { hasText: new RegExp(`^${col.replace('%', '\\%')}$`) }).waitFor()
const [verdes, rojas, totalSel] = [await numeroDato(filaLiga, 'Verdes'), await numeroDato(filaLiga, 'Rojas'), await numeroDato(filaLiga, 'Total')]
assert.equal(verdes + rojas, totalSel)
await abrirYContar(pag, filaLiga, { selecciones: totalSel })
await pag.getByRole('link', { name: 'Rojas', exact: true }).click()
await pag.waitForURL(/color=rojas/)
assert.ok((await pag.locator('[data-detalle="recuento"]').innerText()).startsWith(`${rojas} selecci`))
await foto('84-detalle-aciertos')
bien(`Aciertos por liga: ${verdes} verdes + ${rojas} rojas = ${totalSel}; el detalle cuenta las mismas selecciones (y filtra rojas)`)
await pag.getByLabel('Agrupar aciertos por', { exact: true }).count() // (sigue en el detalle)
await pag.getByRole('link', { name: '← Análisis' }).click()
await pag.waitForURL(/\/analisis\?ac=liga$/)
await pag.getByLabel('Agrupar aciertos por', { exact: true }).selectOption('mercado')
await pag.waitForURL(/ac=mercado/)
await pag.getByRole('heading', { name: /Aciertos por selección · Mercado/ }).waitFor()

// Entrar en una apuesta desde el detalle y volver: al mismo detalle y con los mismos filtros.
await pag.goto(`${APP}/analisis?periodo=mes&seg=tipo&orden=n`)
await filasDe(pag, 'segmentos').first().locator('a').click()
await pag.waitForURL(/\/analisis\/detalle\?/)
const urlDetalle = pag.url()
await pag.locator('[data-detalle="lista"] > li a').first().click()
await esperarDetalle()
await pag.getByRole('link', { name: '← Análisis' }).click()
await pag.waitForURL(urlDetalle)
bien('Apuesta abierta desde el detalle: «← Análisis» vuelve al mismo detalle (periodo, segmento y orden)')
// Guardar desde esa apuesta también vuelve al detalle (y sin el aviso de la lista).
await pag.locator('[data-detalle="lista"] > li a').first().click()
await esperarDetalle()
await pag.getByRole('button', { name: 'Guardar', exact: true }).first().click()
await pag.waitForURL(urlDetalle)
bien('Guardar desde la apuesta vuelve al mismo detalle')

// El periodo cambia el detalle; una fila que no existe en ese periodo lo dice.
const urlVacio = urlDetalle.replace(/periodo=mes/, 'periodo=personalizado&desde=2020-01-01&hasta=2020-12-31')
await pag.goto(urlVacio)
await pag.getByText('No hay apuestas en esta fila con el periodo y los filtros elegidos.').waitFor()
bien('Con otro periodo el detalle cambia (2020 → sin apuestas)')

// Carla: 1200 en «Pre-partido», paginadas de 50 en 50 con el recuento total.
await pagCarla.goto(`${APP}/analisis?seg=directo`)
const filaPre = filasDe(pagCarla, 'segmentos').first()
assert.equal(await numeroDato(filaPre, 'Apuestas'), 1200)
await abrirYContar(pagCarla, filaPre, { esperado: 1200 })
await pagCarla.getByText('1–50 de 1200').waitFor()
await pagCarla.getByRole('link', { name: 'Más antiguas →' }).click()
await pagCarla.getByText('51–100 de 1200').waitFor()
bien('Carla: «Pre-partido» = 1200 apuestas, paginadas de 50 en 50')

// Seguridad: ?volver= externo no se usa; Beto no ve nada de Ana con la dirección del detalle.
const idAna = (await sql(`select id from apuestas where user_id = '${ANA.id}' limit 1`))[0].id
for (const malo of ['//evil.com', '/%2F%2Fevil.com', '/analisis@evil.com', 'https://evil.com']) {
  await pag.goto(`${APP}/apuestas/${idAna}?volver=${encodeURIComponent(malo)}`)
  assert.equal(await pag.getByRole('link', { name: '← Lista' }).getAttribute('href'), '/apuestas', malo)
}
bien('Un ?volver= externo se ignora (vuelve a /apuestas)')

// ---------- Fase 3 · Evolución en el tiempo ----------
paso('Análisis → Evolución: beneficio acumulado, caídas, meses y días (comparados con la base de datos)')
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_ES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const evo = (p) => p.locator('[data-seccion="evolucion"]:visible')
async function caidasBd(userId, extra = '') {
  const filas = await sql(`select resultado_economico::bigint r from apuestas where user_id = '${userId}' and estado in ${RESUELTOS}
    and resultado_economico is not null ${extra} order by fecha, created_at, id`)
  let acc = 0, pico = 0, max = 0
  for (const f of filas) { acc += Number(f.r); if (acc > pico) pico = acc; else max = Math.max(max, pico - acc) }
  return { n: filas.length, final: acc, max, actual: pico - acc }
}
await pag.goto(`${APP}/analisis?periodo=30d`)
await evo(pag).waitFor()
assert.equal(await pag.locator('main [data-grafica]:visible').count(), 0, 'Análisis ya no tiene la gráfica')
assert.equal(await pag.locator('[data-tarjeta="Mayor caída desde un máximo"]:visible').count(), 0, 'ni las caídas')
await evo(pag).getByText('Se usa la fecha de la apuesta (la fecha en que se resolvió no se guarda).', { exact: false }).waitFor()
assert.equal(await evo(pag).locator('[data-enlace="ver-evolucion"]').getAttribute('href'), '/graficas?periodo=30d')
bien('Análisis: sin la gráfica ni las caídas; «Ver evolución →» lleva a Gráficas con el mismo periodo')
// Meses y días: misma cuenta que la BD (hora de España).
const mesesBd = await sql(`select to_char(fecha at time zone 'Europe/Madrid', 'YYYY-MM') m, count(*)::int n from apuestas
  where user_id = '${ANA.id}' and estado in ${RESUELTOS} and resultado_economico is not null group by 1 order by 1 desc`)
const diasBd = await sql(`select extract(isodow from fecha at time zone 'Europe/Madrid')::int d, count(*)::int n from apuestas
  where user_id = '${ANA.id}' and estado in ${RESUELTOS} and resultado_economico is not null group by 1 order by 1`)
const leerFilas = async (tabla) => {
  const out = []
  const filas = filasDe(pag, tabla).filter({ visible: true })
  for (let i = 0; i < (await filas.count()); i++) out.push([(await filas.nth(i).locator('p').first().innerText()).trim(), await numeroDato(filas.nth(i), 'Apuestas')])
  return out
}
assert.deepEqual(await leerFilas('meses'), mesesBd.map((f) => [`${MESES_ES[Number(f.m.slice(5)) - 1]} ${f.m.slice(0, 4)}`, f.n]))
assert.deepEqual(await leerFilas('dias'), diasBd.map((f) => [DIAS_ES[f.d], f.n]))
bien(`Por mes (${mesesBd.length}) y por día de la semana (${diasBd.length}): mismas apuestas que la BD en hora de España`)
// Pulsar un mes y un día: el detalle cuenta lo mismo; abrir una apuesta y volver.
for (const tabla of ['meses', 'dias']) {
  await pag.goto(`${APP}/analisis`)
  const fila = filasDe(pag, tabla).filter({ visible: true }).first()
  const cifra = await numeroDato(fila, 'Apuestas')
  const { desde } = await abrirYContar(pag, fila, { esperado: cifra })
  const urlDet = pag.url()
  await pag.locator('[data-detalle="lista"] > li a').first().click()
  await esperarDetalle()
  await pag.getByRole('link', { name: '← Análisis' }).click()
  await pag.waitForURL((u) => mismaDir(u, urlDet))
  await pag.locator('[data-detalle="titulo"]').waitFor()
  await pag.getByRole('link', { name: '← Análisis' }).click()
  await pag.waitForURL((u) => mismaDir(u, desde))
}
bien('Fila de un mes y de un día: el detalle tiene las mismas apuestas; se abre una y se vuelve con «← Análisis»')
function mismaDir(a, b) {
  const [x, y] = [new URL(a), new URL(b)]
  const orden = (u) => [...u.searchParams].sort().join('&')
  return x.pathname === y.pathname && orden(x) === orden(y)
}
// Periodo: las tablas cambian con él.
await pag.goto(`${APP}/analisis`)
await elegirPeriodo(pag, 'mes')
const condMes = `and fecha >= (date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
  and fecha < ((date_trunc('month', now() at time zone 'Europe/Madrid') + interval '1 month') at time zone 'Europe/Madrid')`
const cMes = await caidasBd(ANA.id, condMes)
if (cMes.n > 0) await esperar(async () => (await filasDe(pag, 'meses').filter({ visible: true }).count()) === 1)
bien(`«Este mes»: un solo mes en la tabla (${cMes.n} resueltas)`)
await pagCarla.goto(`${APP}/analisis`)
await filasDe(pagCarla, 'meses').filter({ visible: true }).first().waitFor()
const diasCarla = (await sql(`select count(distinct (fecha at time zone 'Europe/Madrid')::date)::int n from apuestas where user_id = '${CARLA.id}' and estado in ${RESUELTOS}`))[0].n
const cCarla = await caidasBd(CARLA.id)
assert.equal((await leerFilasDe(pagCarla, 'meses')).reduce((s, n) => s + n, 0), 1200)
async function leerFilasDe(p, tabla) {
  const filas = filasDe(p, tabla).filter({ visible: true })
  const out = []
  for (let i = 0; i < (await filas.count()); i++) out.push(await numeroDato(filas.nth(i), 'Apuestas'))
  return out
}
bien('Carla: sus meses suman 1200')

// ---------- Fase 3 · Pestaña Gráficas ----------
paso('Gráficas: barra de 5 pestañas, beneficio acumulado y caídas (comparados con la base de datos)')
const navLinks = pag.locator('nav[aria-label="Navegación principal"] a')
assert.deepEqual(await navLinks.allInnerTexts(), ['Apuestas', 'Análisis', 'Gráficas', 'Bankroll', 'Ajustes'])
await navLinks.nth(2).click()
await pag.waitForURL(`${APP}/graficas`)
assert.equal(await navLinks.nth(2).getAttribute('aria-current'), 'page')
const graf = (p, id) => p.locator(`main [data-grafica="${id}"]:visible`)
await graf(pag, 'beneficio').waitFor()
assert.equal(Number(await graf(pag, 'beneficio').getAttribute('data-ultimo')), eAna.beneficio, 'final = beneficio neto de Análisis')
assert.equal(await graf(pag, 'beneficio').getAttribute('data-tono'), eAna.beneficio > 0 ? 'positivo' : eAna.beneficio < 0 ? 'negativo' : 'neutro')
assert.equal(await pag.locator('main [data-final]:visible').innerText(), eur(eAna.beneficio, true), 'el final se escribe con signo junto a la gráfica')
const cAna = await caidasBd(ANA.id)
assert.equal(cAna.final, eAna.beneficio)
assert.equal(await valorTarjeta(pag, 'Mayor caída desde un máximo'), eur(cAna.max))
assert.equal(await valorTarjeta(pag, 'Caída actual desde el máximo'), eur(cAna.actual))
// Tocar el extremo derecho a media altura: se elige el punto más cercano al dedo; si hay varios
// casi pegados (apuestas del mismo día), la etiqueta dice cuál es. Con las flechas, el último.
const grafBen = graf(pag, 'beneficio')
const cajaB = await grafBen.locator('[role="img"]').boundingBox()
await grafBen.locator('[role="img"]').tap({ position: { x: cajaB.width - 1, y: cajaB.height / 2 } })
const etqToque = await grafBen.locator('[data-etiqueta-grafica]').innerText()
assert.ok(/\d{2}:\d{2} · apuesta \d+ de \d+/.test(etqToque), etqToque)
const pegados = /\((\d+) de (\d+) aquí/.exec(etqToque)
await grafBen.locator('[role="img"]').focus()
await pag.keyboard.press('Escape')
await pag.keyboard.press('ArrowLeft')
const etq = await grafBen.locator('[data-etiqueta-grafica]').innerText()
assert.ok(etq.includes(`Acumulado: ${eur(eAna.beneficio, true)}`) && /\d{2}:\d{2}/.test(etq), etq)
await foto('86-graficas')
if (pegados) bien(`Puntos casi pegados: la etiqueta dice «${pegados[1]} de ${pegados[2]} aquí» con fecha, hora y valor`)
bien(`5 pestañas; final ${eur(eAna.beneficio, true)} (${await graf(pag, 'beneficio').getAttribute('data-tono')}) = beneficio neto; caídas ${eur(cAna.max)} / ${eur(cAna.actual)} como en la BD; etiqueta con fecha y hora`)

paso('Gráficas por segmento: cada serie = su fila de Análisis; escala, orden, detalle con casa y vuelta')
const leerSeries = async (p) => {
  const lis = p.locator('main [data-lista="series"]:visible > li')
  const out = []
  for (let i = 0; i < (await lis.count()); i++) {
    const li = lis.nth(i)
    out.push({ etiqueta: await li.getAttribute('data-serie'), n: Number(await li.getAttribute('data-n')), beneficio: Number(await li.getAttribute('data-beneficio')) })
  }
  return out
}
const filasAnalisis = async (p, seg) => {
  await p.goto(`${APP}/analisis?seg=${seg}&orden=n`)
  const filas = filasDe(p, 'segmentos').filter({ visible: true })
  await filas.first().waitFor()
  const out = new Map()
  for (let i = 0; i < (await filas.count()); i++) {
    const f = filas.nth(i)
    const et = (await f.locator('p').first().innerText()).trim()
    const ben = (await f.locator('dt', { hasText: /^Beneficio$/ }).locator('xpath=following-sibling::dd').innerText()).trim()
    out.set(et, { n: await numeroDato(f, 'Apuestas'), ben })
  }
  return out
}
for (const seg of ['cuota', 'tipo', 'liga']) {
  const esperadas = await filasAnalisis(pag, seg)
  await pag.goto(`${APP}/graficas?seg=${seg}`)
  await pag.locator('main [data-lista="series"]:visible > li').first().waitFor()
  const series = await leerSeries(pag)
  assert.equal(series.length, Math.min(8, esperadas.size), `${seg}: una gráfica por valor (máx. 8)`)
  for (const sr of series) {
    const f = esperadas.get(sr.etiqueta)
    assert.ok(f, `${seg}: «${sr.etiqueta}» está en Análisis`)
    assert.equal(sr.n, f.n, `${seg} · ${sr.etiqueta}: nº`)
    assert.equal(eur(sr.beneficio, true), f.ben, `${seg} · ${sr.etiqueta}: beneficio = el de su fila`)
  }
  for (let i = 1; i < series.length; i++) assert.ok(series[i - 1].n >= series[i].n, 'más apuestas primero')
}
bien('Rango de cuota, tipo y liga: cada gráfica tiene el mismo nº y beneficio que su fila de Análisis; orden por nº de apuestas')
// Orden por beneficio y misma escala.
await pag.goto(`${APP}/graficas?seg=cuota`)
await pag.getByRole('group', { name: 'Ordenar' }).getByRole('button', { name: 'Beneficio' }).click()
await pag.waitForURL(/orden=beneficio/)
await esperar(async () => {
  const sr = await leerSeries(pag)
  return sr.every((x, i) => i === 0 || sr[i - 1].beneficio >= x.beneficio)
})
await pag.getByRole('group', { name: 'Escala del eje de euros' }).getByRole('button', { name: 'Misma escala' }).click()
await pag.waitForURL(/escala=misma/)
await foto('87-graficas-series')
bien('Conmutadores: orden por beneficio y «Misma escala» en la dirección')
// Pulsar la cabecera: el detalle tiene tantas apuestas como dice; abrir una y volver a Gráficas.
const urlSeries = pag.url()
const primera = pag.locator('main [data-lista="series"]:visible > li').first()
const nPrimera = Number(await primera.getAttribute('data-n'))
await primera.locator('a').first().click()
await pag.waitForURL(/\/analisis\/detalle\?/)
await pag.locator('[data-detalle="titulo"]').waitFor()
const mRec = /(\d+) apuestas?$/.exec(await pag.locator('[data-detalle="recuento"]').innerText())
assert.equal(Number(mRec[1]), nPrimera, 'recuento del detalle = cabecera')
const urlDetG = pag.url()
await pag.locator('[data-detalle="lista"] > li a').first().click()
await esperarDetalle()
await pag.getByRole('link', { name: '← Análisis' }).click()
await pag.waitForURL((u) => mismaDir(u, urlDetG))
await pag.getByRole('link', { name: '← Gráficas' }).click()
await pag.waitForURL((u) => mismaDir(u, urlSeries))
bien(`Cabecera → detalle con ${nPrimera} apuestas; apuesta abierta y vuelta a Gráficas con la misma escala y orden`)
// Casa: todo cambia; «Casa» desaparece del segmento; una apuesta sin casa solo en Todas y Sin casa.
const [casaG] = await sql(`select c.id, c.nombre from casas_apuestas c join apuestas a on a.casa_id = c.id where c.user_id = '${ANA.id}' and a.estado in ${RESUELTOS} group by c.id, c.nombre order by count(*) desc limit 1`)
await pag.goto(`${APP}/graficas?seg=casa`)
await pag.getByLabel('Casa', { exact: true }).selectOption(casaG.id)
await pag.waitForURL(new RegExp(`casa=${casaG.id}`))
const eCasaG = await esperado(ANA.id, `and casa_id = '${casaG.id}'`)
await esperar(async () => Number(await graf(pag, 'beneficio').getAttribute('data-ultimo')) === eCasaG.beneficio)
const opcSeg = await pag.getByLabel('Segmento', { exact: true }).locator('option').allTextContents()
assert.ok(!opcSeg.includes('Casa'), 'con una casa elegida no se ofrece «Casa»')
const cCasaG = await caidasBd(ANA.id, `and casa_id = '${casaG.id}'`)
assert.equal(await valorTarjeta(pag, 'Mayor caída desde un máximo'), eur(cCasaG.max))
const nSin = (await sql(`select count(*)::int n from apuestas where user_id = '${ANA.id}' and casa_id is null and estado in ${RESUELTOS}`))[0].n
if (nSin > 0) {
  await pag.getByLabel('Casa', { exact: true }).selectOption('sin')
  await pag.waitForURL(/casa=sin/)
  const eSin = await esperado(ANA.id, 'and casa_id is null')
  await esperar(async () => Number(await graf(pag, 'beneficio').getAttribute('data-ultimo')) === eSin.beneficio)
}
bien(`Casa «${casaG.nombre}»: final ${eur(eCasaG.beneficio, true)} y caídas como en la BD; sin «Casa» en el segmento${nSin ? '; «Sin casa» también cuadra' : ''}`)
// Periodos nuevos en Gráficas.
await pag.goto(`${APP}/graficas`)
for (const [per, cond] of Object.entries(CONDS)) {
  await elegirPeriodo(pag, per)
  const e = await esperado(ANA.id, cond)
  if (e.n > 0) await esperar(async () => Number(await graf(pag, 'beneficio').getAttribute('data-ultimo')) === e.beneficio)
  else await pag.locator('main [data-vacio="graficas"]:visible').waitFor()
}
bien('Gráficas con Hoy, Ayer y Últimos 7 días: el final cuadra con la BD')
// Ver más (8 en 8) con Carla, por mercado o liga si tiene más de 8 valores.
await pagCarla.goto(`${APP}/graficas`)
assert.equal(Number(await graf(pagCarla, 'beneficio').getAttribute('data-ultimo')), eCarla.beneficio)
assert.equal(Number(await graf(pagCarla, 'beneficio').getAttribute('data-puntos')), diasCarla + 1, 'un punto por día (+ el 0 inicial)')
assert.equal(await valorTarjeta(pagCarla, 'Mayor caída desde un máximo'), eur(cCarla.max))
let verMasProbado = false
for (const seg of ['mercado', 'liga', 'cuota', 'tipo']) {
  await pagCarla.goto(`${APP}/graficas?seg=${seg}`)
  await pagCarla.locator('main [data-lista="series"]:visible > li').first().waitFor()
  const total = Number((await pagCarla.locator('main [data-recuento="series"]:visible').innerText()).match(/^(\d+)/)[1])
  const vistas = await pagCarla.locator('main [data-lista="series"]:visible > li').count()
  assert.equal(vistas, Math.min(8, total))
  if (total > 8) {
    await pagCarla.locator('main [data-ver-mas]:visible').click()
    await pagCarla.waitForURL(/mas=16/)
    await esperar(async () => (await pagCarla.locator('main [data-lista="series"]:visible > li').count()) === Math.min(16, total))
    verMasProbado = true
    break
  }
}
// Si Carla no tiene más de 8 valores, se crean ligas de prueba para comprobar "Ver más".
if (!verMasProbado) {
  await sql(`update selecciones s set liga = 'Liga ' || (abs(hashtext(s.apuesta_id::text)) % 12) from apuestas a where a.id = s.apuesta_id and a.user_id = '${CARLA.id}'`)
  await pagCarla.goto(`${APP}/graficas?seg=liga`)
  await pagCarla.locator('main [data-lista="series"]:visible > li').first().waitFor()
  assert.equal(await pagCarla.locator('main [data-lista="series"]:visible > li').count(), 8)
  await pagCarla.locator('main [data-ver-mas]:visible').click()
  await pagCarla.waitForURL(/mas=16/)
  await esperar(async () => (await pagCarla.locator('main [data-lista="series"]:visible > li').count()) > 8)
}
bien('Carla (1200): un punto por día, final y caídas como en la BD; «Ver más» de 8 en 8')

paso('Análisis: maquetación a 320, 375, 390 y 430 px, modo claro y oscuro')
for (const ancho of [320, 375, 390, 430]) {
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({ ...movil, viewport: { width: ancho, height: 800 }, colorScheme: tema })
    await ctx.addCookies([cookieSesion(ANA)])
    const p = await ctx.newPage()
    for (const ruta of ['/analisis', '/analisis?seg=mercado&periodo=personalizado&desde=2026-01-01&hasta=2026-12-31', '/analisis?ac=liga', '/analisis/detalle?seg=directo&clave=%23Pre-partido', '/analisis/detalle?vista=aciertos&ac=mercado&clave=%23Sin+dato&color=rojas', '/analisis/detalle?seg=dia&clave=%231', '/analisis?periodo=ano', '/graficas', '/graficas?seg=liga&escala=misma&periodo=7d', '/graficas?periodo=hoy', '/bankroll', '/bankroll?periodo=30d', '/bankroll/nuevo', '/ajustes/casas', '/ajustes/estrategias', '/ajustes/deportes', '/ajustes/deportes/revisar']) {
      await p.goto(`${APP}${ruta}`, { waitUntil: 'networkidle' })
      const ancho2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      assert.ok(ancho2 <= 0, `${ruta} a ${ancho}px (${tema}): scroll horizontal de ${ancho2}px`)
    }
    // Barra de 5 pestañas: zonas táctiles de al menos 44 px y textos que caben.
    const pestañas = await p.locator('nav[aria-label="Navegación principal"] a').evaluateAll((as) =>
      as.map((a) => ({ w: a.getBoundingClientRect().width, h: a.getBoundingClientRect().height, cabe: a.scrollWidth <= a.clientWidth })),
    )
    assert.equal(pestañas.length, 5)
    for (const t of pestañas) assert.ok(t.w >= 44 && t.h >= 44 && t.cabe, `pestaña a ${ancho}px: ${JSON.stringify(t)}`)
    if (ancho === 390) await p.screenshot({ path: join(SALIDA, `82-analisis-390-${tema}.png`), fullPage: true })
    if (ancho === 320) {
      await p.goto(`${APP}/graficas?seg=cuota`, { waitUntil: 'networkidle' })
      await p.screenshot({ path: join(SALIDA, `88-graficas-320-${tema}.png`), fullPage: true })
    }
    await ctx.close()
  }
}
bien('Sin scroll horizontal en los 4 anchos y los 2 modos')
await ctxCarla.close()

// ---------- Fase 3 · Bankroll ----------
paso('Bankroll: movimientos y saldos (comparados con un cálculo aparte en la base de datos)')
const RES_BK = `('ganada','perdida','cash_out','media_ganada','media_perdida')`
// Saldo esperado calculado con SQL, independiente del código de la app.
async function esperadoBk(userId, casaId = null) {
  const cond = casaId ? `and casa_id = '${casaId}'` : ''
  const [f] = await sql(`select
    coalesce((select sum(case tipo when 'deposito' then importe when 'retirada' then -importe when 'ajuste' then importe else 0 end)
              from movimientos_bankroll where user_id = '${userId}' ${cond}), 0)::bigint
    + ${casaId ? `coalesce((select sum(importe) from movimientos_bankroll where user_id = '${userId}' and tipo = 'traspaso' and casa_destino_id = '${casaId}'), 0)::bigint
    - coalesce((select sum(importe) from movimientos_bankroll where user_id = '${userId}' and tipo = 'traspaso' and casa_id = '${casaId}'), 0)::bigint` : '0'}
    + coalesce((select sum(resultado_economico) from apuestas where user_id = '${userId}' ${cond} and estado in ${RES_BK}), 0)::bigint as saldo,
    coalesce((select sum(importe) from apuestas where user_id = '${userId}' ${cond} and estado = 'pendiente'), 0)::bigint as en_juego,
    coalesce((select sum(resultado_economico) from apuestas where user_id = '${userId}' ${cond} and estado in ${RES_BK}), 0)::bigint as beneficio,
    coalesce((select sum(importe) from movimientos_bankroll where user_id = '${userId}' ${cond} and tipo = 'deposito'), 0)::bigint as depositado`)
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)]))
}
const cifraBk = (p, bloque, n) => p.locator(`${bloque} [data-cifra="${n}"] dd`).innerText()
async function comprobarBk(p, bloque, e) {
  // Espera (máx. 10 s) a que la pantalla muestre el saldo esperado; luego compara el resto.
  const exacto = new RegExp(`^${eur(e.saldo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  await p.locator(`${bloque} [data-cifra="Saldo"] dd`, { hasText: exacto }).waitFor({ timeout: 10000 }).catch(() => {})
  assert.equal(await cifraBk(p, bloque, 'Saldo'), eur(e.saldo), `${bloque} saldo`)
  assert.equal(await cifraBk(p, bloque, 'En juego'), eur(e.en_juego), `${bloque} en juego`)
  assert.equal(await cifraBk(p, bloque, 'ROI sobre bankroll').catch(() => cifraBk(p, bloque, 'ROI')), e.depositado ? pct(e.beneficio / e.depositado) : '—', `${bloque} ROI`)
}
// Casa principal de Ana: la que tiene más apuestas resueltas.
const [casaBk] = await sql(`select c.id, c.nombre from casas_apuestas c join apuestas a on a.casa_id = c.id
  where c.user_id = '${ANA.id}' and a.estado in ${RES_BK} group by c.id, c.nombre order by count(*) desc, c.nombre limit 1`)
await pag.goto(`${APP}/bankroll`)
await pag.getByText('Registra tus depósitos y retiradas pasados para que el saldo y el ROI sean correctos.').waitFor()
assert.equal(await cifraBk(pag, '[data-bloque="global"]', 'ROI sobre bankroll'), '—', 'sin depósitos, ROI «—»')
await foto('90-bankroll-vacio')
bien('Estado vacío con su guía; ROI «—» sin depósitos')

async function nuevoMovimiento({ tipo = 'Depósito', importe, casa, destino, nuevaCasa, signo, dia, notas }) {
  await pag.goto(`${APP}/bankroll`)
  await pag.getByRole('link', { name: '+ Movimiento' }).click()
  await pag.waitForURL(/\/bankroll\/nuevo/)
  await pag.waitForLoadState('networkidle')
  await pag.getByRole('button', { name: tipo, exact: true }).click()
  if (dia) await pag.getByLabel('Día', { exact: true }).fill(dia)
  await pag.getByLabel('Importe (€)').fill(importe)
  if (signo) await pag.getByRole('button', { name: signo, exact: true }).click()
  if (casa) await pag.getByLabel(tipo === 'Traspaso' ? 'Casa de origen' : 'Casa', { exact: true }).selectOption(casa)
  if (destino) await pag.getByLabel('Casa de destino', { exact: true }).selectOption(destino)
  if (nuevaCasa) {
    await pag.getByLabel('Casa de destino', { exact: true }).selectOption('__nueva__')
    await pag.getByPlaceholder('Nombre de la casa').fill(nuevaCasa)
    await pag.getByRole('button', { name: 'Crear', exact: true }).click()
    await pag.getByLabel('Casa de destino', { exact: true }).locator('option:checked', { hasText: nuevaCasa }).waitFor({ state: 'attached' })
  }
  if (notas) await pag.getByLabel('Notas (opcional)').fill(notas)
  await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
}

await nuevoMovimiento({ importe: '100', casa: casaBk.id })
await pag.waitForURL(`${APP}/bankroll`)
let eG = await esperadoBk(ANA.id)
let eC = await esperadoBk(ANA.id, casaBk.id)
await comprobarBk(pag, '[data-bloque="global"]', eG)
await comprobarBk(pag, `[data-casa="${casaBk.nombre}"]`, eC)
assert.equal(eC.depositado, 10000)
bien(`Depósito de 100 € en ${casaBk.nombre}: saldo ${eur(eC.saldo)} = 100 € + beneficio ${eur(eC.beneficio)}; ROI = beneficio / 100`)

// Retirada, ajuste negativo y traspaso a una casa nueva (creada desde el formulario).
await nuevoMovimiento({ tipo: 'Retirada', importe: '20', casa: casaBk.id })
await pag.waitForURL(`${APP}/bankroll`)
await nuevoMovimiento({ tipo: 'Ajuste', importe: '5,50', signo: 'Resta', casa: casaBk.id, notas: '=comisión' })
await pag.waitForURL(`${APP}/bankroll`)
const globalAntes = (await esperadoBk(ANA.id)).saldo
await nuevoMovimiento({ tipo: 'Traspaso', importe: '30', casa: casaBk.id, nuevaCasa: 'Casa Nueva' })
await pag.waitForURL(`${APP}/bankroll`)
const [casaNueva] = await sql(`select id from casas_apuestas where user_id = '${ANA.id}' and nombre = 'Casa Nueva'`)
eG = await esperadoBk(ANA.id)
eC = await esperadoBk(ANA.id, casaBk.id)
const eN = await esperadoBk(ANA.id, casaNueva.id)
assert.equal(eG.saldo, globalAntes, 'el traspaso no cambia el global')
assert.equal(eN.saldo, 3000)
await comprobarBk(pag, '[data-bloque="global"]', eG)
await comprobarBk(pag, `[data-casa="${casaBk.nombre}"]`, eC)
assert.equal(await cifraBk(pag, '[data-casa="Casa Nueva"]', 'Saldo'), eur(3000))
assert.equal(await cifraBk(pag, '[data-casa="Casa Nueva"]', 'ROI'), '—')
await pag.locator('[data-casa="Casa Nueva"]').getByText('ROI «—»: solo recibe traspasos.').waitFor()
await foto('91-bankroll')
bien(`Retirada 20 €, ajuste −5,50 € y traspaso 30 €: ${casaBk.nombre} ${eur(eC.saldo)}, Casa Nueva 30,00 € (ROI «—»), global sin cambio por el traspaso`)

// Fecha futura: no se puede (aviso claro).
await pag.goto(`${APP}/bankroll/nuevo`, { waitUntil: 'networkidle' })
const manana = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + 2 * 86400000))
await pag.getByLabel('Día', { exact: true }).fill(manana)
await pag.getByLabel('Importe (€)').fill('10')
await pag.getByLabel('Casa', { exact: true }).selectOption(casaBk.id)
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.getByText('La fecha no puede ser futura: registra el movimiento cuando se haga.').waitFor()
assert.equal((await sql(`select count(*)::int n from movimientos_bankroll where user_id = '${ANA.id}'`))[0].n, 4)
bien('Fecha futura: «La fecha no puede ser futura…» y no se guarda')

// Editar y borrar (con confirmación): las cifras se recalculan.
await pag.goto(`${APP}/bankroll?tipo=retirada`)
await pag.locator('[data-lista="movimientos"]:visible > li').first().waitFor()
assert.equal(await pag.locator('[data-lista="movimientos"]:visible > li').count(), 1, 'filtro por tipo')
await pag.locator('[data-lista="movimientos"]:visible > li a').first().click()
await pag.getByLabel('Importe (€)').fill('25')
await pag.getByRole('button', { name: 'Guardar cambios' }).click()
await pag.waitForURL(`${APP}/bankroll?tipo=retirada`)
eC = await esperadoBk(ANA.id, casaBk.id)
await pag.goto(`${APP}/bankroll`)
await comprobarBk(pag, `[data-casa="${casaBk.nombre}"]`, eC)
await pag.goto(`${APP}/bankroll?tipo=ajuste`)
await pag.locator('[data-lista="movimientos"]:visible > li a').first().click()
await pag.getByRole('button', { name: 'Borrar movimiento' }).click()
await pag.getByRole('alertdialog', { name: 'Confirmar borrado' }).waitFor()
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.waitForURL(`${APP}/bankroll?tipo=ajuste`)
await pag.getByText('No hay movimientos con estos filtros.').waitFor()
eG = await esperadoBk(ANA.id)
await pag.goto(`${APP}/bankroll`)
await comprobarBk(pag, '[data-bloque="global"]', eG)
bien('Editar (retirada 20 → 25 €) y borrar (con confirmación) recalculan los saldos')

// Detalle de una casa: cifras, sus movimientos (también el traspaso) y enlace a sus apuestas.
await pag.locator(`[data-casa="${casaBk.nombre}"]`).click()
await pag.waitForURL(new RegExp(`/bankroll/casa/${casaBk.id}$`))
await comprobarBk(pag, `[data-bloque="${casaBk.nombre}"]`, await esperadoBk(ANA.id, casaBk.id))
await pag.locator('[data-lista="movimientos"]:visible > li').first().waitFor()
assert.equal(await pag.locator('[data-lista="movimientos"]:visible > li').count(), 3, 'depósito, retirada y traspaso enviado')
await pag.locator('[data-lista="movimientos"]:visible').getByText(`−30,00 €`).or(pag.locator('[data-lista="movimientos"]:visible').getByText('-30,00 €')).first().waitFor()
assert.equal(await pag.getByRole('link', { name: 'Ver sus apuestas →' }).getAttribute('href'), `/apuestas?casa=${casaBk.id}`)
await foto('92-bankroll-casa')
// Abrir un movimiento desde el detalle y volver a él.
await pag.locator('[data-lista="movimientos"]:visible > li a').first().click()
await pag.getByRole('link', { name: '← Volver' }).click()
await pag.waitForURL(new RegExp(`/bankroll/casa/${casaBk.id}$`))
bien('Detalle de la casa: cifras, 3 movimientos (el traspaso, con −30 €), enlace a sus apuestas y vuelta desde un movimiento')
const sinCasaAna = (await sql(`select count(*)::int n from apuestas where user_id = '${ANA.id}' and casa_id is null and estado in ${RES_BK}`))[0].n
if (sinCasaAna > 0) {
  await pag.goto(`${APP}/bankroll`)
  await pag.locator('[data-casa="Sin casa"]').waitFor()
  bien('Aparece «Sin casa» (apuestas resueltas sin casa: cuentan en el global)')
}

// CSV de bankroll.
await pag.goto(`${APP}/ajustes`)
const csvBk = await descargarCsv(pag, 'Descargar bankroll (CSV)')
assert.equal(csvBk.nombre, `filoverde-bankroll-${hoyMadrid}.csv`)
assert.equal(csvBk.filas.length, 3)
assert.deepEqual(csvBk.filas.map((f) => f.tipo).sort(), ['deposito', 'retirada', 'traspaso'])
assert.ok(csvBk.filas.some((f) => f.tipo === 'traspaso' && f.casa_destino === 'Casa Nueva' && f.importe === '30,00'))
bien('CSV de bankroll: 3 movimientos, importes con coma y casa de destino')

// Carla: más de 1000 movimientos.
const [casaCarla] = await sql(`insert into casas_apuestas (user_id, nombre) values ('${CARLA.id}', 'Casa de Carla') returning id`)
await sql(`insert into movimientos_bankroll (user_id, tipo, importe, casa_id, fecha, notas)
  select '${CARLA.id}', case when g % 5 = 0 then 'retirada' else 'deposito' end, 100 + g, '${casaCarla.id}', timestamptz '2025-01-01 12:00+01' + g * interval '1 hour',
         case when g = 1 then '@importe' end
  from generate_series(1, 1150) g`)
const ctxCarla2 = await navegador.newContext({ ...movil, acceptDownloads: true })
await ctxCarla2.addCookies([cookieSesion(CARLA)])
const pagCarla2 = await ctxCarla2.newPage()
await pagCarla2.goto(`${APP}/bankroll`)
assert.equal(await pagCarla2.locator('[data-recuento="movimientos"]:visible').innerText(), '1150 movimientos')
await comprobarBk(pagCarla2, '[data-bloque="global"]', await esperadoBk(CARLA.id))
await pagCarla2.getByText('1–50 de 1150').waitFor()
await pagCarla2.goto(`${APP}/ajustes`)
const csvCarlaBk = await descargarCsv(pagCarla2, 'Descargar bankroll (CSV)')
assert.equal(csvCarlaBk.filas.length, 1150)
assert.equal(csvCarlaBk.filas[0].notas, "'@importe", 'protección de fórmulas')
await ctxCarla2.close()
bien('Carla: 1150 movimientos (más de 1000), saldos como en la BD y CSV completo')

paso('Bankroll → Evolución del saldo: Global y por casa, periodo, marcas; el último punto = saldo de la tarjeta')
const grafSaldo = (p) => p.locator('[data-seccion="evolucion-saldo"]:visible [data-grafica="saldo"]')
const ultimoSaldo = async (p) => Number(await grafSaldo(p).getAttribute('data-ultimo'))
await pag.goto(`${APP}/bankroll`)
const eGlob = await esperadoBk(ANA.id)
assert.equal(await ultimoSaldo(pag), eGlob.saldo, 'Global: último punto = saldo')
// Color: con «Todo» la variación es saldo final − 0.
assert.equal(await grafSaldo(pag).getAttribute('data-tono'), eGlob.saldo > 0 ? 'positivo' : eGlob.saldo < 0 ? 'negativo' : 'neutro')
assert.equal(Number(await pag.locator('[data-variacion-saldo]:visible').getAttribute('data-variacion-saldo')), eGlob.saldo)
assert.equal(await cifraBk(pag, '[data-bloque="global"]', 'Saldo'), eur(eGlob.saldo))
assert.ok((await grafSaldo(pag).locator('[data-marca="deposito"]').count()) >= 1, 'marca verde de depósito')
assert.ok((await grafSaldo(pag).locator('[data-marca="retirada"]').count()) >= 1, 'marca roja de retirada')
await pag.locator('[data-seccion="evolucion-saldo"]:visible').getByText('Depósito', { exact: true }).waitFor()
// Tocar la gráfica saca una etiqueta; con las flechas se llega al último punto (el saldo de hoy).
const cajaS = await grafSaldo(pag).locator('[role="img"]').boundingBox()
await grafSaldo(pag).locator('[role="img"]').tap({ position: { x: cajaS.width - 2, y: cajaS.height / 2 } })
assert.ok((await grafSaldo(pag).locator('[data-etiqueta-grafica]').innerText()).includes('Saldo: '))
await grafSaldo(pag).locator('[role="img"]').focus()
await pag.keyboard.press('Escape')
await pag.keyboard.press('ArrowLeft')
assert.ok((await grafSaldo(pag).locator('[data-etiqueta-grafica]').innerText()).includes(`Saldo: ${eur(eGlob.saldo)}`))
await foto('93-bankroll-evolucion')
await pag.getByLabel('Saldo de', { exact: true }).selectOption(casaBk.id)
await pag.waitForURL(new RegExp(`evo=${casaBk.id}`))
const eCasa = await esperadoBk(ANA.id, casaBk.id)
await esperar(async () => (await ultimoSaldo(pag)) === eCasa.saldo)
bien(`Global ${eur(eGlob.saldo)} y «${casaBk.nombre}» ${eur(eCasa.saldo)}: el último punto es el saldo de su tarjeta; marcas y etiqueta al tocar`)
await elegirPeriodo(pag, 'mes')
assert.ok(pag.url().includes(`evo=${casaBk.id}`), 'se conserva la casa')
await esperar(async () => (await grafSaldo(pag).getAttribute('data-puntos')) != null)
assert.equal(await ultimoSaldo(pag), eCasa.saldo, '«Este mes» también acaba en el saldo de hoy')
// Periodo pasado: parte del saldo anterior y no llega a hoy.
await pag.goto(`${APP}/bankroll?periodo=personalizado&desde=2020-01-01&hasta=2020-12-31`)
await pag.locator('[data-seccion="evolucion-saldo"]:visible').getByText(/No hay movimientos ni apuestas resueltas en este periodo|Antes:/).first().waitFor()
for (const per of ['hoy', 'ayer', '7d']) {
  await pag.goto(`${APP}/bankroll`)
  await elegirPeriodo(pag, per)
  await pag.locator('[data-seccion="evolucion-saldo"]:visible').waitFor()
}
bien('Periodo: «Este mes» conserva la casa y acaba en el saldo; Hoy, Ayer y 7 días funcionan; un periodo sin datos lo dice; línea en color con su variación')
const ctxCarla3 = await navegador.newContext(movil)
await ctxCarla3.addCookies([cookieSesion(CARLA)])
const pagCarla3 = await ctxCarla3.newPage()
await pagCarla3.goto(`${APP}/bankroll`)
assert.equal(await ultimoSaldo(pagCarla3), (await esperadoBk(CARLA.id)).saldo)
await ctxCarla3.close()
bien('Carla (1150 movimientos y 1200 apuestas): la curva acaba en su saldo')

// ---------- Fase 3 · Gestión de casas y estrategias ----------
paso('Ajustes: casas y estrategias (crear, repetidos, reservados, renombrar, archivar y borrar)')
const filaOp = (p, nombre) => p.locator(`[data-opcion="${nombre}"]:visible`)
await pag.goto(`${APP}/ajustes`)
await pag.getByRole('link', { name: /Casas de apuestas/ }).click()
await pag.waitForURL(`${APP}/ajustes/casas`)
await pag.waitForLoadState('networkidle')
const [usoBk] = await sql(`select (select count(*) from apuestas where casa_id = '${casaBk.id}')::int ap,
  (select count(*) from movimientos_bankroll where casa_id = '${casaBk.id}' or casa_destino_id = '${casaBk.id}')::int mov`)
assert.equal(
  await filaOp(pag, casaBk.nombre).locator('[data-uso]').innerText(),
  `${usoBk.ap} ${usoBk.ap === 1 ? 'apuesta' : 'apuestas'} · ${usoBk.mov} ${usoBk.mov === 1 ? 'movimiento' : 'movimientos'}`,
)
await foto('93-ajustes-casas')
// Crear, repetido (otras mayúsculas/tildes/espacios) y reservado.
const crearEnAjustes = async (nombre) => {
  await pag.getByPlaceholder('Nombre de la casa').fill(nombre)
  await pag.getByRole('button', { name: 'Crear', exact: true }).click()
}
await crearEnAjustes('Casa Prueba')
await pag.getByText('«Casa Prueba» creada.').waitFor()
await filaOp(pag, 'Casa Prueba').waitFor()
await crearEnAjustes('  CÁSA   prueba ')
await pag.getByText('Ya tienes una casa llamada «Casa Prueba».').waitFor()
await crearEnAjustes('sin casa')
await pag.getByText('«sin casa» está reservado', { exact: false }).waitFor()
assert.equal((await sql(`select count(*)::int n from casas_apuestas where user_id = '${ANA.id}' and nombre ilike '%prueba%'`))[0].n, 1)
bien(`Lista con su uso (${usoBk.ap} apuestas · ${usoBk.mov} movimientos); crear «Casa Prueba»; «CÁSA prueba» y «sin casa» rechazadas`)

// Renombrar una casa en uso: el nombre cambia en Análisis y Bankroll sin tocar ninguna cifra.
await pag.goto(`${APP}/analisis?seg=casa`)
const filaAnalisisAntes = await pag.locator('[data-tabla="segmentos"]:visible > li', { hasText: casaBk.nombre }).first().locator('dl').innerText()
await pag.goto(`${APP}/bankroll`)
const bkAntes = await pag.locator(`[data-casa="${casaBk.nombre}"]:visible dl`).innerText()
const globalAntesR = await pag.locator('[data-bloque="global"]:visible dl').innerText()
await pag.goto(`${APP}/ajustes/casas`, { waitUntil: 'networkidle' })
await filaOp(pag, casaBk.nombre).getByRole('button', { name: 'Renombrar' }).click()
await pag.getByLabel(`Nuevo nombre de ${casaBk.nombre}`).fill('Casa Renombrada')
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.getByText('Ahora se llama «Casa Renombrada».').waitFor()
await pag.goto(`${APP}/analisis?seg=casa`)
assert.equal(await pag.locator('[data-tabla="segmentos"]:visible > li', { hasText: 'Casa Renombrada' }).first().locator('dl').innerText(), filaAnalisisAntes, 'Análisis: mismas cifras')
assert.equal(await pag.locator('[data-tabla="segmentos"]:visible > li', { hasText: casaBk.nombre }).count(), 0, 'el nombre viejo ya no sale')
await pag.goto(`${APP}/bankroll`)
assert.equal(await pag.locator('[data-casa="Casa Renombrada"]:visible dl').innerText(), bkAntes, 'Bankroll: mismas cifras')
assert.equal(await pag.locator('[data-bloque="global"]:visible dl').innerText(), globalAntesR)
bien(`«${casaBk.nombre}» → «Casa Renombrada»: mismo nombre nuevo en Análisis y Bankroll, mismas cifras`)

// Borrar: en uso no; sin uso, tras confirmar.
await pag.goto(`${APP}/ajustes/casas`, { waitUntil: 'networkidle' })
await filaOp(pag, 'Casa Renombrada').getByRole('button', { name: 'Borrar' }).click()
await filaOp(pag, 'Casa Renombrada').getByText(`Esta casa tiene ${usoBk.ap} apuestas y`, { exact: false }).waitFor()
await filaOp(pag, 'Casa Prueba').getByRole('button', { name: 'Borrar' }).click()
await pag.getByRole('alertdialog', { name: 'Borrar Casa Prueba' }).waitFor()
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.getByText('«Casa Prueba» borrada.').waitFor()
assert.equal((await sql(`select count(*)::int n from casas_apuestas where user_id = '${ANA.id}' and nombre = 'Casa Prueba'`))[0].n, 0)
assert.equal((await sql(`select count(*)::int n from casas_apuestas where id = '${casaBk.id}'`))[0].n, 1, 'la casa en uso sigue')
bien('Borrar una casa en uso: «Esta casa tiene N apuestas y M movimientos…»; la de prueba se borra tras confirmar')

// Archivar: fuera de los desplegables nuevos; sigue en Bankroll (con su saldo) y en Análisis.
await filaOp(pag, 'Casa Nueva').getByRole('button', { name: 'Archivar' }).click()
await pag.getByText('«Casa Nueva» archivada.').waitFor()
await pag.locator('[data-lista="archivadas"]:visible [data-opcion="Casa Nueva"]').waitFor()
await pag.goto(`${APP}/bankroll`)
await pag.locator('[data-casa="Casa Nueva"]:visible').getByText('Archivada').waitFor()
assert.equal(await pag.locator('[data-casa="Casa Nueva"]:visible [data-cifra="Saldo"] dd').innerText(), eur(3000), 'sigue con su saldo')
await pag.goto(`${APP}/bankroll/nuevo`, { waitUntil: 'networkidle' })
assert.equal(await pag.getByLabel('Casa', { exact: true }).locator('option', { hasText: 'Casa Nueva' }).count(), 0, 'no sale para un movimiento nuevo')
const [traspasoCN] = await sql(`select id from movimientos_bankroll where casa_destino_id = '${casaNueva.id}' limit 1`)
await pag.goto(`${APP}/bankroll/${traspasoCN.id}`, { waitUntil: 'networkidle' })
await pag.getByLabel('Casa de destino', { exact: true }).locator('option:checked', { hasText: 'Casa Nueva (archivada)' }).waitFor({ state: 'attached' })
bien('Archivada: en Bankroll con su saldo y etiqueta; fuera del desplegable de un movimiento nuevo; visible al editar el traspaso que la usa')

// Estrategias: misma pantalla.
await pag.goto(`${APP}/ajustes/estrategias`, { waitUntil: 'networkidle' })
await pag.getByPlaceholder('Nombre de la estrategia').fill('Valor')
await pag.getByRole('button', { name: 'Crear', exact: true }).click()
await pag.getByText('«Valor» creada.').waitFor()
await pag.getByPlaceholder('Nombre de la estrategia').fill('VÁLOR')
await pag.getByRole('button', { name: 'Crear', exact: true }).click()
await pag.getByText('Ya tienes una estrategia llamada «Valor».').waitFor()
await filaOp(pag, 'Valor').getByRole('button', { name: 'Borrar' }).click()
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.getByText('«Valor» borrada.').waitFor()
bien('Estrategias: crear, repetida rechazada y borrar sin uso')

// Una casa ARCHIVADA leída por la IA: la revisión la reconoce (no intenta crear otra) y ofrece recuperarla.
await pag.goto(`${APP}/ajustes/casas`, { waitUntil: 'networkidle' })
await filaOp(pag, 'Codere').getByRole('button', { name: 'Archivar' }).click()
await pag.getByText('«Codere» archivada.').waitFor()
await cola(['combinada'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capCombinada])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await pag.getByLabel('Casa de apuestas').locator('option:checked', { hasText: 'Codere (archivada)' }).waitFor({ state: 'attached' })
assert.equal(await pag.getByText('Crear y usar').count(), 0, 'no ofrece crear otra «Codere»')
await pag.getByText('«Codere» está archivada').waitFor()
await foto('94-revision-casa-archivada')
await pag.getByRole('button', { name: 'Recuperar', exact: true }).click()
await pag.getByText('«Codere» está archivada').waitFor({ state: 'detached' })
assert.equal((await sql(`select archivada from casas_apuestas where user_id = '${ANA.id}' and nombre = 'Codere'`))[0].archivada, false)
assert.equal((await sql(`select count(*)::int n from casas_apuestas where user_id = '${ANA.id}' and nombre ilike 'codere%'`))[0].n, 1, 'no se creó otra')
bien('Captura con una casa archivada: la revisión la reconoce como «Codere (archivada)», ofrece «Recuperar» y no crea otra')

// ---------- Fase 3 · Deportes y ligas ----------
paso('Deportes y ligas: renombrar en uso con aviso, liga de prueba, repetidos, archivadas y posibles errores')
const filaCat = (nombre) => pag.locator(`[data-fila-catalogo="${nombre}"]:visible`)
const abrirDeporte = async (d) => {
  await pag.goto(`${APP}/ajustes/deportes`, { waitUntil: 'networkidle' })
  await pag.locator(`[data-deporte="${d}"]:visible > button`).click()
}
// Renombrar LaLiga (en uso) → "LaLigaX": aviso con los números reales; Análisis → Liga, mismas apuestas.
const [usoLL] = await sql(`select count(*)::int n, count(distinct apuesta_id)::int m from selecciones
  where user_id = '${ANA.id}' and normalizar_nombre(deporte) = 'futbol' and normalizar_nombre(liga) = 'laliga'`)
await pag.goto(`${APP}/analisis?seg=liga`)
const ligaAntes = await pag.locator('[data-tabla="segmentos"]:visible > li', { hasText: 'Fútbol · LaLiga' }).first().locator('dl').innerText()
await abrirDeporte('Fútbol')
await filaCat('LaLiga').getByRole('button', { name: 'Renombrar' }).click()
await pag.getByLabel('Nuevo nombre de LaLiga').fill('LaLigaX')
await pag.getByRole('button', { name: 'Revisar cambio' }).click()
assert.equal(
  await pag.locator('[data-aviso-renombrar]').innerText(),
  `Afecta a ${usoLL.n} ${usoLL.n === 1 ? 'selección' : 'selecciones'} en ${usoLL.m} ${usoLL.m === 1 ? 'apuesta' : 'apuestas'}: también cambia en ellas.`,
)
await pag.getByRole('button', { name: 'Sí, renombrar' }).click()
await pag.getByText('Renombrado a «LaLigaX»', { exact: false }).waitFor()
const [trasRenombrar] = await sql(`select count(*)::int n from selecciones where user_id = '${ANA.id}' and liga = 'LaLigaX'`)
assert.equal(trasRenombrar.n, usoLL.n, 'se actualizaron exactamente N selecciones')
await pag.goto(`${APP}/analisis?seg=liga`)
assert.equal(await pag.locator('[data-tabla="segmentos"]:visible > li', { hasText: 'Fútbol · LaLigaX' }).first().locator('dl').innerText(), ligaAntes, 'mismas apuestas y cifras')
await abrirDeporte('Fútbol')
await filaCat('LaLigaX').getByRole('button', { name: 'Renombrar' }).click()
await pag.getByLabel('Nuevo nombre de LaLigaX').fill('LaLiga')
await pag.getByRole('button', { name: 'Revisar cambio' }).click()
await pag.getByRole('button', { name: 'Sí, renombrar' }).click()
await pag.getByText('Renombrado a «LaLiga»', { exact: false }).waitFor()
bien(`LaLiga → LaLigaX: aviso «${usoLL.n} selecciones en ${usoLL.m} apuestas», ${usoLL.n} actualizadas, mismas cifras en Análisis; y vuelta a LaLiga`)

// Repetido: no se mezcla.
await filaCat('LaLiga').getByRole('button', { name: 'Renombrar' }).click()
await pag.getByLabel('Nuevo nombre de LaLiga').fill('premier LEAGUE')
await pag.getByRole('button', { name: 'Revisar cambio' }).click()
await pag.getByRole('button', { name: 'Sí, renombrar' }).click()
await filaCat('LaLiga').getByText('Ya tienes una liga en este deporte llamada «Premier League». No se mezclan: elige otro nombre.').waitFor()
bien('Renombrar a un nombre que ya existe («premier LEAGUE»): rechazado, no se mezcla')

// Liga de prueba: crear, archivar, recuperar y borrar.
await pag.getByLabel('Nueva liga de Fútbol').fill('Liga Prueba')
await pag.getByRole('button', { name: 'Añadir', exact: true }).first().click()
await filaCat('Liga Prueba').waitFor()
await filaCat('Liga Prueba').getByRole('button', { name: 'Archivar' }).click()
await pag.getByText('«Liga Prueba» archivada.').waitFor()
await filaCat('Liga Prueba').getByText('Archivada', { exact: true }).waitFor()
await filaCat('Liga Prueba').getByRole('button', { name: 'Recuperar' }).click()
await pag.getByText('«Liga Prueba» recuperada.').waitFor()
await filaCat('Liga Prueba').getByRole('button', { name: 'Archivar' }).waitFor() // fila ya redibujada
const confirmarBorrado = pag.getByRole('button', { name: 'Sí, borrar' })
for (let i = 0; i < 3 && !(await confirmarBorrado.isVisible()); i++) {
  await filaCat('Liga Prueba').getByRole('button', { name: 'Borrar liga Liga Prueba' }).click()
  await confirmarBorrado.waitFor({ timeout: 5000 }).catch(() => {})
}
await confirmarBorrado.click()
await pag.getByText('«Liga Prueba» borrada del catálogo.').waitFor()
assert.equal((await sql(`select count(*)::int n from ligas where user_id = '${ANA.id}' and nombre = 'Liga Prueba'`))[0].n, 0)
bien('Liga de prueba: creada, archivada, recuperada y borrada')

// Una liga ARCHIVADA leída en una captura: la revisión la reconoce y ofrece «Recuperar».
await abrirDeporte('Fútbol')
await filaCat('LaLiga').getByRole('button', { name: 'Archivar' }).click()
await pag.getByText('«LaLiga» archivada.').waitFor()
await cola(['simple'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await pag.locator('select option:checked', { hasText: 'LaLiga (archivada)' }).first().waitFor({ state: 'attached' })
assert.equal(await pag.getByText(/La IA ha leído «LaLiga»/).count(), 0, 'no ofrece crear otra')
await pag.getByText('«LaLiga» está archivada', { exact: false }).waitFor()
await foto('95-revision-liga-archivada')
await pag.getByRole('button', { name: 'Recuperar', exact: true }).click()
await pag.getByText('«LaLiga» está archivada', { exact: false }).waitFor({ state: 'detached' })
assert.equal((await sql(`select bool_or(archivada) a from ligas where user_id = '${ANA.id}' and nombre = 'LaLiga'`))[0].a, false)
bien('Captura con una liga archivada: «LaLiga (archivada)» + «Recuperar»; no se crea otra')

// Posibles errores: el mismo partido y fecha con ligas distintas.
const [apX] = await sql(`insert into apuestas (user_id, importe, divisa, cuota_total, estado, resultado_economico)
  values ('${ANA.id}', 500, 'EUR', 2, 'perdida', -500) returning id`)
const [apY] = await sql(`insert into apuestas (user_id, importe, divisa, cuota_total, estado, resultado_economico)
  values ('${ANA.id}', 700, 'EUR', 2, 'ganada', 700) returning id`)
await sql(`insert into selecciones (apuesta_id, user_id, orden, evento, deporte, liga, mercado, pronostico, cuota, estado, evento_fecha) values
  ('${apX.id}', '${ANA.id}', 0, 'Galatasaray SK - VfB Stuttgart', 'Fútbol', 'Champions League', '1X2', '1', 2, 'perdida', '2026-11-03'),
  ('${apY.id}', '${ANA.id}', 0, 'GALATASARAY SK vs VfB Stuttgart', 'Fútbol', 'Europa League', '1X2', '1', 2, 'ganada', '2026-11-03')`)
await pag.goto(`${APP}/ajustes/deportes`, { waitUntil: 'networkidle' })
const contador = Number((await pag.locator('[data-contador-revisar]').innerText()).replace(/\D/g, ''))
assert.ok(contador >= 1)
await pag.getByRole('link', { name: /Revisar posibles errores/ }).click()
await pag.waitForURL(`${APP}/ajustes/deportes/revisar`)
const grupoG = pag.locator('[data-grupo="Galatasaray SK - VfB Stuttgart"]')
await grupoG.waitFor()
assert.equal(await pag.locator('[data-grupo]').count(), contador, 'el contador = los grupos de la lista')
await grupoG.locator('li', { hasText: /^Champions League · Fútbol/ }).first().waitFor()
await grupoG.locator('li', { hasText: /^Europa League · Fútbol/ }).first().waitFor()
assert.match(await grupoG.locator('[data-fecha-grupo]').innerText(), /2026-11-03/)
assert.equal(await grupoG.locator('[data-ligas-apuesta]').count(), 2)
await foto('96-revisar-errores')
await grupoG.locator('a').first().click()
await pag.getByRole('link', { name: '← Revisar' }).click()
await pag.waitForURL(`${APP}/ajustes/deportes/revisar`)
bien(`Revisar posibles errores (${contador}): Galatasaray (03/11) con Champions y Europa League, la liga de cada apuesta, y vuelta desde la apuesta`)

// Sin sesión: no hay archivo.
const sinSesionCsv = await (await navegador.newContext()).request.get(`${APP}/api/exportar/apuestas`, { maxRedirects: 0 })
assert.ok([307, 401].includes(sinSesionCsv.status()), `sin sesión: ${sinSesionCsv.status()}`)
bien('Sin sesión no se descarga nada')

// ---------- Beto: no puede ver nada de Ana ----------
// ---------- Registro: fecha del partido y partidos conocidos ----------
paso('Registro: la fecha de la apuesta es el día del partido (también de madrugada)')
const diaMadridMas = (n) => {
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
  const [y, m, d] = hoy.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const DIA_P = diaMadridMas(3)
const diaApuesta = () => pag.getByLabel('Día de la apuesta', { exact: true }).inputValue()
const diaEvento = () => pag.getByLabel('Día del evento', { exact: true }).first().inputValue()
const fechaGuardada = async (evento) =>
  (await sql(`select to_char(a.fecha at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI') f from apuestas a join selecciones s on s.apuesta_id = a.id
    where a.user_id = '${ANA.id}' and s.evento = '${evento}' order by a.created_at desc limit 1`))[0]?.f
await cola(['partido_base'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await esperar(async () => (await diaApuesta()) === DIA_P)
assert.ok((await pag.locator('[data-nota="fecha-partido"]').innerText()).includes('00:30'), 'nota «Fecha tomada del partido»')
await foto('95-fecha-partido')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await fechaGuardada('Elche - Levante'), `${DIA_P} 00:30`)
bien(`Partido a las 00:30 del ${DIA_P}: «Día de la apuesta» = ${DIA_P} con su nota; guardada a las 00:30 de ese día`)

paso('Partidos conocidos: el mismo partido sin datos se rellena (marcado) y la fecha manual no se pisa')
await cola(['partido_conocido'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
const avisoConocido = pag.locator('[data-partido-conocido="otra_apuesta"]')
await avisoConocido.waitFor({ timeout: 10000 })
assert.ok((await avisoConocido.innerText()).startsWith('Deducido de otra apuesta tuya: partido del'), await avisoConocido.innerText())
assert.equal(await diaEvento(), DIA_P)
assert.equal(await leerHora(pag), '00:30')
assert.equal(await deporteSel().inputValue(), 'Fútbol')
assert.equal(await ligaSel().inputValue(), 'LaLiga')
assert.ok((await pag.getByText('revisar · deducido de otra apuesta tuya').count()) >= 3, 'marcados en ámbar')
await esperar(async () => (await diaApuesta()) === DIA_P)
await foto('96-partido-conocido')
bien('«elche vs levante» sin datos → día, 00:30, LaLiga y Fútbol de la apuesta anterior, marcados «deducido de otra apuesta tuya»')
// Fecha cambiada a mano: ya no sigue al partido.
const DIA_MANUAL = diaMadridMas(-1)
await pag.getByLabel('Día de la apuesta', { exact: true }).fill(DIA_MANUAL)
await pag.getByLabel('Día del evento', { exact: true }).first().fill(diaMadridMas(4))
await pag.waitForTimeout(300)
assert.equal(await diaApuesta(), DIA_MANUAL, 'no se pisa')
assert.equal(await pag.locator('[data-nota="fecha-partido"]').count(), 0)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await fechaGuardada('elche vs levante'), `${DIA_MANUAL} 12:00`)
bien('Cambiada a mano la fecha de la apuesta: no se vuelve a pisar al cambiar el día del partido (guardada a las 12:00)')

paso('Partido registrado en varias fechas: se propone la más reciente y las demás se eligen con un toque')
await cola(['partido_conocido'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await avisoConocido.waitFor({ timeout: 10000 })
assert.equal(await diaEvento(), diaMadridMas(4), 'la más reciente')
const otro = pag.locator(`[data-otro-dia="${DIA_P}"]`)
await otro.click()
await esperar(async () => (await diaEvento()) === DIA_P)
assert.equal(await leerHora(pag), '00:30')
await esperar(async () => (await diaApuesta()) === DIA_P)
await foto('97-varias-fechas')
await pag.getByRole('button', { name: /^Descartar esta captura$/ }).click()
await pag.waitForURL(`${APP}/apuestas`)
bien(`Propone el ${diaMadridMas(4)} y ofrece el ${DIA_P}; al tocarlo cambian día y hora (y la fecha de la apuesta)`)

paso('Tanda: lo editado en la apuesta anterior (aún sin guardar) rellena el mismo partido en la siguiente')
await cola(['tanda_1', 'tanda_2'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple, capResuelta])
await pag.getByRole('button', { name: /^Guardar/ }).waitFor({ timeout: 30000 })
assert.equal(await leerHora(pag), '18:15')
await ponerHora(pag, '19:00') // corregida a mano en la 1.ª
await pag.getByRole('button', { name: 'Siguiente ›' }).waitFor({ timeout: 30000 })
await esperar(async () => !(await pag.getByRole('button', { name: 'Siguiente ›' }).isDisabled()), 30000)
await pag.getByRole('button', { name: 'Siguiente ›' }).click()
const avisoTanda = pag.locator('[data-partido-conocido="tanda"]')
await avisoTanda.waitFor({ timeout: 10000 })
assert.equal(await diaEvento(), diaMadridMas(5))
assert.equal(await leerHora(pag), '19:00', 'la hora corregida en la anterior, aunque no esté guardada')
assert.equal(await ligaSel().inputValue(), 'LaLiga')
assert.ok((await avisoTanda.innerText()).startsWith('Deducido de una apuesta anterior de esta tanda'))
await esperar(async () => (await diaApuesta()) === diaMadridMas(5))
await foto('98-tanda')
bien('2.ª de la tanda: día, 19:00 (corregida en la 1.ª sin guardar) y liga, marcados «deducido de una apuesta anterior de esta tanda»')
// Guardar la 2.ª: la cola vuelve a la 1.ª (pendiente), que se guarda con su hora corregida.
await pag.getByRole('button', { name: /^Guardar/ }).first().click()
assert.ok(await esperar(async () => (await avisoTanda.count()) === 0 && (await leerHora(pag)) === '19:00', 30000), 'al volver a la 1.ª se conserva lo editado')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal(await fechaGuardada('Leganes - Tenerife'), `${diaMadridMas(5)} 19:00`)
assert.equal(await fechaGuardada('Leganés - Tenerife'), `${diaMadridMas(5)} 19:00`)
bien('Las dos de la tanda guardadas con el día y la hora del partido')

paso('«En juego» en Análisis: todas las pendientes, también las de partidos futuros, en cualquier periodo')
const pendFuturas = (await sql(`select count(*)::int n from apuestas where user_id = '${ANA.id}' and estado = 'pendiente' and fecha > now()`))[0].n
assert.ok(pendFuturas > 0, 'hay pendientes con fecha futura (la del partido)')
const pendTodasAna = (await sql(`select count(*)::int n, coalesce(sum(importe), 0)::bigint i from apuestas where user_id = '${ANA.id}' and estado = 'pendiente'`))[0]
for (const per of ['hoy', 'ayer', '7d', 'mes', 'todo']) {
  await pag.goto(`${APP}/analisis${per === 'todo' ? '' : `?periodo=${per}`}`, { waitUntil: 'networkidle' })
  const tarjeta = pag.locator('[data-tarjeta="En juego"]:visible')
  await tarjeta.waitFor()
  const t = await tarjeta.innerText()
  assert.ok(t.includes(String(pendTodasAna.n)) && t.includes(eur(Number(pendTodasAna.i))), `${per}: ${t}`)
  assert.ok(t.includes('Todas tus pendientes, sin filtro de fechas'), per)
}
bien(`«En juego» = ${pendTodasAna.n} pendientes (${pendFuturas} con fecha futura) en Hoy, Ayer, 7 días, Este mes y Todo, con la nota`)

paso('Editar una apuesta guardada: la fecha no cambia sola; «Usar la fecha del partido» sí')
await pag.goto(`${APP}/apuestas`, { waitUntil: 'networkidle' })
await abrir('elche vs levante')
await editar()
assert.equal(await diaApuesta(), DIA_MANUAL)
await pag.getByLabel('Día del evento', { exact: true }).first().fill(diaMadridMas(6))
await pag.waitForTimeout(300)
assert.equal(await diaApuesta(), DIA_MANUAL, 'no cambia sola al editar')
const usar = pag.getByRole('button', { name: /^Usar la fecha del partido/ })
await usar.click()
assert.equal(await diaApuesta(), diaMadridMas(6))
await guardarYVolver('Guardar cambios')
assert.equal(await fechaGuardada('elche vs levante'), `${diaMadridMas(6)} 00:30`)
bien('Al editar, la fecha sigue igual hasta pulsar «Usar la fecha del partido» (guardada con el día y la hora del partido)')

// ---------- Registro: casa de esta tanda (tarea 2a) ----------
paso('Casa de esta tanda: selector sin archivadas, preseleccionada la última casa usada')
// La prueba completa hace más de 60 lecturas: las anteriores se dan por hechas hace 2 h (tope por hora).
await sql(`update transcripciones set created_at = created_at - interval '2 hours' where user_id = '${ANA.id}'`)
const ultimaCasaAna = (await sql(`select c.id, c.nombre from apuestas a join casas_apuestas c on c.id = a.casa_id
  where a.user_id = '${ANA.id}' order by a.created_at desc limit 1`))[0]
const archivadasAna = (await sql(`select nombre from casas_apuestas where user_id = '${ANA.id}' and archivada`)).map((f) => f.nombre)
const activasAna = (await sql(`select id, nombre from casas_apuestas where user_id = '${ANA.id}' and not archivada order by nombre`))
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
const selCasaTanda = pag.getByLabel('Casa de esta tanda')
await selCasaTanda.waitFor()
const opcionesTanda = await selCasaTanda.locator('option').allTextContents()
assert.deepEqual(opcionesTanda, [...activasAna.map((c) => c.nombre), 'Que la detecte la IA'])
for (const a of archivadasAna) assert.ok(!opcionesTanda.includes(a), `archivada fuera: ${a}`)
assert.equal(await selCasaTanda.inputValue(), ultimaCasaAna.id, 'preseleccionada la última usada')
await foto('99-casa-tanda')
bien(`Selector con ${activasAna.length} casas activas (sin archivadas) + «Que la detecte la IA»; preseleccionada «${ultimaCasaAna.nombre}»`)

paso('Casa elegida: se pasa a la IA, va en la apuesta con «elegida por ti»; avisa solo si la captura es claramente de otra')
const casaSel = () => pag.getByLabel('Casa de apuestas', { exact: true }).inputValue()
const descartarCaptura = async () => {
  await pag.getByRole('button', { name: /^Descartar esta captura$/ }).click()
  await pag.waitForURL(`${APP}/apuestas`)
}
const subirConCasa = async (modos, archivos, casa) => {
  await cola(modos)
  await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
  await subirArchivos(archivos, casa)
  await pag.getByRole('button', { name: /^Guardar/ }).first().waitFor({ timeout: 30000 })
}
// 1) La IA no ve la casa: queda la elegida, sin avisos
await subirConCasa(['sin_casa'], [capSimple], ultimaCasaAna.nombre)
assert.equal(await casaSel(), ultimaCasaAna.id)
assert.equal(await pag.locator('[data-origen-casa="tuya"]').innerText(), 'Casa: elegida por ti')
assert.equal(await pag.locator('[data-aviso-casa]').count(), 0)
const ultimaLlamada = async () => (await (await fetch('http://localhost:54322/__llamadas')).json()).at(-1)
assert.ok((await ultimaLlamada()).textoPeticion.includes(`<casa_indicada>${ultimaCasaAna.nombre}</casa_indicada>`), 'la IA recibe la casa indicada')
const ultimaLectura = async () => (await sql(`select version_instrucciones v, propuesta->'casa_indicada'->>'id' c from transcripciones order by created_at desc limit 1`))[0]
assert.deepEqual(await ultimaLectura(), { v: 7, c: ultimaCasaAna.id }, 'versión 7 y la casa elegida guardada en la lectura')
await descartarCaptura()
bien('Sin casa en la captura: la elegida, «Casa: elegida por ti», sin avisos; la IA la recibe; lectura v7 con la casa guardada')
// 2) La IA duda → sin aviso
await subirConCasa(['casa_duda'], [capSimple], ultimaCasaAna.nombre)
assert.equal(await casaSel(), ultimaCasaAna.id)
assert.equal(await pag.locator('[data-aviso-casa]').count(), 0)
await descartarCaptura()
bien('La IA ve «Codere» pero duda: se queda la elegida y no avisa')
// 3) La IA ve claramente otra casa que no está en el catálogo → «Crear y usar»
await subirConCasa(['casa_nueva'], [capSimple], ultimaCasaAna.nombre)
const avisoCasaLoc = pag.locator('[data-aviso-casa]')
await avisoCasaLoc.waitFor()
assert.ok((await avisoCasaLoc.innerText()).startsWith('La captura parece de Kirolbet.'))
assert.equal(await casaSel(), ultimaCasaAna.id, 'hasta pulsar, sigue la elegida')
await foto('99b-aviso-casa')
await avisoCasaLoc.getByRole('button', { name: 'Crear y usar Kirolbet' }).click()
const kirol = async () => (await sql(`select id from casas_apuestas where user_id = '${ANA.id}' and nombre = 'Kirolbet'`))[0]?.id
await esperar(async () => !!(await kirol()))
await esperar(async () => (await casaSel()) === (await kirol()))
assert.equal(await avisoCasaLoc.count(), 0, 'el aviso desaparece al usarla')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
assert.equal((await sql(`select a.casa_id from apuestas a join selecciones s on s.apuesta_id = a.id where s.evento = 'Huesca - Zaragoza'`))[0].casa_id, await kirol())
bien('La captura es claramente de Kirolbet: aviso «La captura parece de Kirolbet» y «Crear y usar» la crea y la pone; guardada con ella')
// 4) Claramente de otra casa que SÍ está en el catálogo → «Usar X»
await subirConCasa(['casa_otra'], [capSimple], 'Kirolbet')
await avisoCasaLoc.waitFor()
const codere = (await sql(`select id from casas_apuestas where user_id = '${ANA.id}' and nombre = 'Codere'`))[0]?.id
if (codere) {
  await avisoCasaLoc.getByRole('button', { name: 'Usar Codere' }).click()
  await esperar(async () => (await casaSel()) === codere)
  bien('Claramente de Codere (ya en el catálogo): «Usar Codere» la cambia')
} else {
  await avisoCasaLoc.getByRole('button', { name: 'Crear y usar Codere' }).waitFor()
  bien('Claramente de Codere (no está en el catálogo): «Crear y usar Codere»')
}
await descartarCaptura()

paso('«Que la detecte la IA»: como antes; tanda con la casa elegida en todas y editable en cada una')
await subirConCasa(['casa_otra'], [capSimple], 'Que la detecte la IA')
assert.equal(await pag.locator('[data-aviso-casa]').count(), 0, 'sin casa elegida no hay aviso')
assert.equal((await ultimaLlamada()).orden, 'catalogo,imagen,texto', 'la IA no recibe casa indicada (solo catálogo, imagen y la frase final)')
if (codere) {
  await esperar(async () => (await casaSel()) === codere)
  assert.equal(await pag.locator('[data-origen-casa="ia"]').innerText(), 'Casa: detectada por la IA')
}
await descartarCaptura()
bien('Con «Que la detecte la IA», la casa sale de la captura como antes, sin aviso ni casa indicada')
await subirConCasa(['sin_casa', 'casa_duda'], [capSimple, capResuelta], 'Kirolbet')
assert.equal(await casaSel(), await kirol(), '1.ª con la casa de la tanda')
await guardarRevision('Guardar y seguir')
await esperar(async () => (await pag.getByLabel('Evento', { exact: true }).first().inputValue()) === 'Valladolid - Eibar', 30000)
assert.equal(await casaSel(), await kirol(), '2.ª también')
await pag.getByLabel('Casa de apuestas', { exact: true }).selectOption(ultimaCasaAna.id)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
const casasTanda = await sql(`select s.evento, a.casa_id from apuestas a join selecciones s on s.apuesta_id = a.id where s.evento in ('Racing - Sporting', 'Valladolid - Eibar') order by s.evento`)
assert.deepEqual(casasTanda.map((f) => [f.evento, f.casa_id]), [['Racing - Sporting', await kirol()], ['Valladolid - Eibar', ultimaCasaAna.id]])
bien('Tanda de 2: la casa elegida en las dos; cambiada en la 2.ª y guardada cada una con la suya')

// ---------- Registro, tarea 3: API-Football (API simulada en :54323) ----------
paso('API-Football: Ajustes muestra «Conectada» y «Comprobar» da plan y llamadas (sin datos de la cuenta)')
const apiLlamadas = async () => (await fetch('http://localhost:54323/__api_llamadas')).json()
const apiModo = (m) => fetch('http://localhost:54323/__api_modo', { method: 'POST', body: m })
await pag.goto(`${APP}/ajustes`)
const cajaApi = pag.locator('[data-ajustes-api-futbol]')
await cajaApi.getByText('Conectada (clave configurada en el servidor)').waitFor()
await cajaApi.getByRole('button', { name: 'Comprobar conexión' }).click()
await cajaApi.getByText(/^Funciona · plan Pro/).waitFor({ timeout: 10000 })
const textoAjustesApi = await cajaApi.innerText()
assert.ok(!textoAjustesApi.includes('privado@') && !textoAjustesApi.includes('Privado'), 'nunca el nombre ni el email de la cuenta')
assert.ok(!(await pag.content()).includes('clave-api-futbol-simulada'), 'la clave no llega al navegador')
await foto('99-ajustes-api-futbol')
bien('Ajustes → API-Football: conectada, «Comprobar» responde con el plan; sin clave ni datos de la cuenta')

paso('API-Football: coincidencia clara (Bayern de Múnich - Arsenal, sin fecha en la captura)')
const MANANA = diaMadridMas(1)
const confirmadas = () => pag.locator('[data-confirmado-api]').count()
const antesClara = (await apiLlamadas()).length // las capturas de fútbol anteriores ya consultaron sus días
await sql(`delete from api_futbol_dias`)
await cola(['api_clara'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
const cajaConfirmado = pag.locator('[data-api-futbol="confirmado"]')
await cajaConfirmado.waitFor({ timeout: 15000 })
assert.ok((await cajaConfirmado.innerText()).includes('Bayern München - Arsenal'), await cajaConfirmado.innerText())
assert.equal(await diaEvento(), MANANA)
assert.equal(await leerHora(pag), '21:00')
assert.equal(await ligaSel().inputValue(), 'Champions League', '«UEFA Champions League» = tu «Champions League»')
assert.equal(await deporteSel().inputValue(), 'Fútbol')
assert.ok((await confirmadas()) >= 4, `marcas «confirmado por API-Football»: ${await confirmadas()}`)
assert.equal(await pag.getByText('revisar · deducido de otra apuesta tuya').count(), 0)
await esperar(async () => (await diaApuesta()) === MANANA)
const llamadasClara = (await apiLlamadas()).slice(antesClara)
const paginasManana = llamadasClara.filter((l) => l.ruta === '/fixtures' && l.params.date === MANANA).map((l) => l.params.page ?? '1')
assert.deepEqual(paginasManana, ['1', '2', '3'], 'paginación: pide las 3 páginas del día')
assert.deepEqual([...new Set(llamadasClara.filter((l) => l.ruta === '/fixtures').map((l) => l.params.date))].sort(), Array.from({ length: 10 }, (_, k) => diaMadridMas(k - 7)), 'sin fecha: de hoy − 7 a hoy + 2')
for (const l of llamadasClara) {
  assert.deepEqual(l.cabeceras, ['x-apisports-key'], 'solo la cabecera de la clave')
  assert.equal(l.clave, 'presente')
}
await foto('100-api-confirmado')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
const [selBayern] = await sql(`select s.liga, s.deporte, to_char(s.evento_fecha, 'YYYY-MM-DD') f, to_char(s.evento_hora, 'HH24:MI') h, to_char(a.fecha at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI') fa
  from selecciones s join apuestas a on a.id = s.apuesta_id where s.evento = 'Bayern de Múnich - Arsenal'`)
assert.deepEqual(selBayern, { liga: 'Champions League', deporte: 'Fútbol', f: MANANA, h: '21:00', fa: `${MANANA} 21:00` })
await esperar(async () => (await sql(`select count(*)::int n from api_futbol_equipos where user_id = '${ANA.id}'`))[0].n === 2)
const eqBayern = await sql(`select nombre_captura, equipo_id from api_futbol_equipos where user_id = '${ANA.id}' order by equipo_id`)
assert.deepEqual(eqBayern, [{ nombre_captura: 'arsenal', equipo_id: 42 }, { nombre_captura: 'bayern munchen', equipo_id: 157 }])
const [eqLiga] = await sql(`select f.liga_api_id, l.nombre from api_futbol_ligas f join ligas l on l.id = f.liga_id where f.user_id = '${ANA.id}'`)
assert.deepEqual(eqLiga, { liga_api_id: 2, nombre: 'Champions League' })
bien(`Rellenados día (${MANANA}), 21:00, «Champions League» y Fútbol con la marca propia; 3 páginas pedidas; al guardar se recuerdan equipos y liga`)

paso('API-Football: apuesta YA RESUELTA de ayer sin fecha ni hora (UD Las Palmas - CD Eldense)')
const AYER = diaMadridMas(-1)
const antesAyer = (await apiLlamadas()).length
await cola(['api_ayer'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await cajaConfirmado.waitFor({ timeout: 15000 })
assert.ok((await cajaConfirmado.innerText()).includes('Las Palmas - Eldense'), await cajaConfirmado.innerText())
assert.equal(await diaEvento(), AYER)
assert.equal(await leerHora(pag), '18:30')
assert.equal(await ligaSel().inputValue(), 'Copa del Rey', 'la de tu catálogo con el mismo nombre')
await esperar(async () => (await diaApuesta()) === AYER)
assert.equal((await apiLlamadas()).length, antesAyer, 'los 10 días ya estaban en la caché: 0 llamadas')
await foto('100b-api-ayer-resuelta')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
const [selLp] = await sql(`select to_char(s.evento_fecha, 'YYYY-MM-DD') f, to_char(s.evento_hora, 'HH24:MI') h, a.estado from selecciones s join apuestas a on a.id = s.apuesta_id where s.evento = 'UD Las Palmas - CD Eldense'`)
assert.deepEqual(selLp, { f: AYER, h: '18:30', estado: 'ganada' })
bien(`Resuelta y sin fecha: confirmada con el día de ayer (${AYER}), 18:30 y la liga; fecha de la apuesta = ayer; guardada ganada`)

paso('API-Football: la captura muestra otra hora con claridad → sugerencia, no se pisa')
const antesHora = (await apiLlamadas()).length
await cola(['api_hora'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await cajaConfirmado.waitFor({ timeout: 15000 })
assert.equal(await leerHora(pag), '20:00', 'la hora clara de la captura no se pisa')
assert.ok((await cajaConfirmado.innerText()).includes('La captura dice 20:00; la API indica 18:45.'), await cajaConfirmado.innerText())
assert.equal((await apiLlamadas()).length, antesHora, 'el día ya estaba en la caché: ninguna llamada nueva')
await pag.getByRole('button', { name: 'Usar 18:45' }).click()
await esperar(async () => (await leerHora(pag)) === '18:45')
await foto('101-api-sugerencia-hora')
await descartarCaptura()
bien('20:00 en la captura y 18:45 en la API: se queda 20:00 con «Usar 18:45»; caché: 0 llamadas nuevas')

paso('API-Football: varias coincidencias → «Partidos posibles»; se elige una y la próxima vez sale sola')
await cola(['api_varias'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
const fichas = pag.locator('[data-partido-posible]')
await pag.locator('[data-api-futbol="varias"]').waitFor({ timeout: 15000 })
assert.equal(await fichas.count(), 2)
assert.equal(await leerHora(pag), '', 'nada preseleccionado ni rellenado')
assert.equal(await ligaSel().inputValue(), '')
await foto('102-api-partidos-posibles')
await pag.locator('[data-partido-posible="9004"]').click()
await cajaConfirmado.waitFor()
assert.equal(await leerHora(pag), '20:00')
assert.equal(await ligaSel().inputValue(), 'Primera División', 'liga de la API, que no está en tu catálogo')
assert.ok((await pag.getByText('API-Football indica «Primera División». Crear y usar').count()) === 1, 'ofrece «Crear y usar»')
await pag.locator('[data-usar-mi-liga]').selectOption('LaLiga Hypermotion')
await esperar(async () => (await ligaSel().inputValue()) === 'LaLiga Hypermotion')
await foto('103-api-usar-mi-liga')
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await esperar(async () => (await sql(`select count(*)::int n from api_futbol_ligas where user_id = '${ANA.id}' and liga_api_id = 268`))[0].n === 1)
await cola(['api_recuerda'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await cajaConfirmado.waitFor({ timeout: 15000 })
assert.ok((await cajaConfirmado.innerText()).includes('Universidad Catolica - Nacional'), await cajaConfirmado.innerText())
assert.equal(await ligaSel().inputValue(), 'LaLiga Hypermotion', 'la liga elegida se recuerda')
assert.equal(await fichas.count(), 0)
await foto('104-api-recordado')
await descartarCaptura()
bien('2 fichas sin nada elegido; elegida la de Uruguay y «Usar una de mis ligas» (LaLiga Hypermotion); la 2.ª captura sale sola con esa liga')

paso('API-Football: liga nueva → «Crear y usar» la crea en tu catálogo y se recuerda')
await cola(['api_liga_nueva'])
await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
await subirArchivos([capSimple])
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
await cajaConfirmado.waitFor({ timeout: 15000 })
assert.equal(await ligaSel().inputValue(), 'Segunda División')
await pag.getByText('API-Football indica «Segunda División». Crear y usar').click()
await esperar(async () => (await sql(`select count(*)::int n from ligas where user_id = '${ANA.id}' and nombre = 'Segunda División'`))[0].n === 1)
await guardarRevision('Guardar')
await pag.waitForURL(`${APP}/apuestas`)
await esperar(async () => (await sql(`select count(*)::int n from api_futbol_ligas f join ligas l on l.id = f.liga_id where f.user_id = '${ANA.id}' and f.liga_api_id = 141 and l.nombre = 'Segunda División'`))[0].n === 1)
bien('«Segunda División» creada en el catálogo con «Crear y usar» y recordada para la próxima vez')

paso('API-Football: sin respuesta (tiempo agotado, fallo, 429) el registro sigue como siempre')
for (const modo of ['colgar', 'fallo', '429']) {
  await sql(`delete from api_futbol_dias`)
  await sql(`delete from api_futbol_uso`)
  await apiModo(modo)
  await cola(['api_clara'])
  await pag.goto(`${APP}/apuestas/nueva`, { waitUntil: 'networkidle' })
  await subirArchivos([capSimple])
  await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
  const t0 = Date.now()
  await pag.locator('[data-aviso-api]').waitFor({ timeout: 15000 })
  assert.ok(Date.now() - t0 < 12000, `${modo}: no hace esperar de más`)
  assert.equal(await pag.locator('[data-api-futbol]').count(), 0)
  // Sigue como siempre: rellenan los «partidos conocidos» (la apuesta del Bayern guardada antes), en ámbar.
  await pag.locator('[data-partido-conocido="otra_apuesta"]').waitFor({ timeout: 5000 })
  assert.equal(await confirmadas(), 0, 'nada «confirmado por API-Football»')
  if (modo === 'colgar') await foto('105-api-sin-respuesta')
  await descartarCaptura()
}
await apiModo('ok')
bien('Tiempo agotado, error 500 y 429: aviso discreto «No se ha podido consultar API-Football…», nada confirmado; siguen los partidos conocidos y la revisión')

paso('API-Football: nunca al editar una apuesta guardada')
const antesEditar = (await apiLlamadas()).length
await pag.goto(`${APP}/apuestas`)
await abrir('Bayern de Múnich - Arsenal')
await editar()
await pag.waitForTimeout(1500)
assert.equal(await pag.locator('[data-api-futbol]').count(), 0)
assert.equal((await apiLlamadas()).length, antesEditar)
bien('Editar una apuesta guardada no consulta API-Football')

paso('Otro usuario (Beto) no ve nada de Ana')
const ctxBeto = await navegador.newContext(movil)
await ctxBeto.addCookies([cookieSesion(BETO)])
const pagBeto = await ctxBeto.newPage()
await pagBeto.goto(`${APP}/apuestas`)
await pagBeto.getByText('Aún no hay apuestas').waitFor()
bien('Su lista está vacía')
await pagBeto.goto(`${APP}/ajustes`)
let descargaBeto = false
pagBeto.on('download', () => (descargaBeto = true))
await pagBeto.getByRole('button', { name: 'Descargar apuestas (CSV)' }).click()
await pagBeto.getByText('Todavía no tienes apuestas registradas: no hay nada que exportar.').waitFor()
await pagBeto.getByRole('button', { name: 'Descargar selecciones (CSV)' }).click()
await pagBeto.getByText('Todavía no tienes apuestas registradas: no hay nada que exportar.').waitFor()
await pagBeto.screenshot({ path: join(SALIDA, '71-copia-sin-apuestas.png'), fullPage: true })
assert.equal(descargaBeto, false, 'sin archivo vacío')
const rBetoCsv = await pagBeto.request.get(`${APP}/api/exportar/apuestas`)
assert.equal(rBetoCsv.status(), 404)
bien('Sin apuestas: mensaje claro y ningún archivo (la de Ana no le cuenta)')
await pagBeto.goto(`${APP}/analisis`)
await pagBeto.getByText('Todavía no hay apuestas resueltas.', { exact: false }).waitFor()
await pagBeto.screenshot({ path: join(SALIDA, '83-analisis-vacio.png'), fullPage: true })
bien('Análisis sin apuestas resueltas: estado vacío claro (nada de Ana)')
await pagBeto.goto(urlDetalle)
await pagBeto.getByText('No hay apuestas en esta fila con el periodo y los filtros elegidos.').waitFor()
bien('Con la dirección de un detalle de Ana, Beto no ve ninguna apuesta')
await pagBeto.goto(`${APP}/bankroll`)
await pagBeto.getByText('Registra tus depósitos y retiradas pasados para que el saldo y el ROI sean correctos.').waitFor()
const [movAna] = await sql(`select id from movimientos_bankroll where user_id = '${ANA.id}' limit 1`)
await pagBeto.goto(`${APP}/bankroll/${movAna.id}`)
await pagBeto.getByText('Este movimiento no existe.', { exact: false }).waitFor()
await pagBeto.goto(`${APP}/bankroll/casa/${casaBk.id}`)
await pagBeto.getByText('Esta casa no existe.').waitFor()
bien('Bankroll de Beto vacío; no puede abrir un movimiento ni una casa de Ana')
await pagBeto.goto(`${APP}/ajustes/deportes`)
await pagBeto.waitForLoadState('networkidle')
await pagBeto.locator('[data-deporte="Tenis"] > button').click()
assert.equal(await pagBeto.locator('[data-fila-catalogo="Laver Cup"]').count(), 0)
await pagBeto.locator('[data-deporte="Fútbol"] > button').click()
assert.equal(await pagBeto.locator('[data-fila-catalogo="Liga Portugal Betclic"]').count(), 0)
await pagBeto.goto(`${APP}/ajustes/deportes/revisar`)
await pagBeto.getByText('No hay posibles errores.').waitFor()
bien('Su catálogo es el inicial: no ve las ligas que creó Ana')
// Intenta abrir una apuesta y una captura de Ana conociendo sus direcciones.
await pag.goto(`${APP}/apuestas`)
await abrir('Codere · Combinada (2)')
const urlApuestaAna = pag.url()
// Una imagen de Ana en Storage (las capturas ya no se ven en el detalle).
const rutaCaptura = `${ANA.id}/00000000-0000-4000-8000-0000000000b1.jpg`
await fetch('http://localhost:54322/__archivo_suelto', { method: 'POST', body: JSON.stringify({ ruta: rutaCaptura }) })
assert.equal((await pag.request.get(`${APP}/api/capturas/ver?ruta=${encodeURIComponent(rutaCaptura)}`)).status(), 200, 'Ana sí la ve')
await pagBeto.goto(`${APP}/ajustes`)
await pagBeto.getByText('No hay capturas antiguas que borrar.').waitFor()
bien('En sus Ajustes no aparece ninguna captura de Ana (Storage solo le enseña su carpeta)')
await pagBeto.goto(urlApuestaAna)
await pagBeto.getByText('Esta apuesta no existe').waitFor()
const r = await pagBeto.request.get(`${APP}/api/capturas/ver?ruta=${encodeURIComponent(rutaCaptura)}`)
assert.equal(r.status(), 404)
const rT = await pagBeto.request.post(`${APP}/api/capturas/transcribir`, { data: { ruta: rutaCaptura } })
assert.equal(rT.status(), 400)
bien('No puede abrir la apuesta de Ana, ni su captura, ni mandarla a la IA')
const sinSesion = await (await navegador.newContext()).request.get(`${APP}/api/capturas/ver?ruta=${encodeURIComponent(rutaCaptura)}`, { maxRedirects: 0 })
assert.ok([307, 401].includes(sinSesion.status()))
bien('Sin sesión tampoco')
await rellenarRayo(pagBeto)
await pagBeto.waitForTimeout(1500)
assert.equal(await pagBeto.getByRole('alertdialog', { name: 'Apuesta duplicada' }).count(), 0, 'la de Ana no cuenta para Beto')
await pagBeto.getByRole('button', { name: 'Guardar', exact: true }).click()
await pagBeto.waitForURL(`${APP}/apuestas`)
await rellenarRayo(pagBeto)
await pagBeto.getByRole('alertdialog', { name: 'Apuesta duplicada' }).waitFor({ timeout: 5000 })
bien('Una apuesta idéntica a la de Ana no avisa a Beto; la suya propia, sí')

assert.deepEqual(erroresConsola, [], 'sin errores en el navegador')
await navegador.close()
console.log(`\n🎉 Todo OK. Capturas de pantalla en .prueba-local/\n`)
cerrar()
process.exit(0)
