'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { descartarCaptura, recuperarDescartada, terminarCola } from '@/app/(app)/apuestas/actions'
import { valoresVacios, type Opcion, type ValoresFormulario } from '@/lib/apuestas/formulario'
import type { ApuestaPendiente, Revision } from '@/lib/apuestas/propuesta'
import type { Catalogo } from '@/lib/apuestas/catalogo'
import { ErrorImagen, reducirImagen } from '@/lib/navegador/reducir-imagen'
import { FormularioApuesta } from './formulario-apuesta'
import { conocidosDeTanda } from '@/lib/apuestas/partidos'
import { MAX_INTENTOS, esperaAntesDeReintentar, pausaLoteTrasLimite } from '@/lib/apuestas/reintentos-ia'
import { VisorCaptura } from './visor-captura'
import { EleccionApuestas } from './eleccion-apuestas'
import { estadoCola, resumenCola, siguientePendiente, type EstadoItemCola } from '@/lib/apuestas/cola'

export const MAX_LOTE = 5

type Paso = 'esperando' | 'reduciendo' | 'subiendo' | 'leyendo' | 'eligiendo' | 'lista' | 'error' | 'manual'

// Cada elemento de la cola es una captura (mientras se lee o se eligen sus apuestas) o una
// apuesta a revisar. Una captura con varias apuestas se convierte en varios elementos.
type Item = {
  clave: string
  archivo?: File
  paso: Paso
  ruta?: string | null
  revision?: Revision
  transcripcionId?: string | null
  indice?: number // posición de la apuesta dentro de la captura (0, 1…)
  total?: number // cuántas apuestas válidas trae la captura (o cuántas se eligieron)
  posicion?: number // 1.ª, 2.ª… dentro de la captura
  elegidas?: boolean // vienen de la pantalla "¿Cuáles quieres guardar?"
  error?: string
  intento?: number // intento de lectura en curso (1-3)
  motivoReintento?: string // por qué se está reintentando
  temporal?: boolean // el último fallo fue temporal (saturación, límite…): queda pendiente de reintentar
  // Revisión: pendiente, guardada (con su id y lo guardado) o descartada.
  estado?: EstadoItemCola
  apuestaId?: string
  guardado?: ValoresFormulario
  borrador?: ValoresFormulario // lo editado en la revisión (aún sin guardar): para las siguientes de la tanda
  // Captura con varias apuestas: las que se pueden elegir y cuántas se ignoraron (cortadas).
  opciones?: { indice: number; revision: Revision }[]
  ignoradas?: number
}

const TEXTO_PASO: Partial<Record<Paso, string>> = {
  esperando: 'En cola…',
  reduciendo: 'Preparando la imagen…',
  subiendo: 'Subiendo la captura…',
  leyendo: 'La IA está leyendo la captura…',
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const CLAVE_SESION = 'filoverde:cola'

// Flujo: elegir 1–5 capturas → se preparan, suben y leen una detrás de otra (mientras revisas la
// primera, se van leyendo las siguientes) → (si una captura trae varias apuestas, eliges cuáles)
// → revisar con Anterior / Siguiente → guardar o descartar → resumen → Terminar.
// En una cola de varias apuestas las capturas se borran al Terminar (para poder volver atrás);
// con una sola, al guardar (como siempre). Si se cierra la app, las limpia el borrado de las 2 h.
export function RegistroCapturas({
  casas,
  estrategias,
  pendientes = [],
  catalogo: catalogoInicial,
}: {
  casas: Opcion[]
  estrategias: Opcion[]
  catalogo: Catalogo
  pendientes?: ApuestaPendiente[] // para retomar una revisión a medias
}) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>(() =>
    pendientes.map((p) => ({
      clave: `pendiente-${p.transcripcionId}-${p.indice}`,
      paso: 'lista' as const,
      estado: 'pendiente' as const,
      ruta: p.ruta,
      revision: p.revision,
      transcripcionId: p.transcripcionId,
      indice: p.indice,
      total: p.total,
      posicion: p.posicion,
    })),
  )
  const [actual, setActual] = useState(0)
  // Partidos de las apuestas anteriores de la tanda (guardadas o editadas): rellenan el mismo partido.
  const clavesAnteriores = items
    .slice(0, actual)
    .map((it) => (estadoCola(it) === 'descartada' ? '' : JSON.stringify((it.guardado ?? it.borrador)?.selecciones ?? null)))
    .join('\u0001')
  const conocidosTanda = useMemo(
    () =>
      conocidosDeTanda(
        items
          .slice(0, actual)
          .filter((it) => estadoCola(it) !== 'descartada')
          .map((it) => it.guardado ?? it.borrador)
          .filter((v): v is ValoresFormulario => !!v),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cambia si cambian esas selecciones
    [clavesAnteriores],
  )
  // Lo que se va editando en la apuesta actual (estable: no provoca bucles en el formulario).
  const claveActual = useRef<string | null>(null)
  const alCambiarValores = useCallback((v: ValoresFormulario) => {
    const c = claveActual.current
    if (!c) return
    const it = itemsRef.current.find((x) => x.clave === c)
    if (!it || it.borrador === v) return
    itemsRef.current = itemsRef.current.map((x) => (x.clave === c ? { ...x, borrador: v } : x))
    setItems(itemsRef.current)
  }, [])
  const [verResumen, setVerResumen] = useState(false)
  const [descartadasAlElegir, setDescartadasAlElegir] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [opcionesCasas, setOpcionesCasas] = useState(casas)
  const [opcionesEstrategias, setOpcionesEstrategias] = useState(estrategias)
  // Lo creado en una apuesta (deporte, liga) sirve también para las siguientes.
  const [catalogo, setCatalogo] = useState(catalogoInicial)
  const itemsRef = useRef<Item[]>(items)
  const enMarcha = useRef(false)
  // Retry-after (s) del último 429 que agotó los intentos (-1 = sin cabecera); null = ninguno.
  const ultimoLimite = useRef<number | null>(null)
  const montado = useRef(false)
  const terminada = useRef(false)

  function actualizar(clave: string, cambios: Partial<Item>) {
    itemsRef.current = itemsRef.current.map((it) => (it.clave === clave ? { ...it, ...cambios } : it))
    setItems(itemsRef.current)
  }
  function poner(nuevos: Item[]) {
    itemsRef.current = nuevos
    setItems(nuevos)
  }

  // ---------- Persistencia en la pestaña (sobrevive a una recarga) ----------
  useEffect(() => {
    montado.current = true
    try {
      // Solo al RECARGAR la página: abrir "Nueva apuesta" de nuevo empieza una cola nueva.
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const recarga = nav?.type === 'reload' && new URL(nav.name).pathname === window.location.pathname
      const guardada = sessionStorage.getItem(CLAVE_SESION)
      if (!recarga) sessionStorage.removeItem(CLAVE_SESION)
      if (guardada && recarga) {
        const e = JSON.parse(guardada) as { items: Item[]; actual: number; descartadasAlElegir?: number }
        // Lo que se estaba subiendo o leyendo vuelve a la cola (la captura ya subida se reutiliza).
        const recuperados = e.items
          .filter((it) => it.ruta || !['esperando', 'reduciendo', 'subiendo'].includes(it.paso))
          .map((it) => (['esperando', 'reduciendo', 'subiendo', 'leyendo'].includes(it.paso) ? { ...it, paso: 'esperando' as const, intento: undefined } : it))
        if (recuperados.length) {
          // Tras el primer pintado (el servidor no conoce el almacenamiento de la pestaña).
          setTimeout(() => {
            poner(recuperados)
            setActual(Math.min(e.actual, recuperados.length - 1))
            setDescartadasAlElegir(e.descartadasAlElegir ?? 0)
            void procesarCola()
          }, 0)
        }
      }
    } catch {
      // Sin almacenamiento de la pestaña: se sigue sin persistencia.
    }
    return () => {
      montado.current = false
      // Salir de la cola (otra pantalla): se terminan las capturas. Se espera un instante por si
      // React vuelve a montar el componente enseguida (modo de desarrollo).
      setTimeout(() => {
        if (!montado.current) salirDeLaCola()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (terminada.current) return
    try {
      if (items.length === 0) sessionStorage.removeItem(CLAVE_SESION)
      else {
        const sinArchivo = items.map((it) => ({ ...it, archivo: undefined }))
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ items: sinArchivo, actual, descartadasAlElegir }))
      }
    } catch {
      // Lleno o no disponible: no pasa nada.
    }
  }, [items, actual, descartadasAlElegir])

  function rutasDeLaCola() {
    return [...new Set(itemsRef.current.map((it) => it.ruta).filter((r): r is string => !!r))]
  }
  function salirDeLaCola() {
    const rutas = rutasDeLaCola()
    try {
      sessionStorage.removeItem(CLAVE_SESION)
    } catch {}
    if (rutas.length && !terminada.current) void terminarCola(rutas).catch(() => {})
  }

  // Avisa si se intenta salir con capturas sin revisar.
  const quedanPendientes = items.some((it) => estadoCola(it) !== 'guardada' && estadoCola(it) !== 'descartada')
  useEffect(() => {
    if (!quedanPendientes) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [quedanPendientes])

  async function procesar(item: Item) {
    let ruta = item.ruta
    let codigoFallo: 'temporal' | 'otro' | undefined
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
      // Lectura con hasta 3 intentos: solo se reintentan los errores temporales (saturación, límite
      // por minuto, tiempo agotado, conexión), con espera creciente o la que pida Anthropic.
      // Cada intento es una petición nueva con la MISMA captura ya subida (no se sube otra vez).
      let j: Record<string, unknown> = {}
      for (let intento = 1; ; intento++) {
        actualizar(item.clave, { paso: 'leyendo', error: undefined, intento })
        let temporal = false
        let reintentarEnS: number | null = null
        try {
          const r = await fetch('/api/capturas/transcribir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ruta, intento }),
          })
          j = await r.json().catch(() => ({ codigo: r.status >= 500 ? 'timeout' : 'desconocido' }))
          if (r.ok && Array.isArray(j.revisiones) && j.revisiones.length) break
          temporal = j.temporal === true || (!r.ok && r.status >= 500)
          reintentarEnS = typeof j.reintentarEnS === 'number' ? j.reintentarEnS : null
          if (!r.ok && r.status >= 500 && !j.error) j = { ...j, codigo: 'timeout', error: 'La lectura ha tardado demasiado. Pulsa «Reintentar» o rellénala a mano.' }
        } catch {
          // Sin respuesta (red): también es temporal.
          temporal = true
          j = { codigo: 'conexion', error: 'Sin conexión. Comprueba internet y pulsa «Reintentar».' }
        }
        const espera = temporal ? esperaAntesDeReintentar({ intento, retryAfterS: reintentarEnS }) : null
        if (espera == null) {
          if (j.codigo === 'limite') ultimoLimite.current = reintentarEnS ?? -1
          codigoFallo = temporal ? 'temporal' : 'otro'
          throw new Error((j.error as string) ?? 'No se ha podido leer la captura.')
        }
        actualizar(item.clave, {
          intento: intento + 1,
          motivoReintento:
            j.codigo === 'limite'
              ? 'Límite de lecturas por minuto: espero y lo intento de nuevo.'
              : j.codigo === 'saturado'
                ? 'La IA está saturada: lo intento de nuevo.'
                : 'Lo intento de nuevo.',
        })
        await esperar(espera)
      }
      const revisiones = j.revisiones as Revision[]
      const indices = Array.isArray(j.indices) ? (j.indices as number[]) : null
      const total = typeof j.total === 'number' ? j.total : revisiones.length
      const ignoradas = typeof j.ignoradas === 'number' ? j.ignoradas : 0
      const transcripcionId = (j.transcripcionId as string) ?? null
      const opciones = revisiones.map((revision, i) => ({ indice: indices?.[i] ?? i, revision }))
      // Con 2 o más apuestas válidas, primero se elige cuáles guardar.
      const nuevos: Item[] =
        opciones.length >= 2
          ? [{ clave: item.clave, paso: 'eligiendo', ruta, transcripcionId, total, opciones, ignoradas }]
          : opciones.map((o, k) => ({
              clave: `${item.clave}-${o.indice}`,
              paso: 'lista',
              estado: 'pendiente',
              ruta,
              revision: o.revision,
              transcripcionId,
              indice: o.indice,
              total,
              posicion: k + 1,
              ignoradas: k === 0 ? ignoradas : 0,
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
      actualizar(item.clave, { paso: 'error', error: mensaje, ruta, intento: undefined, motivoReintento: undefined, temporal: codigoFallo === 'temporal' })
    }
  }

  async function procesarCola() {
    if (enMarcha.current) return
    enMarcha.current = true
    try {
      for (;;) {
        const siguiente = itemsRef.current.find((it) => it.paso === 'esperando')
        if (!siguiente) break
        ultimoLimite.current = null
        await procesar(siguiente)
        // Si una captura acabó en el límite por minuto (429), el lote espera antes de la siguiente.
        if (ultimoLimite.current != null && itemsRef.current.some((it) => it.paso === 'esperando')) {
          await esperar(pausaLoteTrasLimite(ultimoLimite.current >= 0 ? ultimoLimite.current : null))
        }
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
    terminada.current = false
    poner(nuevos)
    setActual(0)
    setVerResumen(false)
    setDescartadasAlElegir(0)
    void procesarCola()
  }

  const varias = () => itemsRef.current.length > 1 || descartadasAlElegir > 0

  // Tras guardar o descartar: la siguiente apuesta sin terminar; si no queda ninguna, el
  // resumen (cola de varias) o la lista (una sola apuesta, como siempre).
  function avanzar() {
    const lista = itemsRef.current
    const sig = siguientePendiente(lista.map(estadoCola), actual)
    if (sig != null) {
      setActual(sig)
      window.scrollTo({ top: 0 })
      return
    }
    if (varias()) {
      setVerResumen(true)
      window.scrollTo({ top: 0 })
    } else terminar()
  }

  function terminar() {
    const rutas = rutasDeLaCola()
    terminada.current = true
    try {
      sessionStorage.removeItem(CLAVE_SESION)
    } catch {}
    if (rutas.length && varias()) void terminarCola(rutas).catch(() => {})
    poner([])
    setVerResumen(false)
    router.push('/apuestas')
    router.refresh()
  }

  async function descartar(item: Item) {
    // Si otras apuestas de esta captura siguen en la cola, la imagen no se borra
    // (el servidor lo comprueba: solo se borra cuando ya no la usa nadie).
    if (item.ruta || item.transcripcionId) {
      await descartarCaptura({
        ruta: item.ruta ?? null,
        transcripcionId: item.transcripcionId ?? null,
        indice: item.indice ?? null,
        conservarImagen: varias(),
      })
    }
    actualizar(item.clave, { estado: 'descartada', paso: item.paso === 'error' ? 'lista' : item.paso })
    avanzar()
  }

  async function recuperar(item: Item) {
    if (item.transcripcionId && item.indice != null) await recuperarDescartada({ transcripcionId: item.transcripcionId, indice: item.indice })
    actualizar(item.clave, { estado: 'pendiente' })
  }

  // Pantalla de elección (captura con varias apuestas): solo las marcadas pasan a la cola.
  async function elegidas(item: Item, marcadas: number[]) {
    const opciones = item.opciones ?? []
    const noElegidas = opciones.filter((o) => !marcadas.includes(o.indice))
    // Las no elegidas cuentan como descartadas (no vuelven a "sin revisar").
    for (const o of noElegidas) {
      await descartarCaptura({ ruta: item.ruta ?? null, transcripcionId: item.transcripcionId ?? null, indice: o.indice, conservarImagen: true })
    }
    setDescartadasAlElegir((n) => n + noElegidas.length)
    const nuevos: Item[] = opciones
      .filter((o) => marcadas.includes(o.indice))
      .map((o, k) => ({
        clave: `${item.clave}-${o.indice}`,
        paso: 'lista',
        estado: 'pendiente',
        ruta: item.ruta,
        revision: o.revision,
        transcripcionId: item.transcripcionId,
        indice: o.indice,
        total: marcadas.length,
        posicion: k + 1,
        elegidas: true,
        ignoradas: k === 0 ? item.ignoradas : 0,
      }))
    poner(itemsRef.current.flatMap((it) => (it.clave === item.clave ? nuevos : [it])))
    if (nuevos.length === 0) {
      // Ninguna elegida: como si se hubiera descartado la captura entera.
      setTimeout(() => {
        const sig = siguientePendiente(itemsRef.current.map(estadoCola), Math.max(0, actual - 1))
        if (sig != null) setActual(sig)
        else if (itemsRef.current.length) setVerResumen(true)
        else terminar()
      }, 0)
    }
  }

  // ---------- Pantalla de elegir capturas ----------
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

  // ---------- Resumen al terminar la cola ----------
  if (verResumen) {
    const r = resumenCola(items.map(estadoCola))
    const descartadas = r.descartadas + descartadasAlElegir
    return (
      <div className="space-y-4 px-4 pt-2">
        <div role="status" className="space-y-1 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-lg font-semibold">
            Has guardado {r.guardadas} {r.guardadas === 1 ? 'apuesta' : 'apuestas'}
            {descartadas > 0 ? `, descartado ${descartadas}` : ''}
          </p>
          {r.pendientes > 0 && <p className="text-sm text-muted">Quedan {r.pendientes} sin revisar.</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            setVerResumen(false)
            setActual(items.length - 1)
          }}
          className="h-12 w-full rounded-xl border border-border text-base font-semibold"
        >
          Revisar anteriores
        </button>
        <button type="button" onClick={terminar} className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground">
          Terminar
        </button>
      </div>
    )
  }

  const item = items[actual]
  if (!item) return null
  claveActual.current = item.clave
  const estados = items.map(estadoCola)
  const variasEnCaptura = (item.total ?? 1) > 1
  const estadoActual = estadoCola(item)

  return (
    <div className="space-y-3">
      <div className="space-y-2 px-4">
        {items.length > 1 && (
          <NavegacionCola
            actual={actual}
            estados={estados}
            leidasPorAdelantado={items.filter((it, i) => i > actual && it.paso === 'lista').length}
            onIr={(i) => {
              setActual(i)
              window.scrollTo({ top: 0 })
            }}
          />
        )}
        {aviso && actual === 0 && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">{aviso}</p>
        )}
        {!!item.ignoradas && item.paso === 'lista' && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            He ignorado {item.ignoradas} {item.ignoradas === 1 ? 'apuesta cortada o sin selección' : 'apuestas cortadas o sin selección'}.
          </p>
        )}
        {variasEnCaptura && item.paso === 'lista' && (
          <p role="status" className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">
            {item.elegidas ? (
              <>
                Has elegido <strong>{item.total} apuestas</strong> de esta captura. Esta es la {item.posicion ?? 1}.ª.
              </>
            ) : (
              <>
                He encontrado <strong>{item.total} apuestas</strong> en esta captura. Esta es la {item.posicion ?? (item.indice ?? 0) + 1}.ª.
              </>
            )}
          </p>
        )}
        {estadoActual === 'guardada' && (
          <p role="status" className="rounded-xl bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
            ✓ Ya guardada. Si la cambias, «Guardar cambios» actualiza esta misma apuesta.
          </p>
        )}
      </div>

      {item.paso === 'eligiendo' && (
        <EleccionApuestas
          key={item.clave}
          ruta={item.ruta ?? null}
          opciones={item.opciones ?? []}
          ignoradas={item.ignoradas ?? 0}
          casas={opcionesCasas}
          onElegir={(marcadas) => void elegidas(item, marcadas)}
        />
      )}

      {estadoActual === 'descartada' && (
        <div className="space-y-3 px-4">
          {item.ruta && <VisorCaptura ruta={item.ruta} />}
          <div role="status" className="rounded-2xl border border-border bg-surface p-4 text-sm">
            Esta apuesta está <strong>descartada</strong>. Puedes recuperarla para revisarla y guardarla.
          </div>
          <button type="button" onClick={() => void recuperar(item)} className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground">
            Recuperar esta apuesta
          </button>
        </div>
      )}

      {(item.paso === 'lista' || item.paso === 'manual') && estadoActual !== 'descartada' && (
        <FormularioApuesta
          key={`${item.clave}-${item.apuestaId ?? 'nueva'}`}
          // Al volver a una apuesta de la cola se recupera lo editado aunque no se guardara.
          inicial={item.guardado ?? item.borrador ?? item.revision?.valores ?? valoresVacios()}
          dudosos={item.guardado ? undefined : item.revision?.dudosos}
          casaDetectada={item.guardado ? null : item.revision?.casaDetectada}
          casas={opcionesCasas}
          estrategias={opcionesEstrategias}
          catalogo={catalogo}
          onCatalogoCambiado={setCatalogo}
          imagen={item.ruta}
          transcripcionId={item.transcripcionId}
          indice={item.indice}
          apuestaId={item.apuestaId ?? null}
          conservarImagen={items.length > 1 || descartadasAlElegir > 0}
          textoGuardar={
            item.apuestaId ? 'Guardar cambios' : siguientePendiente(estados, actual, { soloDespues: true }) != null ? 'Guardar y seguir' : 'Guardar'
          }
          onGuardada={(id, valores) => {
            actualizar(item.clave, { estado: 'guardada', apuestaId: id, guardado: valores, paso: 'lista' })
            avanzar()
          }}
          onDescartar={() => descartar(item)}
          conocidosTanda={conocidosTanda}
          onCambioValores={alCambiarValores}
          onOpcionCreada={(tipo, o) => {
            // Lo creado en esta captura sirve también para las siguientes.
            const anadir = (l: Opcion[]) => (l.some((x) => x.id === o.id) ? l : [...l, o])
            if (tipo === 'casa') setOpcionesCasas(anadir)
            else setOpcionesEstrategias(anadir)
          }}
          extra={
            item.apuestaId ? undefined : (
              <button
                type="button"
                onClick={() => descartar(item)}
                className="h-11 w-full rounded-xl text-sm font-medium text-muted"
              >
                {variasEnCaptura ? 'Descartar esta apuesta' : 'Descartar esta captura'}
              </button>
            )
          }
        />
      )}

      {TEXTO_PASO[item.paso] && (
        <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center" aria-live="polite">
          <span className="size-8 animate-spin rounded-full border-4 border-brand/30 border-t-brand" aria-hidden="true" />
          {item.paso === 'leyendo' && (item.intento ?? 1) > 1 ? (
            <>
              <p className="font-medium">
                Reintentando… ({item.intento} de {MAX_INTENTOS})
              </p>
              {item.motivoReintento && <p className="text-sm text-muted">{item.motivoReintento}</p>}
            </>
          ) : (
            <>
              <p className="font-medium">{TEXTO_PASO[item.paso]}</p>
              {item.paso === 'leyendo' && <p className="text-sm text-muted">Suele tardar entre 5 y 20 segundos.</p>}
            </>
          )}
        </div>
      )}

      {item.paso === 'error' && (
        <div className="space-y-3 px-4">
          {item.ruta && <VisorCaptura ruta={item.ruta} />}
          <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
            {item.temporal && <p className="font-semibold">Pendiente de reintentar</p>}
            <p>{item.error}</p>
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

// Cabecera de la cola: posición, estado de cada apuesta y Anterior / Siguiente.
const ESTILO_ESTADO: Record<EstadoItemCola, { texto: string; clase: string }> = {
  pendiente: { texto: 'pendiente', clase: 'border-border bg-surface text-muted' },
  guardada: { texto: 'guardada', clase: 'border-green-600 bg-green-600 text-white' },
  descartada: { texto: 'descartada', clase: 'border-border bg-zinc-500/30 text-muted line-through' },
  leyendo: { texto: 'leyendo', clase: 'border-dashed border-brand/50 text-brand' },
  error: { texto: 'pendiente de reintentar', clase: 'border-red-500 text-red-600 dark:text-red-400' },
  eligiendo: { texto: 'elegir apuestas', clase: 'border-sky-500 text-sky-700 dark:text-sky-300' },
}

function NavegacionCola({
  actual,
  estados,
  leidasPorAdelantado,
  onIr,
}: {
  actual: number
  estados: EstadoItemCola[]
  leidasPorAdelantado: number
  onIr: (i: number) => void
}) {
  return (
    <nav aria-label="Cola de revisión" className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          Apuesta {actual + 1} de {estados.length}
          <span className="sr-only"> ({ESTILO_ESTADO[estados[actual]].texto})</span>
        </span>
        {leidasPorAdelantado > 0 && <span className="text-muted">Leídas por adelantado: {leidasPorAdelantado}</span>}
      </div>
      <ol className="flex flex-wrap gap-1" aria-label="Estado de cada apuesta">
        {estados.map((e, i) => (
          <li
            key={i}
            title={`${i + 1}: ${ESTILO_ESTADO[e].texto}`}
            aria-label={`Apuesta ${i + 1}: ${ESTILO_ESTADO[e].texto}`}
            aria-current={i === actual ? 'step' : undefined}
            className={`flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-xs font-semibold ${ESTILO_ESTADO[e].clase} ${
              i === actual ? 'ring-2 ring-brand ring-offset-1 ring-offset-background' : ''
            }`}
          >
            {e === 'guardada' ? '✓' : i + 1}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={actual === 0}
          onClick={() => onIr(actual - 1)}
          className="h-11 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
        >
          ‹ Anterior
        </button>
        <button
          type="button"
          disabled={actual >= estados.length - 1}
          onClick={() => onIr(actual + 1)}
          className="h-11 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
        >
          Siguiente ›
        </button>
      </div>
    </nav>
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
