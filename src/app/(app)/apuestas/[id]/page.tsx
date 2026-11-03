import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { listarCasas, listarEstrategias, obtenerApuesta, obtenerCatalogo } from '@/lib/server/datos'
import { EditarApuesta } from '@/components/apuestas/editar-apuesta'
import { centimosATexto } from '@/lib/apuestas/dinero'
import { cuotaATexto } from '@/lib/apuestas/cuotas'
import { isoALocal } from '@/lib/apuestas/fechas'
import type { ValoresFormulario } from '@/lib/apuestas/formulario'
import { NOMBRE_TIPO } from '@/lib/apuestas/estados'
import { deporteResumen } from '@/lib/apuestas/catalogo'

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
  const [apuesta, casas, estrategias, catalogo] = await Promise.all([
    obtenerApuesta(id),
    listarCasas(),
    listarEstrategias(),
    obtenerCatalogo(),
  ])
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
    en_directo: apuesta.en_directo === true,
    viendo_partido: apuesta.viendo_partido === true,
    precipitada: apuesta.precipitada === true,
    recuperar_perdidas: apuesta.recuperar_perdidas === true,
    selecciones: apuesta.selecciones.map((s) => ({
      evento: s.evento ?? '',
      liga: s.liga ?? '',
      deporte: s.deporte ?? '',
      mercado: s.mercado ?? '',
      pronostico: s.pronostico ?? '',
      cuota: cuotaATexto(s.cuota),
      estado: s.estado,
      evento_fecha: s.evento_fecha ? String(s.evento_fecha).slice(0, 10) : '',
      evento_hora: s.evento_hora ? s.evento_hora.slice(0, 5) : '',
    })),
  }

  return (
    <EditarApuesta
      id={apuesta.id}
      valores={valores}
      resumen={{
        titulo: `${casas.find((c) => c.id === apuesta.casa_id)?.nombre ?? 'Sin casa'} · ${NOMBRE_TIPO[apuesta.tipo]}`,
        deporte: deporteResumen(apuesta.selecciones.map((s) => s.deporte)) || null,
        evento: apuesta.selecciones[0]?.evento ?? apuesta.selecciones[0]?.pronostico ?? null,
      }}
      casas={casas}
      estrategias={estrategias}
      catalogo={catalogo}
    />
  )
}
