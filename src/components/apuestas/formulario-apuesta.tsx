'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { buscarDuplicadas, guardarApuesta, type ResultadoDuplicadas } from '@/app/(app)/apuestas/actions'
import { formatoImporte } from '@/lib/apuestas/dinero'
import { cuotaATexto } from '@/lib/apuestas/cuotas'
import { formatoFecha } from '@/lib/apuestas/fechas'
import { resultadoPropuesto } from '@/lib/apuestas/calculos'
import { cuotaADecimal } from '@/lib/apuestas/cuotas'
import { centimosATexto, textoACentimos } from '@/lib/apuestas/dinero'
import {
  ESTADOS_APUESTA,
  ESTADOS_SELECCION,
  MIN_SELECCIONES,
  NOMBRE_ESTADO,
  NOMBRE_MOTIVO,
  NOMBRE_TIPO,
  NOMBRE_TIPO_LARGO,
  TIPOS_APUESTA,
  esEstadoApuesta,
  esTipoApuesta,
  type MotivoRevision,
  type TipoApuesta,
} from '@/lib/apuestas/estados'
import {
  NOMBRE_PROMO,
  TEXTO_CREDITO,
  TIPOS_PROMO,
  calcularAumento,
  esPromoAumento,
} from '@/lib/apuestas/promociones'
import { SelectorHora } from './selector-hora'
import {
  CAMPOS_COMUNES,
  ajustarPorTipo,
  cuotaDeLaApuesta,
  promoVacia,
  seleccionVacia,
  sincronizarPromo,
  validarFormulario,
  type Opcion,
  type ValoresFormulario,
  type ValoresSeleccion,
} from '@/lib/apuestas/formulario'
import {
  buscarLiga,
  deporteResumen,
  ligasDe,
  DEPORTE_MIXTO,
  type Catalogo,
} from '@/lib/apuestas/catalogo'
import { crearDeporte, crearLiga } from '@/app/(app)/apuestas/actions'
import { IdCampo, useIdCampo } from './id-campo'
import { SelectorCatalogo } from './selector-catalogo'
import { emojiDeporte } from '@/lib/apuestas/emojis'
import { SelectorOpcion } from './selector-opcion'
import { VisorCaptura } from './visor-captura'

type Props = {
  inicial: ValoresFormulario
  dudosos?: Record<string, MotivoRevision>
  casaDetectada?: string | null
  casas: Opcion[]
  estrategias: Opcion[]
  imagen?: string | null
  transcripcionId?: string | null
  indice?: number | null
  apuestaId?: string | null
  resultadoManual?: boolean
  textoGuardar?: string
  onGuardada: (id: string, valores: ValoresFormulario) => void
  // En una cola de varias apuestas: la imagen se borra al terminar la cola, no al guardar.
  conservarImagen?: boolean
  onOpcionCreada?: (tipo: 'casa' | 'estrategia', o: Opcion) => void
  catalogo: Catalogo
  onCatalogoCambiado?: (c: Catalogo) => void
  extra?: ReactNode
  // 'revision' = pantalla de revisión de una captura (como siempre) · 'panel' = detalle: solo
  // estado, resultado y precipitada · 'edicion' = detalle: el resto de la apuesta.
  modo?: 'revision' | 'panel' | 'edicion'
  // En el detalle, el panel y "Editar apuesta" comparten los mismos datos.
  compartido?: [ValoresFormulario, Dispatch<SetStateAction<ValoresFormulario>>]
  // Aviso de duplicada: "Descartar" (en la cola de capturas o en el registro a mano).
  onDescartar?: () => void
}

type Duplicada = Extract<ResultadoDuplicadas, { ok: true }>

// ¿El resultado guardado no es el que saldría al calcularlo? Entonces se escribió a mano.
export function resultadoEscritoAMano(v: ValoresFormulario): boolean {
  if (!v.resultado_economico.trim() || v.estado === 'pendiente') return false
  return textoACentimos(v.resultado_economico, { permitirNegativo: true }) !==
    textoACentimos(recalcular(v).resultado_economico, { permitirNegativo: true })
}

// Campos cuyo cambio recalcula el resultado económico propuesto.
const AFECTAN_RESULTADO = new Set(['estado', 'importe', 'cuota_total', 'ganancia_potencial', 'importe_recuperado'])

// Cambio de tipo pendiente de confirmar (cuando se perdería algún dato).
type CambioTipo =
  | { modo: 'elegir'; nuevo: TipoApuesta } // pasar a simple: ¿qué selección conservo?
  | { modo: 'confirmar'; nuevo: TipoApuesta; mensajes: string[] }

export function FormularioApuesta(props: Props) {
  const { casas: casasIniciales, estrategias: estrategiasIniciales, imagen, apuestaId, onGuardada, extra } = props

  const [casas, setCasas] = useState(casasIniciales)
  const [estrategias, setEstrategias] = useState(estrategiasIniciales)
  const modo = props.modo ?? 'revision'
  const [propios, setPropios] = useState<ValoresFormulario>(() => {
    const v = { ...props.inicial }
    if (!v.casa_id && props.casaDetectada) {
      const igual = casasIniciales.find((c) => normalizar(c.nombre) === normalizar(props.casaDetectada!))
      if (igual) v.casa_id = igual.id
    }
    // Promoción leída por la IA: el dato que falte (aumento o cuota original) se calcula ya.
    return sincronizarPromo(v)
  })
  const [valores, setValores] = props.compartido ?? [propios, setPropios]
  const [dudosos, setDudosos] = useState<Record<string, MotivoRevision>>(() => ({ ...(props.dudosos ?? {}) }))
  const [resultadoManual, setResultadoManual] = useState(props.resultadoManual ?? false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [cambioTipo, setCambioTipo] = useState<CambioTipo | null>(null)
  const [catalogo, setCatalogo] = useState<Catalogo>(props.catalogo)
  // Aviso por selección cuando al cambiar de deporte se vacía la liga.
  const [avisosLiga, setAvisosLiga] = useState<Record<number, string>>({})
  // Cambio de estado pendiente de confirmar porque pisaría un resultado escrito a mano.
  const [estadoPorConfirmar, setEstadoPorConfirmar] = useState<string | null>(null)
  // En "Editar apuesta" de una apuesta resuelta: el resultado que saldría con los datos nuevos.
  const [recalculoPropuesto, setRecalculoPropuesto] = useState<string | null>(null)
  // Aviso de apuesta duplicada (solo en apuestas nuevas: revisión de captura y registro a mano).
  const comprobarDuplicadas = modo === 'revision' && !apuestaId
  const [duplicada, setDuplicada] = useState<Duplicada | null>(null)
  const [aceptada, setAceptada] = useState<string | null>(null) // huella para la que se pulsó "Incluir de nuevo"
  const [pedirEleccion, setPedirEleccion] = useState(false) // se pulsó Guardar con el aviso sin resolver
  const consulta = useRef(0) // solo vale la respuesta de la última comprobación
  const refAviso = useRef<HTMLDivElement>(null)
  const [guardando, iniciar] = useTransition()

  const tipo: TipoApuesta = esTipoApuesta(valores.tipo) ? valores.tipo : 'simple'
  const estado = esEstadoApuesta(valores.estado) ? valores.estado : 'pendiente'
  const avisos = useMemo(() => validarFormulario(valores).avisos, [valores])
  const nDudosos = Object.keys(dudosos).length

  // Comprobación al abrir y ~0,6 s después de cada cambio. Las respuestas antiguas se ignoran.
  const casaPendiente =
    !valores.casa_id && !!props.casaDetectada && !casas.some((c) => normalizar(c.nombre) === normalizar(props.casaDetectada!))
  useEffect(() => {
    if (!comprobarDuplicadas) return
    const id = ++consulta.current
    const t = setTimeout(async () => {
      const aComprobar = ajustarPorTipo(valores)
      const r = validarFormulario(aComprobar).ok
        ? await buscarDuplicadas({ valores: aComprobar, casaPendiente }).catch(() => ({ ok: false }) as const)
        : null
      if (id !== consulta.current) return
      setDuplicada(r && r.ok && r.total > 0 ? r : null)
      if (!r || !r.ok || r.total === 0) setPedirEleccion(false)
    }, 600)
    return () => clearTimeout(t)
  }, [comprobarDuplicadas, valores, casaPendiente])

  // ---------- cambios ----------

  function quitarMarca(...claves: string[]) {
    setDudosos((d) => {
      if (!claves.some((c) => d[c])) return d
      const n = { ...d }
      for (const c of claves) delete n[c]
      return n
    })
    setErrores((e) => {
      if (!claves.some((c) => e[c])) return e
      const n = { ...e }
      for (const c of claves) delete n[c]
      return n
    })
  }

  function cambiar<K extends keyof ValoresFormulario>(clave: K, valor: ValoresFormulario[K]) {
    quitarMarca(clave)
    // Editando una apuesta ya resuelta: no se recalcula sin preguntar.
    if (modo === 'edicion' && AFECTAN_RESULTADO.has(clave) && valores.estado !== 'pendiente') {
      const nuevo = sincronizarPromo({ ...valores, [clave]: valor })
      setValores(nuevo)
      const propuesto = recalcular(nuevo).resultado_economico
      const iguales =
        textoACentimos(propuesto, { permitirNegativo: true }) ===
        textoACentimos(nuevo.resultado_economico, { permitirNegativo: true })
      setRecalculoPropuesto(iguales || !propuesto ? null : propuesto)
      return
    }
    setValores((v) => {
      const base = { ...v, [clave]: valor }
      // Asegurada: si el crédito seguía siendo el importe, sigue al importe nuevo.
      if (clave === 'importe' && v.promo && v.promo_tipo === 'asegurada' && v.promo_credito === v.importe) base.promo_credito = valor as string
      const nuevo = sincronizarPromo(base)
      return AFECTAN_RESULTADO.has(clave) && !resultadoManual ? recalcular(nuevo) : nuevo
    })
  }

  // ---------- promoción ----------

  type CamposPromo = Partial<Pick<ValoresFormulario, keyof ReturnType<typeof promoVacia>>>
  function cambiarPromo(c: CamposPromo) {
    quitarMarca(...Object.keys(c))
    const aplicar = (v: ValoresFormulario) => {
      let n = { ...v, ...c }
      if (!n.promo) n = { ...n, ...promoVacia() } // al desmarcar, se vacían los datos
      if (c.promo_tipo !== undefined && c.promo_tipo !== v.promo_tipo) {
        // Al cambiar de tipo, solo se quedan los datos del tipo nuevo.
        n = { ...n, promo_cuota_original: '', promo_aumento: '', promo_base: '', promo_credito: '' }
        // Asegurada: el crédito si se pierde es, por defecto, el importe apostado.
        if (n.promo_tipo === 'asegurada') n.promo_credito = v.importe
      }
      return sincronizarPromo(n)
    }
    // Cambia el cálculo del resultado (crédito). En una apuesta resuelta que se edita, se pregunta.
    if (modo === 'edicion' && valores.estado !== 'pendiente') {
      const nuevo = aplicar(valores)
      setValores(nuevo)
      const propuesto = recalcular(nuevo).resultado_economico
      const iguales =
        textoACentimos(propuesto, { permitirNegativo: true }) ===
        textoACentimos(nuevo.resultado_economico, { permitirNegativo: true })
      setRecalculoPropuesto(iguales || !propuesto ? null : propuesto)
      return
    }
    setValores((v) => {
      const n = aplicar(v)
      return resultadoManual ? n : recalcular(n)
    })
  }

  function cambiarSeleccion(i: number, clave: keyof ValoresSeleccion, valor: string) {
    quitarMarca(`selecciones.${i}.${clave}`, 'selecciones')
    setValores((v) => ({
      ...v,
      selecciones: v.selecciones.map((s, j) => (j === i ? { ...s, [clave]: valor } : s)),
    }))
  }

  // "Mismo partido": partido, liga, deporte, fecha y hora valen para todas las selecciones.
  function cambiarComun(clave: (typeof CAMPOS_COMUNES)[number], valor: string) {
    quitarMarca(...valores.selecciones.map((_, i) => `selecciones.${i}.${clave}`))
    setValores((v) => ({ ...v, selecciones: v.selecciones.map((s) => ({ ...s, [clave]: valor })) }))
  }

  // ---------- deporte y liga ----------

  // Cambia el deporte de una selección (o de todas, en "mismo partido"). Si la liga elegida
  // no es de ese deporte, se vacía y se avisa.
  function cambiarDeporte(indices: number[], deporte: string) {
    const avisos: Record<number, string> = {}
    setValores((v) => ({
      ...v,
      selecciones: v.selecciones.map((s, j) => {
        if (!indices.includes(j)) return s
        if (s.liga.trim() && !buscarLiga(catalogo, deporte, s.liga)) {
          avisos[j] = `Se ha vaciado la liga «${s.liga.trim()}» porque no es de ${deporte || 'ese deporte'}.`
          return { ...s, deporte, liga: '' }
        }
        return { ...s, deporte }
      }),
    }))
    quitarMarca(...indices.flatMap((j) => [`selecciones.${j}.deporte`]))
    setAvisosLiga((a) => {
      const n = { ...a }
      for (const j of indices) delete n[j]
      return { ...n, ...avisos }
    })
  }

  function cambiarLiga(indices: number[], liga: string) {
    setValores((v) => ({
      ...v,
      selecciones: v.selecciones.map((s, j) => (indices.includes(j) ? { ...s, liga } : s)),
    }))
    quitarMarca(...indices.map((j) => `selecciones.${j}.liga`))
    setAvisosLiga((a) => {
      const n = { ...a }
      for (const j of indices) delete n[j]
      return n
    })
  }

  function actualizarCatalogo(c: Catalogo) {
    setCatalogo(c)
    props.onCatalogoCambiado?.(c)
  }

  async function nuevoDeporte(nombre: string) {
    const r = await crearDeporte(nombre)
    if (!r.ok) return r
    if (!catalogo.deportes.some((d) => d.id === r.item.id)) {
      actualizarCatalogo({ ...catalogo, deportes: [...catalogo.deportes, r.item].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) })
    }
    return { ok: true as const, nombre: r.item.nombre, aviso: r.aviso }
  }

  async function nuevaLiga(deporte: string, nombre: string) {
    const r = await crearLiga(deporte, nombre)
    if (!r.ok) return r
    if (!catalogo.ligas.some((l) => l.id === r.item.id)) {
      actualizarCatalogo({ ...catalogo, ligas: [...catalogo.ligas, r.item].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) })
    }
    return { ok: true as const, nombre: r.item.nombre, aviso: r.aviso }
  }

  const camposDeporteLiga = (indices: number[], i0: number, pD: { motivo?: MotivoRevision; error?: string }, pL: { motivo?: MotivoRevision; error?: string }) => {
    const s = valores.selecciones[i0]
    return (
      <CamposDeporteLiga
        deporte={s?.deporte ?? ''}
        liga={s?.liga ?? ''}
        catalogo={catalogo}
        pDeporte={pD}
        pLiga={pL}
        aviso={avisosLiga[i0]}
        onDeporte={(d) => cambiarDeporte(indices, d)}
        onLiga={(l) => cambiarLiga(indices, l)}
        crearDeporte={nuevoDeporte}
        crearLiga={(n) => nuevaLiga(s?.deporte ?? '', n)}
      />
    )
  }

  // Al cambiar el estado de la apuesta, se proponen los de las selecciones.
  // Cambiar el estado siempre recalcula el resultado (después se puede corregir a mano).
  // Antes de pisar un resultado escrito a mano, se pregunta.
  function pedirCambioEstado(nuevo: string) {
    if (nuevo === valores.estado) return
    if (modo !== 'revision' && (resultadoManual || resultadoEscritoAMano(valores)) && valores.resultado_economico.trim()) {
      setEstadoPorConfirmar(nuevo)
      return
    }
    cambiarEstado(nuevo)
  }

  function cambiarEstado(nuevo: string, mantenerResultado = false) {
    setEstadoPorConfirmar(null)
    quitarMarca('estado', 'resultado_economico')
    setResultadoManual(mantenerResultado)
    setValores((v) => {
      let selecciones = v.selecciones
      if (nuevo === 'ganada') {
        // Ganada: todas en verde (las anuladas se quedan como están).
        selecciones = selecciones.map((s) => (s.estado === 'anulada' ? s : { ...s, estado: 'ganada' }))
      } else if (nuevo === 'perdida' && selecciones.length === 1) {
        selecciones = selecciones.map((s) => ({ ...s, estado: 'perdida' }))
      } else if (nuevo === 'perdida') {
        // Con varias, el usuario marca cuáles fallaron; se quitan los verdes puestos al marcar "ganada".
        selecciones = selecciones.map((s) => (s.estado === 'ganada' && v.estado === 'ganada' ? { ...s, estado: 'pendiente' } : s))
      } else if (nuevo === 'pendiente') {
        selecciones = selecciones.map((s) => ({ ...s, estado: 'pendiente' }))
      }
      const n = { ...v, estado: nuevo, selecciones }
      return mantenerResultado && nuevo !== 'pendiente' ? n : recalcular(n)
    })
  }

  function alternarFallada(i: number) {
    const s = valores.selecciones[i]
    cambiarSeleccion(i, 'estado', s.estado === 'perdida' ? 'pendiente' : 'perdida')
  }

  // ---------- tipo ----------

  function pedirCambioTipo(nuevo: TipoApuesta) {
    if (nuevo === tipo) return
    const sels = valores.selecciones
    if (nuevo === 'simple' && sels.length > 1) {
      setCambioTipo({ modo: 'elegir', nuevo })
      return
    }
    if (nuevo === 'mismo_partido' && sels.length > 1) {
      const mensajes: string[] = []
      const cuotas = sels.map((s) => s.cuota.trim()).filter(Boolean)
      if (tipo !== 'simple' && cuotas.length > 0) {
        mensajes.push(`Se quitarán las cuotas de cada selección (${cuotas.join(' · ')}). La cuota total se mantiene.`)
      }
      const base = sels[0]
      const distintas = CAMPOS_COMUNES.filter((c) => sels.some((s) => s[c].trim() && s[c].trim() !== base[c].trim()))
      if (distintas.length > 0) {
        mensajes.push(
          `Las selecciones tienen datos distintos de partido (${distintas.map(nombreComun).join(', ')}). Todas pasarán a ser del partido «${base.evento || 'sin nombre'}».`,
        )
      }
      if (mensajes.length > 0) {
        setCambioTipo({ modo: 'confirmar', nuevo, mensajes })
        return
      }
    }
    aplicarTipo(nuevo)
  }

  function aplicarTipo(nuevo: TipoApuesta, conservar?: number) {
    setCambioTipo(null)
    setErrores({})
    setValores((v) => {
      let selecciones = v.selecciones
      let cuotaTotal = v.cuota_total
      if (conservar != null) {
        const elegida = selecciones[conservar]
        selecciones = [elegida]
        // De combinada/sistema a simple: la cuota de la apuesta pasa a ser la de esa selección.
        if (elegida.cuota.trim()) cuotaTotal = elegida.cuota
      }
      if (v.tipo === 'simple' && selecciones.length === 1 && nuevo !== 'mismo_partido') {
        // La cuota de la simple pasa a su selección para no perderla.
        selecciones = [{ ...selecciones[0], cuota: selecciones[0].cuota || v.cuota_total }]
      }
      // Se añaden selecciones vacías hasta el mínimo del tipo nuevo.
      while (selecciones.length < MIN_SELECCIONES[nuevo]) {
        const nueva = seleccionVacia()
        if (nuevo === 'mismo_partido') {
          for (const c of CAMPOS_COMUNES) nueva[c] = selecciones[0]?.[c] ?? ''
        }
        selecciones = [...selecciones, nueva]
      }
      return recalcularSi(ajustarPorTipo({ ...v, tipo: nuevo, cuota_total: cuotaTotal, selecciones }))
    })
    if (conservar != null) {
      // Las marcas "a revisar" de la selección conservada pasan a la posición 0.
      setDudosos((d) => {
        const n: Record<string, MotivoRevision> = {}
        for (const [k, m] of Object.entries(d)) {
          const r = /^selecciones\.(\d+)\.(.+)$/.exec(k)
          if (!r) n[k] = m
          else if (Number(r[1]) === conservar) n[`selecciones.0.${r[2]}`] = m
        }
        return n
      })
    }
  }

  function recalcularSi(v: ValoresFormulario) {
    return resultadoManual ? v : recalcular(v)
  }

  function anadirSeleccion() {
    setValores((v) => {
      const nueva = seleccionVacia()
      if (v.tipo === 'mismo_partido') for (const c of CAMPOS_COMUNES) nueva[c] = v.selecciones[0]?.[c] ?? ''
      return { ...v, selecciones: [...v.selecciones, nueva] }
    })
    quitarMarca('selecciones')
  }

  function quitarSeleccion(i: number) {
    setValores((v) => ({ ...v, selecciones: v.selecciones.filter((_, j) => j !== i) }))
    // Las marcas de las selecciones siguientes se desplazan una posición.
    setDudosos((d) => {
      const n: Record<string, MotivoRevision> = {}
      for (const [k, m] of Object.entries(d)) {
        const r = /^selecciones\.(\d+)\.(.+)$/.exec(k)
        if (!r) n[k] = m
        else if (Number(r[1]) < i) n[k] = m
        else if (Number(r[1]) > i) n[`selecciones.${Number(r[1]) - 1}.${r[2]}`] = m
      }
      return n
    })
    setErrores({})
  }

  // ---------- guardar ----------

  function guardar(saltarComprobacion = false) {
    setErrorGeneral(null)
    const aGuardar = ajustarPorTipo(valores)
    const local = validarFormulario(aGuardar)
    if (!local.ok) {
      setErrores(local.errores)
      setErrorGeneral('Revisa los campos marcados en rojo.')
      return
    }
    iniciar(async () => {
      // Última comprobación con los valores finales (y la casa ya resuelta). Si falla, se guarda igual.
      if (comprobarDuplicadas && !saltarComprobacion) {
        const id = ++consulta.current
        const d = await buscarDuplicadas({ valores: aGuardar, casaPendiente: false }).catch(() => ({ ok: false }) as const)
        if (d.ok && d.total > 0 && d.clave !== aceptada) {
          if (id === consulta.current) setDuplicada(d)
          setPedirEleccion(true)
          requestAnimationFrame(() => refAviso.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
          return
        }
      }
      const r = await guardarApuesta({
        id: apuestaId ?? null,
        valores: aGuardar,
        imagen: imagen ?? null,
        transcripcionId: props.transcripcionId ?? null,
        indice: props.indice ?? null,
        conservarImagen: props.conservarImagen === true,
      })
      if (!r.ok) {
        setErrores(r.errores ?? {})
        setErrorGeneral(r.error)
        return
      }
      onGuardada(r.id, aGuardar)
    })
  }

  // ---------- pintar ----------

  const p = (clave: string) => ({ motivo: dudosos[clave], error: errores[clave] })
  // En "mismo partido", un campo común está a revisar si lo está en cualquier selección.
  const pComun = (c: string) => {
    const i = valores.selecciones.findIndex((_, j) => dudosos[`selecciones.${j}.${c}`])
    return { motivo: i >= 0 ? dudosos[`selecciones.${i}.${c}`] : undefined, error: errores[`selecciones.0.${c}`] }
  }
  const casaSinCrear =
    props.casaDetectada && !casas.some((c) => normalizar(c.nombre) === normalizar(props.casaDetectada!))
      ? props.casaDetectada
      : null
  const varias = valores.selecciones.length > 1
  const deporteDeLaApuesta = deporteResumen(valores.selecciones.map((x) => x.deporte))
  const minimo = MIN_SELECCIONES[tipo]

  return (
    <form
      className="space-y-5 px-4 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        guardar()
      }}
      noValidate
    >
      {modo === 'revision' && imagen && <VisorCaptura ruta={imagen} />}

      {duplicada && duplicada.clave !== aceptada && (
        <AvisoDuplicada
          ref={refAviso}
          duplicada={duplicada}
          pedirEleccion={pedirEleccion}
          ocupado={guardando}
          onDescartar={props.onDescartar}
          onIncluir={() => {
            setAceptada(duplicada.clave)
            if (pedirEleccion) {
              setPedirEleccion(false)
              guardar(true)
            }
          }}
        />
      )}

      {modo === 'revision' && nDudosos > 0 && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Los campos en <strong>ámbar</strong> no se veían, estaban borrosos o la IA los ha deducido: compáralos con la
          captura.
        </p>
      )}

      {modo !== 'panel' && (
      <Grupo titulo="Apuesta">
        <Campo etiqueta="Casa de apuestas" {...p('casa_id')}>
          <SelectorOpcion
            tipo="casa"
            opciones={casas}
            valor={valores.casa_id}
            sugerencia={casaSinCrear}
            onCambio={(id) => cambiar('casa_id', id)}
            onCreada={(o) => {
              setCasas((c) => (c.some((x) => x.id === o.id) ? c : [...c, o].sort(porNombre)))
              props.onOpcionCreada?.('casa', o)
              cambiar('casa_id', o.id)
            }}
          />
        </Campo>

        <Campo etiqueta="Tipo" {...p('tipo')}>
          <div role="group" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
            {TIPOS_APUESTA.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pedirCambioTipo(t)}
                aria-pressed={tipo === t}
                className={`min-h-11 rounded-lg px-2 text-sm font-medium ${
                  tipo === t ? 'bg-brand text-brand-foreground' : 'text-muted'
                }`}
              >
                {NOMBRE_TIPO_LARGO[t]}
              </button>
            ))}
          </div>
        </Campo>

        {cambioTipo && (
          <DialogoTipo
            cambio={cambioTipo}
            tipoActual={tipo}
            selecciones={valores.selecciones}
            onConservar={(i) => aplicarTipo(cambioTipo.nuevo, i)}
            onConfirmar={() => aplicarTipo(cambioTipo.nuevo)}
            onCancelar={() => setCambioTipo(null)}
          />
        )}

        <CasillasConducta
          mostrar={modo === 'edicion' ? 'directo' : 'ambas'}
          valores={valores}
          onCambio={(c) =>
            setValores((v) => {
              const n = { ...v, ...c }
              // Al desmarcar la principal, su subcasilla se guarda como "no".
              if (!n.en_directo) n.viendo_partido = false
              if (!n.precipitada) n.recuperar_perdidas = false
              return n
            })
          }
        />

        <BloquePromocion valores={valores} dudosos={dudosos} errores={errores} onCambio={cambiarPromo} />

        {deporteDeLaApuesta && (
          <p className="text-sm">
            <span className="text-muted">Deporte de la apuesta: </span>
            <span className={`font-semibold ${deporteDeLaApuesta === DEPORTE_MIXTO ? 'rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-700 dark:text-violet-300' : ''}`}>
                <span aria-hidden="true" className="mr-1">
                {emojiDeporte(deporteDeLaApuesta)}
              </span>
              {deporteDeLaApuesta}
            </span>
            {deporteDeLaApuesta === DEPORTE_MIXTO && <span className="text-muted"> (selecciones de varios deportes)</span>}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Importe (€)" {...p('importe')}>
            <Entrada inputMode="decimal" placeholder="10,00" value={valores.importe} onChange={(v) => cambiar('importe', v)} marca={dudosos.importe} conError={!!errores.importe} />
          </Campo>
          <Campo etiqueta={tipo === 'simple' ? 'Cuota' : 'Cuota total'} {...p('cuota_total')}>
            <Entrada inputMode="decimal" placeholder="1,85" value={valores.cuota_total} onChange={(v) => cambiar('cuota_total', v)} marca={dudosos.cuota_total} conError={!!errores.cuota_total} />
          </Campo>
        </div>

        {modo === 'edicion' && recalculoPropuesto != null && (
          <div role="alertdialog" aria-label="Recalcular el resultado" className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
            <p className="text-sm">
              La apuesta ya está resuelta con un resultado de <strong>{valores.resultado_economico || '0,00'} €</strong>. Con
              los datos nuevos saldría <strong>{recalculoPropuesto} €</strong>. ¿Lo recalculo?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRecalculoPropuesto(null)}
                className="min-h-11 rounded-xl border border-border bg-background px-2 text-sm font-semibold"
              >
                Mantener el mío
              </button>
              <button
                type="button"
                onClick={() => {
                  setValores((v) => recalcular(v))
                  setRecalculoPropuesto(null)
                }}
                className="min-h-11 rounded-xl bg-brand px-2 text-sm font-semibold text-brand-foreground"
              >
                Recalcular
              </button>
            </div>
          </div>
        )}

        <Campo etiqueta="Ganancia potencial (€)" ayuda="Lo que cobrarías si gana, incluido lo apostado." {...p('ganancia_potencial')}>
          <Entrada inputMode="decimal" placeholder={sugerirGanancia(valores)} value={valores.ganancia_potencial} onChange={(v) => cambiar('ganancia_potencial', v)} marca={dudosos.ganancia_potencial} conError={!!errores.ganancia_potencial} />
        </Campo>

        <Campo etiqueta="Día de la apuesta" ayuda="Cuándo la hiciste (hoy, si lo dejas vacío)." {...p('fecha')}>
          <Entrada type="date" value={valores.fecha.slice(0, 10)} onChange={(d) => cambiar('fecha', d)} marca={dudosos.fecha} conError={!!errores.fecha} />
        </Campo>

        <Campo etiqueta="Estrategia (opcional)" {...p('estrategia_id')}>
          <SelectorOpcion
            tipo="estrategia"
            opciones={estrategias}
            valor={valores.estrategia_id}
            onCambio={(id) => cambiar('estrategia_id', id)}
            onCreada={(o) => {
              setEstrategias((c) => (c.some((x) => x.id === o.id) ? c : [...c, o].sort(porNombre)))
              props.onOpcionCreada?.('estrategia', o)
              cambiar('estrategia_id', o.id)
            }}
          />
        </Campo>
      </Grupo>
      )}

      {modo !== 'edicion' && (
      <Grupo titulo="Estado y resultado">
        {modo === 'panel' ? (
          <BotonesEstado estado={estado} onElegir={pedirCambioEstado} />
        ) : (
          <Campo etiqueta="Estado de la apuesta" {...p('estado')}>
            <Desplegable value={valores.estado} onChange={cambiarEstado} marca={dudosos.estado} opciones={ESTADOS_APUESTA.map((e) => [e, NOMBRE_ESTADO[e]])} />
          </Campo>
        )}

        {estadoPorConfirmar && (
          <div role="alertdialog" aria-label="Cambiar el estado" className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
            <p className="text-sm">
              Escribiste a mano el resultado (<strong>{valores.resultado_economico} €</strong>). Al pasar a «
              {NOMBRE_ESTADO[estadoPorConfirmar as keyof typeof NOMBRE_ESTADO]}» se recalcularía. ¿Qué hago?
            </p>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <button
                type="button"
                onClick={() => cambiarEstado(estadoPorConfirmar)}
                className="min-h-11 rounded-xl bg-brand px-2 text-sm font-semibold text-brand-foreground"
              >
                Recalcular
              </button>
              <button
                type="button"
                onClick={() => cambiarEstado(estadoPorConfirmar, true)}
                className="min-h-11 rounded-xl border border-border bg-background px-2 text-sm font-semibold"
              >
                Mantener el mío
              </button>
              <button
                type="button"
                onClick={() => setEstadoPorConfirmar(null)}
                className="min-h-11 rounded-xl px-2 text-sm font-medium text-muted min-[360px]:col-span-2"
              >
                Cancelar (no cambiar el estado)
              </button>
            </div>
          </div>
        )}

        {estado === 'perdida' && varias && (
          <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-sm font-medium">¿Qué selecciones fallaron?</p>
            <ul className="space-y-2">
              {valores.selecciones.map((s, i) => {
                const fallada = s.estado === 'perdida'
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => alternarFallada(i)}
                      aria-pressed={fallada}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                        fallada ? 'border-red-500 bg-red-500/15 font-semibold text-red-700 dark:text-red-300' : 'border-border bg-background'
                      }`}
                    >
                      <span aria-hidden="true">{fallada ? '✕' : '○'}</span>
                      <span className="min-w-0 flex-1 truncate">{resumenSeleccion(s, tipo, i)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {estado === 'cash_out' && (
          <Campo etiqueta="Importe recuperado con el cash out (€)" {...p('importe_recuperado')}>
            <Entrada inputMode="decimal" placeholder="0,00" value={valores.importe_recuperado} onChange={(v) => cambiar('importe_recuperado', v)} conError={!!errores.importe_recuperado} />
          </Campo>
        )}

        {estado !== 'pendiente' && (
          <Campo
            etiqueta="Resultado económico (€)"
            ayuda={resultadoManual ? 'Escrito a mano. Usa − para pérdidas.' : 'Calculado: beneficio (+) o pérdida (−). Puedes corregirlo.'}
            {...p('resultado_economico')}
          >
            <div className="flex gap-2">
              <Entrada
                inputMode="text"
                placeholder="0,00"
                value={valores.resultado_economico}
                onChange={(v) => {
                  setResultadoManual(true)
                  cambiar('resultado_economico', v)
                }}
                marca={dudosos.resultado_economico}
                conError={!!errores.resultado_economico}
              />
              {resultadoManual && (
                <button
                  type="button"
                  onClick={() => {
                    setResultadoManual(false)
                    setValores((v) => recalcular(v))
                  }}
                  className="h-12 shrink-0 rounded-xl border border-border px-3 text-sm font-medium"
                >
                  Recalcular
                </button>
              )}
            </div>
          </Campo>
        )}

        {valores.promo && valores.promo_tipo === 'credito' && (
          <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">{TEXTO_CREDITO}</p>
        )}
        {valores.promo && valores.promo_tipo === 'asegurada' && estado === 'perdida' && valores.promo_credito.trim() && (
          <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">
            Asegurada: recibes {valores.promo_credito} € en crédito. Se guarda aparte y no cuenta como beneficio.
          </p>
        )}

        {modo === 'panel' && (
          <CasillasConducta
            mostrar="precipitada"
            valores={valores}
            onCambio={(c) =>
              setValores((v) => {
                const n = { ...v, ...c }
                if (!n.precipitada) n.recuperar_perdidas = false
                return n
              })
            }
          />
        )}
      </Grupo>
      )}

      {modo !== 'panel' && tipo === 'mismo_partido' && (
        <Grupo titulo="Partido">
          <Campo etiqueta="Evento" {...pComun('evento')}>
            <Entrada value={valores.selecciones[0]?.evento ?? ''} placeholder="Equipo A - Equipo B" onChange={(v) => cambiarComun('evento', v)} marca={pComun('evento').motivo} />
          </Campo>
          {camposDeporteLiga(
            valores.selecciones.map((_, j) => j),
            0,
            pComun('deporte'),
            pComun('liga'),
          )}
          <Campo etiqueta="Día del partido" {...pComun('evento_fecha')}>
            <Entrada type="date" value={valores.selecciones[0]?.evento_fecha ?? ''} onChange={(v) => cambiarComun('evento_fecha', v)} marca={pComun('evento_fecha').motivo} conError={!!errores['selecciones.0.evento_fecha']} />
          </Campo>
          <Campo etiqueta="Hora" {...pComun('evento_hora')}>
            <SelectorHora valor={valores.selecciones[0]?.evento_hora ?? ''} onCambio={(v) => cambiarComun('evento_hora', v)} marcado={!!pComun('evento_hora').motivo} conError={!!errores['selecciones.0.evento_hora']} />
          </Campo>
        </Grupo>
      )}

      {modo !== 'panel' && (
      <Grupo titulo={tipo === 'mismo_partido' ? `Condiciones (${valores.selecciones.length})` : tipo === 'simple' ? 'Selección' : `Selecciones (${valores.selecciones.length})`}>
        {errores.selecciones && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errores.selecciones}</p>}
        {tipo === 'mismo_partido' && <p className="text-xs text-muted">Sin cuota por condición: en «mismo partido» solo cuenta la cuota total.</p>}
        <ol className="space-y-3">
          {valores.selecciones.map((s, i) => (
            <TarjetaSeleccion
              key={i}
              i={i}
              s={s}
              tipo={tipo}
              puedeQuitar={varias}
              dudosos={dudosos}
              errores={errores}
              onCambio={(c, v) => cambiarSeleccion(i, c, v)}
              onQuitar={() => quitarSeleccion(i)}
              deporteLiga={camposDeporteLiga([i], i, p(`selecciones.${i}.deporte`), p(`selecciones.${i}.liga`))}
            />
          ))}
        </ol>
        {tipo === 'simple' ? (
          <p className="text-xs text-muted">Una simple tiene una sola selección. ¿Hay más? Cambia el tipo arriba.</p>
        ) : (
          <>
            {valores.selecciones.length < minimo && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Una apuesta «{NOMBRE_TIPO[tipo]}» necesita al menos {minimo} selecciones.
              </p>
            )}
            <button type="button" onClick={anadirSeleccion} className="h-12 w-full rounded-xl border border-dashed border-border text-sm font-semibold text-brand">
              {tipo === 'mismo_partido' ? '+ Añadir condición' : '+ Añadir selección'}
            </button>
          </>
        )}
      </Grupo>

      )}

      {modo !== 'panel' && (
      <Grupo titulo="Notas">
        <textarea
          aria-label="Notas"
          value={valores.notas}
          onChange={(e) => cambiar('notas', e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Opcional"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base"
        />
      </Grupo>
      )}

      {avisos.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {avisos.map((a) => (
            <li key={a} className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              ⚠️ {a}
            </li>
          ))}
        </ul>
      )}

      <div
        className={
          modo === 'panel'
            ? 'space-y-2'
            : 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur'
        }
      >
        {errorGeneral && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            {errorGeneral}
          </p>
        )}
        <button type="submit" disabled={guardando} className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground disabled:opacity-60">
          {guardando ? 'Guardando…' : (props.textoGuardar ?? 'Guardar')}
        </button>
        {extra}
      </div>
    </form>
  )
}

// ---------- selección ----------

const BORDE_ESTADO: Record<string, string> = {
  ganada: 'border-l-4 border-l-green-500',
  media_ganada: 'border-l-4 border-l-green-500',
  perdida: 'border-l-4 border-l-red-500',
  media_perdida: 'border-l-4 border-l-red-500',
  anulada: 'border-l-4 border-l-amber-500',
}

function TarjetaSeleccion({
  i,
  s,
  tipo,
  puedeQuitar,
  dudosos,
  errores,
  onCambio,
  onQuitar,
  deporteLiga,
}: {
  deporteLiga: ReactNode
  i: number
  s: ValoresSeleccion
  tipo: TipoApuesta
  puedeQuitar: boolean
  dudosos: Record<string, MotivoRevision>
  errores: Record<string, string>
  onCambio: (c: keyof ValoresSeleccion, v: string) => void
  onQuitar: () => void
}) {
  const k = (c: keyof ValoresSeleccion) => `selecciones.${i}.${c}`
  const ps = (c: keyof ValoresSeleccion) => ({ motivo: dudosos[k(c)], error: errores[k(c)] })
  const ent = (c: keyof ValoresSeleccion, extra: { placeholder?: string; type?: string; inputMode?: 'decimal' | 'text' } = {}) => (
    <Entrada value={s[c]} onChange={(v) => onCambio(c, v)} marca={dudosos[k(c)]} conError={!!errores[k(c)]} {...extra} />
  )
  const partidoPropio = tipo !== 'mismo_partido'
  const conCuota = tipo === 'combinada' || tipo === 'sistema'
  const titulo = tipo === 'mismo_partido' ? `Condición ${i + 1}` : tipo === 'simple' ? 'Selección' : `Selección ${i + 1}`

  return (
    <li className={`space-y-3 rounded-xl border border-border bg-background p-3 ${BORDE_ESTADO[s.estado] ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{titulo}</span>
        {puedeQuitar && (
          <button type="button" onClick={onQuitar} className="h-11 rounded-lg px-3 text-sm font-medium text-red-600 dark:text-red-400">
            Quitar
          </button>
        )}
      </div>
      {partidoPropio && (
        <Campo etiqueta="Evento" {...ps('evento')}>
          {ent('evento', { placeholder: 'Equipo A - Equipo B' })}
        </Campo>
      )}
      <div className={conCuota ? 'grid grid-cols-[1fr_6rem] gap-3' : ''}>
        <Campo etiqueta="Pronóstico" {...ps('pronostico')}>
          {ent('pronostico', { placeholder: 'Equipo A' })}
        </Campo>
        {conCuota && (
          <Campo etiqueta="Cuota" {...ps('cuota')}>
            {ent('cuota', { placeholder: '1,85', inputMode: 'decimal' })}
          </Campo>
        )}
      </div>
      <Campo etiqueta="Mercado" {...ps('mercado')}>
        {ent('mercado', { placeholder: '1X2, Más/menos goles…' })}
      </Campo>
      {partidoPropio && (
        <>
          {deporteLiga}
          <Campo etiqueta="Día del evento" {...ps('evento_fecha')}>
            {ent('evento_fecha', { type: 'date' })}
          </Campo>
          <Campo etiqueta="Hora" {...ps('evento_hora')}>
            <SelectorHora valor={s.evento_hora} onCambio={(v) => onCambio('evento_hora', v)} marcado={!!dudosos[k('evento_hora')]} conError={!!errores[k('evento_hora')]} />
          </Campo>
        </>
      )}
      <Campo etiqueta={tipo === 'mismo_partido' ? 'Estado de la condición' : 'Estado de la selección'} {...ps('estado')}>
        <Desplegable value={s.estado} onChange={(v) => onCambio('estado', v)} marca={dudosos[k('estado')]} opciones={ESTADOS_SELECCION.map((e) => [e, NOMBRE_ESTADO[e]])} />
      </Campo>
    </li>
  )
}

// ---------- aviso de apuesta duplicada ----------

function AvisoDuplicada({
  ref,
  duplicada,
  pedirEleccion,
  ocupado,
  onDescartar,
  onIncluir,
}: {
  ref: React.Ref<HTMLDivElement>
  duplicada: Duplicada
  pedirEleccion: boolean
  ocupado: boolean
  onDescartar?: () => void
  onIncluir: () => void
}) {
  const r = duplicada.reciente
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-label="Apuesta duplicada"
      className="min-w-0 space-y-3 rounded-2xl border-2 border-amber-500 bg-amber-500/10 p-4"
    >
      <p className="font-semibold">Parece que esta apuesta ya está registrada</p>
      {r && (
        <p className="text-sm">
          {formatoFecha(r.fecha, { conHora: false })} · {NOMBRE_ESTADO[r.estado as keyof typeof NOMBRE_ESTADO] ?? r.estado} ·{' '}
          {r.casa ?? 'Sin casa'} · {formatoImporte(r.importe, r.divisa)} · @ {cuotaATexto(r.cuota) || '—'}
        </p>
      )}
      {duplicada.total > 1 && (
        <p className="text-sm text-muted">
          Hay {duplicada.total} apuestas iguales; esta es la más reciente.
        </p>
      )}
      {pedirEleccion && (
        <p role="status" className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Elige Descartar o Incluir de nuevo.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {onDescartar && (
          <button
            type="button"
            disabled={ocupado}
            onClick={onDescartar}
            className="min-h-12 rounded-xl border border-border bg-background px-2 text-sm font-semibold disabled:opacity-60"
          >
            Descartar
          </button>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={onIncluir}
          className={`min-h-12 rounded-xl bg-brand px-2 text-sm font-semibold text-brand-foreground disabled:opacity-60 ${onDescartar ? '' : 'col-span-2'}`}
        >
          Incluir de nuevo
        </button>
      </div>
    </div>
  )
}

// ---------- en directo y precipitada (las marca siempre el usuario) ----------

type Conducta = Pick<ValoresFormulario, 'en_directo' | 'viendo_partido' | 'precipitada' | 'recuperar_perdidas'>

function CasillasConducta({
  valores,
  onCambio,
  mostrar = 'ambas',
}: {
  valores: Conducta
  onCambio: (c: Partial<Conducta>) => void
  mostrar?: 'ambas' | 'directo' | 'precipitada'
}) {
  return (
    <div
      role="group"
      aria-label="Cómo fue la apuesta"
      className={`grid grid-cols-1 gap-2 ${mostrar === 'ambas' ? 'min-[360px]:grid-cols-2' : ''}`}
    >
      {mostrar !== 'precipitada' && (
      <div className="min-w-0 space-y-1">
        <Casilla etiqueta="En directo" marcada={valores.en_directo} onCambio={(m) => onCambio({ en_directo: m })} />
        {valores.en_directo && (
          <Casilla
            sub
            etiqueta="Veía el partido"
            marcada={valores.viendo_partido}
            onCambio={(m) => onCambio({ viendo_partido: m })}
          />
        )}
      </div>
      )}
      {mostrar !== 'directo' && (
      <div className="min-w-0 space-y-1">
        <Casilla etiqueta="Precipitada" marcada={valores.precipitada} onCambio={(m) => onCambio({ precipitada: m })} />
        {valores.precipitada && (
          <Casilla
            sub
            etiqueta="Para recuperar pérdidas"
            marcada={valores.recuperar_perdidas}
            onCambio={(m) => onCambio({ recuperar_perdidas: m })}
          />
        )}
      </div>
      )}
    </div>
  )
}

// ---------- promoción ----------

type CamposPromoValores = Pick<
  ValoresFormulario,
  'promo' | 'promo_tipo' | 'promo_cuota_original' | 'promo_aumento' | 'promo_base' | 'promo_credito'
>

function BloquePromocion({
  valores,
  dudosos,
  errores,
  onCambio,
}: {
  valores: ValoresFormulario
  dudosos: Record<string, MotivoRevision>
  errores: Record<string, string>
  onCambio: (c: Partial<CamposPromoValores>) => void
}) {
  const p = (clave: string, motivo?: MotivoRevision) => ({ motivo: motivo ?? dudosos[clave], error: errores[clave] })
  const conAumento = valores.promo && esPromoAumento(valores.promo_tipo)
  const calculo = conAumento
    ? calcularAumento({
        importe: textoACentimos(valores.importe) ?? null,
        cuotaTotal: cuotaDeLaApuesta(valores),
        gananciaPotencial: textoACentimos(valores.ganancia_potencial) ?? null,
        cuotaOriginal: cuotaADecimal(valores.promo_cuota_original) ?? null,
        aumento: textoACentimos(valores.promo_aumento, { permitirNegativo: true }) ?? null,
        base: valores.promo_base,
      })
    : null
  // Escribir en uno de los dos campos lo convierte en el dato "base"; el otro se calcula.
  // Si se vacía el que manda, se vacían los dos (para no recalcular a partir del calculado).
  const escribir = (campo: 'promo_cuota_original' | 'promo_aumento', v: string) => {
    const base = campo === 'promo_cuota_original' ? 'cuota_original' : 'aumento'
    if (!v.trim() && valores.promo_base === base) onCambio({ promo_cuota_original: '', promo_aumento: '', promo_base: '' })
    else onCambio({ [campo]: v, promo_base: base })
  }
  const eur = (c: number | null | undefined) => (c == null ? '—' : formatoImporte(c))

  return (
    <div className="min-w-0 space-y-2">
      <Casilla etiqueta="Promoción" marcada={valores.promo} onCambio={(m) => onCambio({ promo: m })} />
      {valores.promo && (
        <div className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-3">
          <Campo etiqueta="Tipo de promoción" {...p('promo_tipo')}>
            <Desplegable
              value={valores.promo_tipo}
              onChange={(t) => onCambio({ promo_tipo: t })}
              marca={dudosos.promo_tipo}
              conError={!!errores.promo_tipo}
              opciones={[['', 'Elige el tipo…'], ...TIPOS_PROMO.map((t) => [t, NOMBRE_PROMO[t]] as [string, string])]}
            />
          </Campo>

          {conAumento && calculo && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo
                  etiqueta="Cuota original"
                  {...p('promo_cuota_original', calculo.falta && !dudosos.promo_cuota_original ? 'falta' : undefined)}
                >
                  <Entrada
                    inputMode="decimal"
                    placeholder="1,80"
                    value={valores.promo_cuota_original}
                    onChange={(v) => escribir('promo_cuota_original', v)}
                    marca={calculo.falta ? 'falta' : dudosos.promo_cuota_original}
                    conError={!!errores.promo_cuota_original}
                  />
                </Campo>
                <Campo etiqueta="Aumento (€)" {...p('promo_aumento')}>
                  <Entrada
                    inputMode="decimal"
                    placeholder="0,00"
                    value={valores.promo_aumento}
                    onChange={(v) => escribir('promo_aumento', v)}
                    marca={dudosos.promo_aumento}
                    conError={!!errores.promo_aumento}
                  />
                </Campo>
              </div>
              <p className="text-xs text-muted">
                Cuota original = sin la promoción. Escribe uno de los dos y el otro se calcula
                {calculo.base === 'cuota_original' ? ' (ahora se calcula el aumento)' : calculo.base === 'aumento' ? ' (ahora se calcula la cuota original)' : ''}.
              </p>
              <p aria-label="Resumen de la promoción" className="rounded-xl bg-brand/10 px-3 py-2 text-sm">
                Sin promoción: <strong>{eur(calculo.gananciaSin)}</strong> · Con promoción: <strong>{eur(calculo.gananciaCon)}</strong> · Aumento:{' '}
                <strong>{eur(calculo.aumento)}</strong>
              </p>
            </>
          )}

          {valores.promo_tipo === 'asegurada' && (
            <Campo etiqueta="Crédito si se pierde (€)" ayuda="Lo que la casa te devuelve en crédito si pierdes. No cuenta como beneficio." {...p('promo_credito')}>
              <Entrada
                inputMode="decimal"
                placeholder={valores.importe || '0,00'}
                value={valores.promo_credito}
                onChange={(v) => onCambio({ promo_credito: v })}
                marca={dudosos.promo_credito}
                conError={!!errores.promo_credito}
              />
            </Campo>
          )}

          {valores.promo_tipo === 'credito' && (
            <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">{TEXTO_CREDITO}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- panel de resultado (detalle) ----------

const OTROS_ESTADOS = ['anulada', 'cash_out', 'media_ganada', 'media_perdida', 'pendiente'] as const

function BotonesEstado({ estado, onElegir }: { estado: string; onElegir: (e: string) => void }) {
  const otro = (OTROS_ESTADOS as readonly string[]).includes(estado) ? estado : ''
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Estado de la apuesta" className="grid grid-cols-2 gap-2">
        {(['ganada', 'perdida'] as const).map((e) => {
          const activo = estado === e
          return (
            <button
              key={e}
              type="button"
              aria-pressed={activo}
              onClick={() => !activo && onElegir(e)}
              className={`h-14 rounded-xl border-2 text-base font-bold ${
                activo
                  ? e === 'ganada'
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-red-600 bg-red-600 text-white'
                  : e === 'ganada'
                    ? 'border-green-600/40 text-green-700 dark:text-green-400'
                    : 'border-red-600/40 text-red-700 dark:text-red-400'
              }`}
            >
              {activo ? '✓ ' : ''}
              {NOMBRE_ESTADO[e]}
            </button>
          )
        })}
      </div>
      <select
        aria-label="Otro estado"
        value={otro}
        onChange={(ev) => ev.target.value && onElegir(ev.target.value)}
        className={`h-12 w-full min-w-0 rounded-xl border px-3 text-base ${otro ? 'border-brand bg-brand/10 font-semibold' : 'border-border bg-background'}`}
      >
        <option value="">Otro estado…</option>
        {OTROS_ESTADOS.map((e) => (
          <option key={e} value={e}>
            {NOMBRE_ESTADO[e]}
          </option>
        ))}
      </select>
    </div>
  )
}

function Casilla({
  etiqueta,
  marcada,
  onCambio,
  sub,
}: {
  etiqueta: string
  marcada: boolean
  onCambio: (m: boolean) => void
  sub?: boolean
}) {
  return (
    <label
      className={`flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium ${
        sub ? 'ml-4 border-dashed' : ''
      } ${marcada ? 'border-brand bg-brand/10' : 'border-border bg-background'}`}
    >
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onCambio(e.target.checked)}
        className="size-5 shrink-0 accent-[var(--brand)]"
      />
      <span className="min-w-0">{etiqueta}</span>
    </label>
  )
}

// ---------- deporte y liga ----------

function CamposDeporteLiga({
  deporte,
  liga,
  catalogo,
  pDeporte,
  pLiga,
  aviso,
  onDeporte,
  onLiga,
  crearDeporte,
  crearLiga,
}: {
  deporte: string
  liga: string
  catalogo: Catalogo
  pDeporte: { motivo?: MotivoRevision; error?: string }
  pLiga: { motivo?: MotivoRevision; error?: string }
  aviso?: string
  onDeporte: (d: string) => void
  onLiga: (l: string) => void
  crearDeporte: (n: string) => Promise<{ ok: true; nombre: string; aviso?: string } | { ok: false; error: string }>
  crearLiga: (n: string) => Promise<{ ok: true; nombre: string; aviso?: string } | { ok: false; error: string }>
}) {
  const ligas = ligasDe(catalogo, deporte).map((l) => l.nombre)
  const deporteEnCatalogo = catalogo.deportes.some((d) => d.nombre === deporte)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Deporte" {...pDeporte}>
          <SelectorCatalogo
            valor={deporte}
            opciones={catalogo.deportes.map((d) => d.nombre)}
            vacio="Elige…"
            textoNuevo="+ Nuevo deporte…"
            emoji={emojiDeporte}
            marcado={!!pDeporte.motivo}
            conError={!!pDeporte.error}
            esNueva={pDeporte.motivo === 'nueva'}
            crear={crearDeporte}
            onCambio={onDeporte}
          />
        </Campo>
        <Campo etiqueta="Liga" {...pLiga}>
          <SelectorCatalogo
            valor={liga}
            opciones={ligas}
            vacio="Sin liga"
            textoNuevo="+ Nueva liga…"
            marcado={!!pLiga.motivo}
            conError={!!pLiga.error}
            esNueva={pLiga.motivo === 'nueva'}
            deshabilitado={!deporteEnCatalogo}
            ayudaDeshabilitado={deporte ? 'Crea antes el deporte' : 'Elige antes el deporte'}
            crear={crearLiga}
            onCambio={onLiga}
          />
        </Campo>
      </div>
      {aviso && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {aviso}
        </p>
      )}
    </div>
  )
}

// ---------- diálogo al cambiar de tipo ----------

function DialogoTipo({
  cambio,
  tipoActual,
  selecciones,
  onConservar,
  onConfirmar,
  onCancelar,
}: {
  cambio: CambioTipo
  tipoActual: TipoApuesta
  selecciones: ValoresSeleccion[]
  onConservar: (i: number) => void
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const [elegida, setElegida] = useState(0)
  return (
    <div role="alertdialog" aria-label="Cambiar el tipo de apuesta" className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
      {cambio.modo === 'elegir' ? (
        <>
          <p className="text-sm font-medium">
            Una simple tiene una sola selección. ¿Cuál conservas? Las demás se quitarán.
          </p>
          <ul className="space-y-2">
            {selecciones.map((s, i) => (
              <li key={i}>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <input type="radio" name="conservar" checked={elegida === i} onChange={() => setElegida(i)} className="size-5" />
                  <span className="min-w-0 flex-1">{resumenSeleccion(s, tipoActual, i)}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Al pasar a «{NOMBRE_TIPO_LARGO[cambio.nuevo]}»:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {cambio.mensajes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancelar} className="h-11 rounded-xl border border-border bg-background text-sm font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => (cambio.modo === 'elegir' ? onConservar(elegida) : onConfirmar())}
          className="h-11 rounded-xl bg-brand text-sm font-semibold text-brand-foreground"
        >
          {cambio.modo === 'elegir' ? 'Conservar esta' : 'Cambiar tipo'}
        </button>
      </div>
    </div>
  )
}

// ---------- utilidades ----------

function resumenSeleccion(s: ValoresSeleccion, tipo: string, i: number) {
  const partes = tipo === 'mismo_partido' ? [s.mercado, s.pronostico] : [s.evento, s.pronostico, s.cuota && `@ ${s.cuota}`]
  return partes.filter(Boolean).join(' · ') || `Selección ${i + 1}`
}

function nombreComun(c: string) {
  return { evento: 'partido', liga: 'liga', deporte: 'deporte', evento_fecha: 'día', evento_hora: 'hora' }[c] ?? c
}

function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function porNombre(a: Opcion, b: Opcion) {
  return a.nombre.localeCompare(b.nombre, 'es')
}

const cuotaEfectiva = cuotaDeLaApuesta

function recalcular(v: ValoresFormulario): ValoresFormulario {
  if (!esEstadoApuesta(v.estado)) return v
  const r = resultadoPropuesto({
    estado: v.estado,
    importe: textoACentimos(v.importe) ?? null,
    cuota: cuotaEfectiva(v),
    gananciaPotencial: textoACentimos(v.ganancia_potencial) ?? null,
    recuperado: textoACentimos(v.importe_recuperado) ?? null,
    promo: v.promo ? v.promo_tipo : null,
  })
  return { ...v, resultado_economico: centimosATexto(r) }
}

function sugerirGanancia(v: ValoresFormulario): string {
  const importe = textoACentimos(v.importe)
  const cuota = cuotaEfectiva(v)
  return importe && cuota ? centimosATexto(Math.round(importe * cuota)) : '0,00'
}

// ---------- piezas del formulario ----------

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-2xl border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function Campo({
  etiqueta,
  ayuda,
  motivo,
  error,
  children,
}: {
  etiqueta: string
  ayuda?: string
  motivo?: MotivoRevision
  error?: string
  children: ReactNode
}) {
  const id = useId()
  const descripcion = `${id}-d`
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {etiqueta}
        </label>
        {motivo && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            revisar · {NOMBRE_MOTIVO[motivo]}
          </span>
        )}
      </div>
      <IdCampo value={{ id, descripcion }}>{children}</IdCampo>
      <span id={descripcion}>
        {motivo && <span className="sr-only">A revisar: {NOMBRE_MOTIVO[motivo]}. </span>}
        {error ? (
          <span className="mt-1 block text-sm text-red-600 dark:text-red-400">{error}</span>
        ) : (
          ayuda && <span className="mt-1 block text-xs text-muted">{ayuda}</span>
        )}
      </span>
    </div>
  )
}

function clasesEntrada(marcado?: boolean, conError?: boolean) {
  return `h-12 w-full min-w-0 rounded-xl border px-3 text-base outline-none focus:ring-2 focus:ring-brand/40 ${
    conError ? 'border-red-500 bg-red-500/5' : marcado ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-background'
  }`
}

function Entrada({
  value,
  onChange,
  marca,
  conError,
  type = 'text',
  inputMode,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  marca?: MotivoRevision
  conError?: boolean
  type?: string
  inputMode?: 'decimal' | 'text'
  placeholder?: string
}) {
  const { id, descripcion } = useIdCampo()
  return (
    <input
      id={id}
      aria-describedby={descripcion}
      aria-invalid={conError || undefined}
      type={type}
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
      className={clasesEntrada(!!marca, conError)}
    />
  )
}

function Desplegable({
  value,
  onChange,
  opciones,
  marca,
  conError,
}: {
  value: string
  onChange: (v: string) => void
  opciones: [string, string][]
  marca?: MotivoRevision
  conError?: boolean
}) {
  const { id, descripcion } = useIdCampo()
  return (
    <select id={id} aria-describedby={descripcion} value={value} onChange={(e) => onChange(e.target.value)} className={clasesEntrada(!!marca, conError)}>
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  )
}
