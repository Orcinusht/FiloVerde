-- =============================================================
-- Filoverde · Fase 1 · Catálogo de deportes y ligas
-- SOLO ADITIVA y se puede ejecutar varias veces sin errores.
--   * Tablas deportes y ligas (cada liga es de un deporte), por usuario, con RLS.
--     Nombres únicos por usuario sin distinguir mayúsculas NI tildes (Futbol = Fútbol).
--     "Mixto" está reservado: no se puede crear un deporte con ese nombre.
--   * Lista inicial para cada usuario (y para las cuentas nuevas al registrarse;
--     si eso fallara, el registro NO falla).
--   * Se copian al catálogo los deportes y ligas ya escritos en las apuestas.
--   * apuestas.deporte: deporte resumen (un deporte, "Mixto" o vacío). Lo calcula
--     SIEMPRE la base de datos al guardar (guardar_apuesta), nunca el navegador.
--   * Las selecciones siguen guardando deporte y liga como TEXTO: borrar o renombrar
--     algo del catálogo no cambia las apuestas guardadas.
--   * transcripciones.version_instrucciones: para comparar el coste real por versión.
-- =============================================================

-- ---------- Normalizar nombres (minúsculas, sin tildes, espacios simples) ----------

create or replace function public.normalizar_nombre(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
           translate(lower(trim(coalesce(t, ''))),
                     'áàâäãéèêëíìîïóòôöõúùûüñç',
                     'aaaaaeeeeiiiiooooouuuunc'),
           '\s+', ' ', 'g')
$$;

-- ---------- deportes ----------

create table if not exists public.deportes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 60),
  created_at  timestamptz not null default now(),
  constraint deportes_id_user unique (id, user_id),
  constraint deportes_no_mixto check (public.normalizar_nombre(nombre) <> 'mixto')
);

create unique index if not exists deportes_nombre_unico
  on public.deportes (user_id, public.normalizar_nombre(nombre));

-- ---------- ligas ----------

create table if not exists public.ligas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deporte_id  uuid not null,
  nombre      text not null check (length(trim(nombre)) between 1 and 80),
  created_at  timestamptz not null default now(),
  -- La liga y su deporte son del mismo usuario. Borrar un deporte del catálogo borra
  -- sus ligas del catálogo (las apuestas guardadas no cambian: guardan texto).
  constraint ligas_deporte_fk foreign key (deporte_id, user_id)
    references public.deportes (id, user_id) on delete cascade
);

create unique index if not exists ligas_nombre_unico
  on public.ligas (user_id, deporte_id, public.normalizar_nombre(nombre));
create index if not exists ligas_deporte_idx on public.ligas (deporte_id);

-- ---------- Seguridad: cada usuario solo ve y toca lo suyo ----------

revoke all on public.deportes, public.ligas from anon;
grant select, insert, update, delete on public.deportes, public.ligas to authenticated;

alter table public.deportes enable row level security;
alter table public.ligas    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['deportes', 'ligas']
  loop
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

-- ---------- Lista inicial ----------
-- Solo la usa la propia base de datos (al registrarse y en esta migración):
-- nadie puede llamarla desde la app.

create or replace function public.sembrar_catalogo(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inicial constant jsonb := '{
    "Fútbol": ["LaLiga", "LaLiga Hypermotion", "Premier League", "Serie A", "Bundesliga", "Ligue 1",
               "Champions League", "Europa League", "Conference League", "Copa del Rey"],
    "Tenis": ["ATP", "WTA", "Challenger", "ITF", "Grand Slam"],
    "Baloncesto": ["NBA", "Liga ACB", "Euroliga"],
    "Béisbol": ["MLB"],
    "Fútbol americano": ["NFL", "NCAA"],
    "Hockey": ["NHL"],
    "Balonmano": ["Liga ASOBAL", "EHF Champions League"],
    "Voleibol": ["Superliga"],
    "Rugby": ["Seis Naciones", "Top 14"],
    "MMA/Boxeo": ["UFC", "Boxeo"],
    "Ciclismo": ["Tour de Francia", "Giro de Italia", "La Vuelta"],
    "eSports": ["League of Legends", "Counter-Strike", "Valorant"]
  }';
  d record;
  v_deporte uuid;
begin
  for d in select key as nombre, value as ligas from jsonb_each(inicial)
  loop
    insert into public.deportes (user_id, nombre) values (p_user, d.nombre)
    on conflict do nothing;
    select id into v_deporte from public.deportes
      where user_id = p_user and public.normalizar_nombre(nombre) = public.normalizar_nombre(d.nombre);
    insert into public.ligas (user_id, deporte_id, nombre)
      select p_user, v_deporte, l from jsonb_array_elements_text(d.ligas) as l
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.sembrar_catalogo(uuid) from public, anon, authenticated;

-- Al registrarse una cuenta nueva. Si algo falla, solo se anota un aviso: el registro sigue.
create or replace function public.sembrar_catalogo_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.sembrar_catalogo(new.id);
  exception when others then
    raise warning 'No se pudo crear el catálogo inicial: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.sembrar_catalogo_nuevo_usuario() from public, anon, authenticated;

drop trigger if exists al_crear_usuario_catalogo on auth.users;
create trigger al_crear_usuario_catalogo
  after insert on auth.users
  for each row execute function public.sembrar_catalogo_nuevo_usuario();

-- Cuentas que ya existen.
select public.sembrar_catalogo(id) from auth.users;

-- ---------- Copiar al catálogo lo que ya está escrito en las apuestas ----------

insert into public.deportes (user_id, nombre)
  select distinct on (s.user_id, public.normalizar_nombre(s.deporte)) s.user_id, trim(s.deporte)
  from public.selecciones s
  where s.deporte is not null and trim(s.deporte) <> ''
    and public.normalizar_nombre(s.deporte) <> 'mixto'
    and length(trim(s.deporte)) <= 60
on conflict do nothing;

insert into public.ligas (user_id, deporte_id, nombre)
  select distinct on (s.user_id, d.id, public.normalizar_nombre(s.liga)) s.user_id, d.id, trim(s.liga)
  from public.selecciones s
  join public.deportes d
    on d.user_id = s.user_id and public.normalizar_nombre(d.nombre) = public.normalizar_nombre(s.deporte)
  where s.liga is not null and trim(s.liga) <> '' and length(trim(s.liga)) <= 80
on conflict do nothing;

-- ---------- apuestas.deporte (deporte resumen) ----------

alter table public.apuestas add column if not exists deporte text;
create index if not exists apuestas_user_deporte_idx on public.apuestas (user_id, deporte);

-- Todas las selecciones del mismo deporte → ese deporte; varios → "Mixto"; ninguno → vacío.
create or replace function public.deporte_resumen(p_apuesta uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when count(distinct public.normalizar_nombre(s.deporte)) = 0 then null
           when count(distinct public.normalizar_nombre(s.deporte)) = 1 then min(trim(s.deporte))
           else 'Mixto'
         end
  from public.selecciones s
  where s.apuesta_id = p_apuesta and s.deporte is not null and trim(s.deporte) <> ''
$$;

update public.apuestas a set deporte = public.deporte_resumen(a.id)
  where a.deporte is distinct from public.deporte_resumen(a.id);

-- ---------- transcripciones: versión de las instrucciones de la IA ----------
-- Vacía = versión 1 (antes de este cambio). Sirve para comparar el coste real.

alter table public.transcripciones
  add column if not exists version_instrucciones smallint
    check (version_instrucciones is null or version_instrucciones between 1 and 999);

-- ---------- guardar_apuesta: calcula el deporte resumen ----------
-- Misma firma. Además: cada selección necesita deporte (y no puede ser "Mixto"),
-- y apuestas.deporte se recalcula aquí siempre (lo que mande el navegador se ignora).

create or replace function public.guardar_apuesta(p_id uuid, p_apuesta jsonb, p_selecciones jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_selecciones) is distinct from 'array' then
    raise exception 'selecciones debe ser una lista' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_selecciones) as s(v)
    where coalesce(trim(s.v->>'deporte'), '') = ''
  ) then
    raise exception 'falta el deporte de una selección' using errcode = '22023', hint = 'deporte';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_selecciones) as s(v)
    where public.normalizar_nombre(s.v->>'deporte') = 'mixto'
  ) then
    raise exception '"Mixto" no es un deporte de selección' using errcode = '22023', hint = 'deporte';
  end if;

  if p_id is null then
    insert into public.apuestas (
      casa_id, estrategia_id, tipo, fecha, importe, cuota_total, ganancia_potencial,
      estado, resultado_economico, notas, imagen_origen, transcripcion_id, transcripcion_indice
    ) values (
      nullif(p_apuesta->>'casa_id', '')::uuid,
      nullif(p_apuesta->>'estrategia_id', '')::uuid,
      coalesce(p_apuesta->>'tipo', 'simple'),
      coalesce(nullif(p_apuesta->>'fecha', '')::timestamptz, now()),
      (p_apuesta->>'importe')::bigint,
      nullif(p_apuesta->>'cuota_total', '')::numeric,
      nullif(p_apuesta->>'ganancia_potencial', '')::bigint,
      coalesce(p_apuesta->>'estado', 'pendiente'),
      nullif(p_apuesta->>'resultado_economico', '')::bigint,
      nullif(p_apuesta->>'notas', ''),
      nullif(p_apuesta->>'imagen_origen', ''),
      nullif(p_apuesta->>'transcripcion_id', '')::uuid,
      nullif(p_apuesta->>'transcripcion_indice', '')::smallint
    )
    returning id into v_id;
  else
    update public.apuestas set
      casa_id             = nullif(p_apuesta->>'casa_id', '')::uuid,
      estrategia_id       = nullif(p_apuesta->>'estrategia_id', '')::uuid,
      tipo                = coalesce(p_apuesta->>'tipo', 'simple'),
      fecha               = coalesce(nullif(p_apuesta->>'fecha', '')::timestamptz, fecha),
      importe             = (p_apuesta->>'importe')::bigint,
      cuota_total         = nullif(p_apuesta->>'cuota_total', '')::numeric,
      ganancia_potencial  = nullif(p_apuesta->>'ganancia_potencial', '')::bigint,
      estado              = coalesce(p_apuesta->>'estado', 'pendiente'),
      resultado_economico = nullif(p_apuesta->>'resultado_economico', '')::bigint,
      notas               = nullif(p_apuesta->>'notas', '')
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'apuesta no encontrada' using errcode = 'P0002';
    end if;

    delete from public.selecciones where apuesta_id = v_id;
  end if;

  insert into public.selecciones (
    apuesta_id, orden, evento, liga, deporte, mercado, pronostico, cuota, estado, evento_fecha, evento_hora
  )
  select v_id,
         (s.n - 1)::smallint,
         nullif(s.v->>'evento', ''),
         nullif(trim(s.v->>'liga'), ''),
         trim(s.v->>'deporte'),
         nullif(s.v->>'mercado', ''),
         nullif(s.v->>'pronostico', ''),
         nullif(s.v->>'cuota', '')::numeric,
         coalesce(s.v->>'estado', 'pendiente'),
         nullif(s.v->>'evento_fecha', '')::date,
         nullif(s.v->>'evento_hora', '')::time
  from jsonb_array_elements(p_selecciones) with ordinality as s(v, n);

  -- Deporte resumen: siempre calculado aquí, a partir de las selecciones guardadas.
  update public.apuestas set deporte = public.deporte_resumen(v_id) where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.guardar_apuesta(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_apuesta(uuid, jsonb, jsonb) to authenticated;
