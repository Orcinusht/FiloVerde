// Prueba de punta a punta EN LOCAL, con el simulador (sin internet, sin datos reales):
// arranca el simulador, compila y arranca la app, y la usa con un navegador
// automático en tamaño móvil, como lo harías tú. Guarda capturas de pantalla en
// .prueba-local/ para poder verlas.
//
// Uso:  npm run probar:local

import { spawn, execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
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
  PORT: '3100',
}

const procesos = []
function arrancar(cmd, args, listo) {
  return new Promise((ok, mal) => {
    const p = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    procesos.push(p)
    const ver = (d) => {
      const t = d.toString()
      if (process.env.VERBOSE || /error|⨯|\[ia:|\[capturas|\[apuestas/i.test(t)) process.stdout.write(`   │ ${t}`)
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
await pag.locator('input[type=file][multiple]').setInputFiles([capCombinada, capResuelta, capPerro])
await pag.getByText('Captura 1 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
await pag.waitForTimeout(500)
await foto('03-revision-combinada')

// Comprobaciones de la combinada
const valor = (etiqueta, n = 0) => pag.getByLabel(etiqueta, { exact: true }).nth(n).inputValue()
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
await pag.getByRole('button', { name: 'Guardar y seguir' }).click()

await pag.getByText('Captura 2 de 3').waitFor()
await pag.getByRole('button', { name: 'Guardar y seguir' }).waitFor({ timeout: 30000 })
await pag.waitForTimeout(300)
await foto('04-revision-resuelta')
assert.equal(await pag.getByLabel('Estado de la apuesta').inputValue(), 'ganada')
assert.equal(await valor('Resultado económico (€)'), '22,00')
bien('Apuesta ya resuelta: propone «Ganada» y resultado +22,00 €')
await pag.getByRole('button', { name: 'Guardar y seguir' }).click()

await pag.getByText('Captura 3 de 3').waitFor()
await pag.getByText(/no parece una apuesta/).waitFor({ timeout: 30000 })
await foto('05-no-es-apuesta')
bien('Imagen que no es apuesta: lo dice sin romperse (con Reintentar / Rellenar a mano / Descartar)')
await pag.getByRole('button', { name: 'Descartar esta captura' }).click()

await pag.waitForURL(`${APP}/apuestas`)
await pag.getByText('Codere · Combinada (2)').waitFor()
await foto('06-lista-con-2')
assert.equal(await pag.locator('main ul li').count(), 2)
bien('Lista con las 2 guardadas, la más reciente primero')

paso('Fallo de la IA → reintentar')
await cola(['error500', 'error500', 'simple'])
await pag.goto(`${APP}/apuestas/nueva`)
await pag.locator('input[type=file][multiple]').setInputFiles([capSimple])
await pag.getByText(/saturada/).waitFor({ timeout: 60000 })
await foto('07-error-ia')
bien('Mensaje claro en español; la imagen sigue visible')
await pag.getByRole('button', { name: 'Reintentar' }).click()
await pag.getByRole('button', { name: 'Guardar', exact: true }).waitFor({ timeout: 30000 })
bien('Reintento correcto')
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.waitForURL(`${APP}/apuestas`)

paso('JSON inválido de la IA → rellenar a mano sin perder la imagen')
await cola(['json_malo', 'json_malo'])
await pag.goto(`${APP}/apuestas/nueva`)
await pag.locator('input[type=file][multiple]').setInputFiles([capSimple])
await pag.getByText(/datos que no se entienden/).waitFor({ timeout: 30000 })
await pag.getByRole('button', { name: 'Rellenar a mano' }).click()
await pag.getByRole('img', { name: 'Captura de la apuesta' }).waitFor()
bien('Formulario vacío con la captura encima para copiarla')
await pag.getByRole('button', { name: 'Descartar esta captura' }).click()
await pag.waitForURL(`${APP}/apuestas`)

paso('Detalle: cambiar estado (ganada, cash out, media ganada) y ver el resultado')
await pag.getByText('Real Betis - Sevilla FC').first().click()
await pag.getByRole('button', { name: 'Guardar cambios' }).waitFor()
await pag.getByLabel('Estado de la apuesta').selectOption('perdida')
assert.equal(await valor('Resultado económico (€)'), '-10,00')
await pag.getByLabel('Estado de la apuesta').selectOption('media_ganada')
assert.equal(await valor('Resultado económico (€)'), '4,25')
await pag.getByLabel('Estado de la apuesta').selectOption('cash_out')
await pag.getByLabel('Importe recuperado con el cash out (€)').fill('14,30')
assert.equal(await valor('Resultado económico (€)'), '4,30')
await pag.getByLabel('Estado de la apuesta').selectOption('ganada')
assert.equal(await valor('Resultado económico (€)'), '8,50')
await pag.getByLabel('Resultado económico (€)').fill('8,40')
bien('Ganada +8,50 · perdida −10 · media ganada +4,25 · cash out (14,30 recuperados) +4,30 · corregible a mano')
await pag.getByRole('button', { name: 'Guardar cambios' }).click()
await pag.getByText('✓ Cambios guardados').waitFor()
await foto('08-detalle-editado')
await pag.reload()
assert.equal(await pag.getByLabel('Estado de la apuesta').inputValue(), 'ganada')
assert.equal(await valor('Resultado económico (€)'), '8,40')
bien('Al recargar sigue ahí (ganada, +8,40 corregido a mano)')

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
await pag.getByLabel('Evento').fill('Partido manual')
await pag.getByLabel('Cuota', { exact: true }).fill('+150')
await pag.getByRole('button', { name: 'Guardar', exact: true }).click()
await pag.waitForURL(`${APP}/apuestas`)
await pag.getByText('Partido manual').click()
await pag.getByRole('button', { name: 'Guardar cambios' }).waitFor()
assert.equal(await valor('Cuota total'), '2,50')
bien('Apuesta manual creada (cuota +150 guardada como 2,50)')
await pag.getByRole('button', { name: 'Borrar apuesta' }).click()
await foto('09-confirmar-borrado')
await pag.getByRole('button', { name: 'Sí, borrar' }).click()
await pag.waitForURL(`${APP}/apuestas`)
await pag.waitForTimeout(300)
assert.equal(await pag.getByText('Partido manual').count(), 0)
bien('Borrada (con confirmación)')

paso('Ajustes: coste de la IA')
await pag.goto(`${APP}/ajustes`)
await pag.getByText('Coste medio por captura').waitFor()
await foto('10-ajustes-coste')
const llamadas = await (await fetch('http://localhost:54322/__llamadas')).json()
bien(`${llamadas.length} llamadas a la IA registradas; modelo ${llamadas[0].model}, esfuerzo ${llamadas[0].effort}, formato ${llamadas[0].formato}`)
assert.ok(llamadas.every((l) => l.model === 'claude-sonnet-5-5'))
const grande = llamadas[1]
assert.ok(grande.bytesImagen < 600_000, `imagen reducida: ${grande.bytesImagen} bytes`)
bien(`La captura de 3000×5000 llegó a la IA reducida (${Math.round(grande.bytesImagen / 1024)} KB)`)

// ---------- Beto: no puede ver nada de Ana ----------
paso('Otro usuario (Beto) no ve nada de Ana')
const ctxBeto = await navegador.newContext(movil)
await ctxBeto.addCookies([cookieSesion(BETO)])
const pagBeto = await ctxBeto.newPage()
await pagBeto.goto(`${APP}/apuestas`)
await pagBeto.getByText('Aún no hay apuestas').waitFor()
bien('Su lista está vacía')
// Intenta abrir una apuesta y una captura de Ana conociendo sus direcciones.
await pag.goto(`${APP}/apuestas`)
await pag.getByText('Codere · Combinada (2)').click()
await pag.getByRole('button', { name: 'Guardar cambios' }).waitFor()
const urlApuestaAna = pag.url()
const rutaCaptura = new URL(await pag.getByRole('img', { name: 'Captura de la apuesta' }).first().getAttribute('src'), APP).searchParams.get('ruta')
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

assert.deepEqual(erroresConsola, [], 'sin errores en el navegador')
await navegador.close()
console.log(`\n🎉 Todo OK. Capturas de pantalla en .prueba-local/\n`)
cerrar()
process.exit(0)
