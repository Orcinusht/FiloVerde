-- =============================================================
-- Filoverde · Fase 1 · Registro de apuestas desde capturas
--   * selecciones.orden: conserva el orden en que aparecen en la captura.
--   * apuestas.imagen_origen solo puede apuntar a la carpeta del propio usuario.
--   * transcripciones: una fila por cada lectura de la IA (modelo, tokens,
--     coste aproximado y si salió bien). Sirve para el control de coste.
--   * guardar_apuesta(): guarda apuesta + selecciones de una vez (si algo
--     falla, no se guarda nada). Corre con los permisos del usuario: RLS aplica.
-- =============================================================

-- ---------- selecciones.orden ----------

alter table public.selecciones
  add column orden smallint not null default 0 check (orden between 0 and 99);

-- ---------- apuestas: límites extra ----------

alter table public.apuestas
  add constraint apuestas_imagen_propia
    check (imagen_origen is null or imagen_origen like (user_id::text || '/%')),
  add constraint apuestas_notas_largo
    check (notas is null or length(notas) <= 2000);

-- ---------- transcripciones ----------

create table public.transcripciones (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  imagen          text check (imagen is null or imagen like (user_id::text || '/%')),
  modelo          text not null check (length(modelo) between 1 and 100),
  resultado       text not null check (resultado in ('ok', 'no_es_apuesta', 'error')),
  error_codigo    text check (error_codigo is null or length(error_codigo) <= 60),
  tokens_entrada  integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida   integer not null default 0 check (tokens_salida >= 0),
  -- Coste aproximado en dólares (precio público del modelo × tokens).
  coste_usd       numeric(12, 6) check (coste_usd is null or coste_usd >= 0),
  duracion_ms     integer check (duracion_ms is null or duracion_ms >= 0),
  created_at      timestamptz not null default now()
);

create index transcripciones_user_fecha_idx on public.transcripciones (user_id, created_at desc);

revoke all on public.transcripciones from anon;
grant select, insert, delete on public.transcripciones to authenticated;

alter table public.transcripciones enable row level security;

create policy "ver lo mío" on public.transcripciones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "crear lo mío" on public.transcripciones
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "borrar lo mío" on public.transcripciones
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Sin política de "editar": el registro de coste no se modifica.

-- ---------- guardar_apuesta ----------
-- p_id = null → crea; si no, edita esa apuesta (solo si es tuya, por RLS).
-- p_apuesta: { casa_id, estrategia_id, tipo, fecha, importe, cuota_total,
--              ganancia_potencial, estado, resultado_economico, notas, imagen_origen }
-- p_selecciones: [ { evento, liga, deporte, mercado, pronostico, cuota, estado }, ... ]
-- Las selecciones de la apuesta se sustituyen por las recibidas.

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

  if p_id is null then
    insert into public.apuestas (
      casa_id, estrategia_id, tipo, fecha, importe, cuota_total, ganancia_potencial,
      estado, resultado_economico, notas, imagen_origen
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
      nullif(p_apuesta->>'imagen_origen', '')
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
      -- imagen_origen no se cambia al editar.
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'apuesta no encontrada' using errcode = 'P0002';
    end if;

    delete from public.selecciones where apuesta_id = v_id;
  end if;

  insert into public.selecciones (apuesta_id, orden, evento, liga, deporte, mercado, pronostico, cuota, estado)
  select v_id,
         (s.n - 1)::smallint,
         nullif(s.v->>'evento', ''),
         nullif(s.v->>'liga', ''),
         nullif(s.v->>'deporte', ''),
         nullif(s.v->>'mercado', ''),
         nullif(s.v->>'pronostico', ''),
         nullif(s.v->>'cuota', '')::numeric,
         coalesce(s.v->>'estado', 'pendiente')
  from jsonb_array_elements(p_selecciones) with ordinality as s(v, n);

  return v_id;
end;
$$;

revoke all on function public.guardar_apuesta(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_apuesta(uuid, jsonb, jsonb) to authenticated;
