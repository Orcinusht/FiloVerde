// Reglas de PROMOCIONES de las instrucciones de la IA (desde la v8). Aparte del resto de las
// instrucciones (que son solo del servidor) para poder probarlas con `npm test`.

// Lo que SÍ es promoción (positivos) y lo que NO (negativos: ventajas o funciones de la casa).
export const SI_PROMOCION = [
  'Aumento de ganancias',
  'Superaumento',
  'Supercuota',
  'Cuota mejorada',
  'Boost',
  'Mejora de ganancias',
  'Apuesta gratuita',
  'Free bet',
  'Apuesta con crédito',
  'Bono de apuesta',
  'Reembolso',
  'Apuesta asegurada',
  'Apuesta sin riesgo',
] as const

export const NO_PROMOCION = [
  'Pago anticipado',
  '2 goles de ventaja',
  'Goles de ventaja',
  'Sustituto',
  'Sustituto+',
  'Cash out',
  'Cerrar apuesta',
  'Crear apuesta',
  'Bet Builder',
  'Apuesta rápida',
] as const

export const REGLAS_PROMOCION = `Promociones (de cada apuesta). SOLO lees; no calcules nada y no inventes:
- SÍ son promociones (y solo estas): mejoras de cuota o de ganancias, aumento, superaumento, apuesta gratis o con crédito, reembolso y apuesta sin riesgo. "promo_tipo" SOLO si la captura lo indica de forma explícita:
  · "superaumento": Superaumento, Supercuota (la captura muestra la cuota original TACHADA y la nueva).
  · "aumento": Aumento de ganancias, Mejora de ganancias, Cuota mejorada, Boost (la captura suele mostrar UNA sola cuota, que es la original, y las ganancias ya mejoradas).
  · "asegurada": Apuesta asegurada, Reembolso si pierdes, Apuesta sin riesgo.
  · "credito": Apuesta gratuita, Free bet, Apuesta con crédito, Bono de apuesta.
  · "otra": SOLO si la captura usa expresamente la palabra "promoción", "bono" u "oferta" para algo que no encaje arriba.
- NO son promociones (son ventajas o funciones de la casa: "promo_tipo" null y ningún campo de promoción): ${NO_PROMOCION.map((t) => `"${t}"`).join(', ')}. Tampoco lo es una etiqueta verde de "goles de ventaja" (la casa paga la victoria si tu equipo va ganando por 2 goles), ni un jugador sustituto en estadísticas de jugadores, ni una cuota alta.
  Ejemplos: "Pago anticipado - 2 goles de ventaja" en verde → promo_tipo null. "Sustituto+: Rafael Leao" → promo_tipo null (va en "sustituto"). "Aumento de ganancias 25%" → "aumento". "Apuesta sin riesgo" → "asegurada".
- "promo_cuota_original": SOLO la cuota original que aparece TACHADA junto a la nueva (superaumento), copiada tal cual. Si no hay cuota tachada (p. ej. en un aumento de ganancias), null: no la deduzcas ni pongas ningún valor por defecto. "promo_aumento": el aumento de ganancias en unidades de moneda, si aparece escrito. "promo_credito": en una asegurada, el crédito que devuelven si se pierde, si aparece escrito (p. ej. "hasta 10 €"). Lo que no aparezca, null; nunca lo calcules a partir de otros datos.`
