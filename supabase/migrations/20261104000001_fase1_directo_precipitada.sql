-- =============================================================
-- Filoverde · Fase 1 · Apuesta en directo y apuesta precipitada
-- SOLO ADITIVA y se puede ejecutar varias veces sin errores.
-- Se aplica DESPUÉS de 20261103000001_fase1_deportes_ligas.sql.
--   * apuestas.en_directo / viendo_partido: lo marca SIEMPRE el usuario (la IA no).
--   * apuestas.precipitada / recuperar_perdidas: lo marca SIEMPRE el usuario.
--   * apuestas.precipitada_momento ('al_registrar' | 'al_resolver'): solo existe si
--     precipitada es verdadera. Lo pone SIEMPRE la base de datos (disparador), sea
--     cual sea el camino por el que llegue el cambio; lo que mande el navegador se ignora.
--   * Sin marcar = pre-partido y normal: las apuestas existentes quedan así.
-- =============================================================

alter table public.apuestas
  add column if not exists en_directo          boolean not null default false,
  add column if not exists viendo_partido      boolean not null default false,
  add column if not exists precipitada         boolean not null default false,
  add column if not exists recuperar_perdidas  boolean not null default false,
  add column if not exists precipitada_momento text;

-- ---------- Reglas (las aplica la base de datos, no solo el formulario) ----------

alter table public.apuestas drop constraint if exists apuestas_viendo_requiere_directo;
alter table public.apuestas add constraint apuestas_viendo_requiere_directo
  check (not viendo_partido or en_directo);

alter table public.apuestas drop constraint if exists apuestas_recuperar_requiere_precipitada;
alter table public.apuestas add constraint apuestas_recuperar_requiere_precipitada
  check (not recuperar_perdidas or precipitada);

alter table public.apuestas drop constraint if exists apuestas_momento_valido;
alter table public.apuestas add constraint apuestas_momento_valido
  check (precipitada_momento is null or precipitada_momento in ('al_registrar', 'al_resolver'));

-- El momento existe si y solo si la apuesta está marcada como precipitada.
alter table public.apuestas drop constraint if exists apuestas_momento_solo_si_precipitada;
alter table public.apuestas add constraint apuestas_momento_solo_si_precipitada
  check (precipitada = (precipitada_momento is not null));

-- ---------- Momento de "precipitada": lo calcula siempre la base de datos ----------
--  · Se marca ahora y el estado que se guarda es pendiente → al_registrar.
--  · Se marca ahora y el estado que se guarda ya está resuelto → al_resolver
--    (también una captura que llega resuelta, o si se resuelve y se marca a la vez).
--  · Ya estaba marcada → se conserva el momento (aunque se reabra o cambie el estado).
--  · Se desmarca → se borra.
-- Se ejecuta antes de las reglas de arriba, así que guardar nunca falla por el momento.

create or replace function public.apuestas_momento_precipitada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.precipitada then
    if tg_op = 'UPDATE' and old.precipitada and old.precipitada_momento is not null then
      new.precipitada_momento := old.precipitada_momento;
    else
      new.precipitada_momento := case when new.estado = 'pendiente' then 'al_registrar' else 'al_resolver' end;
    end if;
  else
    new.precipitada_momento := null;
  end if;
  return new;
end;
$$;

drop trigger if exists apuestas_precipitada_momento on public.apuestas;
create trigger apuestas_precipitada_momento
  before insert or update on public.apuestas
  for each row execute function public.apuestas_momento_precipitada();

-- ---------- guardar_apuesta: admite las casillas nuevas ----------
-- Misma firma. Si la app no las envía, al crear quedan en "no" y al editar se conservan.

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
      estado, resultado_economico, notas, imagen_origen, transcripcion_id, transcripcion_indice,
      en_directo, viendo_partido, precipitada, recuperar_perdidas
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
      nullif(p_apuesta->>'transcripcion_indice', '')::smallint,
      coalesce((p_apuesta->>'en_directo')::boolean, false),
      coalesce((p_apuesta->>'viendo_partido')::boolean, false),
      coalesce((p_apuesta->>'precipitada')::boolean, false),
      coalesce((p_apuesta->>'recuperar_perdidas')::boolean, false)
      -- precipitada_momento: lo pone siempre el disparador (no se lee del navegador).
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
      notas               = nullif(p_apuesta->>'notas', ''),
      -- Si no se envían (versión antigua de la app), se conservan.
      en_directo          = coalesce((p_apuesta->>'en_directo')::boolean, en_directo),
      viendo_partido      = coalesce((p_apuesta->>'viendo_partido')::boolean, viendo_partido),
      precipitada         = coalesce((p_apuesta->>'precipitada')::boolean, precipitada),
      recuperar_perdidas  = coalesce((p_apuesta->>'recuperar_perdidas')::boolean, recuperar_perdidas)
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
