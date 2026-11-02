-- =============================================================
-- Filoverde · Fase 1 · Ajustes tras la primera prueba real
-- SOLO ADITIVA: añade columnas opcionales, permisos y un tipo nuevo.
-- No borra ni renombra nada.
--   * Tipo de apuesta nuevo: "mismo_partido" (Crear apuesta / Bet Builder).
--   * Fecha y hora del EVENTO en cada selección (hora de España):
--       evento_fecha date  · evento_hora time (vacía = solo se conoce el día).
--   * transcripciones guarda la propuesta de la IA (lista de apuestas con sus
--     campos dudosos y motivo), cuántas apuestas encontró y cuáles se descartaron,
--     para poder retomar la revisión sin volver a llamar a la IA.
--   * apuestas.transcripcion_id / transcripcion_indice: de qué lectura y qué
--     apuesta de la captura viene (una captura puede traer varias).
-- (La cuota de las selecciones ya era opcional desde la migración anterior.)
-- =============================================================

-- ---------- Tipo nuevo ----------

-- Se sustituye la regla de tipos por otra que admite los mismos + "mismo_partido".
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.apuestas'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%simple%combinada%'
  loop
    execute format('alter table public.apuestas drop constraint %I', c);
  end loop;
end;
$$;
alter table public.apuestas
  add constraint apuestas_tipo_check
    check (tipo in ('simple', 'combinada', 'sistema', 'mismo_partido'));

-- ---------- Fecha y hora del evento ----------

alter table public.selecciones
  add column evento_fecha date,
  add column evento_hora  time,
  add constraint selecciones_hora_con_fecha
    check (evento_hora is null or evento_fecha is not null);

-- ---------- transcripciones: propuesta de la IA ----------

alter table public.transcripciones
  add column n_apuestas   smallint check (n_apuestas is null or n_apuestas between 0 and 50),
  -- { "apuestas": [ { ...datos..., "dudosos": [ { "campo", "motivo" } ] } ] } ya validado
  add column propuesta    jsonb,
  -- índices (0, 1, …) de las apuestas de la propuesta que se descartaron al revisar
  add column descartadas  smallint[] not null default '{}',
  add constraint transcripciones_id_user unique (id, user_id);

-- Solo se pueden cambiar estas dos columnas (descartar y soltar la imagen borrada);
-- el modelo, los tokens y el coste no se pueden modificar.
grant update (descartadas, imagen) on public.transcripciones to authenticated;

create policy "editar lo mío" on public.transcripciones
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- apuestas: de qué lectura viene ----------

alter table public.apuestas
  add column transcripcion_id     uuid,
  add column transcripcion_indice smallint check (transcripcion_indice is null or transcripcion_indice between 0 and 49),
  -- La lectura tiene que ser del mismo usuario. Si se borra, la apuesta se queda.
  add constraint apuestas_transcripcion_fk
    foreign key (transcripcion_id, user_id)
    references public.transcripciones (id, user_id) on delete set null (transcripcion_id);

-- Cada apuesta propuesta por la IA se guarda una sola vez (evita duplicados por doble toque).
create unique index apuestas_transcripcion_unica
  on public.apuestas (transcripcion_id, transcripcion_indice)
  where transcripcion_id is not null;

-- ---------- guardar_apuesta: admite los campos nuevos ----------
-- Misma firma que antes; los campos que no se envían quedan vacíos.

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
      -- imagen_origen y la lectura de origen no se cambian al editar.
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
         nullif(s.v->>'liga', ''),
         nullif(s.v->>'deporte', ''),
         nullif(s.v->>'mercado', ''),
         nullif(s.v->>'pronostico', ''),
         nullif(s.v->>'cuota', '')::numeric,
         coalesce(s.v->>'estado', 'pendiente'),
         nullif(s.v->>'evento_fecha', '')::date,
         nullif(s.v->>'evento_hora', '')::time
  from jsonb_array_elements(p_selecciones) with ordinality as s(v, n);

  return v_id;
end;
$$;

revoke all on function public.guardar_apuesta(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_apuesta(uuid, jsonb, jsonb) to authenticated;
