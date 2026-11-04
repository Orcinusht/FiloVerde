-- Fase 1 · retoques: PROMOCIONES de cada apuesta.
-- SOLO aditiva y repetible: se puede pegar dos veces sin errores y no rompe la app publicada en main.
--
--   * promo_tipo: superaumento · aumento · asegurada · credito · otra. NULL = sin promoción
--     (así quedan todas las apuestas que ya existen).
--   * promo_cuota_original (cuota sin la promoción) y promo_aumento (céntimos; PUEDE ser negativo:
--     la app avisa sin bloquear): solo en superaumento y aumento.
--   * promo_base: cuál de los dos se leyó o escribió ('cuota_original', 'aumento' o 'ambos'); el otro
--     lo recalcula el servidor en cada guardado. Solo en superaumento y aumento.
--   * promo_credito (céntimos, >= 0): crédito que da la casa si se pierde. Solo en asegurada.
--   * En "credito" (apuesta pagada con crédito de promoción) no hay cifras extra: cambia el
--     resultado económico que propone la app.
-- guardar_apuesta mantiene su firma (p_id, p_apuesta, p_selecciones): la promoción va dentro de
-- p_apuesta. Si no llega "promo_tipo" (versión anterior de la app), al crear queda sin promoción
-- y al editar se conserva lo que hubiera.

alter table public.apuestas
  add column if not exists promo_tipo           text,
  add column if not exists promo_cuota_original numeric(12, 6),
  add column if not exists promo_aumento        bigint,
  add column if not exists promo_credito        bigint,
  add column if not exists promo_base           text;

alter table public.apuestas drop constraint if exists apuestas_promo_tipo_valido;
alter table public.apuestas add constraint apuestas_promo_tipo_valido
  check (promo_tipo is null or promo_tipo in ('superaumento', 'aumento', 'asegurada', 'credito', 'otra'));

alter table public.apuestas drop constraint if exists apuestas_promo_base_valida;
alter table public.apuestas add constraint apuestas_promo_base_valida
  check (promo_base is null or promo_base in ('cuota_original', 'aumento', 'ambos'));

-- Sin tipo de promoción, ningún dato de promoción.
alter table public.apuestas drop constraint if exists apuestas_promo_sin_tipo;
alter table public.apuestas add constraint apuestas_promo_sin_tipo
  check (promo_tipo is not null or (promo_cuota_original is null and promo_aumento is null
                                    and promo_credito is null and promo_base is null));

-- Cuota original, aumento y su "base": solo en superaumento y aumento.
alter table public.apuestas drop constraint if exists apuestas_promo_aumento_tipo;
alter table public.apuestas add constraint apuestas_promo_aumento_tipo
  check ((promo_cuota_original is null and promo_aumento is null and promo_base is null)
         or promo_tipo in ('superaumento', 'aumento'));

-- Crédito si se pierde: solo en asegurada, y nunca negativo.
alter table public.apuestas drop constraint if exists apuestas_promo_credito_tipo;
alter table public.apuestas add constraint apuestas_promo_credito_tipo
  check (promo_credito is null or (promo_tipo = 'asegurada' and promo_credito >= 0));

alter table public.apuestas drop constraint if exists apuestas_promo_cuota_original_valida;
alter table public.apuestas add constraint apuestas_promo_cuota_original_valida
  check (promo_cuota_original is null or promo_cuota_original >= 1);

-- Para el filtro "Con promoción" de la lista.
create index if not exists apuestas_promo_idx on public.apuestas (user_id) where promo_tipo is not null;

-- ---------- guardar_apuesta: admite la promoción ----------

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
      en_directo, viendo_partido, precipitada, recuperar_perdidas,
      promo_tipo, promo_cuota_original, promo_aumento, promo_credito, promo_base
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
      coalesce((p_apuesta->>'recuperar_perdidas')::boolean, false),
      nullif(p_apuesta->>'promo_tipo', ''),
      nullif(p_apuesta->>'promo_cuota_original', '')::numeric,
      nullif(p_apuesta->>'promo_aumento', '')::bigint,
      nullif(p_apuesta->>'promo_credito', '')::bigint,
      nullif(p_apuesta->>'promo_base', '')
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
      recuperar_perdidas  = coalesce((p_apuesta->>'recuperar_perdidas')::boolean, recuperar_perdidas),
      -- Promoción: la app nueva SIEMPRE envía "promo_tipo" (vacío = sin promoción) y entonces se
      -- guardan los cinco campos tal cual (quitar la promoción los vacía). La versión anterior de
      -- la app no lo envía: entonces se conservan.
      promo_tipo           = case when p_apuesta ? 'promo_tipo' then nullif(p_apuesta->>'promo_tipo', '') else promo_tipo end,
      promo_cuota_original = case when p_apuesta ? 'promo_tipo' then nullif(p_apuesta->>'promo_cuota_original', '')::numeric else promo_cuota_original end,
      promo_aumento        = case when p_apuesta ? 'promo_tipo' then nullif(p_apuesta->>'promo_aumento', '')::bigint else promo_aumento end,
      promo_credito        = case when p_apuesta ? 'promo_tipo' then nullif(p_apuesta->>'promo_credito', '')::bigint else promo_credito end,
      promo_base           = case when p_apuesta ? 'promo_tipo' then nullif(p_apuesta->>'promo_base', '') else promo_base end
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
