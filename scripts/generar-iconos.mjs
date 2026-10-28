// Genera los iconos provisionales (una "F" blanca sobre verde) con el navegador
// Chromium que trae Playwright. Uso: node scripts/generar-iconos.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
// Playwright no es dependencia del proyecto: se usa el instalado en el sistema.
const { chromium } = createRequire(import.meta.url)('playwright')

// padding: margen interior (los "maskable" necesitan zona segura del 20 %).
const iconos = [
  { file: 'public/icons/icon-192.png', size: 192, padding: 0, radius: 0.22 },
  { file: 'public/icons/icon-512.png', size: 512, padding: 0, radius: 0.22 },
  { file: 'public/icons/maskable-512.png', size: 512, padding: 0.2, radius: 0 },
  { file: 'src/app/apple-icon.png', size: 180, padding: 0, radius: 0 },
  { file: 'src/app/icon.png', size: 64, padding: 0, radius: 0.22 },
]

const html = ({ size, padding, radius }) => `
<html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;background:#16a34a;border-radius:${radius * size}px;
  display:flex;align-items:center;justify-content:center;
  font:700 ${Math.round(size * (1 - padding * 2) * 0.62)}px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#fff;letter-spacing:-0.02em">F</div>
</body></html>`

mkdirSync(join(ROOT, 'public/icons'), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
for (const icono of iconos) {
  await page.setViewportSize({ width: icono.size, height: icono.size })
  await page.setContent(html(icono))
  await page.screenshot({ path: join(ROOT, icono.file), omitBackground: true })
  console.log('✓', icono.file)
}
await browser.close()
