import Link from 'next/link'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarError, usuarioActual } from '@/lib/server/capturas'
import { COLS_MOVIMIENTO, leerCasas } from '@/lib/bankroll/leer'
import type { Movimiento } from '@/lib/bankroll/calculos'
import { rutaVueltaSegura } from '@/lib/navegador/volver-a-lista'
import { AvisoError } from './piezas'
import { FormularioMovimiento, type ValoresMovimiento } from './formulario-movimiento'

// Carga lo necesario para el formulario (servidor) y lo muestra. `id` = null → alta.
type Busqueda = Record<string, string | string[] | undefined>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const diaEspana = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(d)

export async function EditorMovimiento({ id, sp }: { id: string | null; sp: Busqueda }) {
  await connection()
  const volver = rutaVueltaSegura(uno(sp.volver), '/bankroll')
  let casas: Awaited<ReturnType<typeof leerCasas>> = []
  let mov: Movimiento | null = null
  let ultimaCasa: string | null = null
  let fallo: 'sesion' | 'error' | 'no-existe' | null = null
  try {
    const supabase = await createClient()
    const userId = await usuarioActual(supabase)
    if (!userId) fallo = 'sesion'
    else {
      casas = await leerCasas(supabase, userId)
      if (id) {
        const ok = /^[0-9a-f-]{36}$/i.test(id)
        const { data, error } = ok
          ? await supabase.from('movimientos_bankroll').select(COLS_MOVIMIENTO).eq('id', id).eq('user_id', userId).maybeSingle()
          : { data: null, error: null }
        if (error) throw error
        if (!data) fallo = 'no-existe'
        else mov = { ...(data as unknown as Movimiento), importe: Number((data as unknown as Movimiento).importe) }
      } else {
        // Casa preseleccionada: la del último movimiento registrado.
        const { data, error } = await supabase
          .from('movimientos_bankroll')
          .select('casa_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) throw error
        ultimaCasa = data?.[0]?.casa_id ?? null
      }
    }
  } catch (e) {
    registrarError('bankroll:formulario', e)
    fallo = 'error'
  }
  if (fallo === 'sesion') return <AvisoError>Tu sesión ha caducado. Vuelve a entrar.</AvisoError>
  if (fallo === 'error') return <AvisoError>No se ha podido cargar el formulario. Recarga la página en unos segundos.</AvisoError>
  if (fallo === 'no-existe') {
    return (
      <div className="mx-4 mt-4 space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p>Este movimiento no existe. Puede que lo hayas borrado.</p>
        <Link href={volver} className="inline-flex h-11 items-center font-semibold text-brand">
          Volver
        </Link>
      </div>
    )
  }

  // Para un movimiento nuevo solo se preselecciona una casa NO archivada.
  const activas = casas.filter((c) => !c.archivada)
  const ids = new Set(activas.map((c) => c.id))
  const pedida = uno(sp.casa)
  const casaInicial = ids.has(pedida) ? pedida : ultimaCasa && ids.has(ultimaCasa) ? ultimaCasa : activas.length === 1 ? activas[0].id : ''
  const hoy = diaEspana(new Date())
  const inicial: ValoresMovimiento = mov
    ? {
        tipo: mov.tipo,
        dia: diaEspana(new Date(mov.fecha)),
        importe: mov.importe,
        casa_id: mov.casa_id,
        casa_destino_id: mov.casa_destino_id ?? '',
        notas: mov.notas ?? '',
      }
    : { tipo: 'deposito', dia: hoy, importe: null, casa_id: casaInicial, casa_destino_id: '', notas: '' }

  return <FormularioMovimiento id={id} inicial={inicial} casas={casas} hoy={hoy} volver={volver} />
}

export async function EnlaceVolver({ sp }: { sp: Promise<Busqueda> }) {
  const href = rutaVueltaSegura(uno((await sp).volver), '/bankroll')
  return (
    <Link href={href} className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
      ← Volver
    </Link>
  )
}
