import { exportarApuestas } from '@/lib/exportar/leer'
import { responderCsv } from '../responder'

// GET /api/exportar/apuestas — todas las apuestas del usuario en CSV (copia de seguridad).
export async function GET() {
  return responderCsv('apuestas', exportarApuestas)
}
