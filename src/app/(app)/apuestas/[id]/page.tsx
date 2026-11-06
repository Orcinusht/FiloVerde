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
import { rutaVueltaSegura } from '@/lib/navegador/volver-a-lista'

export const metadata = { title: 'Apuesta · Filoverde' }
export const maxDuration = 60

export default function Page({ params, searchParams }: PageProps<'/apuestas/[id]'>) {
  return (
    <>
      <PageHeader
        title="Apuesta"
        accion={
          <Suspense fallback={<EnlaceVuelta href="/apuestas" texto="← Lista" />}>
            <Vuelta searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<div className="mx-4 h-60 animate-pulse rounded-2xl bg-surface" />}>
        <Detalle params={params} />
      </Suspense>
    </>
  )
}

// "← Lista" o "← Análisis": vuelve a donde se abrió la apuesta (?volver=, solo rutas internas).
async function Vuelta({ searchParams }: { searchParams: PageProps<'/apuestas/[id]'>['searchParams'] }) {
  const v = (await searchParams).volver
  const href = rutaVueltaSegura(Array.isArray(v) ? v[0] : v)
  return <EnlaceVuelta href={href} texto={href.startsWith('/analisis') ? '← Análisis' : href.startsWith('/ajustes') ? '← Revisar' : '← Lista'} />
}

function EnlaceVuelta({ href, texto }: { href: string; texto: string }) {
  return (
    <Link href={href} className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
      {texto}
    </Link>
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
    // Solo el día; la hora guardada se conserva si no se cambia el día.
    fecha: isoALocal(apuesta.fecha).slice(0, 10),
    fecha_original: apuesta.fecha,
    importe: centimosATexto(apuesta.importe),
    cuota_total: cuotaATexto(apuesta.cuota_total),
    ganancia_potencial: centimosATexto(apuesta.ganancia_potencial),
    estado: apuesta.estado,
    resultado_economico: centimosATexto(apuesta.resultado_economico),
    // En un cash out guardado, lo recuperado = resultado + importe (con crédito: el resultado).
    importe_recuperado:
      apuesta.estado === 'cash_out' && apuesta.resultado_economico != null
        ? centimosATexto(apuesta.resultado_economico + (apuesta.promo_tipo === 'credito' ? 0 : apuesta.importe))
        : '',
    notas: apuesta.notas ?? '',
    en_directo: apuesta.en_directo === true,
    viendo_partido: apuesta.viendo_partido === true,
    precipitada: apuesta.precipitada === true,
    recuperar_perdidas: apuesta.recuperar_perdidas === true,
    promo: apuesta.promo_tipo != null,
    promo_tipo: apuesta.promo_tipo ?? '',
    promo_cuota_original: cuotaATexto(apuesta.promo_cuota_original),
    promo_aumento: centimosATexto(apuesta.promo_aumento),
    promo_base: apuesta.promo_base ?? '',
    promo_credito: centimosATexto(apuesta.promo_credito),
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
