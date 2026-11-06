// Geometría de las gráficas de línea (sin React ni base de datos): marcas del eje de euros,
// color según el resultado y qué punto se elige al tocar. La usa el componente del navegador
// (`components/grafica-linea.tsx`) y la prueba `npm test`.

export type Tono = 'positivo' | 'negativo' | 'neutro'

// Verde si el resultado final es > 0, rojo si es < 0 y neutro si es 0 (el color nunca va solo:
// junto a la gráfica se escribe el valor con su signo).
export const tonoDe = (v: number): Tono => (v > 0 ? 'positivo' : v < 0 ? 'negativo' : 'neutro')

// Marcas del eje: entre 3 y 6 valores "redondos" que incluyen el 0 y cubren [min, max].
export function marcasEje(min: number, max: number): number[] {
  min = Math.min(0, min)
  max = Math.max(0, max)
  if (min === max) {
    min = -100
    max = 100
  }
  const bruto = (max - min) / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot
  const marcas: number[] = []
  for (let v = Math.floor(min / paso) * paso; v <= max + paso * 0.001; v += paso) marcas.push(Math.round(v))
  if (marcas[marcas.length - 1] < max) marcas.push(marcas[marcas.length - 1] + paso)
  return marcas
}

// Punto más cercano al dedo, en píxeles de pantalla (x e y): así, si varios puntos quedan casi
// pegados en horizontal (varias apuestas el mismo día), se elige el que está a la altura del dedo.
// Empate: el primero. Lista vacía → -1.
export function puntoMasCercano(puntos: { x: number; y: number }[], x: number, y: number): number {
  let mejor = -1
  let dMejor = Infinity
  for (let i = 0; i < puntos.length; i++) {
    const dx = puntos[i].x - x
    const dy = puntos[i].y - y
    const d = dx * dx + dy * dy
    if (d < dMejor) {
      dMejor = d
      mejor = i
    }
  }
  return mejor
}

// Cuántos puntos hay a menos de `px` píxeles en horizontal del elegido (él incluido) y su posición
// entre ellos (1, 2…), para que la etiqueta diga "1 de 3 aquí" cuando estén casi pegados.
export function vecinos(xs: number[], i: number, px = 8): { total: number; posicion: number } {
  let total = 0
  let posicion = 0
  for (let j = 0; j < xs.length; j++) {
    if (Math.abs(xs[j] - xs[i]) < px) {
      total++
      if (j <= i) posicion++
    }
  }
  return { total, posicion }
}
