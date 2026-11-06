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
   **Copia de seguridad en CSV fusionada el 2026-11-05** (rama `exportar-csv`, hecha y probada el
   2026-11-04; pruebas de GitHub Actions en verde; sin migración): adelantada antes de la Fase 2.
   **Verificada por el usuario en producción el 2026-11-05.**
2. **Gráficas y métricas: fusionada el 2026-11-05** (rama `fase-2-analisis`, PR #2; pruebas de
   GitHub Actions en verde; sin migración): pantalla **Análisis** (antes "Gráficas") con filtro de
   fechas, resumen, segmentos con barras de beneficio, aciertos por selección y mercado, y resumen
   descriptivo. **Verificada en el móvil con la cuenta de email (5 apuestas).** Falta verificarla en
   producción con la cuenta de Google (35 apuestas). Reglas de cálculo en la sección "Análisis
   (Fase 2)".
   **Retoques del Análisis fusionados el 2026-11-05** (rama `fase-2-retoques-analisis`, PR #3;
   pruebas de GitHub Actions en verde; sin migración): aciertos también por liga, cada fila abre el
   detalle con sus apuestas y se quita "En cifras". **Verificados en el móvil con la cuenta de email
   (5 apuestas).** Falta verificarlos en producción con la cuenta de Google (35 apuestas).
3. **Bankroll y evolución.** **Primera ronda (Bankroll) fusionada el 2026-11-05** (rama
   `fase-3-bankroll`, PR #4; pruebas de GitHub Actions en verde; migración `20261106000001`
   **aplicada** en Supabase): movimientos (depósito, retirada, ajuste y traspaso entre casas), saldo
   global y por casa, en juego, disponible y ROI sobre bankroll; CSV de movimientos. **Verificada en
   el móvil con la cuenta de email.** Falta verificarla en producción con la cuenta de Google (35
   apuestas). **Segunda ronda, parte 1: gestión de casas y estrategias, fusionada el 2026-11-06**
   (rama `fase-3-casas-estrategias`, PR #5; pruebas de GitHub Actions en verde; migración
   `20261107000001` **aplicada** en Supabase): Ajustes → "Casas de apuestas" y "Estrategias" (crear,
   renombrar, archivar y borrar sin uso). **Verificada en el móvil con la cuenta de email.** Falta
   verificarla en producción con la cuenta de Google. **Segunda ronda, parte 2: deportes y ligas,
   fusionada el 2026-11-06** (rama `fase-3-deportes-ligas`, PR #6; pruebas de GitHub Actions en
   verde; migración `20261108000001` **aplicada** en Supabase): renombrar en el catálogo y en las
   apuestas (con aviso "Afecta a N selecciones en M apuestas", todo o nada), archivar/recuperar, borrar
   solo sin uso y "Revisar posibles errores". **Verificada en el móvil con la cuenta de email.** Falta
   verificarla en producción con la cuenta de Google (el detector con los datos reales). El resto de
   la segunda ronda, en Pendiente.

### Pendiente (sin fase asignada salvo indicación; revisado el 2026-11-06, tras fusionar deportes y ligas)
1. **Unir ligas** (paso pequeño posterior; solo ligas, no deportes): pasar las selecciones de una liga a
   otra existente del MISMO deporte (p. ej. "Champions League" → "UEFA Champions League") con el mismo
   aviso N/M y todo o nada, y quitar la sobrante del catálogo. Cuidado: "LaLiga" y "LaLiga Hypermotion"
   son competiciones distintas.
2. **Evolución en el tiempo** (Fase 3, segunda ronda): beneficio acumulado, evolución del saldo,
   rendimiento por mes y por día de la semana, drawdown.
3. **Importación** (de CSV, para restaurar una copia): los CSV de la copia ya usan los códigos internos
   y los ids para poder hacerla.
4. **Fusionar casas o estrategias duplicadas** (aparcado el 2026-11-05): mover apuestas y movimientos
   de una a otra en una función de la BD; cuidado con los traspasos entre las dos. Solo si aparece un
   duplicado real (la regla de nombre único evita los de mayúsculas, tildes y espacios).
5. **Informe con IA con Opus** (`claude-opus-5-5`; Fase 4): sin empezar.

Además:
- **Verificar en producción con la cuenta de Google** Deportes y ligas: el detector "Revisar posibles
  errores" con los datos reales (Galatasaray SK - VfB Stuttgart y Deportivo de A Coruña - Osasuna),
  renombrar con aviso y archivar.
- **Verificar en producción con la cuenta de Google** (35 apuestas) la gestión de casas y estrategias
  (recuentos, crear, repetidos y reservados rechazados, renombrar sin cambiar cifras, archivar y borrar).
- **Verificar el Bankroll en producción con la cuenta de Google** (35 apuestas): saldos por casa y
  global con calculadora, traspaso, ajuste, editar y borrar, y el CSV de bankroll.
- **Verificar el Análisis en producción con la cuenta de Google** (35 apuestas): cifras a mano con
  calculadora, filtro de fechas, "Muestra pequeña" y "En juego"; y los retoques (aciertos por liga,
  detalle de cada fila con el mismo recuento y vuelta al mismo sitio).
- **Resto de reglas de promociones de la Fase 2** (ver Principios): beneficio por promociones
  APARTE, "aumento cobrado" solo si se gana y aumento negativo como dato dudoso. De momento el
  Análisis solo aplica la regla de las apuestas **con crédito**.
- **Comparar "precipitada" al registrar frente a al resolver** (`precipitada_momento`): aparcado
  (las apuestas históricas se registran ya resueltas).
- **SMTP propio** (p. ej. Resend) y **reactivar "Confirm email"** en Supabase antes de abrir la
  app a más gente.
- **Login con Apple** (descomentar en `login/providers.ts` + configurarlo en Supabase y Apple).
- **API-Football** u otra fuente de datos deportivos (Fase 2 o 3).
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
                        casas/ y estrategias/ (gestión: crear, renombrar, archivar y borrar sin uso;
                        opciones/ = pantalla común pagina-opciones.tsx + gestion-opciones.tsx),
                        deportes/ (catálogo: editor-catalogo.tsx con Renombrar —aviso N/M—, Archivar y
                        Borrar sin uso; revisar/ = "Revisar posibles errores"), cuenta
      analisis/         pantalla Análisis (Fase 2): analisis.tsx (servidor: lee y calcula),
                        controles.tsx (periodo, segmento, orden, tipo y Mercado/Liga; todo en la
                        dirección). /graficas redirige aquí (next.config.ts)
        detalle/          las apuestas que forman una fila (segmento o aciertos), con la tarjeta de
                          la lista, Todas/Verdes/Rojas en aciertos y páginas de 50
      bankroll/         Fase 3: page.tsx (global, casas, movimientos con filtros) · casa/[id]/ (detalle de
                        una casa; casa/sin = apuestas sin casa) · nuevo/ y [id]/ (formulario: editor.tsx
                        carga, formulario-movimiento.tsx, actions.ts guarda y borra) · piezas.tsx · filtros.tsx
    api/capturas/     POST subir · transcribir/ (IA) · ver/ (sirve la imagen privada, solo en la revisión)
                      · reintentar/ (reintenta en silencio los borrados de imágenes que fallaron)
    api/exportar/     GET apuestas/, selecciones/ y bankroll/ (copia de seguridad en CSV; responder.ts = común)
    login/            pantalla de entrada (providers.ts = proveedores, actions.ts = login en servidor)
    auth/callback/    vuelta de Google (?code) y del email de confirmación (#tokens) → sesión
    auth/confirm/     alternativa para el email si se usa plantilla con token_hash
    api/diagnostico/  comprueba la configuración de Supabase (sin mostrar claves)
    manifest.ts       datos de instalación de la PWA
  components/         piezas de interfaz reutilizables
    apuestas/         formulario de revisión, flujo de capturas (registro-capturas.tsx: cola con
                      Anterior/Siguiente y resumen), eleccion-apuestas.tsx ("¿Cuáles quieres
                      guardar?"), lista, tarjeta-apuesta.tsx (la tarjeta de la lista, también en el
                      detalle de Análisis), filtros, visor de captura, selector-hora.tsx
  lib/
    apuestas/         lógica común (móvil y servidor): estados, importes, cuotas, fechas,
                      cálculos, validación del formulario, esquema de la IA (propuesta.ts),
                      catalogo-gestion.ts (deportes y ligas: nombres, reservados, uso, selecciones
                      afectadas por un renombrado y detector de posibles errores),
                      opciones.ts (casas y estrategias: nombres válidos, reservados, uso, borrado,
                      archivadas y reconocer el nombre leído por la IA),
                      duplicadas.ts (¿es una copia calcada de otra?), promociones.ts (aumentos,
                      asegurada y crédito: cálculos en céntimos), reintentos-ia.ts (errores de la
                      IA: clasificación, cuáles se reintentan, esperas y mensajes), fecha-evento.ts
                      (traduce el texto de la fecha del evento), cola.ts (estados de la cola)
    exportar/         csv.ts (formato: celdas, columnas, lectura en tandas) · leer.ts (consultas
                      con la sesión del usuario; sin claves, se prueba con un cliente falso)
    analisis/         calculos.ts (funciones puras: métricas, segmentos y aciertos con los ids de
                      sus apuestas, detalle, rachas, periodos, MUESTRA_MINIMA) · leer.ts (consultas
                      con la sesión, en tandas de 1000) · direccion.ts (enlaces de Análisis y del
                      detalle, y lectura de sus parámetros)
    navegador/        reducir-imagen.ts (1.600 px, JPEG, HEIC) · volver-a-lista.ts (vuelta tras
                      guardar/borrar; `rutaVueltaSegura`: ?volver= solo a /apuestas, /analisis… o /bankroll…)
    bankroll/         calculos.ts (funciones puras: saldos por casa y global, ROI, validación del
                      movimiento y su fecha) · leer.ts (casas, movimientos y apuestas, en tandas de 1000)
    supabase/         clientes de Supabase (navegador, servidor, proxy)
    server/           SOLO servidor: env.ts (claves y modelo), ia/ (Claude y precios),
                      capturas.ts (bucket), datos.ts (lecturas de la BD), catalogo.ts y
                      acciones-catalogo.ts (deportes y ligas), acciones-opciones.ts (Server Actions de
                      casas y estrategias) y opciones.ts (sus lecturas y su uso), pendientes.ts (sin revisar),
                      limpieza.ts (capturas temporales: reintento y borrado de las antiguas)
  proxy.ts            renueva sesión y protege rutas
supabase/migrations/  esquema de la base de datos (SQL, en orden)
supabase/pruebas/     comprobación de RLS en vivo (pegar en el SQL Editor; no deja datos)
tests/                prueba de seguridad RLS + lógica de apuestas (logica.test.ts) + copia en CSV (exportar.test.ts)
                      + análisis (analisis.test.ts) + bankroll (bankroll.test.ts) + casas y estrategias (opciones.test.ts)
                      + deportes y ligas (catalogo.test.ts)
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
- Movimientos (`movimientos_bankroll`, ampliada en la Fase 3): ver la sección "Bankroll (Fase 3)".
- **Casas y estrategias** (migración `20261107000001`, solo aditiva y repetible): columna `archivada`
  (no por defecto); **nombre único** por usuario sin mayúsculas, tildes ni espacios (índices
  `casas_nombre_unico` / `estrategias_nombre_unico` con `normalizar_nombre`); **reservados** Sin casa,
  Sin estrategia, Sin dato, Varios y Mixto (CHECK); **no se borran con apuestas** (disparador
  `opcion_sin_apuestas`, SECURITY DEFINER solo para mirar si la cuenta sigue existiendo: al borrar la
  CUENTA entera no bloquea nada); las casas con movimientos ya estaban protegidas (`on delete restrict`).
  Antes de esta migración, borrar una casa o estrategia con apuestas las dejaba en "Sin casa" / "Sin
  estrategia". Todo se enlaza por id: renombrar cambia el nombre en toda la app sin tocar cifras.
- **Gestión en Ajustes** (`/ajustes/casas`, `/ajustes/estrategias`): lista con su uso ("N apuestas · M
  movimientos" en casas), crear, Renombrar, Archivar / Recuperar y Borrar (solo sin uso y con
  confirmación; si se usa: "Esta casa tiene N apuestas y M movimientos: no se puede borrar. Puedes
  renombrarla o archivarla."). Server Actions con la sesión; el servidor valida (vacío, > 80, repetido,
  reservado) y cuenta el uso antes de borrar; la BD lo repite. Errores en español y `[casas:…]` /
  `[estrategias:…]` al log.
- **Archivadas:** no salen en los desplegables para apuestas o movimientos NUEVOS; sí la que ya está
  elegida (editar algo antiguo), como "Nombre (archivada)" con "Recuperar". Siguen contando igual en
  Análisis, Bankroll (su tarjeta sigue visible con la etiqueta ARCHIVADA) y CSV. Una casa archivada
  leída por la IA en una captura se reconoce como existente (`buscarPorNombre`) y se ofrece recuperarla;
  crear una con el nombre de otra (también archivada) devuelve la existente.
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
  liga como TEXTO**; desde el 2026-11-06, **renombrar en el catálogo cambia también ese texto en las
  apuestas** (ver "Deportes y ligas" más abajo) y no se puede borrar lo que se usa.
- **Deportes y ligas** (migración `20261108000001`, solo aditiva y repetible): columna `archivada`;
  reservados (deportes: Mixto, Sin dato, Varios; ligas: Sin dato, Varios); **no se borra en uso**
  (disparador `catalogo_sin_uso`; "en uso" = alguna selección con ese deporte, o con esa liga Y su
  deporte, sin mayúsculas, tildes ni espacios; no bloquea el borrado de la cuenta entera).
  - **Renombrar** (siempre en el catálogo Y en las apuestas, sin opción "solo catálogo"):
    `previsualizar_renombrado(tipo, id)` da N selecciones y M apuestas para el aviso;
    `renombrar_en_catalogo(tipo, id, nombre, N, M)` lo hace TODO O NADA en una sola llamada: si N y M
    ya no coinciden (algo cambió), no aplica nada (hint `cambiado`, se vuelve a pedir confirmación);
    nombre repetido (sin mayúsculas ni tildes; la liga, dentro de su deporte) o reservado: rechazado,
    no se mezcla. Una liga solo cambia en las selecciones de SU deporte. Al renombrar un deporte se
    recalcula el deporte resumen (`deporte_resumen`) de cada apuesta afectada ("Mixto" ↔ uno).
    Funciones `security invoker` (RLS), comprueban `auth.uid()`, sin permiso para `anon`.
  - **Archivados:** fuera de los desplegables y del catálogo que se envía a la IA (`catalogoParaIA`);
    la revisión de capturas los reconoce como existentes (con la escritura del catálogo, sin «nueva»)
    y el desplegable muestra "Nombre (archivada)" con **Recuperar**.
  - **"Revisar posibles errores"** (`/ajustes/deportes/revisar`, contador en Deportes y ligas): agrupa
    selecciones por partido (sin mayúsculas, tildes ni espacios; "vs" y guiones iguales) y fecha del
    evento; marca el grupo si hay más de una liga (contando "Sin liga") o más de un deporte. Ignora
    las selecciones sin fecha. Muestra fecha, ligas (con nº de selecciones), cada apuesta con su liga
    y enlace para corregirla a mano ("← Revisar" vuelve). Es una pista: solo junta partidos escritos
    igual (p. ej. la selección de Galatasaray del 04/11 cae en otro grupo que las del 03/11).
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

## Bankroll (Fase 3, primera ronda)

**Modelo de datos** (migración `20261106000001_fase3_bankroll.sql`, solo aditiva y repetible): amplía
`movimientos_bankroll` (existía desde la Fase 0, vacía; RLS: cada usuario ve, crea, edita y borra
solo lo suyo). Columnas: `fecha`, `tipo` (`deposito` · `retirada` · `ajuste` · `traspaso`), `importe`
(céntimos), `divisa` (la del perfil), `casa_id` (obligatoria), `casa_destino_id` (solo en traspasos),
`notas` (≤ 500), `created_at`, `updated_at` (disparador). Reglas en la BD: importe > 0 en depósito,
retirada y traspaso; ≠ 0 en ajuste (+/−); destino obligatorio solo en traspaso y distinto del origen;
**casas del mismo usuario** por clave compuesta `(casa, user_id)` → `casas_apuestas (id, user_id)`
(imposible usar la casa de otro) con **`on delete restrict`** (no se borra una casa con movimientos);
**fecha no futura** (disparador `movimiento_sin_fecha_futura`, margen de 1 día por la zona horaria; al
editar solo si cambia la fecha). La migración sustituye las dos comprobaciones de la Fase 0
(`movimientos_bankroll_tipo_check` y `movimientos_bankroll_check`).

**Reglas de cálculo** (`src/lib/bankroll/calculos.ts`, funciones puras probadas en `tests/bankroll.test.ts`):
- **Saldo de una casa** = depósitos − retiradas ± ajustes + traspasos recibidos − traspasos enviados +
  beneficio neto (`resultado_economico`) de sus apuestas RESUELTAS.
- **Saldo global** = depósitos − retiradas ± ajustes + beneficio de TODAS las resueltas (también sin
  casa). Los traspasos suman cero en el global.
- Resueltas = ganada, perdida, cash out, media ganada, media perdida. Anuladas y pendientes no suman
  beneficio. Las apuestas con crédito suman su resultado.
- **En juego** = importes de las pendientes (por casa y global). **Disponible estimado** = saldo − en juego.
- **Total depositado / retirado** = suma de depósitos / retiradas (ni traspasos ni ajustes).
- **ROI sobre bankroll** = beneficio de las resueltas / total depositado; con 0 depositado, "—". Por
  casa, igual con lo suyo: una casa que solo recibe traspasos muestra "—" con la nota "solo recibe
  traspasos". Saldo y ROI son "hasta hoy" (no dependen del filtro de Análisis); la fecha no puede ser
  futura, así que "hasta hoy" no incluye dinero que aún no se ha movido.
- **"Sin casa"**: apuestas sin casa (resueltas o pendientes); su beneficio y en juego cuentan en el
  global, sin saldo propio.

**Pantallas** (`/bankroll`, pestaña que ya existía): global (7 cifras) · tarjeta por casa (abre
`/bankroll/casa/[id]`: cifras, sus movimientos con su efecto en la casa y "Ver sus apuestas") · "Sin
casa" · lista de movimientos (más recientes primero; filtros de casa y tipo en la dirección; páginas de
50) · "+ Movimiento". Estado vacío: "Registra tus depósitos y retiradas pasados para que el saldo y el
ROI sean correctos". **Formulario** (`/bankroll/nuevo`, `/bankroll/[id]`): tipo con 4 botones, día (hoy
por defecto; hoy = hora actual, otro día = 12:00; sin futuros), importe con teclado numérico, "Suma /
Resta" en ajustes, casa preseleccionada (la del último movimiento o la única) con "+ Nueva casa…",
origen y destino en traspasos, notas. Borrar pide confirmación. Guardar o borrar vuelve a donde se
abrió (`?volver=`) y refresca las cifras (`revalidatePath('/bankroll', 'layout')`). Todo con la sesión
del usuario; la validación se repite en el servidor y la BD también lo impide. Errores en español y
`[bankroll:…]` al log.

**CSV**: Ajustes → "Descargar bankroll (CSV)" (`/api/exportar/bankroll`): id, fecha, tipo, importe
(ajustes negativos como número), casa, casa_destino, notas (protegidas contra fórmulas), creada y
modificada; mismo formato que los otros archivos.

## Análisis (Fase 2)

Pantalla `/analisis` (pestaña "Análisis"). Cálculos en `src/lib/analisis/calculos.ts` (funciones
puras, probadas en `tests/analisis.test.ts`); lectura en `src/lib/analisis/leer.ts`, en el servidor
con la sesión del usuario (RLS) y filtrando además por su id (de la sesión, nunca del navegador):
apuestas resueltas y pendientes del periodo (las anuladas no se leen), en tandas de 1000 con orden
fijo (fecha, creación, id), sus selecciones (por lotes de 150 ids) y los nombres de casa y
estrategia. Error → mensaje en español y `[analisis:leer]` al log. Sin migración.

- **Filtro de fechas** (en la dirección: `?periodo=mes|30d|ano|personalizado&desde=&hasta=`): Todo,
  Este mes, Últimos 30 días (contando hoy), Este año y Personalizado (los dos días incluidos; al
  revés se dan la vuelta). Por `apuestas.fecha`, con los días de **España**. Se filtra en la
  consulta. **Todo** respeta el filtro: resumen, "En juego", rachas, segmentos y aciertos.
- **Resueltas** = `ganada`, `perdida`, `cash_out`, `media_ganada`, `media_perdida` con resultado
  económico. Anuladas y pendientes fuera de todas las métricas; las pendientes salen aparte en
  **"En juego"** (número e importe). Una resuelta sin resultado no cuenta y sale un aviso (hoy no hay).
- `resultado_economico` es el **beneficio neto** (ver "Base de datos"); beneficio = su suma.
- **Importe apostado** = importe completo (también en medias y cash out). **Yield** = beneficio /
  importe apostado. **% de acierto** = resultado > 0 / (> 0 + < 0); un resultado exactamente 0
  cuenta en resueltas, importe y yield, pero no en el acierto. **Cuota media** = media simple de la
  cuota total (de las que la tienen). **Importe medio** = importe apostado / resueltas.
- **Con crédito** (`promo_tipo = 'credito'`): su resultado SÍ suma al beneficio neto, pero NO entran
  en el importe apostado, el importe medio, el yield ni el % de acierto (numerador y denominador),
  tampoco dentro de cada segmento. Si hay alguna: "Con crédito: N apuestas, X € obtenidos". Las
  demás promociones cuentan como apuestas normales.
- **Rachas** (solo con las apuestas del periodo; se dice en pantalla): por fecha (desempate:
  creación, id); > 0 suma a la ganadora, < 0 a la perdedora; 0 y anuladas ni rompen ni suman.
  Actual (con su signo), mejor ganadora y peor perdedora.
- Cualquier división por cero → **"—"**. Se cuentan APUESTAS, no selecciones.
- **Segmentos**: casa ("Sin casa"), estrategia ("Sin estrategia"), tipo, deporte (`apuestas.deporte`,
  con "Mixto"), liga (deporte + liga), mercado, rango de cuota (sobre la total, con `<=`: Hasta 1,50
  · 1,51 – 2,00 · 2,01 – 3,00 · Más de 3,00; sin cuota → "Sin dato"), directo (Pre-partido · Directo
  viendo · Directo sin ver) y precipitada (Sí · No). Cada uno: nº, apostado, beneficio, yield,
  acierto; orden por beneficio o por nº (`?seg=…&orden=n`). Liga y mercado: la apuesta cuenta solo
  si TODAS sus selecciones coinciden (sin mayúsculas, tildes ni espacios de más; se muestra la forma
  más usada); si no, "Varios"; todas vacías → "Sin dato"; dato + vacío → "Varios".
- **"Muestra pequeña"** con n < `MUESTRA_MINIMA` (10; constante única en `calculos.ts`).
- **Barras** de beneficio horizontales desde una línea central (verde positivo, rojo negativo), con
  HTML/CSS propio, sin librería de gráficas.
- **Aciertos por selección** (sin dinero: el dinero es de la apuesta y no se reparte entre
  selecciones), agrupados por **Mercado** o por **Liga** (deporte + liga, sin mayúsculas, tildes ni
  espacios; `?ac=liga`): selecciones con estado propio `ganada` (verde) o `perdida` (roja) de
  apuestas resueltas; verdes, rojas, % verdes y total; "Muestra pequeña"; filtro por tipo de apuesta
  (`?tipo=mismo_partido`). El beneficio por mercado o liga está en los segmentos.
- **Detalle de cada fila** (`/analisis/detalle`, desde el 2026-11-05): TODAS las filas (segmentos y
  aciertos, también "Varios" y "Sin dato") se pueden pulsar y muestran las apuestas que forman esa
  cifra, con la tarjeta de la lista de Apuestas. Las funciones de cálculo devuelven los **ids** de
  las apuestas de cada fila (`segmentar`, `aciertos`, `detalle`): la lista y la cifra salen de la
  misma fuente y no pueden diferir (lo prueban `npm test` en los 9 segmentos y las 2 tablas, y la
  prueba local en el navegador). Cabecera: "Mercado: X · desde a hasta · N apuestas"; en aciertos,
  "N selecciones en M apuestas" con **Todas / Verdes / Rojas** (`?color=`). Solo resueltas. Páginas
  de 50. Respeta el periodo y el tipo. El servidor vuelve a leer y calcular (no se pasan ids por la
  dirección).
- **Todo en la dirección**: Análisis (`periodo`, `desde`, `hasta`, `seg`, `orden`, `ac`, `tipo`) →
  detalle (lo mismo + `vista`, `clave`, `color`, `pagina`) → apuesta (`?volver=` con la dirección
  del detalle). "← Análisis" y guardar o borrar en la apuesta vuelven al mismo sitio (sin el aviso
  breve, que es de la lista). `lib/analisis/direccion.ts` construye y lee las direcciones
  (URLSearchParams codifica tildes, espacios y símbolos).
- **`?volver=` seguro** (`rutaVueltaSegura`): solo `/apuestas` o `/analisis` seguido de nada, "/" o
  "/" + minúsculas, cifras y guiones, y después opcionalmente "?…". Rechaza `//dominio`, `/\dominio`,
  `/analisisx`, `/analisis@dominio`, sus versiones con `%2F`/`%5C` y cualquier dirección externa
  (si no vale, vuelve a `/apuestas`).
- **"En cifras" (resumen descriptivo) eliminado el 2026-11-05**: no se entendía en 5 segundos y
  repetía las tarjetas y el orden por beneficio de las tablas.
- **Avisos fijos** en pantalla: qué cuenta (resueltas), sin marcar = pre-partido y normal, y que con
  muestra pequeña no se saca ninguna conclusión.

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
npm test             # prueba de seguridad RLS + lógica de apuestas + copia en CSV + análisis + bankroll + casas y estrategias + deportes y ligas (sin Docker ni internet) · también en GitHub
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
| 2026-11-02 | Selecciones enlazadas al catálogo por TEXTO, no por id | Borrar o renombrar en el catálogo no toca las apuestas guardadas (cambiado el 2026-11-06: renombrar sí las actualiza) |
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
| 2026-11-05 | **Copia de seguridad en CSV fusionada en `main`** (rama `exportar-csv`, PR #1) | Pruebas de GitHub Actions en verde; producción desplegada en Vercel; sin migración |
| 2026-11-05 | Copia de seguridad en CSV **verificada por el usuario en producción** | Descarga y apertura comprobadas en el móvil |
| 2026-11-05 | **Fase 2 empezada** en la rama `fase-2-analisis`: pestaña "Gráficas" → **"Análisis"** (`/analisis`; `/graficas` redirige) | Reglas de cálculo cerradas por el usuario (sección "Análisis (Fase 2)") |
| 2026-11-05 | Cálculos en funciones puras (`lib/analisis/calculos.ts`) y lectura en el servidor con la sesión, en tandas de 1000; sin migración ni cálculo en la BD | Probables con `npm test`; el volumen es pequeño; el móvil no habla directo con Supabase |
| 2026-11-05 | Con crédito: suman al beneficio neto, fuera del importe, yield y acierto (también por segmento) | Su importe no es dinero propio: el yield no sale inflado (regla de Principios, ajustada por el usuario) |
| 2026-11-05 | Liga y mercado agrupados sin mayúsculas, tildes ni espacios; la apuesta cuenta solo si todas sus selecciones coinciden ("Varios" / "Sin dato") | "1X2" y "1x2" son el mismo mercado; una combinada mixta no se reparte |
| 2026-11-05 | Barras de beneficio con HTML/CSS propio, sin Recharts | 0 KB extra, sin riesgo con Next 16 / React 19, horizontales para nombres largos en el móvil; revisar si la Fase 3 necesita líneas |
| 2026-11-05 | Filtros de la pantalla en la dirección (`periodo`, `desde`, `hasta`, `seg`, `orden`, `tipo`) | Se puede recargar o volver atrás sin perderlos |
| 2026-11-05 | `MUESTRA_MINIMA = 10` en un solo sitio (el resumen descriptivo que lo usaba se eliminó el 2026-11-05) | Con pocas apuestas las cifras engañan; sin consejos |
| 2026-11-05 | El simulador local admite el filtro `lt` (además de corte a 1000 filas) | La prueba completa usa el filtro de fechas real |
| 2026-11-05 | Sin cambios en `comprobar_rls_en_vivo.sql` | Sin tablas, permisos ni funciones nuevas: solo lecturas con la sesión, ya cubiertas por RLS (prueba nueva en `rls.test.mjs` con las consultas del Análisis) |
| 2026-11-05 | **Fase 2 (pantalla Análisis) fusionada en `main`** (rama `fase-2-analisis`, PR #2) | Verificada en el móvil con la cuenta de email (5 apuestas); pruebas de GitHub Actions en verde; producción desplegada en Vercel; sin migración. Falta verificarla en producción con la cuenta de Google (35 apuestas) |
| 2026-11-05 | **Retoques del Análisis** en la rama `fase-2-retoques-analisis` (sin migración) | Pedidos por el usuario antes de la Fase 3 |
| 2026-11-05 | Aciertos por selección también por **liga** (deporte + liga), con selector Mercado / Liga y sin dinero | El dinero es de la apuesta: no se puede repartir entre selecciones de combinadas y "mismo partido" |
| 2026-11-05 | **Detalle de cada fila** en una pantalla propia (`/analisis/detalle`) con todo en la dirección, en vez de un panel dentro de Análisis | Atrás del móvil, recargar y volver de una apuesta funcionan solos y dejan al usuario en el mismo sitio |
| 2026-11-05 | Las funciones de cálculo devuelven los ids de cada fila; el detalle se recalcula en el servidor con las mismas funciones | El recuento de la lista y la cifra de la fila salen de la misma fuente: no pueden diferir |
| 2026-11-05 | Tarjeta de la lista sacada a `tarjeta-apuesta.tsx` y reutilizada en el detalle | Mismo aspecto en las dos pantallas, sin duplicar código |
| 2026-11-05 | `?volver=` acepta también `/analisis…` con una regla estricta de ruta (probada con `//`, `\`, `@`, `%2F`, `%5C` y externas) | Volver al Análisis sin abrir la puerta a redirecciones a otras webs |
| 2026-11-05 | **"En cifras" eliminado** (código y pruebas) | No pasaba los criterios: no se entendía en 5 segundos y no aportaba nada que no estuviera ya en tarjetas y tablas |
| 2026-11-05 | Corregido: la cuenta de Google tiene 35 apuestas (el "39" era el total de las dos cuentas) | Dato del usuario |
| 2026-11-05 | **Retoques del Análisis fusionados en `main`** (rama `fase-2-retoques-analisis`, PR #3) | Verificados en el móvil con la cuenta de email (5 apuestas); pruebas de GitHub Actions en verde; producción desplegada en Vercel; sin migración. Falta verificarlos en producción con la cuenta de Google (35 apuestas) |
| 2026-11-05 | **Fase 3 empezada (primera ronda: Bankroll)** en la rama `fase-3-bankroll` | La evolución en el tiempo y la gestión de casas quedan para la segunda ronda |
| 2026-11-05 | Se amplía `movimientos_bankroll` (de la Fase 0, vacía) en vez de crear otra tabla | Reutiliza su RLS, permisos, divisa por defecto y pruebas; no hay datos que migrar |
| 2026-11-05 | Casas del movimiento comprobadas por clave compuesta `(casa, user_id)` | Más fuerte que una regla de RLS: la BD impide usar la casa de otro usuario venga de donde venga |
| 2026-11-05 | `on delete restrict` en las casas de los movimientos | No se puede borrar una casa con movimientos; con apuestas, se bloqueará en la gestión de casas (segunda ronda) |
| 2026-11-05 | Ajuste ≠ 0 (puede ser + o −); depósito, retirada y traspaso > 0 | Un ajuste de 0 no cambia nada |
| 2026-11-05 | **Sin fechas futuras** en movimientos (servidor + disparador en la BD, margen de 1 día) | El saldo "hasta hoy" no incluye dinero que aún no se ha movido |
| 2026-11-05 | ROI por casa con sus propios depósitos; "—" y nota si solo recibe traspasos | Los traspasos no son depósitos (regla del usuario) |
| 2026-11-05 | Cálculos en funciones puras y lectura en el servidor en tandas de 1000; formulario con Server Actions | Probables con `npm test`; el móvil no habla directo con Supabase |
| 2026-11-05 | La pestaña Bankroll ya existía: la barra sigue con 4 entradas | Sin saturar la navegación |
| 2026-11-05 | `SelectorOpcion` admite el texto de la opción vacía ("Elige una casa") | La casa es obligatoria en los movimientos; en las apuestas no cambia nada |
| 2026-11-05 | `comprobar_rls_en_vivo.sql` con 9 comprobaciones nuevas de bankroll (55 en total) | Desde la fusión (2026-11-05), la versión de `main` ya es la nueva (55 comprobaciones; crea movimientos con casa) |
| 2026-11-05 | El nombre `20261106000001` de la migración de bankroll no es una fecha real (se hizo el 2026-11-05) | Solo marca el orden; ya está aplicada y no se renombra |
| 2026-11-05 | **Fase 3, primera ronda (Bankroll), fusionada en `main`** (rama `fase-3-bankroll`, PR #4) | Migración aplicada en Supabase; verificada en el móvil con la cuenta de email; pruebas de GitHub Actions en verde; producción desplegada en Vercel. Falta verificarla en producción con la cuenta de Google (35 apuestas) |
| 2026-11-05 | **Fase 3, segunda ronda, parte 1: gestión de casas y estrategias** en la rama `fase-3-casas-estrategias` | Hoy solo se creaban al vuelo y una creada por error se quedaba para siempre |
| 2026-11-05 | Borrar solo sin uso (0 apuestas y, en casas, 0 movimientos), en servidor y en la BD (disparador) | Borrar una en uso movería su beneficio a "Sin casa"/"Sin estrategia" y cambiaría saldos y Análisis sin avisar |
| 2026-11-05 | El disparador no bloquea el borrado de la cuenta entera (mira si la cuenta sigue existiendo) | Borrar una cuenta con casas, estrategias, apuestas y movimientos debe seguir funcionando (probado) |
| 2026-11-05 | Nombre único sin mayúsculas, tildes ni espacios y nombres reservados, también en la BD | Evita duplicados como "Bet365"/"bet365" y choques con las etiquetas de Análisis y Bankroll |
| 2026-11-05 | **Archivar** (columna `archivada`) como alternativa a borrar | Ocultar de los desplegables sin perder histórico ni cifras |
| 2026-11-05 | Las listas de casas y estrategias de los formularios incluyen las archivadas (marcadas) y el desplegable las filtra | La revisión reconoce una casa archivada leída por la IA (y ofrece recuperarla) en vez de intentar crear otra |
| 2026-11-05 | Fusionar duplicadas: aparcado | Hoy no hay duplicados y la regla de nombre único evita los nuevos; mover datos tiene riesgo |
| 2026-11-05 | Deportes y ligas con "renombrar también en mis apuestas": tarea propia después de esta | Las selecciones guardan el texto; requiere aviso previo y cambio todo o nada |
| 2026-11-05 | `comprobar_rls_en_vivo.sql` con 8 comprobaciones nuevas (63 en total) | Nombres repetidos y reservados, borrado con apuestas y que otra cuenta no renombre, archive ni borre |
| 2026-11-06 | **Gestión de casas y estrategias fusionada en `main`** (rama `fase-3-casas-estrategias`, PR #5) | Migración `20261107000001` aplicada en Supabase; verificada en el móvil con la cuenta de email; pruebas de GitHub Actions en verde; producción desplegada en Vercel. Falta verificarla en producción con la cuenta de Google |
| 2026-11-06 | El nombre `20261107000001` de la migración no es una fecha real | Solo marca el orden; ya está aplicada y no se renombra |
| 2026-11-06 | **Fase 3, segunda ronda, parte 2: deportes y ligas** en la rama `fase-3-deportes-ligas` | Corregir nombres con seguridad y detectar errores de datos |
| 2026-11-06 | Renombrar SIEMPRE en el catálogo y en las apuestas a la vez (sin "solo catálogo") | Renombrar solo el catálogo crea los descuadres entre catálogo y apuestas |
| 2026-11-06 | Renombrado con funciones de la BD: aviso N/M y aplicación todo o nada que comprueba que N y M no han cambiado | Lo confirmado es exactamente lo que se cambia; nunca un bucle desde la app |
| 2026-11-06 | No borrar deportes ni ligas en uso (disparador), sin bloquear el borrado de la cuenta | Borrar algo en uso dejaría apuestas con nombres fuera del catálogo |
| 2026-11-06 | Archivados fuera del catálogo de la IA pero reconocidos en la revisión (con Recuperar) | Mismo criterio que casas y estrategias |
| 2026-11-06 | Detector "Revisar posibles errores" por partido + fecha con ligas o deportes distintos, calculado en el servidor con funciones puras | Pista con pocos falsos positivos; sin corrección automática: decide el usuario |
| 2026-11-06 | "Unir ligas" como paso posterior; no para deportes | Unir deportes obliga a juntar ligas que chocan; caso real solo de ligas |
| 2026-11-06 | Catálogo leído en tandas de 1000 (antes, con límites de 200/2000) | Supabase devuelve como mucho 1000 filas por consulta |
| 2026-11-06 | El simulador local responde a las funciones que devuelven filas como PostgREST (lista de filas) | Las funciones nuevas devuelven tablas (N y M) |
| 2026-11-06 | `?volver=` acepta también `/ajustes…` (misma regla estricta) | Volver de una apuesta a "Revisar posibles errores" |
| 2026-11-06 | `comprobar_rls_en_vivo.sql` con 8 comprobaciones nuevas (71 en total); la versión de main sigue pasando con la migración | Renombrar con aviso, en uso, reservados y que otra cuenta no vea ni toque nada |
| 2026-11-06 | **Deportes y ligas fusionado en `main`** (rama `fase-3-deportes-ligas`, PR #6) | Migración `20261108000001` aplicada en Supabase; verificado en el móvil con la cuenta de email; pruebas de GitHub Actions en verde; producción desplegada en Vercel. Falta verificarlo en producción con la cuenta de Google (el detector con los datos reales) |
| 2026-11-06 | El nombre `20261108000001` de la migración no es una fecha real | Solo marca el orden; ya está aplicada y no se renombra |
