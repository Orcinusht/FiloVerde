'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { borrarApuesta } from '@/app/(app)/apuestas/actions'
import { valoresVacios, type Opcion, type ValoresFormulario } from '@/lib/apuestas/formulario'
import type { Catalogo } from '@/lib/apuestas/catalogo'
import { FormularioApuesta, resultadoEscritoAMano } from './formulario-apuesta'
import { DeporteConEmoji } from './deporte-con-emoji'
import { avisarAlVolver, rutaDeVuelta } from '@/lib/navegador/volver-a-lista'

// Detalle de una apuesta guardada (sin captura: las capturas se borran al guardar).
//  · Arriba, un resumen y el panel "Estado y resultado" (+ Precipitada) con su Guardar.
//  · Debajo, "Editar apuesta" despliega el resto del formulario, y el borrado.
// Las dos partes comparten los datos: cualquier Guardar guarda todo.
export function EditarApuesta({
  id,
  valores: inicial,
  resumen,
  casas,
  estrategias,
  catalogo,
}: {
  catalogo: Catalogo
  id: string
  valores: ValoresFormulario
  resumen: { titulo: string; deporte: string | null; evento: string | null }
  casas: Opcion[]
  estrategias: Opcion[]
}) {
  const router = useRouter()
  const compartido = useState<ValoresFormulario>(inicial)
  const [editando, setEditando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrando, iniciar] = useTransition()

  function borrar() {
    setError(null)
    iniciar(async () => {
      const r = await borrarApuesta(id)
      if (!r.ok) {
        setError(r.error ?? 'No se ha podido borrar.')
        return
      }
      volver('Apuesta borrada')
    })
  }

  // Tras guardar o borrar bien: a la lista de la que venía (con sus filtros), REEMPLAZANDO
  // esta pantalla en el historial (Atrás no la vuelve a abrir) y con datos frescos.
  function volver(aviso: string) {
    avisarAlVolver(aviso)
    router.replace(rutaDeVuelta(), { scroll: false })
    router.refresh()
  }

  const alGuardar = () => volver('Apuesta guardada')
  const comunes = {
    inicial,
    compartido,
    casas,
    estrategias,
    catalogo,
    apuestaId: id,
    resultadoManual: resultadoEscritoAMano(inicial),
    onGuardada: alGuardar,
  }

  return (
    <>
      <div className="mx-4 mb-4 min-w-0 rounded-2xl border border-border bg-surface p-4">
        <p className="truncate font-semibold">{resumen.titulo}</p>
        {resumen.deporte && (
          <p className="truncate text-sm text-muted">
            <DeporteConEmoji nombre={resumen.deporte} />
          </p>
        )}
        {resumen.evento && <p className="truncate text-sm">{resumen.evento}</p>}
      </div>

      <FormularioApuesta {...comunes} modo="panel" textoGuardar="Guardar" />

      <div className="px-4 pb-8">
        <button
          type="button"
          aria-expanded={editando}
          onClick={() => setEditando((e) => !e)}
          className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-surface px-4 text-base font-semibold"
        >
          Editar apuesta <span aria-hidden="true">{editando ? '▴' : '▾'}</span>
        </button>
      </div>

      {editando && (
        <>
          <FormularioApuesta {...comunes} modo="edicion" textoGuardar="Guardar cambios" />
          <div className="px-4 pb-8">
            {!confirmar ? (
              <button
                type="button"
                onClick={() => setConfirmar(true)}
                className="h-12 w-full rounded-xl border border-red-500/40 text-base font-semibold text-red-600 dark:text-red-400"
              >
                Borrar apuesta
              </button>
            ) : (
              <div role="alertdialog" className="space-y-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
                <p className="text-sm font-medium">¿Seguro que quieres borrar esta apuesta? No se puede deshacer.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirmar(false)} className="h-12 rounded-xl border border-border font-semibold">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={borrar}
                    disabled={borrando}
                    className="h-12 rounded-xl bg-red-600 font-semibold text-white disabled:opacity-60"
                  >
                    {borrando ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </>
      )}
    </>
  )
}

// Registro a mano, sin captura.
export function NuevaManual({
  casas,
  estrategias,
  catalogo,
}: {
  casas: Opcion[]
  estrategias: Opcion[]
  catalogo: Catalogo
}) {
  const router = useRouter()
  return (
    <FormularioApuesta
      inicial={valoresVacios()}
      casas={casas}
      estrategias={estrategias}
      catalogo={catalogo}
      // Aviso de duplicada → "Descartar": no se crea nada y se vuelve a la lista.
      onDescartar={() => router.replace('/apuestas')}
      onGuardada={() => {
        router.push('/apuestas')
        router.refresh()
      }}
    />
  )
}
