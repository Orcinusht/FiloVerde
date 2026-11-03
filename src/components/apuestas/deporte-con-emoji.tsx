import { emojiDeporte } from '@/lib/apuestas/emojis'

// "⚽ Fútbol": el emoji es decoración (oculto a lectores de pantalla).
export function DeporteConEmoji({ nombre }: { nombre: string }) {
  const e = emojiDeporte(nombre)
  return (
    <>
      {e && (
        <span aria-hidden="true" className="mr-1">
          {e}
        </span>
      )}
      {nombre}
    </>
  )
}
