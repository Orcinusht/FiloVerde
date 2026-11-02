'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { borrarApuesta } from '@/app/(app)/apuestas/actions'
import { valoresVacios, type Opcion, type ValoresFormulario } from '@/lib/apuestas/formulario'
import type { Catalogo } from '@/lib/apuestas/catalogo'
import { FormularioApuesta } from './formulario-apuesta'

// Detalle de una apuesta guardada: editar cualquier campo (incluido el estado) y borrar.
export function EditarApuesta({
  id,
  valores,
  imagen,
  resultadoGuardado,
  casas,
  estrategias,
  catalogo,
}: {
  catalogo: Catalogo
  id: string
  valores: ValoresFormulario
  imagen: string | null
  resultadoGuardado: boolean
  casas: Opcion[]
  estrategias: Opcion[]
}) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrando, iniciar] = useTransition()
  const [guardado, setGuardado] = useState(false)

  function borrar() {
    setError(null)
    iniciar(async () => {
      const r = await borrarApuesta(id)
      if (!r.ok) {
        setError(r.error ?? 'No se ha podido borrar.')
        return
      }
      router.replace('/apuestas')
      router.refresh()
    })
  }

  return (
    <>
      {guardado && (
        <p role="status" className="mx-4 mb-3 rounded-xl bg-green-500/10 px-3 py-2 text-sm font-medium text-green-800 dark:text-green-300">
          ✓ Cambios guardados
        </p>
      )}
      <FormularioApuesta
        inicial={valores}
        casas={casas}
        estrategias={estrategias}
        catalogo={catalogo}
        imagen={imagen}
        apuestaId={id}
        resultadoManual={resultadoGuardado}
        textoGuardar="Guardar cambios"
        onGuardada={() => {
          setGuardado(true)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          router.refresh()
        }}
      />
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
            <p className="text-sm font-medium">¿Seguro que quieres borrar esta apuesta y su captura? No se puede deshacer.</p>
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
      onGuardada={() => {
        router.push('/apuestas')
        router.refresh()
      }}
    />
  )
}
