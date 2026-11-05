import { exportarMovimientos } from '@/lib/exportar/leer'
import { responderCsv } from '../responder'

// GET /api/exportar/bankroll — todos los movimientos de bankroll del usuario en CSV (copia de seguridad).
export async function GET() {
  return responderCsv('bankroll', exportarMovimientos)
}
