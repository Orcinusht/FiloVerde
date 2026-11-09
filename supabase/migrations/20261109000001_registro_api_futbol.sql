-- =============================================================
-- Filoverde · Mejoras del registro, tarea 3: API-FOOTBALL (solo fútbol).
-- SOLO ADITIVA y repetible: se puede pegar dos veces sin errores. No toca ninguna tabla existente,
-- así que la app publicada en main sigue funcionando igual (no usa estas tablas).
--
-- Cuatro tablas nuevas, por usuario, con RLS (cada usuario solo ve y toca lo suyo), sin permisos
-- para visitantes sin sesión y con "on delete cascade" a la cuenta (borrar una cuenta entera
-- borra también esto). No entran en la copia de seguridad CSV: se regeneran solas.
--
--   * api_futbol_dias    caché de partidos: UNA fila por día (hora de España) con la lista de
--                        partidos de ese día (solo los campos necesarios). Se refresca entera.
--   * api_futbol_equipos equivalencias recordadas: nombre escrito en la captura (normalizado) →
--                        equipo de la API (id y nombre).
--   * api_futbol_ligas   equivalencias recordadas: liga de la API (id) → liga de TU catálogo.
--   * api_futbol_uso     llamadas del día (UTC, como la API) para el tope diario y lo que dice la
--                        API que queda. Una fila por día.
-- =============================================================

-- ---------- caché de partidos (una fila por día) ----------
-- partidos = lista JSON de objetos con: id, fecha (AAAA-MM-DD), hora (HH:MM o ''), liga_id, liga,
-- pais, local_id, local, visitante_id, visitante, estado. completo = false si la API decía que
-- había más páginas y no se pudieron traer todas (entonces no se da por buena para siempre).
create table if not exists public.api_futbol_dias (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha        date not null,
  partidos     jsonb not null default '[]'::jsonb,
  completo     boolean not null default true,
  actualizado  timestamptz not null default now(),
  primary key (user_id, fecha),
  constraint api_futbol_dias_lista check (jsonb_typeof(partidos) = 'array')
);

-- ---------- equipos recordados ----------
create table if not exists public.api_futbol_equipos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre_captura text not null check (length(nombre_captura) between 1 and 120),
  equipo_id      integer not null check (equipo_id > 0),
  equipo_nombre  text not null check (length(equipo_nombre) between 1 and 120),
  actualizado    timestamptz not null default now()
);
create unique index if not exists api_futbol_equipos_unico on public.api_futbol_equipos (user_id, nombre_captura);

-- La FK de api_futbol_ligas necesita que (id, user_id) sea único en ligas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ligas_id_user') then
    alter table public.ligas add constraint ligas_id_user unique (id, user_id);
  end if;
end;
$$;

-- ---------- ligas recordadas ----------
-- La liga de tu catálogo va por id (si la renombras, la equivalencia sigue valiendo; si la borras,
-- la equivalencia desaparece). Clave compuesta: imposible apuntar a la liga de otro usuario.
create table if not exists public.api_futbol_ligas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  liga_api_id      integer not null check (liga_api_id > 0),
  liga_api_nombre  text not null check (length(liga_api_nombre) between 1 and 120),
  pais             text not null default '' check (length(pais) <= 80),
  liga_id          uuid not null,
  actualizado      timestamptz not null default now(),
  constraint api_futbol_ligas_liga_fk foreign key (liga_id, user_id)
    references public.ligas (id, user_id) on delete cascade
);
create unique index if not exists api_futbol_ligas_unico on public.api_futbol_ligas (user_id, liga_api_id);
create index if not exists api_futbol_ligas_liga_idx on public.api_futbol_ligas (liga_id);

-- ---------- uso del día (tope diario) ----------
create table if not exists public.api_futbol_uso (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dia          date not null, -- día UTC (la API reinicia su contador a las 00:00 UTC)
  llamadas     integer not null default 0 check (llamadas >= 0),
  restantes    integer check (restantes >= 0),  -- x-ratelimit-requests-remaining de la última respuesta
  limite_dia   integer check (limite_dia >= 0), -- x-ratelimit-requests-limit
  pausa_hasta  timestamptz,                      -- tras un 429: no se consulta hasta entonces
  actualizado  timestamptz not null default now(),
  primary key (user_id, dia)
);

-- ---------- Seguridad: cada usuario solo ve y toca lo suyo ----------
revoke all on public.api_futbol_dias, public.api_futbol_equipos, public.api_futbol_ligas, public.api_futbol_uso from anon;
grant select, insert, update, delete
  on public.api_futbol_dias, public.api_futbol_equipos, public.api_futbol_ligas, public.api_futbol_uso
  to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['api_futbol_dias', 'api_futbol_equipos', 'api_futbol_ligas', 'api_futbol_uso']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ver lo mío" on public.%I', t);
    execute format('drop policy if exists "crear lo mío" on public.%I', t);
    execute format('drop policy if exists "editar lo mío" on public.%I', t);
    execute format('drop policy if exists "borrar lo mío" on public.%I', t);
    execute format(
      'create policy "ver lo mío" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "crear lo mío" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "editar lo mío" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "borrar lo mío" on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;
