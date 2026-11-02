'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { descartarCaptura } from '@/app/(app)/apuestas/actions'
import { valoresVacios, type Opcion } from '@/lib/apuestas/formulario'
import type { ApuestaPendiente, Revision } from '@/lib/apuestas/propuesta'
import { ErrorImagen, reducirImagen } from '@/lib/navegador/reducir-imagen'
import { FormularioApuesta } from './formulario-apuesta'
import { VisorCaptura } from './visor-captura'

export const MAX_LOTE = 5

type Paso = 'esperando' | 'reduciendo' | 'subiendo' | 'leyendo' | 'lista' | 'error' | 'manual'

// Cada elemento de la cola es una captura (mientras se lee) o una apuesta a revisar.
// Una captura con varias apuestas se convierte en varios elementos, uno por apuesta.
type Item = {
  clave: string
  archivo?: File
  paso: Paso
  ruta?: string | null
  revision?: Revision
  transcripcionId?: string | null
  indice?: number // posición de la apuesta dentro de la captura (0, 1…)
  total?: number // cuántas apuestas trae la captura
  error?: string
}

const TEXTO_PASO: Partial<Record<Paso, string>> = {
  esperando: 'En cola…',
  reduciendo: 'Preparando la imagen…',
  subiendo: 'Subiendo la captura…',
  leyendo: 'La IA está leyendo la captura…',
}

// Flujo: elegir 1–5 capturas → se preparan, suben y leen una detrás de otra
// (mientras revisas la primera, se van leyendo las siguientes) → revisar → guardar.
export function RegistroCapturas({
  casas,
  estrategias,
  pendientes = [],
}: {
  casas: Opcion[]
  estrategias: Opcion[]
  pendientes?: ApuestaPendiente[] // para retomar una revisión a medias
}) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>(() =>
    pendientes.map((p) => ({
      clave: `pendiente-${p.transcripcionId}-${p.indice}`,
      paso: 'lista' as const,
      ruta: p.ruta,
      revision: p.revision,
      transcripcionId: p.transcripcionId,
      indice: p.indice,
      total: p.total,
    })),
  )
  const [actual, setActual] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [opcionesCasas, setOpcionesCasas] = useState(casas)
  const [opcionesEstrategias, setOpcionesEstrategias] = useState(estrategias)
  const itemsRef = useRef<Item[]>(items)
  const enMarcha = useRef(false)

  function actualizar(clave: string, cambios: Partial<Item>) {
    itemsRef.current = itemsRef.current.map((it) => (it.clave === clave ? { ...it, ...cambios } : it))
    setItems(itemsRef.current)
  }

  // Avisa si se intenta salir con capturas sin guardar.
  const quedanPendientes = items.slice(actual).length > 0
  useEffect(() => {
    if (!quedanPendientes) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [quedanPendientes])

  async function procesar(item: Item) {
    let ruta = item.ruta
    try {
      if (!ruta) {
        actualizar(item.clave, { paso: 'reduciendo', error: undefined })
        if (!item.archivo) throw new Error('Falta la imagen. Vuelve a elegirla.')
        const reducida = await reducirImagen(item.archivo)
        actualizar(item.clave, { paso: 'subiendo' })
        const datos = new FormData()
        datos.append('archivo', reducida, 'captura.jpg')
        const r = await fetch('/api/capturas', { method: 'POST', body: datos })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.ruta) throw new Error(j.error ?? 'No se ha podido subir la captura.')
        ruta = j.ruta as string
        actualizar(item.clave, { ruta })
      }
      actualizar(item.clave, { paso: 'leyendo', error: undefined })
      const r = await fetch('/api/capturas/transcribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruta }),
      })
      const j = await r.json().catch(() => ({}))
      const revisiones = j.revisiones as Revision[] | undefined
      if (!r.ok || !revisiones?.length) throw new Error(j.error ?? 'No se ha podido leer la captura.')
      // Una entrada en la cola por cada apuesta encontrada, todas con la misma imagen.
      const nuevos: Item[] = revisiones.map((revision, indice) => ({
        clave: `${item.clave}-${indice}`,
        paso: 'lista',
        ruta,
        revision,
        transcripcionId: j.transcripcionId ?? null,
        indice,
        total: revisiones.length,
      }))
      itemsRef.current = itemsRef.current.flatMap((it) => (it.clave === item.clave ? nuevos : [it]))
      setItems(itemsRef.current)
    } catch (e) {
      const mensaje =
        e instanceof ErrorImagen || e instanceof Error
          ? e.message === 'Failed to fetch' || e.message === 'Load failed'
            ? 'Sin conexión. Comprueba internet y pulsa «Reintentar».'
            : e.message
          : 'Algo ha fallado. Pulsa «Reintentar».'
      actualizar(item.clave, { paso: 'error', error: mensaje, ruta })
    }
  }

  async function procesarCola() {
    if (enMarcha.current) return
    enMarcha.current = true
    try {
      for (;;) {
        const siguiente = itemsRef.current.find((it) => it.paso === 'esperando')
        if (!siguiente) break
        await procesar(siguiente)
      }
    } finally {
      enMarcha.current = false
    }
  }

  function elegir(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const archivos = Array.from(lista)
    setAviso(
      archivos.length > MAX_LOTE
        ? `Has elegido ${archivos.length}; se procesan las ${MAX_LOTE} primeras. Las demás, en otra tanda.`
        : null,
    )
    const nuevos: Item[] = archivos.slice(0, MAX_LOTE).map((archivo, i) => ({
      clave: `${Date.now()}-${i}`,
      archivo,
      paso: 'esperando',
    }))
    itemsRef.current = nuevos
    setItems(nuevos)
    setActual(0)
    void procesarCola()
  }

  function siguiente() {
    if (actual + 1 >= itemsRef.current.length) {
      itemsRef.current = []
      setItems([])
      router.push('/apuestas')
      router.refresh()
    } else {
      setActual((a) => a + 1)
      window.scrollTo({ top: 0 })
    }
  }

  async function descartar(item: Item) {
    // Si otras apuestas de esta captura siguen en la cola, la imagen no se borra
    // (el servidor lo comprueba: solo se borra cuando ya no la usa nadie).
    if (item.ruta || item.transcripcionId) {
      await descartarCaptura({
        ruta: item.ruta ?? null,
        transcripcionId: item.transcripcionId ?? null,
        indice: item.indice ?? null,
      })
    }
    siguiente()
  }

  // ---------- Pantalla de elegir ----------
  if (items.length === 0) {
    return (
      <div className="space-y-4 px-4 pt-2">
        <p className="text-sm text-muted">
          Elige hasta {MAX_LOTE} capturas de tus apuestas. La IA las lee y tú revisas cada una antes de guardarla.
        </p>
        <BotonArchivo etiqueta="📷  Hacer una foto" captura onElegir={elegir} principal />
        <BotonArchivo etiqueta="🖼️  Elegir de la galería" multiple onElegir={elegir} />
        <Link
          href="/apuestas/nueva?manual=1"
          className="flex h-12 items-center justify-center rounded-xl text-sm font-semibold text-brand"
        >
          Registrar a mano, sin captura
        </Link>
      </div>
    )
  }

  const item = items[actual]
  if (!item) return null
  // El total puede crecer: una captura con varias apuestas se convierte en varias.
  const progreso = items.length > 1 ? `Apuesta ${actual + 1} de ${items.length}` : null
  const variasEnCaptura = (item.total ?? 1) > 1

  return (
    <div className="space-y-3">
      <div className="space-y-2 px-4">
        {progreso && (
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{progreso}</span>
            <span className="text-muted">
              Leídas por adelantado: {items.filter((it, i) => i > actual && it.paso === 'lista').length}
            </span>
          </div>
        )}
        {aviso && actual === 0 && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">{aviso}</p>
        )}
        {variasEnCaptura && item.paso === 'lista' && (
          <p role="status" className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">
            He encontrado <strong>{item.total} apuestas</strong> en esta captura. Esta es la {(item.indice ?? 0) + 1}.ª.
          </p>
        )}
      </div>

      {(item.paso === 'lista' || item.paso === 'manual') && (
        <FormularioApuesta
          key={item.clave}
          inicial={item.revision?.valores ?? valoresVacios()}
          dudosos={item.revision?.dudosos}
          casaDetectada={item.revision?.casaDetectada}
          casas={opcionesCasas}
          estrategias={opcionesEstrategias}
          imagen={item.ruta}
          transcripcionId={item.transcripcionId}
          indice={item.indice}
          textoGuardar={items.length > 1 && actual + 1 < items.length ? 'Guardar y seguir' : 'Guardar'}
          onGuardada={siguiente}
          onOpcionCreada={(tipo, o) => {
            // Lo creado en esta captura sirve también para las siguientes.
            const anadir = (l: Opcion[]) => (l.some((x) => x.id === o.id) ? l : [...l, o])
            if (tipo === 'casa') setOpcionesCasas(anadir)
            else setOpcionesEstrategias(anadir)
          }}
          extra={
            <button
              type="button"
              onClick={() => descartar(item)}
              className="h-11 w-full rounded-xl text-sm font-medium text-muted"
            >
              {variasEnCaptura ? 'Descartar esta apuesta' : 'Descartar esta captura'}
            </button>
          }
        />
      )}

      {TEXTO_PASO[item.paso] && (
        <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center" aria-live="polite">
          <span className="size-8 animate-spin rounded-full border-4 border-brand/30 border-t-brand" aria-hidden="true" />
          <p className="font-medium">{TEXTO_PASO[item.paso]}</p>
          {item.paso === 'leyendo' && <p className="text-sm text-muted">Suele tardar entre 5 y 20 segundos.</p>}
        </div>
      )}

      {item.paso === 'error' && (
        <div className="space-y-3 px-4">
          {item.ruta && <VisorCaptura ruta={item.ruta} />}
          <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
            {item.error}
          </div>
          <button
            type="button"
            onClick={() => {
              actualizar(item.clave, { paso: 'esperando' })
              void procesarCola()
            }}
            className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground"
          >
            Reintentar
          </button>
          {item.ruta && (
            <button
              type="button"
              onClick={() => actualizar(item.clave, { paso: 'manual' })}
              className="h-12 w-full rounded-xl border border-border text-base font-semibold"
            >
              Rellenar a mano
            </button>
          )}
          <button type="button" onClick={() => descartar(item)} className="h-11 w-full rounded-xl text-sm font-medium text-muted">
            Descartar esta captura
          </button>
        </div>
      )}
    </div>
  )
}

function BotonArchivo({
  etiqueta,
  onElegir,
  multiple,
  captura,
  principal,
}: {
  etiqueta: string
  onElegir: (f: FileList | null) => void
  multiple?: boolean
  captura?: boolean
  principal?: boolean
}) {
  return (
    <label
      className={`flex h-14 w-full cursor-pointer items-center justify-center rounded-xl text-base font-semibold ${
        principal ? 'bg-brand text-brand-foreground' : 'border border-border bg-surface'
      }`}
    >
      {etiqueta}
      <input
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        capture={captura ? 'environment' : undefined}
        className="sr-only"
        onChange={(e) => {
          onElegir(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}
