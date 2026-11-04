import { exportarSelecciones } from '@/lib/exportar/leer'
import { responderCsv } from '../responder'

// GET /api/exportar/selecciones — todas las selecciones del usuario en CSV (copia de seguridad).
export async function GET() {
  return responderCsv('selecciones', exportarSelecciones)
}
