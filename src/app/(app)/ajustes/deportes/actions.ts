'use server'

import { revalidatePath } from 'next/cache'
import * as catalogo from '@/lib/server/acciones-catalogo'
import type { TipoCatalogo } from '@/lib/apuestas/catalogo-gestion'

// Ajustes → Deportes y ligas. Renombrar cambia el nombre en el catálogo Y en tus apuestas (todo o
// nada). Tras cambiar algo se refresca toda la app (Análisis agrupa por estos nombres).
const refrescar = () => revalidatePath('/', 'layout')

export async function anadirDeporte(nombre: string) {
  const r = await catalogo.crearDeporte(nombre)
  refrescar()
  return r
}
export async function anadirLiga(deporte: string, nombre: string) {
  const r = await catalogo.crearLiga(deporte, nombre)
  refrescar()
  return r
}
export async function previsualizarRenombrado(tipo: TipoCatalogo, id: string) {
  return catalogo.previsualizar(tipo, id)
}
export async function renombrarEnTodo(tipo: TipoCatalogo, id: string, nombre: string, n: number, m: number) {
  const r = await catalogo.renombrar(tipo, id, nombre, n, m)
  refrescar()
  return r
}
export async function archivarCatalogo(tipo: TipoCatalogo, id: string, archivada: boolean) {
  const r = await catalogo.archivar(tipo, id, archivada)
  refrescar()
  return r
}
export async function borrarCatalogo(tipo: TipoCatalogo, id: string) {
  const r = await catalogo.borrar(tipo, id)
  refrescar()
  return r
}
// Desde la revisión de una captura: recuperar un deporte o una liga archivados por su nombre.
export async function recuperarCatalogo(tipo: TipoCatalogo, nombre: string, deporte?: string) {
  const r = await catalogo.recuperarPorNombre(tipo, nombre, deporte)
  refrescar()
  return r
}
