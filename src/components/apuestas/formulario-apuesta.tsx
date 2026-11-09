'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { buscarPorNombre } from '@/lib/apuestas/opciones'
import { buscarDuplicadas, buscarPartidosConocidos, crearCasa, guardarApuesta, type ResultadoDuplicadas } from '@/app/(app)/apuestas/actions'
import {
  agruparConocidos,
  claveConocida,
  diaSegunPartido,
  proponerPartido,
  textoDiaHora,
  ultimoPartido,
  type CamposPartido,
  type DiaConocido,
  type SeleccionConocida,
} from '@/lib/apuestas/partidos'
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
  esAmbar,
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
  diaEnMadridTexto,
  type Opcion,
  type ValoresFormulario,
  type ValoresSeleccion,
} from '@/lib/apuestas/formulario'
import {
  buscarDeporte,
  buscarLiga,
  deporteResumen,
  ligasDe,
  DEPORTE_MIXTO,
  type Catalogo,
} from '@/lib/apuestas/catalogo'
import { crearDeporte, crearLiga } from '@/app/(app)/apuestas/actions'
import { IdCampo, useIdCampo } from './id-campo'
import { SelectorCatalogo } from './selector-catalogo'
import { recuperarCatalogo } from '@/app/(app)/ajustes/deportes/actions'
import { emojiDeporte } from '@/lib/apuestas/emojis'
import { SelectorOpcion } from './selector-opcion'
import { decidirRelleno, esDeFutbol, ladosDelEvento, textoDia, type CampoPartido, type Marcas } from '@/lib/api-futbol/emparejar'
import type { PartidoCliente, RespuestaConsulta, ResultadoSeleccion } from '@/lib/api-futbol/consulta'
import { VisorCaptura } from './visor-captura'

type Props = {
  inicial: ValoresFormulario
  dudosos?: Record<string, MotivoRevision>
  casaDetectada?: string | null
  // Casa de la tanda (v7): 'tuya' = la eligió el usuario antes de subir; 'ia' = la detecta la IA.
  origenCasa?: 'tuya' | 'ia'
  avisoCasa?: string | null // "La captura parece de X" (la IA ve con claridad otra casa)
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
  // Tanda de capturas: selecciones ya confirmadas o editadas en las apuestas anteriores (para
  // rellenar el mismo partido) y aviso a la cola de lo que se va editando.
  conocidosTanda?: SeleccionConocida[]
  onCambioValores?: (v: ValoresFormulario) => void
}

// Datos de un partido rellenados en una selección: de dónde salen y otros días para elegir.
type Deducido = { fuente: 'otra_apuesta' | 'tanda'; origen: DiaConocido; otros: DiaConocido[]; campos: CamposPartido[] }
const CAMPOS_PARTIDO: CamposPartido[] = ['evento_fecha', 'evento_hora', 'liga', 'deporte']

type Duplicada = Extract<ResultadoDuplicadas, { ok: true }>

// API-Football en una selección: lo que respondió y el partido aceptado (el que se recordará al
// guardar). `clave` = partido escrito cuando se consultó (si cambia, ya no vale).
type ApiSeleccion = {
  clave: string
  nivel: ResultadoSeleccion['nivel']
  partidos: PartidoCliente[]
  elegido: PartidoCliente | null
  sugerencias: { dia?: string; hora?: string; liga?: string }
}

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
      const igual = buscarPorNombre(casasIniciales, props.casaDetectada)
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
  const nDudosos = Object.values(dudosos).filter(esAmbar).length

  // Comprobación al abrir y ~0,6 s después de cada cambio. Las respuestas antiguas se ignoran.
  const casaPendiente =
    !valores.casa_id && !!props.casaDetectada && !buscarPorNombre(casas, props.casaDetectada)
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

  // ---------- fecha de la apuesta = día del último partido ----------
  // Apuesta NUEVA (captura o a mano): la fecha sigue al último partido mientras no la cambies a
  // mano. Al editar una guardada nunca cambia sola (hay un botón para pedirlo).
  const fechaSigue = modo === 'revision' && !apuestaId
  const [fechaManual, setFechaManual] = useState(false)
  const partido = useMemo(() => ultimoPartido(valores.selecciones), [valores.selecciones])
  useEffect(() => {
    setValores((v) => {
      const dia = diaSegunPartido({ fecha: v.fecha.slice(0, 10), nueva: fechaSigue, manual: fechaManual, partido })
      return dia === v.fecha.slice(0, 10) ? v : { ...v, fecha: dia }
    })
  }, [fechaSigue, fechaManual, partido, setValores])

  // La cola guarda lo que se va editando (para la apuesta siguiente de la tanda).
  const onCambioValores = props.onCambioValores
  useEffect(() => {
    onCambioValores?.(valores)
  }, [valores, onCambioValores])

  // ---------- partidos conocidos ----------
  // Al abrir y ~0,6 s después de cambiar un partido: rellena SOLO los campos vacíos con lo que se
  // sabe de ese partido (antes, de esta tanda; si no, de tus apuestas guardadas). Una vez por
  // selección y partido. Si la búsqueda falla, no pasa nada (se queda sin rellenar).
  const buscarConocidos = modo === 'revision' && !apuestaId
  const [deducidos, setDeducidos] = useState<Record<number, Deducido>>({})
  const aplicados = useRef(new Set<string>())
  const consultaPartidos = useRef(0)
  const valoresRef = useRef(valores)
  useEffect(() => {
    valoresRef.current = valores
  }, [valores])
  const conocidosTanda = props.conocidosTanda
  const clavesEventos = valores.selecciones.map((s) => claveConocida(s.evento)).join('|')
  useEffect(() => {
    if (!buscarConocidos) return
    const id = ++consultaPartidos.current
    const t = setTimeout(async () => {
      const v = valoresRef.current
      const faltan = v.selecciones
        .map((s, i) => ({ s, i, clave: claveConocida(s.evento) }))
        .filter((x) => x.clave && !aplicados.current.has(`${x.i}|${x.clave}`) && CAMPOS_PARTIDO.some((c) => !x.s[c].trim()))
      if (faltan.length === 0) return
      const hoy = diaEnMadridTexto(new Date())
      const tanda = agruparConocidos(conocidosTanda ?? [])
      let guardados: Map<string, DiaConocido[]> | null = null
      if (faltan.some((x) => !proponerPartido(x.s, tanda, hoy))) {
        const r = await buscarPartidosConocidos({ eventos: faltan.map((x) => x.s.evento) }).catch(() => ({ ok: false }) as const)
        if (r.ok) guardados = new Map(Object.entries(r.partidos))
      }
      if (id !== consultaPartidos.current) return
      const nuevos: Record<number, Deducido> = {}
      for (const x of faltan) {
        aplicados.current.add(`${x.i}|${x.clave}`)
        const deTanda = proponerPartido(x.s, tanda, hoy)
        const prop = deTanda ?? (guardados ? proponerPartido(x.s, guardados, hoy) : null)
        if (!prop) continue
        nuevos[x.i] = { fuente: deTanda ? 'tanda' : 'otra_apuesta', origen: prop.origen, otros: prop.otrosDias, campos: Object.keys(prop.cambios) as CamposPartido[] }
      }
      if (Object.keys(nuevos).length === 0) return
      // Se aplica sobre los valores ACTUALES: nunca se pisa lo que ya tenga dato.
      setValores((actual) => ({
        ...actual,
        selecciones: actual.selecciones.map((s, i) => {
          const d = nuevos[i]
          if (!d) return s
          const prop = proponerPartido(s, new Map([[claveConocida(s.evento), [d.origen]]]), '0000-00-00')
          if (!prop) return s
          const n = { ...s }
          for (const [c, val] of Object.entries(prop.cambios)) if (!n[c as CamposPartido].trim()) n[c as CamposPartido] = val as string
          return n
        }),
      }))
      setDudosos((d) => {
        const n = { ...d }
        for (const [i, x] of Object.entries(nuevos)) for (const c of x.campos) n[`selecciones.${i}.${c}`] = x.fuente // el dato ya no "falta": sale de otra apuesta
        return n
      })
      setDeducidos((d) => ({ ...d, ...nuevos }))
    }, 600)
    return () => clearTimeout(t)
  }, [buscarConocidos, clavesEventos, conocidosTanda, setValores])

  // Elegir otro día del mismo partido (opciones con un toque): cambia día y hora y, si los había
  // rellenado esta función, también liga y deporte.
  function elegirDia(i: number, d: DiaConocido) {
    const indices = tipo === 'mismo_partido' ? valores.selecciones.map((_, j) => j) : [i]
    const ded = deducidos[i]
    setValores((v) => ({
      ...v,
      selecciones: v.selecciones.map((s, j) => {
        if (!indices.includes(j)) return s
        const n = { ...s, evento_fecha: d.dia, evento_hora: d.hora || s.evento_hora }
        if (ded?.campos.includes('liga') && d.liga) n.liga = d.liga
        if (ded?.campos.includes('deporte') && d.deporte) n.deporte = d.deporte
        return n
      }),
    }))
    if (ded) {
      const otros = [ded.origen, ...ded.otros].filter((x) => x.dia !== d.dia).sort((a, b) => (a.dia < b.dia ? 1 : -1))
      setDeducidos((x) => {
        const n = { ...x }
        for (const j of indices) if (n[j]) n[j] = { ...n[j], origen: d, otros }
        return n
      })
    }
  }

  // ---------- API-Football (solo fútbol) ----------
  // Al abrir y ~0,6 s después de cambiar el partido o su día: el servidor busca el partido en
  // API-Football (con caché y tope). Una coincidencia clara rellena hora, liga, día (si falta) y
  // "Fútbol", marcados "confirmado por API-Football"; varias → fichas "Partidos posibles"; otro día
  // → sugerencia. Nunca pisa lo que la captura muestra con claridad. Si falla, no pasa nada.
  const buscarApi = modo === 'revision' && !apuestaId
  const [apiSel, setApiSel] = useState<Record<number, ApiSeleccion>>({})
  const [avisoApi, setAvisoApi] = useState<string | null>(null)
  const consultadosApi = useRef(new Set<string>())
  const dudososRef = useRef(dudosos)
  useEffect(() => {
    dudososRef.current = dudosos
  }, [dudosos])
  const nombreFutbol = buscarDeporte(catalogo, 'Fútbol')?.nombre ?? 'Fútbol'
  const indicesPartido = (i: number) => (tipo === 'mismo_partido' ? valores.selecciones.map((_, j) => j) : [i])
  const clavesApi = valores.selecciones
    .map((s, i) => (tipo === 'mismo_partido' && i > 0 ? '' : `${claveConocida(s.evento)}|${s.evento_fecha}|${esDeFutbol(s.deporte) ? 1 : 0}`))
    .join('#')
  useEffect(() => {
    if (!buscarApi) return
    const t = setTimeout(async () => {
      const v = valoresRef.current
      const pedir = v.selecciones
        .map((s, i) => ({ s, i, clave: claveConocida(s.evento) }))
        .filter((x) => (tipo !== 'mismo_partido' || x.i === 0) && x.clave && ladosDelEvento(x.s.evento) && esDeFutbol(x.s.deporte))
        .filter((x) => !consultadosApi.current.has(`${x.i}|${x.clave}|${x.s.evento_fecha}`))
      if (!pedir.length) return
      for (const x of pedir) consultadosApi.current.add(`${x.i}|${x.clave}|${x.s.evento_fecha}`)
      const d = dudososRef.current
      const r: RespuestaConsulta | null = await fetch('/api/futbol/partidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selecciones: pedir.map((x) => ({
            indice: x.i,
            evento: x.s.evento.slice(0, 200),
            fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.s.evento_fecha) ? x.s.evento_fecha : '',
            hora: /^\d{2}:\d{2}$/.test(x.s.evento_hora.slice(0, 5)) && !esAmbar(d[`selecciones.${x.i}.evento_hora`]) ? x.s.evento_hora.slice(0, 5) : '',
            liga: esAmbar(d[`selecciones.${x.i}.liga`]) ? '' : x.s.liga.slice(0, 80),
            deporte: x.s.deporte.slice(0, 60),
          })),
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
      if (!r || !r.activa) return
      setAvisoApi(r.aviso)
      for (const res of r.resultados) {
        const x = pedir.find((y) => y.i === res.indice)
        if (!x) continue
        // Si el partido escrito ha cambiado mientras tanto, la respuesta ya no vale.
        if (claveConocida(valoresRef.current.selecciones[res.indice]?.evento) !== x.clave) continue
        if (res.nivel === 'clara') aplicarPartido(res.indice, res.partido, x.clave, { nivel: 'clara', partidos: [res.partido] })
        else
          setApiSel((a) => ({
            ...a,
            [res.indice]: { clave: x.clave, nivel: res.nivel, partidos: res.nivel === 'ninguna' ? [] : res.partidos, elegido: null, sugerencias: {} },
          }))
      }
    }, 600)
    return () => clearTimeout(t)
    // aplicarPartido usa refs y setters estables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscarApi, clavesApi, tipo])

  // Aplica un partido de la API (coincidencia clara, ficha elegida u "otro día" aceptado).
  function aplicarPartido(i: number, p: PartidoCliente, clave: string, base: Pick<ApiSeleccion, 'nivel' | 'partidos'>, forzarDia = false) {
    const indices = tipo === 'mismo_partido' ? valoresRef.current.selecciones.map((_, j) => j) : [i]
    const actual = valoresRef.current.selecciones[i]
    if (!actual) return
    const marcas: Marcas = {}
    for (const c of ['evento_fecha', 'evento_hora', 'liga', 'deporte'] as CampoPartido[]) marcas[c] = dudososRef.current[`selecciones.${i}.${c}`]
    const s = { evento_fecha: forzarDia ? p.fecha : actual.evento_fecha, evento_hora: actual.evento_hora, liga: actual.liga, deporte: actual.deporte }
    if (forzarDia) marcas.evento_fecha = 'api'
    const r = decidirRelleno(s, marcas, { ...p, liga_id: p.liga.apiId, liga: p.liga.apiNombreOriginal, pais: p.liga.pais, local_id: 0, visitante_id: 0, estado: '' }, p.liga.nombre, nombreFutbol)
    if (forzarDia) r.cambios.evento_fecha = p.fecha
    const campos = Object.keys(r.cambios) as CampoPartido[]
    if (campos.includes('evento_fecha')) for (const j of indices) consultadosApi.current.add(`${j}|${clave}|${r.cambios.evento_fecha}`)
    if (campos.length) {
      setValores((v) => ({
        ...v,
        selecciones: v.selecciones.map((x, j) => (indices.includes(j) ? { ...x, ...r.cambios } : x)),
      }))
      setDudosos((d) => {
        const n = { ...d }
        for (const j of indices) for (const c of campos) n[`selecciones.${j}.${c}`] = 'api'
        return n
      })
    }
    setApiSel((a) => ({ ...a, [i]: { clave, ...base, elegido: p, sugerencias: r.sugerencias } }))
    // API-Football tiene prioridad sobre "partidos conocidos": su aviso deja de mostrarse.
    setDeducidos((d) => {
      if (!d[i]) return d
      const n = { ...d }
      delete n[i]
      return n
    })
  }

  // "No es este partido": se quita la confirmación (los datos quedan, editables) y no se recuerda.
  function descartarPartidoApi(i: number) {
    const indices = indicesPartido(i)
    setDudosos((d) => {
      const n = { ...d }
      for (const [k, m] of Object.entries(d)) {
        const r = /^selecciones\.(\d+)\./.exec(k)
        if (m === 'api' && r && indices.includes(Number(r[1]))) n[k] = 'deducido'
      }
      return n
    })
    setApiSel((a) => ({ ...a, [i]: { ...a[i], nivel: 'ninguna', partidos: [], elegido: null, sugerencias: {} } }))
  }

  // Sugerencia aceptada (la captura decía otra hora u otra liga).
  function usarSugerencia(i: number, campo: 'evento_hora' | 'liga', valor: string) {
    const indices = indicesPartido(i)
    setValores((v) => ({ ...v, selecciones: v.selecciones.map((x, j) => (indices.includes(j) ? { ...x, [campo]: valor } : x)) }))
    setDudosos((d) => {
      const n = { ...d }
      for (const j of indices) n[`selecciones.${j}.${campo}`] = 'api'
      return n
    })
    setApiSel((a) => {
      const sug = { ...a[i].sugerencias }
      delete sug[campo === 'evento_hora' ? 'hora' : 'liga']
      return { ...a, [i]: { ...a[i], sugerencias: sug } }
    })
  }

  // Al GUARDAR: los partidos aceptados (y que siguen siendo el mismo partido escrito) se recuerdan.
  function eleccionesApi(v: ValoresFormulario) {
    return Object.entries(apiSel)
      .map(([k, a]) => ({ i: Number(k), a }))
      .filter(({ i, a }) => a.elegido && v.selecciones[i] && claveConocida(v.selecciones[i].evento) === a.clave)
      .map(({ i, a }) => ({ partidoId: a.elegido!.id, fecha: a.elegido!.fecha, evento: v.selecciones[i].evento.slice(0, 200), liga: v.selecciones[i].liga.slice(0, 80) }))
  }

  // ---------- casa de la tanda ----------
  const origenCasa = props.origenCasa
  const avisoCasa = props.avisoCasa ?? null
  const [casaInicialId] = useState(() => valores.casa_id)
  const [creandoCasa, setCreandoCasa] = useState(false)
  const [errorCasa, setErrorCasa] = useState<string | null>(null)
  // "Usar X" (ya está en tu catálogo) o "Crear y usar X".
  async function usarCasaDeLaCaptura(nombre: string) {
    const existente = buscarPorNombre(casas, nombre)
    if (existente) return cambiar('casa_id', existente.id)
    setCreandoCasa(true)
    setErrorCasa(null)
    const r = await crearCasa(nombre).catch(() => ({ ok: false as const, error: 'No se ha podido crear la casa. Inténtalo de nuevo.' }))
    setCreandoCasa(false)
    if (!r.ok) return setErrorCasa(r.error)
    setCasas((c) => (c.some((x) => x.id === r.opcion.id) ? c : [...c, r.opcion].sort(porNombre)))
    props.onOpcionCreada?.('casa', r.opcion)
    cambiar('casa_id', r.opcion.id)
  }

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
    if (clave === 'fecha') setFechaManual(true) // cambiada a mano: ya no sigue al partido
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
      const elecciones = buscarApi ? eleccionesApi(aGuardar) : []
      if (elecciones.length) {
        // Sin esperar y sin bloquear: si falla, la apuesta ya está guardada.
        fetch('/api/futbol/recordar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ elecciones }),
          keepalive: true,
        }).catch(() => null)
      }
      onGuardada(r.id, aGuardar)
    })
  }

  // ---------- pintar ----------

  // Tarjeta de API-Football bajo los datos del partido de la selección i.
  const tarjetaApi = (i: number) => {
    const a = apiSel[i]
    const sel = valores.selecciones[i]
    if (!buscarApi || !a || !sel || claveConocida(sel.evento) !== a.clave) return null
    if (!a.elegido && a.nivel === 'ninguna') return null
    const ligasFutbol = ligasDe(catalogo, nombreFutbol).filter((l) => !l.archivada).map((l) => l.nombre)
    return (
      <PartidoApiFutbol
        a={a}
        sel={sel}
        ligasFutbol={ligasFutbol}
        ligaEnCatalogo={!sel.liga.trim() || !!buscarLiga(catalogo, sel.deporte, sel.liga)}
        onElegir={(p, forzarDia) => aplicarPartido(i, p, a.clave, { nivel: a.nivel, partidos: a.partidos }, forzarDia)}
        onDescartar={() => descartarPartidoApi(i)}
        onSugerencia={(c, v) => usarSugerencia(i, c, v)}
        onLiga={(l) => cambiarLiga(indicesPartido(i), l)}
      />
    )
  }

  const p = (clave: string) => ({ motivo: dudosos[clave], error: errores[clave] })
  // En "mismo partido", un campo común está a revisar si lo está en cualquier selección.
  const pComun = (c: string) => {
    const i = valores.selecciones.findIndex((_, j) => dudosos[`selecciones.${j}.${c}`])
    return { motivo: i >= 0 ? dudosos[`selecciones.${i}.${c}`] : undefined, error: errores[`selecciones.0.${c}`] }
  }
  // Con la casa elegida por el usuario, la IA no propone crear otra (eso va por el aviso).
  const casaSinCrear =
    props.origenCasa !== 'tuya' && props.casaDetectada && !buscarPorNombre(casas, props.casaDetectada)
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

      {buscarApi && avisoApi && (
        <p role="status" data-aviso-api="" className="rounded-xl bg-surface px-3 py-2 text-xs text-muted">
          {avisoApi}
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
          {origenCasa && valores.casa_id && valores.casa_id === casaInicialId && (
            <span className="mt-1 block text-xs text-muted" data-origen-casa={origenCasa}>
              Casa: {origenCasa === 'tuya' ? 'elegida por ti' : 'detectada por la IA'}
            </span>
          )}
          {avisoCasa && valores.casa_id !== buscarPorNombre(casas, avisoCasa)?.id && (
            <div role="status" data-aviso-casa="" className="mt-2 space-y-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <p>La captura parece de {avisoCasa}.</p>
              <button
                type="button"
                disabled={creandoCasa}
                onClick={() => void usarCasaDeLaCaptura(avisoCasa)}
                className="h-11 rounded-xl border border-amber-500/50 bg-surface px-3 text-sm font-semibold text-foreground disabled:opacity-60"
              >
                {buscarPorNombre(casas, avisoCasa) ? `Usar ${avisoCasa}` : `Crear y usar ${avisoCasa}`}
              </button>
              {errorCasa && <p className="text-red-600 dark:text-red-400">{errorCasa}</p>}
            </div>
          )}
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

        <Campo
          etiqueta="Día de la apuesta"
          ayuda={fechaSigue ? 'Por defecto, el día del último partido (o hoy, si no hay día de partido).' : 'Cuándo la hiciste (hoy, si lo dejas vacío).'}
          {...p('fecha')}
        >
          <Entrada type="date" value={valores.fecha.slice(0, 10)} onChange={(d) => cambiar('fecha', d)} marca={dudosos.fecha} conError={!!errores.fecha} />
          {fechaSigue && !fechaManual && partido && valores.fecha.slice(0, 10) === partido.dia && (
            <span className="mt-1 block text-xs text-muted" data-nota="fecha-partido">
              Fecha tomada del partido ({textoDiaHora(partido)}).
            </span>
          )}
          {!fechaSigue && modo === 'edicion' && partido && valores.fecha.slice(0, 10) !== partido.dia && (
            <button
              type="button"
              onClick={() => cambiar('fecha', partido.dia)}
              className="mt-2 h-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
            >
              Usar la fecha del partido ({textoDiaHora(partido)})
            </button>
          )}
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
            <SelectorHora valor={valores.selecciones[0]?.evento_hora ?? ''} onCambio={(v) => cambiarComun('evento_hora', v)} marcado={esAmbar(pComun('evento_hora').motivo)} conError={!!errores['selecciones.0.evento_hora']} />
          </Campo>
          {deducidos[0] && <PartidoConocido d={deducidos[0]} onElegir={(dia) => elegirDia(0, dia)} />}
          {tarjetaApi(0)}
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
              partidoConocido={
                <>
                  {deducidos[i] && <PartidoConocido d={deducidos[i]} onElegir={(dia) => elegirDia(i, dia)} />}
                  {tipo !== 'mismo_partido' && tarjetaApi(i)}
                </>
              }
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

// Aviso bajo los datos de un partido rellenados con otro que ya registraste: de dónde salen y,
// si el partido está en varios días recientes, los demás para elegir con un toque.
function PartidoConocido({ d, onElegir }: { d: Deducido; onElegir: (dia: DiaConocido) => void }) {
  return (
    <div className="space-y-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-partido-conocido={d.fuente}>
      <p>
        {d.fuente === 'tanda' ? 'Deducido de una apuesta anterior de esta tanda' : 'Deducido de otra apuesta tuya'}: partido del{' '}
        {textoDiaHora(d.origen)}
        {d.origen.liga ? ` · ${d.origen.liga}` : ''}. Compruébalo.
      </p>
      {d.otros.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Otros días:</span>
          {d.otros.map((o) => (
            <button
              key={o.dia}
              type="button"
              data-otro-dia={o.dia}
              onClick={() => onElegir(o)}
              className="h-9 rounded-full border border-amber-500/50 bg-surface px-3 text-xs font-semibold text-foreground"
            >
              {textoDiaHora(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
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
  partidoConocido,
}: {
  deporteLiga: ReactNode
  partidoConocido?: ReactNode
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
            <SelectorHora valor={s.evento_hora} onCambio={(v) => onCambio('evento_hora', v)} marcado={esAmbar(dudosos[k('evento_hora')])} conError={!!errores[k('evento_hora')]} />
          </Campo>
          {partidoConocido}
        </>
      )}
      <Campo etiqueta={tipo === 'mismo_partido' ? 'Estado de la condición' : 'Estado de la selección'} {...ps('estado')}>
        <Desplegable value={s.estado} onChange={(v) => onCambio('estado', v)} marca={dudosos[k('estado')]} opciones={ESTADOS_SELECCION.map((e) => [e, NOMBRE_ESTADO[e]])} />
      </Campo>
    </li>
  )
}

// ---------- API-Football ----------

const CLASE_FICHA = 'min-h-11 w-full rounded-xl border border-sky-500/40 bg-surface px-3 py-2 text-left text-sm text-foreground'

function PartidoApiFutbol({
  a,
  sel,
  ligasFutbol,
  ligaEnCatalogo,
  onElegir,
  onDescartar,
  onSugerencia,
  onLiga,
}: {
  a: ApiSeleccion
  sel: ValoresSeleccion
  ligasFutbol: string[]
  ligaEnCatalogo: boolean
  onElegir: (p: PartidoCliente, forzarDia: boolean) => void
  onDescartar: () => void
  onSugerencia: (campo: 'evento_hora' | 'liga', valor: string) => void
  onLiga: (liga: string) => void
}) {
  const e = a.elegido
  if (!e) {
    const otroDia = a.nivel === 'otro_dia'
    return (
      <div className="space-y-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200" data-api-futbol={a.nivel}>
        <p className="font-semibold">
          {otroDia ? `La API indica otro día para este partido${sel.evento_fecha ? ` (la captura dice el ${textoDia(sel.evento_fecha)})` : ''}:` : 'Partidos posibles (API-Football): elige el tuyo'}
        </p>
        <ul className="space-y-2">
          {a.partidos.map((p) => (
            <li key={p.id}>
              <button type="button" data-partido-posible={p.id} onClick={() => onElegir(p, otroDia)} className={CLASE_FICHA}>
                <span className="block font-semibold">
                  {p.local} - {p.visitante}
                </span>
                <span className="block text-xs text-muted">
                  {textoDia(p.fecha, p.hora || undefined)} · {p.liga.apiNombre}
                  {otroDia ? ' · Usar este día' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const sug = a.sugerencias
  return (
    <div className="space-y-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200" data-api-futbol="confirmado">
      <p>
        <strong>✓ Confirmado por API-Football:</strong> {e.local} - {e.visitante} · {textoDia(e.fecha, e.hora || undefined)} · {e.liga.apiNombre}
      </p>
      {sug.dia && sug.dia !== sel.evento_fecha && (
        <div className="flex flex-wrap items-center gap-2">
          <span>La API indica el {textoDia(sug.dia)}.</span>
          <button type="button" onClick={() => onElegir(e, true)} className="h-11 rounded-xl border border-sky-500/50 bg-surface px-3 text-sm font-semibold text-foreground">
            Usar el {textoDia(sug.dia)}
          </button>
        </div>
      )}
      {sug.hora && sug.hora !== sel.evento_hora.slice(0, 5) && (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            La captura dice {sel.evento_hora.slice(0, 5)}; la API indica {sug.hora}.
          </span>
          <button type="button" onClick={() => onSugerencia('evento_hora', sug.hora!)} className="h-11 rounded-xl border border-sky-500/50 bg-surface px-3 text-sm font-semibold text-foreground">
            Usar {sug.hora}
          </button>
        </div>
      )}
      {sug.liga && sug.liga !== sel.liga && (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            La captura dice «{sel.liga}»; la API indica «{sug.liga}».
          </span>
          <button type="button" onClick={() => onSugerencia('liga', sug.liga!)} className="h-11 rounded-xl border border-sky-500/50 bg-surface px-3 text-sm font-semibold text-foreground">
            Usar «{sug.liga}»
          </button>
        </div>
      )}
      {!ligaEnCatalogo && ligasFutbol.length > 0 && (
        <label className="block space-y-1">
          <span className="block text-xs">«{sel.liga}» no está en tu catálogo: créala arriba («Crear y usar») o usa una de tus ligas.</span>
          <select
            value=""
            data-usar-mi-liga=""
            onChange={(ev) => ev.target.value && onLiga(ev.target.value)}
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-foreground"
          >
            <option value="">Usar una de mis ligas…</option>
            {ligasFutbol.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" onClick={onDescartar} className="h-11 text-sm font-medium text-sky-800 underline dark:text-sky-300">
        No es este partido
      </button>
    </div>
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
  // Archivados: fuera de las opciones, salvo el elegido (que se marca y ofrece "Recuperar").
  const dElegido = buscarDeporte(catalogo, deporte)
  const lElegida = buscarLiga(catalogo, deporte, liga)
  const deportes = catalogo.deportes.filter((d) => !d.archivada || d.id === dElegido?.id).map((d) => d.nombre)
  const ligas = ligasDe(catalogo, deporte)
    .filter((l) => !l.archivada || l.id === lElegida?.id)
    .map((l) => l.nombre)
  const deporteEnCatalogo = catalogo.deportes.some((d) => d.nombre === deporte)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Deporte" {...pDeporte}>
          <SelectorCatalogo
            valor={deporte}
            opciones={deportes}
            archivada={!!dElegido?.archivada}
            recuperar={() => recuperarCatalogo('deporte', deporte)}
            vacio="Elige…"
            textoNuevo="+ Nuevo deporte…"
            emoji={emojiDeporte}
            marcado={esAmbar(pDeporte.motivo)}
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
            archivada={!!lElegida?.archivada}
            recuperar={() => recuperarCatalogo('liga', liga, deporte)}
            vacio="Sin liga"
            textoNuevo="+ Nueva liga…"
            marcado={esAmbar(pLiga.motivo)}
            conError={!!pLiga.error}
            esNueva={pLiga.motivo === 'nueva' || pLiga.motivo === 'api'}
            origenNueva={pLiga.motivo === 'api' ? 'API-Football indica' : undefined}
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
        {motivo === 'api' ? (
          <span data-confirmado-api="" className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
            ✓ {NOMBRE_MOTIVO.api}
          </span>
        ) : (
          motivo && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              revisar · {NOMBRE_MOTIVO[motivo]}
            </span>
          )
        )}
      </div>
      <IdCampo value={{ id, descripcion }}>{children}</IdCampo>
      <span id={descripcion}>
        {motivo && <span className="sr-only">{motivo === 'api' ? `${NOMBRE_MOTIVO.api}. ` : `A revisar: ${NOMBRE_MOTIVO[motivo]}. `}</span>}
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
      className={clasesEntrada(esAmbar(marca), conError)}
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
    <select id={id} aria-describedby={descripcion} value={value} onChange={(e) => onChange(e.target.value)} className={clasesEntrada(esAmbar(marca), conError)}>
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  )
}
