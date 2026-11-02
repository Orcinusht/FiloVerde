import { connection } from 'next/server'
import { resumenCosteIA } from '@/lib/server/datos'
import { getAnthropicModel, hayAnthropicApiKey } from '@/lib/server/env'

// Control de coste de la IA: cuántas capturas se han leído y cuánto ha costado (aprox.).
export async function CosteIA() {
  await connection()
  let r: Awaited<ReturnType<typeof resumenCosteIA>>
  try {
    r = await resumenCosteIA()
  } catch {
    return <Marco><p className="px-4 py-3 text-sm text-muted">No se ha podido cargar el coste.</p></Marco>
  }
  const usd = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 4 : 2 }).format(n)

  return (
    <Marco>
      <dl className="divide-y divide-border text-sm">
        <Fila nombre="Este mes" valor={`${usd(r.mesUsd)} · ${r.mesLecturas} ${r.mesLecturas === 1 ? 'lectura' : 'lecturas'}`} />
        <Fila nombre="Coste medio por captura" valor={r.medioUsd == null ? '—' : usd(r.medioUsd)} />
        <Fila nombre="Total desde el principio" valor={`${usd(r.totalUsd)} · ${r.totalLecturas}`} />
        {r.fallidas > 0 && <Fila nombre="Lecturas fallidas" valor={String(r.fallidas)} />}
        {r.porVersion.length > 1 && <ComparativaVersiones porVersion={r.porVersion} usd={usd} />}
        <Fila nombre="Modelo actual" valor={getAnthropicModel()} />
        {r.modelos.length > 0 && <Fila nombre="Modelos usados" valor={r.modelos.join(', ')} />}
      </dl>
      {!hayAnthropicApiKey() && (
        <p className="border-t border-border px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Falta la clave de la IA (ANTHROPIC_API_KEY): las capturas no se leerán solas.
        </p>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted">
        Coste aproximado según el precio público del modelo (en dólares). El cargo real lo ves en console.anthropic.com.
      </p>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Coste de la IA</h2>
      <div className="rounded-xl border border-border bg-surface">{children}</div>
    </section>
  )
}

function Fila({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-muted">{nombre}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  )
}

const NOMBRE_VERSION: Record<number, string> = {
  1: 'antes del catálogo',
  2: 'con catálogo',
  3: 'ignora señales de directo',
}

// Coste medio antes y después de cambiar las instrucciones de la IA (p. ej. con el catálogo).
function ComparativaVersiones({
  porVersion,
  usd,
}: {
  porVersion: { version: number; lecturas: number; medioUsd: number | null }[]
  usd: (n: number) => string
}) {
  const [antes, despues] = porVersion.slice(-2)
  const sube =
    antes.medioUsd && despues.medioUsd ? Math.round(((despues.medioUsd - antes.medioUsd) / antes.medioUsd) * 100) : null
  return (
    <div className="px-4 py-3 text-sm">
      <p className="text-muted">Coste medio por versión de las instrucciones</p>
      <ul className="mt-1 space-y-0.5">
        {porVersion.map((v) => (
          <li key={v.version} className="flex justify-between gap-3">
            <span>
              v{v.version}
              {NOMBRE_VERSION[v.version] ? ` (${NOMBRE_VERSION[v.version]})` : ''} · {v.lecturas}
            </span>
            <span className="font-medium">{v.medioUsd == null ? '—' : usd(v.medioUsd)}</span>
          </li>
        ))}
      </ul>
      {sube != null && (
        <p className="mt-1 font-medium">
          Cambio: {sube > 0 ? '+' : ''}
          {sube} % por captura
        </p>
      )}
    </div>
  )
}
