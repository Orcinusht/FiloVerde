'use client'

import { createContext, useContext } from 'react'

// Une cada campo del formulario con su etiqueta y su texto de ayuda/error.
export const IdCampo = createContext<{ id?: string; descripcion?: string }>({})
export function useIdCampo() {
  return useContext(IdCampo)
}
