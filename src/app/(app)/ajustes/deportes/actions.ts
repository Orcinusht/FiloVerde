'use server'

import { revalidatePath } from 'next/cache'
import * as catalogo from '@/lib/server/acciones-catalogo'

// Ajustes → Deportes y ligas. Borrar o renombrar NO cambia las apuestas ya guardadas.

export async function renombrarDeporte(id: string, nombre: string) {
  const r = await catalogo.renombrar('deportes', id, nombre)
  revalidatePath('/ajustes/deportes')
  return r
}
export async function borrarDeporte(id: string) {
  const r = await catalogo.borrar('deportes', id)
  revalidatePath('/ajustes/deportes')
  return r
}
export async function renombrarLiga(id: string, nombre: string) {
  const r = await catalogo.renombrar('ligas', id, nombre)
  revalidatePath('/ajustes/deportes')
  return r
}
export async function borrarLiga(id: string) {
  const r = await catalogo.borrar('ligas', id)
  revalidatePath('/ajustes/deportes')
  return r
}
export async function anadirLiga(deporte: string, nombre: string) {
  const r = await catalogo.crearLiga(deporte, nombre)
  revalidatePath('/ajustes/deportes')
  return r
}
export async function anadirDeporte(nombre: string) {
  const r = await catalogo.crearDeporte(nombre)
  revalidatePath('/ajustes/deportes')
  return r
}
