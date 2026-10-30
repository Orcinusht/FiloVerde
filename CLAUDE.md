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
1. Capturas → transcripción con IA (API de Claude, solo desde servidor) → revisión → guardado.
2. Listas, gráficas y métricas.
3. Pendiente de definir.

## Principios

- **Móvil primero**, pensado para usarse con una mano (navegación inferior, botones de ≥ 44 px).
- **Datos en la nube con login.** Nada importante vive solo en el móvil.
- **La IA propone y el usuario decide.** Lo transcrito siempre se revisa antes de guardarse.
- **Apuesta y selecciones separadas.** Una apuesta (simple, combinada o sistema) tiene una o
  varias selecciones, cada una con su propia cuota y estado.
- **Estados de apuesta:** `pendiente`, `ganada`, `perdida`, `anulada`, `cash_out`,
  `media_ganada`, `media_perdida`. Las selecciones usan los mismos menos `cash_out`.
- **Métricas solo con apuestas resueltas**; las `pendiente` no cuentan y las `anulada`
  quedan fuera de las métricas.
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
| Pruebas | `node:test` + PGlite (Postgres en memoria, sin Docker) |
| Hosting | Vercel, despliegue automático desde GitHub (`main`) |

> Ojo: Next.js 16 cambia cosas respecto a versiones antiguas (p. ej. `middleware.ts` ahora es
> `proxy.ts`). Antes de escribir código de Next, mirar `node_modules/next/dist/docs/`.

## Estructura

```
src/
  app/
    (app)/            pantallas con sesión + barra inferior
      apuestas/ graficas/ bankroll/ ajustes/
    login/            pantalla de entrada (providers.ts = proveedores, actions.ts = login en servidor)
    auth/callback/    vuelta de Google (?code) y del email de confirmación (#tokens) → sesión
    auth/confirm/     alternativa para el email si se usa plantilla con token_hash
    api/diagnostico/  comprueba la configuración de Supabase (sin mostrar claves)
    manifest.ts       datos de instalación de la PWA
  components/         piezas de interfaz reutilizables
  lib/
    supabase/         clientes de Supabase (navegador, servidor, proxy)
    server/           SOLO servidor: claves secretas (p. ej. Claude en Fase 1)
  proxy.ts            renueva sesión y protege rutas
supabase/migrations/  esquema de la base de datos (SQL, en orden)
tests/                prueba de seguridad RLS
scripts/              utilidades (generar iconos)
public/               sw.js e iconos
```

## Base de datos

Tablas (todas con `user_id`): `perfiles`, `casas_apuestas`, `estrategias`, `apuestas`,
`selecciones`, `movimientos_bankroll`. Bucket privado de Storage: `capturas`, con rutas
`<user_id>/<archivo>`.

- RLS activado en **todas** las tablas y en el bucket: cada usuario solo ve y modifica lo suyo.
  El rol `anon` (sin sesión) no tiene permisos.
- `selecciones.user_id` debe coincidir con el de su apuesta (FK compuesta `(apuesta_id, user_id)`).
  Igual para casa y estrategia de una apuesta.
- El perfil se crea solo al registrarse (trigger en `auth.users`).
- `divisa` en apuestas y movimientos: si no se indica, toma la del perfil (trigger).
- Estados y tipos con `CHECK` (no enums). Para añadir un estado: nueva migración que cambie el `CHECK`.
- Movimientos: `deposito` y `retirada` con importe positivo; `ajuste` puede ser +/−.

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
npm test             # prueba de seguridad RLS (sin Docker ni internet)  · también la ejecuta GitHub en cada push
npm run lint         # revisar el código
npm run build        # compilar como en producción
npm run iconos       # regenerar iconos provisionales (usa Playwright del sistema)
```

**Desplegar:** hacer push a `main` en GitHub → Vercel publica solo. Las ramas generan
URLs de prueba (preview).

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
