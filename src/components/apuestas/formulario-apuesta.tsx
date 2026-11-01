'use client'

import { useId, useMemo, useState, useTransition, type ReactNode } from 'react'
import { guardarApuesta } from '@/app/(app)/apuestas/actions'
import { resultadoPropuesto } from '@/lib/apuestas/calculos'
import { cuotaADecimal } from '@/lib/apuestas/cuotas'
import { centimosATexto, textoACentimos } from '@/lib/apuestas/dinero'
import {
  ESTADOS_APUESTA,
  ESTADOS_SELECCION,
  NOMBRE_ESTADO,
  NOMBRE_TIPO,
  TIPOS_APUESTA,
  esEstadoApuesta,
} from '@/lib/apuestas/estados'
import {
  seleccionVacia,
  validarFormulario,
  type ValoresFormulario,
  type ValoresSeleccion,
} from '@/lib/apuestas/formulario'
import type { Opcion } from '@/lib/apuestas/formulario'
import { IdCampo, useIdCampo } from './id-campo'
import { SelectorOpcion } from './selector-opcion'
import { VisorCaptura } from './visor-captura'

type Props = {
  inicial: ValoresFormulario
  dudosos?: string[]
  casaDetectada?: string | null
  casas: Opcion[]
  estrategias: Opcion[]
  imagen?: string | null
  apuestaId?: string | null
  resultadoManual?: boolean
  textoGuardar?: string
  onGuardada: (id: string) => void
  onOpcionCreada?: (tipo: 'casa' | 'estrategia', o: Opcion) => void
  extra?: ReactNode
}

// Campos cuyo cambio recalcula el resultado económico propuesto.
const AFECTAN_RESULTADO = new Set(['estado', 'importe', 'cuota_total', 'ganancia_potencial', 'importe_recuperado'])

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
  const [dudosos, setDudosos] = useState(() => new Set(props.dudosos ?? []))
  const [resultadoManual, setResultadoManual] = useState(props.resultadoManual ?? false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  const avisos = useMemo(() => validarFormulario(valores).avisos, [valores])

  function quitarMarca(clave: string) {
    setDudosos((d) => {
      if (!d.has(clave)) return d
      const n = new Set(d)
      n.delete(clave)
      return n
    })
    setErrores((e) => {
      if (!e[clave]) return e
      const n = { ...e }
      delete n[clave]
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
    quitarMarca(`selecciones.${i}.${clave}`)
    setValores((v) => ({
      ...v,
      selecciones: v.selecciones.map((s, j) => (j === i ? { ...s, [clave]: valor } : s)),
    }))
  }

  function anadirSeleccion() {
    setValores((v) => ({
      ...v,
      tipo: v.tipo === 'simple' ? 'combinada' : v.tipo,
      selecciones: [...v.selecciones, seleccionVacia()],
    }))
  }

  function quitarSeleccion(i: number) {
    setValores((v) => ({ ...v, selecciones: v.selecciones.filter((_, j) => j !== i) }))
    // Las marcas de las selecciones siguientes se desplazan una posición.
    setDudosos((d) => {
      const n = new Set<string>()
      for (const k of d) {
        const m = /^selecciones\.(\d+)\.(.+)$/.exec(k)
        if (!m) n.add(k)
        else if (Number(m[1]) < i) n.add(k)
        else if (Number(m[1]) > i) n.add(`selecciones.${Number(m[1]) - 1}.${m[2]}`)
      }
      return n
    })
    setErrores({})
  }

  function guardar() {
    setErrorGeneral(null)
    const local = validarFormulario(valores)
    if (!local.ok) {
      setErrores(local.errores)
      setErrorGeneral('Revisa los campos marcados en rojo.')
      return
    }
    iniciar(async () => {
      const r = await guardarApuesta({ id: apuestaId ?? null, valores, imagen: imagen ?? null })
      if (!r.ok) {
        setErrores(r.errores ?? {})
        setErrorGeneral(r.error)
        return
      }
      onGuardada(r.id)
    })
  }

  const p = (clave: string) => ({ dudoso: dudosos.has(clave), error: errores[clave] })
  const estado = esEstadoApuesta(valores.estado) ? valores.estado : 'pendiente'
  const casaSinCrear =
    props.casaDetectada && !casas.some((c) => normalizar(c.nombre) === normalizar(props.casaDetectada!))
      ? props.casaDetectada
      : null

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

      {dudosos.size > 0 && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Los campos en <strong>ámbar</strong> no se leyeron con seguridad: compáralos con la captura.
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
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background p-1">
            {TIPOS_APUESTA.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => cambiar('tipo', t)}
                aria-pressed={valores.tipo === t}
                className={`h-10 rounded-lg text-sm font-medium ${
                  valores.tipo === t ? 'bg-brand text-brand-foreground' : 'text-muted'
                }`}
              >
                {NOMBRE_TIPO[t]}
              </button>
            ))}
          </div>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Importe (€)" {...p('importe')}>
            <Entrada
              inputMode="decimal"
              placeholder="10,00"
              value={valores.importe}
              onChange={(v) => cambiar('importe', v)}
              marcado={dudosos.has('importe')}
              conError={!!errores.importe}
            />
          </Campo>
          <Campo etiqueta="Cuota total" {...p('cuota_total')}>
            <Entrada
              inputMode="decimal"
              placeholder="1,85"
              value={valores.cuota_total}
              onChange={(v) => cambiar('cuota_total', v)}
              marcado={dudosos.has('cuota_total')}
              conError={!!errores.cuota_total}
            />
          </Campo>
        </div>

        <Campo
          etiqueta="Ganancia potencial (€)"
          ayuda="Lo que cobrarías si gana, incluido lo apostado."
          {...p('ganancia_potencial')}
        >
          <Entrada
            inputMode="decimal"
            placeholder={sugerirGanancia(valores)}
            value={valores.ganancia_potencial}
            onChange={(v) => cambiar('ganancia_potencial', v)}
            marcado={dudosos.has('ganancia_potencial')}
            conError={!!errores.ganancia_potencial}
          />
        </Campo>

        <Campo etiqueta="Fecha" ayuda={valores.fecha ? undefined : 'Si la dejas vacía, se guarda la de ahora.'} {...p('fecha')}>
          <Entrada
            type="datetime-local"
            value={valores.fecha}
            onChange={(v) => cambiar('fecha', v)}
            marcado={dudosos.has('fecha')}
            conError={!!errores.fecha}
          />
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
          <Desplegable
            value={valores.estado}
            onChange={(v) => cambiar('estado', v)}
            marcado={dudosos.has('estado')}
            opciones={ESTADOS_APUESTA.map((e) => [e, NOMBRE_ESTADO[e]])}
          />
        </Campo>

        {estado === 'cash_out' && (
          <Campo etiqueta="Importe recuperado con el cash out (€)" {...p('importe_recuperado')}>
            <Entrada
              inputMode="decimal"
              placeholder="0,00"
              value={valores.importe_recuperado}
              onChange={(v) => cambiar('importe_recuperado', v)}
              conError={!!errores.importe_recuperado}
            />
          </Campo>
        )}

        {estado !== 'pendiente' && (
          <Campo
            etiqueta="Resultado económico (€)"
            ayuda={
              resultadoManual
                ? 'Escrito a mano. Usa − para pérdidas.'
                : 'Calculado: beneficio (+) o pérdida (−). Puedes corregirlo.'
            }
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
                marcado={dudosos.has('resultado_economico')}
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

      <Grupo titulo={`Selecciones (${valores.selecciones.length})`}>
        {errores.selecciones && <p className="text-sm text-red-600 dark:text-red-400">{errores.selecciones}</p>}
        <ol className="space-y-3">
          {valores.selecciones.map((s, i) => {
            const ps = (c: keyof ValoresSeleccion) => p(`selecciones.${i}.${c}`)
            const marca = (c: keyof ValoresSeleccion) => dudosos.has(`selecciones.${i}.${c}`)
            const err = (c: keyof ValoresSeleccion) => !!errores[`selecciones.${i}.${c}`]
            return (
              <li key={i} className="space-y-3 rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Selección {i + 1}</span>
                  {valores.selecciones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarSeleccion(i)}
                      className="h-11 rounded-lg px-3 text-sm font-medium text-red-600 dark:text-red-400"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <Campo etiqueta="Evento" {...ps('evento')}>
                  <Entrada value={s.evento} placeholder="Equipo A - Equipo B" onChange={(v) => cambiarSeleccion(i, 'evento', v)} marcado={marca('evento')} conError={err('evento')} />
                </Campo>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <Campo etiqueta="Pronóstico" {...ps('pronostico')}>
                    <Entrada value={s.pronostico} placeholder="Equipo A" onChange={(v) => cambiarSeleccion(i, 'pronostico', v)} marcado={marca('pronostico')} conError={err('pronostico')} />
                  </Campo>
                  <Campo etiqueta="Cuota" {...ps('cuota')}>
                    <Entrada inputMode="decimal" value={s.cuota} placeholder="1,85" onChange={(v) => cambiarSeleccion(i, 'cuota', v)} marcado={marca('cuota')} conError={err('cuota')} />
                  </Campo>
                </div>
                <Campo etiqueta="Mercado" {...ps('mercado')}>
                  <Entrada value={s.mercado} placeholder="1X2, Más/menos goles…" onChange={(v) => cambiarSeleccion(i, 'mercado', v)} marcado={marca('mercado')} conError={err('mercado')} />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Liga" {...ps('liga')}>
                    <Entrada value={s.liga} onChange={(v) => cambiarSeleccion(i, 'liga', v)} marcado={marca('liga')} conError={err('liga')} />
                  </Campo>
                  <Campo etiqueta="Deporte" {...ps('deporte')}>
                    <Entrada value={s.deporte} placeholder="Fútbol" onChange={(v) => cambiarSeleccion(i, 'deporte', v)} marcado={marca('deporte')} conError={err('deporte')} />
                  </Campo>
                </div>
                <Campo etiqueta="Estado de la selección" {...ps('estado')}>
                  <Desplegable
                    value={s.estado}
                    onChange={(v) => cambiarSeleccion(i, 'estado', v)}
                    marcado={marca('estado')}
                    opciones={ESTADOS_SELECCION.map((e) => [e, NOMBRE_ESTADO[e]])}
                  />
                </Campo>
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          onClick={anadirSeleccion}
          className="h-12 w-full rounded-xl border border-dashed border-border text-sm font-semibold text-brand"
        >
          + Añadir selección
        </button>
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
        <button
          type="submit"
          disabled={guardando}
          className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-foreground disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : (props.textoGuardar ?? 'Guardar')}
        </button>
        {extra}
      </div>
    </form>
  )
}

// ---------- utilidades ----------

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
  if (v.selecciones.length === 1) return cuotaADecimal(v.selecciones[0].cuota) ?? null
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
    <fieldset className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function Campo({
  etiqueta,
  ayuda,
  dudoso,
  error,
  children,
}: {
  etiqueta: string
  ayuda?: string
  dudoso?: boolean
  error?: string
  children: ReactNode
}) {
  const id = useId()
  const descripcion = `${id}-d`
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {etiqueta}
        </label>
        {dudoso && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            revisar
          </span>
        )}
      </div>
      <IdCampo value={{ id, descripcion }}>{children}</IdCampo>
      <span id={descripcion}>
        {dudoso && <span className="sr-only">No se leyó con seguridad: revísalo. </span>}
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
    conError
      ? 'border-red-500 bg-red-500/5'
      : marcado
        ? 'border-amber-500 bg-amber-500/10'
        : 'border-border bg-background'
  }`
}

function Entrada({
  value,
  onChange,
  marcado,
  conError,
  type = 'text',
  inputMode,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  marcado?: boolean
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
      className={clasesEntrada(marcado, conError)}
    />
  )
}

function Desplegable({
  value,
  onChange,
  opciones,
  marcado,
}: {
  value: string
  onChange: (v: string) => void
  opciones: [string, string][]
  marcado?: boolean
}) {
  const { id, descripcion } = useIdCampo()
  return (
    <select
      id={id}
      aria-describedby={descripcion}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clasesEntrada(marcado)}
    >
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  )
}
