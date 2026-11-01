import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { listarCasas, listarEstrategias, obtenerApuesta } from '@/lib/server/datos'
import { EditarApuesta } from '@/components/apuestas/editar-apuesta'
import { centimosATexto } from '@/lib/apuestas/dinero'
import { cuotaATexto } from '@/lib/apuestas/cuotas'
import { isoALocal } from '@/lib/apuestas/fechas'
import type { ValoresFormulario } from '@/lib/apuestas/formulario'

export const metadata = { title: 'Apuesta · Filoverde' }
export const maxDuration = 60

export default function Page({ params }: PageProps<'/apuestas/[id]'>) {
  return (
    <>
      <PageHeader
        title="Apuesta"
        accion={
          <Link href="/apuestas" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            ← Lista
          </Link>
        }
      />
      <Suspense fallback={<div className="mx-4 h-60 animate-pulse rounded-2xl bg-surface" />}>
        <Detalle params={params} />
      </Suspense>
    </>
  )
}

async function Detalle({ params }: { params: PageProps<'/apuestas/[id]'>['params'] }) {
  const { id } = await params
  const [apuesta, casas, estrategias] = await Promise.all([obtenerApuesta(id), listarCasas(), listarEstrategias()])
  if (!apuesta) notFound()

  const valores: ValoresFormulario = {
    casa_id: apuesta.casa_id ?? '',
    estrategia_id: apuesta.estrategia_id ?? '',
    tipo: apuesta.tipo,
    fecha: isoALocal(apuesta.fecha),
    importe: centimosATexto(apuesta.importe),
    cuota_total: cuotaATexto(apuesta.cuota_total),
    ganancia_potencial: centimosATexto(apuesta.ganancia_potencial),
    estado: apuesta.estado,
    resultado_economico: centimosATexto(apuesta.resultado_economico),
    // En un cash out guardado, lo recuperado = resultado + importe.
    importe_recuperado:
      apuesta.estado === 'cash_out' && apuesta.resultado_economico != null
        ? centimosATexto(apuesta.resultado_economico + apuesta.importe)
        : '',
    notas: apuesta.notas ?? '',
    selecciones: apuesta.selecciones.map((s) => ({
      evento: s.evento ?? '',
      liga: s.liga ?? '',
      deporte: s.deporte ?? '',
      mercado: s.mercado ?? '',
      pronostico: s.pronostico ?? '',
      cuota: cuotaATexto(s.cuota),
      estado: s.estado,
    })),
  }

  return (
    <EditarApuesta
      id={apuesta.id}
      valores={valores}
      imagen={apuesta.imagen_origen}
      resultadoGuardado={apuesta.resultado_economico != null}
      casas={casas}
      estrategias={estrategias}
    />
  )
}
