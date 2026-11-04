@AGENTS.md

# Filoverde

> Nombre provisional. **Todo lo que hay en este documento es revisable, incluida la base**
> (stack, estructura de datos, principios). Si algo deja de tener sentido, se propone el
> cambio, se explica qué cuesta y se anota en el registro de decisiones.

## Qué es

App móvil (PWA) para **registrar apuestas deportivas a partir de capturas** (una IA las
transcribe) y **analizar el rendimiento** por mercado, casa de apuestas y estrategia.

El usuario no es programador: explicar lo técnico en pocas palabras, guiar paso a paso
lo que tenga que hacer él y **nunca pedir claves secretas por el chat** (decir en qué
archivo o panel ponerlas).

### Fases
0. **Cimientos** (hecha): PWA vacía, login, base de datos con RLS, despliegue.
1. **Registrar apuestas** (**CERRADA el 2026-11-02**, verificada en el móvil y RLS en vivo 37/37):
   capturas → transcripción con IA (API de Claude, solo desde servidor) → revisión → guardado;
   lista, detalle, edición, borrado, registro manual, coste de la IA en Ajustes, varias apuestas
   por captura, tipo "mismo partido", catálogo de deportes y ligas, en directo y precipitada.
   **Retoques fusionados el 2026-11-03** (verificados en el móvil): las capturas se borran al
   guardar (solo se ven en la revisión), panel "Estado y resultado" en el detalle con "Editar
   apuesta" desplegable, guardar o borrar vuelve a la lista (con filtros, scroll y aviso breve),
   emojis de deporte y tarjeta de la lista con el resultado a la derecha.
   **Aviso de apuesta duplicada fusionado el 2026-11-03** (verificado en el móvil; sin migración).
   **Promociones y selector de minutos fusionados el 2026-11-04** (verificados en el móvil;
   migración `20261105000001` aplicada; RLS en vivo 46/46).
   **IA más fiable y jugadores sustituidos fusionados el 2026-11-04** (verificados en el móvil; sin
   migración): reintentos desde el móvil, 429 separado de la saturación, caché de Anthropic y regla
   del sustituto (instrucciones v5).
   **Cola de revisión, elección de apuestas, día de la apuesta y fecha del evento fusionados el
   2026-11-04** (verificados en el móvil; sin migración; instrucciones v6).
   **Copia de seguridad en CSV** (rama `exportar-csv`, 2026-11-04; sin migración): adelantada antes
   de la Fase 2. Pendiente de verificar en el móvil y de fusionar.
2. Gráficas y métricas.
3. Pendiente de definir.

### Pendiente (sin fase asignada salvo indicación; revisado el 2026-11-04, tras fusionar la cola de revisión)
- **SMTP propio** (p. ej. Resend) y **reactivar "Confirm email"** en Supabase antes de abrir la
  app a más gente.
- **Login con Apple** (descomentar en `login/providers.ts` + configurarlo en Supabase y Apple).
- **API-Football** u otra fuente de datos deportivos (Fase 2 o 3).
- **Importación de CSV** (restaurar una copia): no hecha; los CSV de la copia ya usan los códigos
  internos y los ids para poder hacerla más adelante.
- **Análisis del coste y del modelo de IA**: revisar en Ajustes el coste medio real por captura
  (por versión de instrucciones: v4 de promociones, v5 con caché y v6 de apuestas cortadas y fechas;
  comprobar en Vercel → Logs, `[ia:uso]`, que la caché se lee) y decidir si se mantiene `claude-sonnet-5-5` o se cambia.
- **Seguimiento del saldo y la caducidad de los créditos** de promoción (fuera de la ronda de
  promociones).
- **Modelo de reserva** (aparcado el 2026-11-04): SOLO si, tras los reintentos y la caché, siguen
  saliendo 529/429 en Vercel → Logs (`[ia:transcribir]`). Opción preferida: `claude-opus-5-5`
  (≈ 2× el coste, solo en esos casos; tiene su propio límite por minuto) con un aviso en la revisión
  "Leída con el modelo de reserva"; `claude-haiku-5-5` es mucho más barato pero lee peor capturas
  complejas. No choca con el plan B de rechazos (`fallbacks: "default"`).

## Principios

- **Móvil primero**, pensado para usarse con una mano (navegación inferior, botones de ≥ 44 px).
- **Datos en la nube con login.** Nada importante vive solo en el móvil.
- **La IA propone y el usuario decide.** Lo transcrito siempre se revisa antes de guardarse.
- **Apuesta y selecciones separadas.** Una apuesta (simple, combinada, mismo partido o sistema)
  tiene una o varias selecciones, cada una con su estado (y su cuota, salvo en "mismo partido").
- **Tipos:** `simple` (1 selección; su cuota es la cuota total) · `combinada` (≥ 2 eventos
  distintos, cada uno con cuota; la total se compara con el producto solo como aviso) ·
  `mismo_partido` ("Crear apuesta"/Bet Builder: ≥ 2 condiciones de UN partido, sin cuota por
  condición; solo cuenta la cuota total, nunca se multiplican: están correlacionadas) ·
  `sistema` (≥ 3 selecciones).
- **Estados de apuesta:** `pendiente`, `ganada`, `perdida`, `anulada`, `cash_out`,
  `media_ganada`, `media_perdida`. Las selecciones usan los mismos menos `cash_out`.
- **Métricas solo con apuestas resueltas**; las `pendiente` no cuentan y las `anulada`
  quedan fuera de las métricas.
- **Fase 2: las métricas por liga agrupan por DEPORTE + LIGA** (la "Superliga" de voleibol no es
  la de otro deporte), y **las de deporte usan `apuestas.deporte`, con "Mixto" como categoría
  propia** (no se reparte entre los deportes de sus selecciones).
- **Fase 2: las métricas por liga, deporte y casa cuentan APUESTAS, no selecciones.** Una
  combinada de 3 partidos de LaLiga es 1 apuesta de LaLiga; un "mismo partido" con 4 condiciones
  es 1 apuesta (en la BD cada condición repite evento/liga/fecha: no sumarlas como si fueran 4).
- **Fase 2 · promociones:** (a) el beneficio por promociones se muestra APARTE; (b) el crédito
  recibido en las aseguradas (`promo_credito`) nunca cuenta como beneficio; (c) el aumento solo es
  "cobrado" si la apuesta se gana; (d) las apuestas **con crédito** NO entran en el yield ni en el %
  de acierto en efectivo (su importe no es dinero propio y una perdida tiene resultado 0): llevan un
  bloque propio (número, ganadas, dinero real obtenido) y el beneficio neto total muestra efectivo,
  crédito y la suma; (e) una apuesta con **aumento negativo** no suma como "aumento cobrado" y se
  marca como dato dudoso.
- **Fase 2 · directo y precipitada:** sin marcar significa **pre-partido** y **normal**; las
  métricas lo tratan así y deben avisar de que una apuesta en directo que se olvidó marcar cuenta
  como pre-partido. Para medir el sesgo, comparar "precipitada" marcada **al registrar** frente a
  **al resolver** (`precipitada_momento`). Avisar cuando una subdivisión tenga muy pocas apuestas.
- **La app registra y analiza; no recomienda apuestas.**
- Importes en **céntimos** (enteros). Cuotas **siempre en decimal** en la base de datos; el
  formato de cuota del perfil (decimal / fraccional / americana) es solo para mostrar.
- Código sencillo, ordenado por módulos, fácil de leer.

## Stack

| Pieza | Qué se usa |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack, `cacheComponents`) |
| Estilos | Tailwind CSS 4 · modo oscuro por clase con `next-themes` |
| Login y datos | Supabase (Auth con Google + email/contraseña, Postgres, Storage) en región UE |
| Sesión | `@supabase/ssr` con cookies; `src/proxy.ts` la renueva en cada visita |
| PWA | `src/app/manifest.ts` + `public/sw.js` (solo cachea estáticos, nunca datos) |
| IA | API de Claude (`@anthropic-ai/sdk`), solo desde el servidor; respuesta validada con `zod` |
| Pruebas | `node:test` + PGlite (Postgres en memoria, sin Docker) · simulador local + Playwright |
| Hosting | Vercel, despliegue automático desde GitHub (`main`) |

> Ojo: Next.js 16 cambia cosas respecto a versiones antiguas (p. ej. `middleware.ts` ahora es
> `proxy.ts`). Antes de escribir código de Next, mirar `node_modules/next/dist/docs/`.

## Estructura

```
src/
  app/
    (app)/            pantallas con sesión + barra inferior
      apuestas/         lista (filtros) · nueva/ (capturas o ?manual=1) · [id]/ (detalle y edición)
        actions.ts      guardar, borrar, crear casa/estrategia, descartar captura (Server Actions)
      ajustes/          tema, coste de la IA (coste-ia.tsx), capturas guardadas (recuento y borrado),
                        copia de seguridad (copia-seguridad.tsx: descarga de los CSV),
                        deportes/ (catálogo: renombrar y borrar), cuenta
      graficas/ bankroll/
    api/capturas/     POST subir · transcribir/ (IA) · ver/ (sirve la imagen privada, solo en la revisión)
                      · reintentar/ (reintenta en silencio los borrados de imágenes que fallaron)
    api/exportar/     GET apuestas/ y selecciones/ (copia de seguridad en CSV; responder.ts = común)
    login/            pantalla de entrada (providers.ts = proveedores, actions.ts = login en servidor)
    auth/callback/    vuelta de Google (?code) y del email de confirmación (#tokens) → sesión
    auth/confirm/     alternativa para el email si se usa plantilla con token_hash
    api/diagnostico/  comprueba la configuración de Supabase (sin mostrar claves)
    manifest.ts       datos de instalación de la PWA
  components/         piezas de interfaz reutilizables
    apuestas/         formulario de revisión, flujo de capturas (registro-capturas.tsx: cola con
                      Anterior/Siguiente y resumen), eleccion-apuestas.tsx ("¿Cuáles quieres
                      guardar?"), lista, filtros, visor de captura, selector-hora.tsx
  lib/
    apuestas/         lógica común (móvil y servidor): estados, importes, cuotas, fechas,
                      cálculos, validación del formulario, esquema de la IA (propuesta.ts),
                      duplicadas.ts (¿es una copia calcada de otra?), promociones.ts (aumentos,
                      asegurada y crédito: cálculos en céntimos), reintentos-ia.ts (errores de la
                      IA: clasificación, cuáles se reintentan, esperas y mensajes), fecha-evento.ts
                      (traduce el texto de la fecha del evento), cola.ts (estados de la cola)
    exportar/         csv.ts (formato: celdas, columnas, lectura en tandas) · leer.ts (consultas
                      con la sesión del usuario; sin claves, se prueba con un cliente falso)
    navegador/        reducir-imagen.ts (1.600 px, JPEG, HEIC)
    supabase/         clientes de Supabase (navegador, servidor, proxy)
    server/           SOLO servidor: env.ts (claves y modelo), ia/ (Claude y precios),
                      capturas.ts (bucket), datos.ts (lecturas de la BD), catalogo.ts y
                      acciones-catalogo.ts (deportes y ligas), pendientes.ts (sin revisar),
                      limpieza.ts (capturas temporales: reintento y borrado de las antiguas)
  proxy.ts            renueva sesión y protege rutas
supabase/migrations/  esquema de la base de datos (SQL, en orden)
supabase/pruebas/     comprobación de RLS en vivo (pegar en el SQL Editor; no deja datos)
tests/                prueba de seguridad RLS + lógica de apuestas (logica.test.ts) + copia en CSV (exportar.test.ts)
scripts/              iconos · simulador.mjs (Supabase + Claude falsos) · probar-local.mjs (prueba completa)
public/               sw.js e iconos
```

## Base de datos

Tablas (todas con `user_id`): `perfiles`, `casas_apuestas`, `estrategias`, `apuestas`,
`selecciones`, `movimientos_bankroll`, `deportes`, `ligas` (catálogo del usuario; cada liga es de
un deporte), `transcripciones` (una fila por lectura de la IA = por
captura: modelo, tokens, coste aprox. en USD, resultado, `n_apuestas`, `propuesta` = lo que
propuso la IA con los campos dudosos y su motivo, `descartadas` = índices de apuestas de la
captura que se descartaron). Bucket privado de Storage: `capturas`, con rutas
`<user_id>/<archivo>`.

- RLS activado en **todas** las tablas y en el bucket: cada usuario solo ve y modifica lo suyo.
  El rol `anon` (sin sesión) no tiene permisos.
- `selecciones.user_id` debe coincidir con el de su apuesta (FK compuesta `(apuesta_id, user_id)`).
  Igual para casa y estrategia de una apuesta.
- El perfil se crea solo al registrarse (trigger en `auth.users`).
- `divisa` en apuestas y movimientos: si no se indica, toma la del perfil (trigger).
- Estados y tipos con `CHECK` (no enums). Para añadir un estado: nueva migración que cambie el `CHECK`.
- Movimientos: `deposito` y `retirada` con importe positivo; `ajuste` puede ser +/−.
- `guardar_apuesta(p_id, p_apuesta, p_selecciones)`: guarda apuesta + selecciones de una vez
  (todo o nada). Corre con los permisos del usuario (RLS aplica). Al editar sustituye las selecciones.
- `selecciones.orden`: orden en el resguardo. `apuestas.imagen_origen` solo puede apuntar a la
  carpeta del propio usuario (CHECK).
- `selecciones.evento_fecha` (`date`) y `evento_hora` (`time`): día y hora de inicio del evento en
  hora de España. Hora vacía = solo se conoce el día. No puede haber hora sin día (CHECK).
  Es distinta de `apuestas.fecha` (cuándo se hizo la apuesta).
- Una captura puede tener varias apuestas: todas comparten `imagen_origen` y se enlazan a su
  lectura con `apuestas.transcripcion_id` + `transcripcion_indice` (único: no se guarda dos veces).
- **Apuestas sin revisar** = las de la `propuesta` de una transcripción que no están guardadas ni
  en `descartadas` (`lib/server/pendientes.ts`). La lista muestra "Tienes N sin revisar" y se
  retoman sin volver a llamar a la IA. Borrar una apuesta guardada la marca como descartada.
- **Las capturas son TEMPORALES** (desde el 2026-11-03): solo se ven en la pantalla de revisión
  (también al retomar una a medias). Al guardar una apuesta NO se guarda `imagen_origen` (queda
  vacío; la columna se mantiene para las antiguas). Primero se guarda en la BD y, si va bien,
  después de responder se borra la imagen (`after()`), siempre que no quede ninguna apuesta de esa
  captura sin revisar (con varias apuestas, al guardar o descartar la última). La transcripción se
  conserva (coste, propuesta, dudosos) con `imagen` vacía.
- **Si el borrado falla**, el guardado no falla y no se avisa: la transcripción conserva su
  `imagen` como marca de "pendiente de borrar". Al abrir la lista, `/api/capturas/reintentar`
  responde al momento y reintenta después (hasta 20). Nunca toca capturas con apuestas sin
  revisar, imágenes enlazadas a apuestas antiguas ni lecturas de menos de 2 h
  (`FILOVERDE_MARGEN_CAPTURAS_MIN`, 120 por defecto; 0 en la prueba local).
- **Ajustes → Capturas guardadas**: recuento con la API de Storage (sesión del usuario: solo su
  carpeta) separado en "de apuestas guardadas o descartadas", "sin enlace en la BD" (avisa si
  Storage tiene más archivos de los que enlaza la BD), "pendientes de revisar" y "recién subidas"
  (estas dos nunca se borran). "Borrar" pide confirmación, recalcula en el servidor y vacía los
  enlaces (`apuestas.imagen_origen`, `transcripciones.imagen`). Irreversible.
- En `transcripciones` el usuario solo puede cambiar `descartadas` e `imagen` (permiso por
  columna): el modelo, los tokens y el coste no se pueden modificar.
- **Catálogo de deportes y ligas** (`deportes`, `ligas`): nombres únicos por usuario sin
  distinguir mayúsculas ni tildes (`public.normalizar_nombre`; en JS `lib/apuestas/catalogo.ts`
  hace lo mismo). "Mixto" está reservado. Lista inicial (12 deportes y unas pocas ligas) creada
  por `sembrar_catalogo()` al registrarse (trigger en `auth.users`; si falla, el registro sigue).
  Borrar un deporte del catálogo borra sus ligas del catálogo. **Las selecciones guardan deporte y
  liga como TEXTO**: renombrar o borrar en el catálogo no cambia las apuestas guardadas.
- `selecciones.deporte` es obligatorio al guardar (y no puede ser "Mixto").
  **`apuestas.deporte`** = deporte resumen: si todas las selecciones son del mismo deporte, ese;
  si hay varios, "Mixto". Lo calcula SIEMPRE `guardar_apuesta` (`deporte_resumen()`), al crear y
  al editar; lo que mande el navegador se ignora.
- `transcripciones.version_instrucciones`: versión de las instrucciones de la IA (vacía = 1, sin
  catálogo; 2 = con catálogo; 3 = ignora señales de directo; 4 = lee promociones; 5 = sustitutos y
  caché; 6 = apuestas cortadas y fecha del evento como texto). Ajustes compara el coste medio por versión. **Lecturas** = filas `ok` y `no_es_apuesta`;
  las `error` (fallos que Anthropic sí cobra: rechazo, respuesta cortada, datos rotos) no cuentan
  como lectura ni entran en el coste medio: se muestran aparte ("Intentos fallidos cobrados"). Los
  intentos saturados o con límite no se cobran y no crean fila.
- **Conducta** (la marca SIEMPRE el usuario, nunca la IA): `apuestas.en_directo` y
  `viendo_partido` (solo si en directo), `precipitada` y `recuperar_perdidas` (solo si
  precipitada). Booleanos no nulos, falso por defecto: sin marcar = pre-partido y normal (así
  quedaron las apuestas anteriores). La BD rechaza "veía el partido" sin directo y "recuperar
  pérdidas" sin precipitada (CHECK).
- `apuestas.precipitada_momento` (`al_registrar` · `al_resolver`): solo existe si `precipitada`.
  Lo pone SIEMPRE el disparador `apuestas_precipitada_momento` (en cualquier escritura; lo que
  mande el navegador se ignora): al marcarla, `al_registrar` si el estado que se guarda es
  pendiente y `al_resolver` si ya está resuelta (también una captura que llega resuelta). Si ya
  estaba marcada se conserva, **también si se reabre una apuesta resuelta**; al desmarcarla se
  borra. No se muestra en pantalla. Por eso guardar nunca falla por la regla del momento.
- **Aviso de apuesta duplicada** (`lib/apuestas/duplicadas.ts` + `buscarDuplicadas` en
  `apuestas/actions.ts`): al revisar una captura (también al retomarla) y en el registro a mano, si
  la apuesta es una copia **calcada** de otra ya guardada (de cualquier estado), sale "Parece que
  esta apuesta ya está registrada" con la más reciente (fecha · estado · casa · importe · cuota) y
  cuántas hay. "Descartar" = descarte normal; "Incluir de nuevo" = guardar igual (no vuelve a
  preguntar salvo que cambien los datos comparados). Se comprueba al abrir, al cambiar datos
  (espera ~0,6 s; solo vale la respuesta de los datos actuales) y otra vez al pulsar Guardar con
  los valores finales; con el aviso sin resolver, Guardar no guarda: lo lleva a la vista y pide
  elegir. **Nunca al editar una apuesta guardada.** Si la comprobación falla (red, servidor), no
  bloquea: se guarda normal y el error va al log (`[apuestas:duplicadas]`, sin datos personales).
  - **Se compara:** casa, tipo, importe (céntimos), cuota total, ganancia potencial (solo si las
    dos la tienen), número de selecciones y en cada una evento, mercado, pronóstico y cuota (vacía =
    vacía, como en mismo partido) y día del evento (solo si los dos lo tienen). Orden de las
    selecciones indiferente; textos sin mayúsculas, tildes ni espacios de más; números exactos.
  - **No se compara:** estado, resultado, estrategia, notas, deporte, liga, hora, fecha de
    registro, en directo, precipitada ni los datos de promoción.
  - Una casa leída por la IA que aún no está en el catálogo no coincide con nada (tampoco con las
    "sin casa"); al pulsar Guardar se usa la casa ya resuelta.
  - **Límite:** comparación estricta, no por parecido. "Betis - Sevilla" y "Real Betis - Sevilla
    FC", o una cuota 1,85 frente a 1,86, NO avisan. Es intencionado: mejor perder algún aviso que
    molestar con falsos.
  - La búsqueda se hace **SIEMPRE con la sesión del usuario (RLS)**, nunca con la clave de
    administrador: solo puede encontrar apuestas propias. Sin migración ni índice nuevo (filtra
    en la BD por importe y tipo, y compara el resto en el servidor).
- **Promociones** (desde el 2026-11-04, migración `20261105000001`; columnas en `apuestas`):
  `promo_tipo` (`superaumento` · `aumento` · `asegurada` · `credito` · `otra`; NULL = sin promoción,
  así quedaron todas las anteriores), `promo_cuota_original` (`numeric(12,6)`, ≥ 1),
  `promo_aumento` (céntimos; **puede ser negativo**: la app avisa sin bloquear), `promo_base`
  (`cuota_original` · `aumento` · `ambos`: cuál se leyó o escribió) y `promo_credito` (céntimos,
  ≥ 0). CHECK: sin tipo, todo vacío; cuota original, aumento y base solo en superaumento/aumento;
  crédito solo en asegurada. La casilla "Promoción" (desmarcada = sin promoción) está junto a En
  directo y Precipitada; al desmarcarla se vacían los datos.
  - **Superaumento / aumento** (`lib/apuestas/promociones.ts`, en céntimos y sin coma flotante):
    ganancia con promoción = `ganancia_potencial` (si falta, importe × cuota total). Con la cuota
    original: aumento = ganancia con promoción − importe × cuota original. Con el aumento: cuota
    original = (ganancia con promoción − aumento) / importe. Con los dos: se conservan y se avisa
    si no cuadran (más de 2 céntimos). El **dato derivado lo recalcula el servidor en CADA
    guardado** a partir del dato base (`promo_base`): si se edita el importe o la cuota no queda
    desfasado. Sin ninguno: la cuota original sale vacía en ámbar ("falta"). Avisos sin bloquear:
    cuota original mayor que la pagada y aumento negativo. Ganada = ganancia potencial − importe;
    media ganada/perdida, fórmula normal (sin aumento). Sin aviso de importe × cuota.
  - **Asegurada:** "Crédito si se pierde", por defecto el importe (sigue al importe mientras no se
    toque). Perdida = −importe; el crédito se guarda aparte y NO es beneficio.
  - **Con crédito** (el importe es crédito de promoción): ganada = importe × (cuota − 1); media
    ganada = la mitad de eso; perdida, media perdida y anulada = 0; cash out = **todo lo
    recuperado**. Editable. Sin aviso de importe × cuota.
  - `guardar_apuesta` mantiene su firma: la promoción va dentro de `p_apuesta`. La app nueva SIEMPRE
    envía `promo_tipo` (null = sin promoción → vacía los cinco campos); si no llega (versión
    anterior), al crear queda sin promoción y al editar se conserva.
  - Lista: filtro "Con promoción" (`?promo=1`) y marcas PROMO y CRÉDITO en la tarjeta.
- **Hora del evento** (desde el 2026-11-04): dos desplegables (hora 00-23 y minuto de 5 en 5;
  `selector-hora.tsx`), porque Safari de iPhone ignora el paso del control nativo. Un minuto que no
  es múltiplo de 5 (leído por la IA o guardado) se muestra como una opción más y **nunca se redondea
  solo**. Admite "—" (sin hora) y no puede haber hora sin día.
- **Día de la apuesta** (cuándo se hizo; desde el 2026-11-04, v6): el formulario (revisión, a mano y
  "Editar apuesta") pide **solo el día** (hoy por defecto). La hora NO se pide ni se muestra
  (`fechaDeLaApuesta` en `formulario.ts`, en el servidor): día de hoy → la hora actual; otro día
  (pasado o futuro) → 12:00 de España; al editar sin cambiar el día → se conserva lo guardado. Misma
  columna `apuestas.fecha` (`timestamptz`), sin migración. Ninguna métrica la usa por la hora; la
  lista ordena por `fecha` y desempata por `created_at`; duplicadas no la compara.
- **Copia de seguridad en CSV** (desde el 2026-11-04, sin migración): Ajustes → "Copia de
  seguridad" con dos botones (dos descargas separadas: los móviles bloquean varias a la vez).
  `GET /api/exportar/apuestas` y `/api/exportar/selecciones`, generadas en el servidor con la sesión
  del usuario (RLS) y filtrando además por su id, que sale de la sesión (nunca del navegador). Sin
  sesión → 401 (o el proxy manda a /login); sin apuestas → 404 con "Todavía no tienes apuestas
  registradas: no hay nada que exportar." y no se descarga nada; fallo → 500 con mensaje en español
  y el error real al log (`[exportar:apuestas]` / `[exportar:selecciones]`, sin datos personales).
  - **Todas las filas:** se leen en tandas de 1000 (límite de Supabase por consulta) con orden fijo
    (fecha, creación, id). Incluye pendientes, anuladas y resueltas (es una copia, no un análisis).
  - **apuestas.csv:** una fila por apuesta, de la más antigua a la más reciente: id, fecha, casa y
    estrategia (por nombre), tipo, deporte (resumen), importe, divisa, cuota_total,
    ganancia_potencial, estado, resultado_economico, notas, en_directo, viendo_partido, precipitada,
    recuperar_perdidas, precipitada_momento, los 5 campos `promo_*`, creada y modificada.
  - **selecciones.csv:** una fila por selección, en el orden de sus apuestas y de su `orden`:
    apuesta_id, id, orden, evento, deporte, liga, mercado, pronostico, cuota, evento_fecha,
    evento_hora, estado, creada y modificada.
  - **Formato (Excel en español):** UTF-8 con BOM, separador `;`, fin de línea `\r\n`; importes en
    euros con coma y 2 decimales sin símbolo ni miles (`-12,50`); cuotas con coma (`1,85`, `2,00`,
    sin redondear); fechas `AAAA-MM-DD HH:MM` en hora de España; día `AAAA-MM-DD` y hora `HH:MM` del
    evento; casillas `sí`/`no`; estados, tipos y promociones con su **código interno**
    (`media_ganada`, `mismo_partido`…). Nombre: `filoverde-apuestas-AAAA-MM-DD.csv`.
  - **Fórmulas:** SOLO en texto libre (notas, evento, deporte, liga, mercado, pronóstico, nombres de
    casa y estrategia) que empieza por `=` `+` `-` `@` (o tabulador / retorno de carro) se antepone
    un apóstrofo. Nunca en importes, cuotas ni resultados (un `-12,50` sigue siendo número). Textos
    con `;`, comillas o saltos de línea van entre comillas (las internas, duplicadas).
  - No se exportan capturas, transcripciones ni costes de la IA. No hay importación.
  - Con la coma decimal, Google Sheets debe estar en español (Archivo → Configuración → Configuración
    regional: España); en inglés, los números se verían como texto.
- `ganancia_potencial` = retorno total (importe × cuota, incluye lo apostado).
  `resultado_economico` = neto (+/−). Cash out: neto = recuperado − importe.

**Cambios en la base de datos = nueva migración** en `supabase/migrations/` (nunca editar una
ya aplicada) + actualizar `tests/rls.test.mjs` si hay tablas nuevas.

## Claves y seguridad

- Claves en `.env.local` (en `.gitignore`) y en Vercel → Settings → Environment Variables.
  Plantilla en `.env.example`.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable o anon):
  **públicas**, pueden ir al navegador; los datos los protege RLS.
- La **service role / secret key** de Supabase **nunca** va en código de navegador ni en el
  repositorio. La app no la usa.
- Claves secretas solo en `src/lib/server/` (protegido con `import 'server-only'`) y usadas
  desde rutas de servidor. Nunca con prefijo `NEXT_PUBLIC_`.

## IA (lectura de capturas)

- **Modelo:** variable `ANTHROPIC_MODEL`. Si no existe, `claude-sonnet-5-5` (por defecto en
  `src/lib/server/env.ts`). Si la lectura falla a menudo, cambiar a **`claude-opus-5-5`**
  (≈ el doble de caro). Opción barata: `claude-haiku-5-5`.
  **Cómo cambiarlo:** Vercel → proyecto → Settings → Environment Variables → `ANTHROPIC_MODEL` =
  `claude-opus-5-5` (Production y Preview) → Save → Deployments → último → **Redeploy**.
  Para volver atrás, borrar la variable y Redeploy. Ajustes muestra el modelo actual.
  Si se usa un modelo nuevo, añadir su precio en `src/lib/server/ia/precios.ts`.
- Flujo: el móvil reduce la imagen → `POST /api/capturas` (comprueba tipo real y ≤ 4 MB, sube a
  `capturas/<user_id>/<uuid>.jpg`) → `POST /api/capturas/transcribir` (IA) → formulario de revisión
  → `guardarApuesta` (vuelve a validar todo en el servidor).
- La IA devuelve JSON con esquema estricto (`lib/apuestas/propuesta.ts`): una **lista de
  apuestas** (de 1 a 10 por captura), cada una con sus selecciones y sus `dudosos`
  (`{campo, motivo}`, motivo = `no_visible` · `borroso` · `deducido`). Solo se marca lo que no se
  ve, está borroso o se ha deducido; nunca lo que se lee bien. Copia las cuotas tal cual y el
  código las pasa a decimal. El texto de la imagen se trata como datos, nunca como instrucciones.
- **Fecha/hora del evento (v6): la IA copia el texto tal cual** (`selecciones[].evento_fecha_texto`:
  "Dom 8 nov / 17:00", "Hoy 21:00"…) y **el código lo traduce** (`lib/apuestas/fecha-evento.ts`) con
  el día de la subida en Europe/Madrid. **La fecha de hoy NO se pasa a la IA** (así la IA no calcula,
  el resultado es comprobable y la caché no se toca). Reglas: año escrito → sin ámbar; con día de la
  semana y sin año → el año, **dentro de la ventana de 6 meses antes a 6 meses después de hoy**, en que
  ese día cae en ese día de la semana, sin ámbar ("Dom 8 nov / 17:00" → 2026-11-08 17:00); si no cuadra
  con ninguno de la ventana → el año más cercano a hoy, en ámbar "el día de la semana no coincide"
  ("Sáb 15 nov" → 15/11/2026, que es domingo, en ámbar; nunca 2025 sin aviso); sin día de la semana ni
  año → el año más cercano a hoy, "deducido"; "Hoy", "Mañana", "Ayer", "Pasado mañana" → "deducido"
  (dependen de cuándo se hizo la captura); solo hora sin día → día y hora vacíos con "falta el día";
  formato no reconocido → vacíos con "formato no reconocido"; nada → vacíos "no visible". Cubre
  meses en español (abreviados y completos, "8 de noviembre"), "/" como separador, dd/mm(/aa), ISO,
  24 h y 12 h (AM/PM). Las fechas completas del campo antiguo de la IA se ignoran; las lecturas
  guardadas antes de la v6 se convierten a texto ISO y pasan por el mismo traductor.
- **Apuestas válidas (v6):** el SERVIDOR solo admite una apuesta si tiene al menos una selección con
  pronóstico y la IA no la marca `incompleta` (cortada en la captura); las demás se ignoran y se
  cuentan ("He ignorado N apuestas cortadas o sin selección"). Los índices de la lectura no cambian
  (`transcripcion_indice`). `n_apuestas` = válidas. La IA lee solo apuestas completas y no mezcla
  datos entre apuestas.
- **"¿Cuáles quieres guardar?" (v6):** con 2 o más apuestas válidas en una captura, antes de la
  revisión (casa · tipo · selección · importe · estado y resultado). Marcadas por defecto las que no
  son idénticas a una ya guardada (misma comparación que el aviso de duplicadas, con la sesión del
  usuario); las idénticas salen sin marcar con "Ya registrada". Las no elegidas quedan como
  `descartadas` (no vuelven a "sin revisar"). Sigue siendo una lectura por captura.
- **Cola de revisión (v6):** "Apuesta X de N" con el estado de cada una (guardada, descartada,
  pendiente…) y Anterior / Siguiente. Volver a una guardada la abre con lo guardado y "Guardar
  cambios" ACTUALIZA esa apuesta (sin aviso de duplicadas); volver a una descartada → "Recuperar"
  (sale de `descartadas`). En una cola de más de una apuesta las capturas **no se borran al guardar
  sino al pulsar Terminar** en el resumen ("Has guardado N, descartado M", con "Revisar anteriores")
  o al salir de la cola; con una sola apuesta, como antes (al guardar). Si se cierra la app a medias,
  lo no revisado sigue en "Tienes N sin revisar" y las imágenes sobrantes las borra el reintento de
  las 2 h. El estado de la cola se guarda en `sessionStorage` y solo se recupera al RECARGAR esa
  pantalla (abrir "Nueva apuesta" empieza una cola nueva).
- Deporte y liga de CADA selección: leídos o deducidos por equipos/jugadores/competición
  ("deducido"); si no se pueden, vacíos y "no visible". La IA recibe el catálogo del usuario
  como DATOS (bloque `<catalogo>` en el mensaje, JSON compacto, tope 4.000 caracteres) y elige
  de ahí. El servidor lo comprueba: lo que no esté en el catálogo (o una liga de otro deporte)
  sale en ámbar como **"nueva"** con "Crear y usar". Coste extra medido: ~200 tokens de catálogo
  + ~150 de instrucciones ≈ +0,0007 $ por captura con Sonnet 5.5 (≈ +6 %).
- Promociones (instrucciones v4): la IA SOLO lee `promo_tipo` (si la captura lo dice de forma
  explícita; "apuesta gratuita"/"free bet" = crédito), `promo_cuota_original`, `promo_aumento` y
  `promo_credito`; no calcula nada. El tipo propuesto sale en ámbar ("confírmalo"). Las lecturas
  guardadas antes (v1-v3) se retoman igual (`completarPropuestaAntigua`). Coste extra estimado:
  ~450 tokens de entrada + ~20 de salida por apuesta ≈ +0,001 $ por captura con Sonnet 5.5
  (≈ +9 %); medirlo en Ajustes (v4).
- **Jugador sustituido (instrucciones v5):** en mercados de jugador, si la captura muestra dos nombres,
  uno TACHADO y otro como sustituto ("Sustituto", "Sustituto+" o similar, en cualquier casa), el
  pronóstico es el TACHADO (el que eligió el usuario); nunca el sustituto. Si solo hay un nombre sin
  tachar, ese. La IA lo devuelve en `selecciones[].sustituto` y el código escribe
  "Sustituto: <nombre>" en las notas SOLO al crear desde la lectura (nunca pisa notas del usuario);
  sin ámbar si se lee bien. Estado y resultado se leen como siempre (la casa ya los calcula con el
  sustituto). Las lecturas anteriores se retoman igual (`completarPropuestaAntigua`).
- **Reintentos** (`lib/apuestas/reintentos-ia.ts`): **3 intentos en total por captura**, solo en errores
  temporales — 529/5xx (`saturado`), 429 de Anthropic (`limite`, distinto del tope propio de 60/h,
  `tope_hora`), tiempo agotado y conexión —, con esperas de ~2 y ~5 s (±25 % al azar) o lo que pida
  `retry-after` (si pide más de 60 s, no se reintenta solo). La librería de Anthropic va con
  `maxRetries: 0` (si no, serían 3 × 2). Nunca en errores permanentes (clave, saldo, tope de gasto
  —también llega como 429—, imagen o petición mala). **Los reintentos los hace el móvil**, uno por
  petición (cada intento ≤ 60 s; `maxDuration` 120 s), mostrando "Reintentando… (2 de 3)". Cada
  intento reutiliza la captura ya subida; el servidor rechaza un `intento` > 3, y si la captura ya
  se leyó bien devuelve esa lectura (sin volver a pagar ni duplicar filas). El lote se lee de una
  en una; si una falla, las demás siguen y la fallida queda "Pendiente de reintentar" (Reintentar /
  Rellenar a mano); tras un 429 que agota los intentos, el lote espera el `retry-after` (o 10 s)
  antes de la siguiente. El error real va a Vercel → Logs como `[ia:transcribir]` (código, status,
  tipo, retry-after, request id; sin datos personales).
- **Caché de Anthropic** (desde la v5): orden de la petición = instrucciones (+ esquema) con
  `cache_control` → catálogo del usuario con `cache_control` → imagen → frase final. Mínimo
  cacheable en Sonnet 5.5: 512 tokens; duración 5 min, se renueva con cada lectura. Según la
  documentación oficial de límites (consultada el 2026-11-04), los tokens LEÍDOS de la caché no
  cuentan para el límite de tokens de entrada por minuto (salvo Haiku 3.5); los escritos sí.
  Precio: escribir 1,25 × la entrada; leer 0,20 $/M en Sonnet 5.5 (10 %). `precios.ts` calcula cada
  tipo a su precio. En Vercel → Logs, `[ia:uso]` muestra `sinCache` (imagen + final), `escritos` y
  `leidos` por lectura.
- Directo: la IA tiene orden expresa de IGNORAR "En juego", marcador y minuto (reflejan el
  momento de la captura, no el de apostar). No hay campos de directo/precipitada en su esquema.
- Clasificación: varios partidos distintos = combinada; un partido con varias condiciones sin
  cuotas individuales (Crear apuesta, Bet Builder, Same Game Multi) = mismo_partido; un solo
  mercado = simple. La IA propone; el formulario deja cambiar el tipo y pregunta qué conservar si
  hay datos que no encajan (nunca borra sin confirmar).
- `max_tokens` 16000 (varias apuestas por captura). Una captura = una transcripción = un coste.
- Errores de la IA: mensajes en español en `lib/server/ia/transcribir.ts`; en Vercel → Logs,
  buscar `[ia:transcribir]`. La imagen nunca se pierde: reintentar o rellenar a mano.
- Topes: 5 capturas por tanda, 60 lecturas por hora y usuario.
- Coste: cada lectura guarda tokens y coste aprox. en `transcripciones`; resumen en Ajustes.

## Si el login falla

1. Abrir `https://filo-verde.vercel.app/api/diagnostico`: dice si las variables existen,
   si tienen buen formato, qué tipo de clave es y si Supabase responde (nunca muestra valores).
2. Vercel → proyecto → **Logs**: buscar `[auth:` para ver el error real de Supabase
   (`code`, `status`, `message`; sin emails ni contraseñas).
3. Supabase → **Logs & Analytics** → *Auth* (errores de registro/login) y *API Gateway*
   (peticiones rechazadas antes de llegar a Auth, p. ej. clave incorrecta).

Los mensajes al usuario se traducen en `src/lib/supabase/errores.ts`.

**Email de confirmación:** funciona con la plantilla por defecto de Supabase. El registro usa
el flujo *implicit* (`createRegistroClient` en `lib/supabase/server.ts`), así el enlace trae la
sesión en el propio enlace y vale en cualquier navegador (también si se abre desde la app de
correo). `/auth/callback` (página) la lee y la guarda en el servidor. Si algún día se cambia la
plantilla a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, también funciona
(ruta `/auth/confirm`).

**Confirmación por email: DESACTIVADA** (Supabase → Authentication → Sign In / Providers →
Email → *Confirm email*). El servidor de correo gratuito de Supabase solo envía ~2 emails/hora
y suele entregar solo a miembros del equipo. Al registrarse se entra directamente. Antes de
abrir la app a más gente: configurar un SMTP propio (p. ej. Resend) y volver a activarla; el
código ya soporta los dos casos.

## Comandos

```bash
npm install          # instalar dependencias (la primera vez)
npm run dev          # arrancar en local → http://localhost:3000 (necesita .env.local)
npm test             # prueba de seguridad RLS + lógica de apuestas + copia en CSV (sin Docker ni internet) · también en GitHub
npm run probar:local # prueba COMPLETA en local con simulador de Supabase y Claude + navegador móvil
                     # (capturas de pantalla en .prueba-local/; no usa internet ni datos reales)
npm run lint         # revisar el código
npm run build        # compilar como en producción
npm run iconos       # regenerar iconos provisionales (usa Playwright del sistema)
```

**Desplegar:** hacer push a `main` en GitHub → Vercel publica solo. Las ramas generan
URLs de prueba (preview).

**Comprobar la seguridad en el Supabase real:** pegar `supabase/pruebas/comprobar_rls_en_vivo.sql`
en Supabase → SQL Editor y pulsar Run. Usa las dos cuentas más antiguas, intenta que una acceda
a lo de la otra y muestra una tabla ✅/❌. Borra sus datos de prueba al terminar.

**Aplicar migraciones:** de momento, a mano en Supabase → SQL Editor, pegando cada archivo de
`supabase/migrations/` en orden. (Si más adelante se usa la CLI de Supabase, marcar las ya
aplicadas con `supabase migration repair --status applied <versión>`.)

## Registro de decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-28 | Next.js 16 + Tailwind 4 + Supabase + Vercel | Lo pedido en Fase 0; todo gratis para empezar |
| 2026-10-28 | `user_id` también en `selecciones`, con FK compuesta a su apuesta | RLS directo y más simple; la BD impide que no coincida |
| 2026-10-28 | Columna `divisa` en apuestas y movimientos (por defecto la del perfil) | Permite otras monedas sin rehacer tablas |
| 2026-10-28 | Estados y tipos con `CHECK` en vez de enums | Más fácil de ampliar |
| 2026-10-28 | Supabase en región UE | Latencia desde España y RGPD |
| 2026-10-28 | Importes `bigint` en céntimos; cuotas `numeric(12,6)` | Sin errores de redondeo |
| 2026-10-28 | Casa y estrategia con FK compuesta y `on delete set null (columna)` | No se puede usar la casa de otro; borrar una casa no borra apuestas |
| 2026-10-28 | Sesión con cookies (`@supabase/ssr`) y `getClaims()` en `proxy.ts` | Sesión persistente y verificada en servidor |
| 2026-10-28 | Se mantiene `cacheComponents` de Next 16 | Será el modo por defecto; las pantallas actuales son estáticas (carga rápida) |
| 2026-10-28 | Service worker propio y mínimo (sin librería) | Solo cachea estáticos versionados; nunca datos de usuario |
| 2026-10-28 | `display: standalone` en el manifest | Se abre sin barra del navegador; `fullscreen` no funciona en iPhone |
| 2026-10-28 | Prueba RLS con PGlite + `node:test` (sin Docker, sin Vitest) | Cero instalación para el usuario; evita conflictos de dependencias |
| 2026-10-28 | Login con lista de proveedores (`login/providers.ts`) | Añadir Apple = descomentar una línea + configurarlo en Supabase |
| 2026-10-28 | Migraciones aplicadas a mano en el SQL Editor | Lo más sencillo sin CLI; revisable más adelante |
| 2026-10-28 | GitHub Actions ejecuta lint + prueba RLS + build en cada push | Detecta fallos de seguridad antes de publicar |
| 2026-10-29 | Login con email y Google mediante Server Actions (antes, en el navegador) | El error real queda en los logs de Vercel; mensajes concretos en español |
| 2026-10-29 | Ruta pública `/api/diagnostico` | Comprobar la configuración desde el móvil sin exponer claves |
| 2026-10-29 | Email de confirmación con `token_hash` → `/auth/confirm` (en vez del `code` PKCE) | El enlace abierto desde la app de correo no tenía la cookie del registro y acababa en el login |
| 2026-10-29 | Registro con flujo *implicit* y `/auth/callback` como página que guarda la sesión en servidor | El enlace del email funciona en cualquier navegador sin tocar la plantilla de Supabase |
| 2026-10-30 | Confirmación por email desactivada en Supabase | Límite de ~2 emails/hora del correo gratuito; la app es de momento para un solo usuario. Revisar (SMTP propio) si se abre a más gente |
| 2026-10-30 | Acciones de login llamadas dentro de `startTransition` | Next gestiona la redirección del servidor sin mostrar un falso error |
| 2026-11-01 | Script de comprobación de RLS en vivo (`supabase/pruebas/`) | Demuestra el aislamiento entre usuarios sobre la base de datos real, no solo la simulada |
| 2026-11-01 | **Fase 0 cerrada** | Verificado en el móvil (login Google y email, sesión persistente, instalación como app, modo claro/oscuro) y RLS en vivo: 12/12 comprobaciones OK |
| 2026-11-01 | IA: `claude-sonnet-5-5` por defecto, cambiable con `ANTHROPIC_MODEL` sin tocar código | Buena lectura a mitad de precio que Opus 5.5 (~0,01 $/captura estimado); medir el coste real en Ajustes |
| 2026-11-01 | Esfuerzo `low` y salida con esquema JSON estricto (`output_config.format`) | Transcribir no necesita razonar mucho: menos tokens y respuesta siempre con la forma esperada |
| 2026-11-01 | Plan B automático de Anthropic (`fallbacks: "default"`) en Sonnet/Opus 5.5 | Si el modelo rechaza una imagen, otro la reintenta en la misma llamada |
| 2026-11-01 | La IA copia las cuotas como aparecen; la conversión a decimal la hace el código | Conversión exacta y comprobable con pruebas; la IA no "calcula" |
| 2026-11-01 | Subida y lectura por rutas (`/api/capturas/*`), no Server Actions | Las Server Actions limitan el cuerpo a 1 MB; además el móvil no habla directo con Supabase |
| 2026-11-01 | Imagen reducida en el móvil a 1.600 px JPEG; HEIC con conversor cargado solo si hace falta | Subida rápida, por debajo del límite de Vercel (4,5 MB) y menos tokens |
| 2026-11-01 | Capturas servidas por `/api/capturas/ver` (con la sesión, RLS) en vez de URLs firmadas | El móvil no conecta bien directo con Supabase |
| 2026-11-01 | Tanda máxima de 5 capturas; se leen en cola mientras se revisa la primera | Petición del usuario; evita esperas y gasto accidental |
| 2026-11-01 | Función `guardar_apuesta` en la BD (todo o nada) | Nunca queda una apuesta sin sus selecciones |
| 2026-11-01 | Fechas del formulario en hora de España (`Europe/Madrid`) | Zona del perfil por defecto; revisar si se usa otra zona |
| 2026-11-01 | Simulador local (PGlite + migraciones reales + Claude falso) y prueba Playwright | El entorno de desarrollo en la nube no llega a Vercel ni a Supabase reales |
| 2026-11-02 | Tipo `mismo_partido` (Crear apuesta / Bet Builder): una cuota total, condiciones sin cuota | Las cuotas dentro de un partido están correlacionadas: no se multiplican ni comparan |
| 2026-11-02 | Formulario según el tipo (mínimos: simple 1, combinada 2, mismo partido 2, sistema 3) y diálogo al cambiar de tipo | La IA propone y el usuario decide; nada se borra sin confirmación |
| 2026-11-02 | En mismo partido, partido/liga/deporte/fecha/hora se escriben una vez y se copian a cada condición | Formulario más corto; en la BD cada selección sigue completa |
| 2026-11-02 | Ganada → selecciones en verde (las anuladas no cambian); perdida → el usuario marca las falladas (aviso si ninguna) | Igual en combinadas, sistemas y mismo partido. Cambiar el estado siempre recalcula el resultado |
| 2026-11-02 | Aviso (sin bloquear) si hay una selección anulada en combinada o sistema | La casa recalcula la cuota sin ella: revisar el resultado económico |
| 2026-11-02 | La IA devuelve una lista de apuestas por captura; cada una entra en la cola ("Apuesta 1 de 2") | Capturas con varios resguardos; una sola lectura y un solo coste |
| 2026-11-02 | Campos dudosos con motivo (`no_visible` · `borroso` · `deducido`) | Menos ámbar falso y diagnóstico de la IA |
| 2026-11-02 | `evento_fecha date` + `evento_hora time` (en vez de un `timestamptz`) | Permite "solo el día" sin inventar una hora ni cambiar de día por la zona horaria |
| 2026-11-02 | Propuesta de la IA guardada en `transcripciones` para retomar la revisión | Si se cierra la app a mitad, no se vuelve a pagar otra lectura |
| 2026-11-02 | Imagen borrada solo cuando ya no la usa ninguna apuesta ni queda nada por revisar | Varias apuestas comparten captura; el registro de coste se conserva |
| 2026-11-02 | Migración `20261102000001` solo aditiva | No rompe la app publicada en `main` |
| 2026-11-02 | Catálogo de deportes y ligas por usuario (tablas `deportes`, `ligas`) con desplegables y "+ Nuevo…" | Datos uniformes para las métricas; la IA elige de tu lista |
| 2026-11-02 | Selecciones enlazadas al catálogo por TEXTO, no por id | Borrar o renombrar en el catálogo no toca las apuestas guardadas |
| 2026-11-02 | `apuestas.deporte` (deporte resumen, "Mixto" si hay varios) calculado por la BD al guardar | Filtro y métricas simples; nunca se fía del navegador |
| 2026-11-02 | Unicidad sin mayúsculas ni tildes; "Mixto" reservado | Evita duplicados como Futbol/Fútbol |
| 2026-11-02 | Catálogo enviado a la IA como datos, compacto y con tope de 4.000 caracteres | ≈ +6 % de coste por captura; sin riesgo de instrucciones ocultas |
| 2026-11-02 | `transcripciones.version_instrucciones` | Medir el coste real antes/después de cambiar las instrucciones |
| 2026-11-02 | Campos de fecha/hora sin aspecto nativo, rejilla de 2 columnas con `min-width: 0` (también en `fieldset`) | En iPhone se salían de la tarjeta; revisado a 320/375/390/430 px |
| 2026-11-02 | Migración `20261103000001` solo aditiva y repetible (se puede ejecutar dos veces) | No rompe `main`; segura si se pega de nuevo por error |
| 2026-11-02 | Casillas "En directo" (+ "Veía el partido") y "Precipitada" (+ "Para recuperar pérdidas"), siempre del usuario | Datos de conducta para la Fase 2 sin pasos extra al registrar ni al resolver |
| 2026-11-02 | Cuatro booleanos en vez de una columna "conducta" con varios valores | Métricas más simples; la BD impide combinaciones imposibles (CHECK) |
| 2026-11-02 | `precipitada_momento` calculado por un disparador de la tabla | Vale para cualquier camino de escritura; se conserva al reabrir; nunca se fía del navegador |
| 2026-11-02 | La IA ignora señales de directo (instrucciones v3) sin tocar su esquema | La captura refleja el momento de la captura, no el de la apuesta |
| 2026-11-02 | Filtros "En directo" y "Precipitadas" y marcas LIVE / ⚡ en la lista | Encontrarlas rápido sin abrir cada apuesta |
| 2026-11-02 | Migración `20261104000001` solo aditiva y repetible, después de la de deportes | No rompe `main` |
| 2026-11-02 | Los nombres `20261103…` y `20261104…` de las migraciones no son fechas reales (se hicieron el 2026-11-02) | Solo marcan el orden; ya están aplicadas y no se renombran |
| 2026-11-02 | **Fase 1 cerrada** y fusionada en `main` | Verificada en el móvil; RLS en vivo 37/37; pruebas de GitHub Actions en verde |
| 2026-11-03 | **Las capturas se borran al guardar** (son temporales; solo se ven en la revisión) | Una vez revisada y guardada, la imagen no aporta: todos sus datos están en la BD y la propuesta de la IA en `transcripciones`. Menos datos personales guardados, menos espacio y nada que proteger después |
| 2026-11-03 | Orden: guardar en la BD → borrar la imagen después de responder; reintento silencioso al abrir la lista | El guardado nunca falla por el borrado; sin tablas nuevas (la marca es `transcripciones.imagen`) |
| 2026-11-03 | Capturas antiguas: recuento y borrado desde Ajustes con la API de Storage y confirmación | La decisión irreversible la toma el usuario; nunca toca las pendientes de revisar |
| 2026-11-03 | **Panel "Estado y resultado"** en el detalle: Ganada / Perdida (botones grandes), resto en desplegable, resultado editable, Precipitada debajo, un solo Guardar | Resolver una apuesta con un toque, sin abrir el formulario entero |
| 2026-11-03 | Aviso antes de pisar un resultado escrito a mano (al cambiar el estado) o de recalcular al cambiar importe/cuota de una resuelta | La IA y el cálculo proponen; el usuario decide |
| 2026-11-03 | "Editar apuesta" despliega el formulario completo sin captura; comparte datos con el panel (cualquier Guardar guarda todo) | No se pierde lo cambiado en la otra parte |
| 2026-11-03 | Emojis de deporte (⚽ 🎾 🏀 ⚾ 🏈 🏒 🤾 🏐 🏉 🥊, 🏅 el resto, 🔀 Mixto) solo como decoración | Se reconocen de un vistazo; ocultos a lectores de pantalla (en desplegables, etiqueta sin emoji) |
| 2026-11-03 | Tarjeta de la lista: todo a la izquierda y SOLO el resultado a la derecha; importe · cuota · estado pasan a dos líneas antes de cortarse | Lectura rápida del resultado; sin solapes de 320 a 430 px |
| 2026-11-03 | Sin migración en estos retoques | Todo se apoya en columnas existentes |
| 2026-11-03 | Tras guardar o borrar en el detalle se vuelve a la lista (la misma, con sus filtros, vía `?volver=`), reemplazando el historial, con datos frescos, scroll recuperado y aviso breve arriba | Atrás no reabre el formulario guardado; si el guardado falla no se cierra nada y se conserva lo escrito |
| 2026-11-03 | **Retoques de la Fase 1 fusionados en `main`** (rama `fase-1-retoques`) | Verificados en el móvil; pruebas de GitHub Actions en verde; sin migración |
| 2026-11-03 | **Aviso de apuesta duplicada** con comparación estricta (lista de campos comparados y no comparados en "Base de datos") | Evita registrar dos veces la misma captura; estricta para no dar falsos avisos (no detecta copias "parecidas") |
| 2026-11-03 | Duplicadas: la IA no interviene, sin migración; búsqueda siempre con la sesión del usuario (RLS), nunca con la clave de administrador | Sin coste extra; imposible ver apuestas de otro usuario |
| 2026-11-03 | Duplicadas: si la comprobación falla, se guarda igual; con el aviso sin resolver, Guardar pide elegir | Nunca se pierde un guardado por el aviso; el usuario decide |
| 2026-11-03 | **Aviso de apuesta duplicada fusionado en `main`** (rama `fase-1-duplicadas`) | Verificado en el móvil; pruebas de GitHub Actions en verde; sin migración |
| 2026-11-04 | **Promociones** en columnas de `apuestas` (`promo_tipo` + cifras) con CHECK por tipo | Un solo tipo por apuesta; la BD impide datos que no encajan con su tipo |
| 2026-11-04 | Columna extra `promo_base` (cuál de los dos datos se leyó o escribió) | Para recalcular el otro en cada guardado (si cambia el importe o la cuota) sin adivinar cuál era el original |
| 2026-11-04 | `promo_aumento` admite negativos (la app avisa sin bloquear); `promo_credito` ≥ 0 | Un aumento negativo casi siempre es una cuota mal leída: nunca debe impedir guardar |
| 2026-11-04 | Cálculos de promociones en funciones puras compartidas: el formulario los enseña al momento y el servidor los repite al guardar (es el que cuenta) | Resumen inmediato sin fiarse del navegador |
| 2026-11-04 | Con crédito: ganada = importe × (cuota − 1), perdida/anulada 0, cash out = todo lo recuperado | El importe no era dinero propio |
| 2026-11-04 | Media ganada/perdida con aumento o asegurada: fórmula normal | El aumento suele aplicarse solo a la apuesta ganada completa; se puede corregir a mano |
| 2026-11-04 | `guardar_apuesta` con la misma firma; promoción dentro de `p_apuesta` y solo se toca si llega `promo_tipo` | La app publicada en `main` sigue funcionando con la migración aplicada |
| 2026-11-04 | IA instrucciones v4: lee promociones sin calcular; lecturas antiguas completadas con null al retomarlas | La IA propone, el código calcula; no se pierden revisiones a medias |
| 2026-11-04 | Hora y minuto con dos desplegables (paso de 5) en vez del control nativo; minutos raros se conservan | iOS Safari ignora el paso; nunca se cambia un dato sin que lo cambie el usuario |
| 2026-11-04 | Migración `20261105000001` solo aditiva y repetible (el nombre no es una fecha real: solo marca el orden) | No rompe `main`; segura si se pega dos veces |
| 2026-11-04 | **Promociones y selector de minutos fusionados en `main`** (rama `fase-1-promos`) | Verificados en el móvil; migración aplicada; RLS en vivo 46/46; pruebas de GitHub Actions en verde |
| 2026-11-04 | 429 de Anthropic separado de la saturación (529/5xx): mensajes distintos | Antes, el límite de la cuenta se mostraba como "la IA está saturada" |
| 2026-11-04 | Reintentos desde el móvil (3 intentos en total, ~2 y ~5 s o `retry-after`), librería sin reintentos | "Reintentando…" real; cada intento cabe en el límite de Vercel; exactamente 3, no 3 × 2 |
| 2026-11-04 | Reintentar reutiliza la captura subida y la lectura ya hecha; el servidor limita a 3 intentos | Sin subidas, filas ni pagos duplicados |
| 2026-11-04 | Ajustes: lecturas y coste medio solo con lecturas buenas; fallos cobrados aparte | Coste medio real; el gasto total sigue completo. Sin migración (`resultado` ya existía) |
| 2026-11-04 | Caché de Anthropic en instrucciones y catálogo; imagen al final | En un lote, de la 2.ª captura en adelante la parte fija cuesta un 10 % y no cuenta para el límite por minuto |
| 2026-11-04 | Instrucciones v5: en mercados de jugador, el pronóstico es el jugador tachado; el sustituto, a las notas | La captura muestra a los dos; el usuario eligió al tachado |
| 2026-11-04 | Modelo de reserva aparcado | Primero medir si los reintentos y la caché bastan |
| 2026-11-04 | **IA más fiable y jugadores sustituidos fusionados en `main`** (rama `fase-1-ia-fiable`) | Verificados en el móvil; pruebas de GitHub Actions en verde; sin migración |
| 2026-11-04 | Fecha del evento: la IA copia el texto y el código la traduce; la fecha de hoy NO va a la IA | Exacto y comprobable con pruebas; la IA no calcula; la caché no se toca. Antes casi nunca se rellenaba (1 de 93 selecciones) porque la IA no podía dar el año |
| 2026-11-04 | Día de la semana decide el año, solo dentro de ±6 meses de hoy; si no coincide, año más cercano en ámbar ("el día de la semana no coincide"); relativas y sin año en ámbar ("deducido"); hora sin día → "falta el día" | Nunca se inventa; lo dudoso se revisa; un día de la semana mal leído no debe saltar a otro año sin avisar |
| 2026-11-04 | Apuesta válida = al menos una selección con pronóstico y no cortada, comprobado en el servidor | Las capturas de listas cortan apuestas arriba y abajo |
| 2026-11-04 | Pantalla "¿Cuáles quieres guardar?" con 2+ válidas; ya registradas sin marcar; no elegidas = descartadas | Guardar solo lo que se quiere sin revisar una a una |
| 2026-11-04 | Cola con Anterior/Siguiente; en colas de varias, capturas borradas al Terminar (no al guardar) | Poder volver atrás viendo la captura; lo sobrante lo recoge el borrado de las 2 h |
| 2026-11-04 | Estado de la cola en `sessionStorage`, recuperado solo al recargar | Sobrevive a una recarga sin datos nuevos en la BD; nada importante vive solo en el móvil |
| 2026-11-04 | Día de la apuesta sin hora: hoy = hora actual, otro día = 12:00, al editar sin cambiar el día se conserva | La hora no se usa; misma columna, sin migración |
| 2026-11-04 | **Cola de revisión, elección de apuestas, día de la apuesta y fecha del evento fusionados en `main`** (rama `fase-1-cola-lecturas`) | Verificados en el móvil; pruebas de GitHub Actions en verde; sin migración |
| 2026-11-04 | **Exportación a CSV adelantada antes de la Fase 2** por falta de copias automáticas en el plan gratuito (rama `exportar-csv`) | El usuario ya tiene apuestas reales y Supabase gratis no hace copias de seguridad |
| 2026-11-04 | CSV generado en el servidor (rutas GET con la sesión), dos archivos separados, sin ZIP | El móvil no habla directo con Supabase; los móviles bloquean varias descargas; un ZIP obliga a descomprimir antes de abrir |
| 2026-11-04 | Formato para Excel en español: BOM, `;`, coma decimal, sin símbolo €; estados y tipos con código interno; columnas extra de promoción, divisa y orden | Se abre bien con doble toque; los códigos y los ids sirven para una futura importación; la copia no pierde datos |
| 2026-11-04 | Protección contra fórmulas solo en texto libre, nunca en números | Un resultado negativo debe seguir siendo un número en Excel |
| 2026-11-04 | Lectura en tandas de 1000; el simulador local también corta en 1000 | Supabase devuelve como mucho 1000 filas por consulta; la prueba local lo reproduce (1205 apuestas) |
| 2026-11-04 | Sin cambios en `comprobar_rls_en_vivo.sql` | No hay tablas, permisos ni funciones nuevas: la exportación solo lee con la sesión del usuario, ya cubierto por RLS |
