'use client'

import { useId, useMemo, useState, useTransition, type ReactNode } from 'react'
import { guardarApuesta } from '@/app/(app)/apuestas/actions'
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
  CAMPOS_COMUNES,
  ajustarPorTipo,
  seleccionVacia,
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
  onGuardada: (id: string) => void
  onOpcionCreada?: (tipo: 'casa' | 'estrategia', o: Opcion) => void
  catalogo: Catalogo
  onCatalogoCambiado?: (c: Catalogo) => void
  extra?: ReactNode
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
  const [valores, setValores] = useState<ValoresFormulario>(() => {
    const v = { ...props.inicial }
    if (!v.casa_id && props.casaDetectada) {
      const igual = casasIniciales.find((c) => normalizar(c.nombre) === normalizar(props.casaDetectada!))
      if (igual) v.casa_id = igual.id
    }
    return v
  })
  const [dudosos, setDudosos] = useState<Record<string, MotivoRevision>>(() => ({ ...(props.dudosos ?? {}) }))
  const [resultadoManual, setResultadoManual] = useState(props.resultadoManual ?? false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [cambioTipo, setCambioTipo] = useState<CambioTipo | null>(null)
  const [catalogo, setCatalogo] = useState<Catalogo>(props.catalogo)
  // Aviso por selección cuando al cambiar de deporte se vacía la liga.
  const [avisosLiga, setAvisosLiga] = useState<Record<number, string>>({})
  const [guardando, iniciar] = useTransition()

  const tipo: TipoApuesta = esTipoApuesta(valores.tipo) ? valores.tipo : 'simple'
  const estado = esEstadoApuesta(valores.estado) ? valores.estado : 'pendiente'
  const avisos = useMemo(() => validarFormulario(valores).avisos, [valores])
  const nDudosos = Object.keys(dudosos).length

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
    setValores((v) => {
      const nuevo = { ...v, [clave]: valor }
      return AFECTAN_RESULTADO.has(clave) && !resultadoManual ? recalcular(nuevo) : nuevo
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
  function cambiarEstado(nuevo: string) {
    quitarMarca('estado', 'resultado_economico')
    setResultadoManual(false)
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
      return recalcular({ ...v, estado: nuevo, selecciones })
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

  function guardar() {
    setErrorGeneral(null)
    const aGuardar = ajustarPorTipo(valores)
    const local = validarFormulario(aGuardar)
    if (!local.ok) {
      setErrores(local.errores)
      setErrorGeneral('Revisa los campos marcados en rojo.')
      return
    }
    iniciar(async () => {
      const r = await guardarApuesta({
        id: apuestaId ?? null,
        valores: aGuardar,
        imagen: imagen ?? null,
        transcripcionId: props.transcripcionId ?? null,
        indice: props.indice ?? null,
      })
      if (!r.ok) {
        setErrores(r.errores ?? {})
        setErrorGeneral(r.error)
        return
      }
      onGuardada(r.id)
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
      {imagen && <VisorCaptura ruta={imagen} />}

      {nDudosos > 0 && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Los campos en <strong>ámbar</strong> no se veían, estaban borrosos o la IA los ha deducido: compáralos con la
          captura.
        </p>
      )}

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

        {deporteDeLaApuesta && (
          <p className="text-sm">
            <span className="text-muted">Deporte de la apuesta: </span>
            <span className={`font-semibold ${deporteDeLaApuesta === DEPORTE_MIXTO ? 'rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-700 dark:text-violet-300' : ''}`}>
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

        <Campo etiqueta="Ganancia potencial (€)" ayuda="Lo que cobrarías si gana, incluido lo apostado." {...p('ganancia_potencial')}>
          <Entrada inputMode="decimal" placeholder={sugerirGanancia(valores)} value={valores.ganancia_potencial} onChange={(v) => cambiar('ganancia_potencial', v)} marca={dudosos.ganancia_potencial} conError={!!errores.ganancia_potencial} />
        </Campo>

        <Campo etiqueta="Fecha de la apuesta" ayuda={valores.fecha ? 'Cuándo la hiciste.' : 'Cuándo la hiciste. Si la dejas vacía, se guarda la de ahora.'} {...p('fecha')}>
          <Entrada type="datetime-local" value={valores.fecha} onChange={(v) => cambiar('fecha', v)} marca={dudosos.fecha} conError={!!errores.fecha} />
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

      <Grupo titulo="Estado y resultado">
        <Campo etiqueta="Estado de la apuesta" {...p('estado')}>
          <Desplegable value={valores.estado} onChange={cambiarEstado} marca={dudosos.estado} opciones={ESTADOS_APUESTA.map((e) => [e, NOMBRE_ESTADO[e]])} />
        </Campo>

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
      </Grupo>

      {tipo === 'mismo_partido' && (
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
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Día del partido" {...pComun('evento_fecha')}>
              <Entrada type="date" value={valores.selecciones[0]?.evento_fecha ?? ''} onChange={(v) => cambiarComun('evento_fecha', v)} marca={pComun('evento_fecha').motivo} conError={!!errores['selecciones.0.evento_fecha']} />
            </Campo>
            <Campo etiqueta="Hora" {...pComun('evento_hora')}>
              <Entrada type="time" value={valores.selecciones[0]?.evento_hora ?? ''} onChange={(v) => cambiarComun('evento_hora', v)} marca={pComun('evento_hora').motivo} conError={!!errores['selecciones.0.evento_hora']} />
            </Campo>
          </div>
        </Grupo>
      )}

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

      {avisos.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {avisos.map((a) => (
            <li key={a} className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              ⚠️ {a}
            </li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
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
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Día del evento" {...ps('evento_fecha')}>
              {ent('evento_fecha', { type: 'date' })}
            </Campo>
            <Campo etiqueta="Hora" {...ps('evento_hora')}>
              {ent('evento_hora', { type: 'time' })}
            </Campo>
          </div>
        </>
      )}
      <Campo etiqueta={tipo === 'mismo_partido' ? 'Estado de la condición' : 'Estado de la selección'} {...ps('estado')}>
        <Desplegable value={s.estado} onChange={(v) => onCambio('estado', v)} marca={dudosos[k('estado')]} opciones={ESTADOS_SELECCION.map((e) => [e, NOMBRE_ESTADO[e]])} />
      </Campo>
    </li>
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

function cuotaEfectiva(v: ValoresFormulario): number | null {
  const total = cuotaADecimal(v.cuota_total)
  if (total) return total
  if (v.tipo === 'simple' && v.selecciones.length === 1) return cuotaADecimal(v.selecciones[0].cuota) ?? null
  return null
}

function recalcular(v: ValoresFormulario): ValoresFormulario {
  if (!esEstadoApuesta(v.estado)) return v
  const r = resultadoPropuesto({
    estado: v.estado,
    importe: textoACentimos(v.importe) ?? null,
    cuota: cuotaEfectiva(v),
    gananciaPotencial: textoACentimos(v.ganancia_potencial) ?? null,
    recuperado: textoACentimos(v.importe_recuperado) ?? null,
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
}: {
  value: string
  onChange: (v: string) => void
  opciones: [string, string][]
  marca?: MotivoRevision
}) {
  const { id, descripcion } = useIdCampo()
  return (
    <select id={id} aria-describedby={descripcion} value={value} onChange={(e) => onChange(e.target.value)} className={clasesEntrada(!!marca)}>
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  )
}
