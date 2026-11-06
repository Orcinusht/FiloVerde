-- Fase 3 · segunda ronda, parte 2: DEPORTES Y LIGAS (catálogo).
-- SOLO aditiva y repetible: se puede pegar dos veces sin errores y no rompe la app publicada en main
-- (main no usa la columna ni las funciones nuevas; si en main se intenta borrar un deporte o una liga
-- EN USO, ahora se rechaza y main muestra su mensaje genérico "No se ha podido borrar").
--
-- Las selecciones guardan deporte y liga como TEXTO. Un deporte o una liga "se usa" si alguna
-- selección del usuario lo tiene escrito igual (sin mayúsculas, tildes ni espacios); una liga, además,
-- con el deporte de su catálogo.
--
--   * archivada (no por defecto): fuera de los desplegables y del catálogo que se envía a la IA.
--   * Nombres reservados: deportes "Mixto" (ya estaba), "Sin dato" y "Varios"; ligas "Sin dato" y
--     "Varios" (coinciden con etiquetas de Análisis).
--   * No se borra un deporte o una liga en uso (disparador; al borrar la CUENTA entera no bloquea).
--   * previsualizar_renombrado / renombrar_en_catalogo: renombrar en el catálogo Y en las selecciones
--     afectadas, todo o nada, solo con las filas del usuario de la sesión (RLS). Al renombrar un
--     deporte se recalcula el deporte resumen de cada apuesta afectada.

alter table public.deportes add column if not exists archivada boolean not null default false;
alter table public.ligas    add column if not exists archivada boolean not null default false;

alter table public.deportes drop constraint if exists deportes_nombre_no_reservado;
alter table public.deportes add constraint deportes_nombre_no_reservado
  check (public.normalizar_nombre(nombre) not in ('mixto', 'sin dato', 'varios'));
alter table public.ligas drop constraint if exists ligas_nombre_no_reservado;
alter table public.ligas add constraint ligas_nombre_no_reservado
  check (public.normalizar_nombre(nombre) not in ('sin dato', 'varios'));

-- Para buscar rápido las selecciones de un deporte o liga.
create index if not exists selecciones_deporte_norm_idx
  on public.selecciones (user_id, public.normalizar_nombre(deporte));

-- ---------- No borrar en uso ----------
-- SECURITY DEFINER solo para mirar si la cuenta sigue existiendo (borrado de la cuenta entera) y
-- contar selecciones de ESE usuario (old.user_id). No devuelve datos.
create or replace function public.catalogo_sin_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deporte text;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old; -- borrado de la cuenta entera
  end if;
  if tg_table_name = 'deportes' then
    if exists (select 1 from public.selecciones s
               where s.user_id = old.user_id
                 and public.normalizar_nombre(s.deporte) = public.normalizar_nombre(old.nombre)) then
      raise exception 'el deporte está en uso: no se puede borrar' using errcode = '23503', hint = 'en_uso';
    end if;
  else
    select d.nombre into v_deporte from public.deportes d where d.id = old.deporte_id;
    -- Si su deporte ya no existe (se está borrando el deporte, que no estaba en uso), no se usa.
    if v_deporte is not null and exists (
         select 1 from public.selecciones s
         where s.user_id = old.user_id
           and public.normalizar_nombre(s.deporte) = public.normalizar_nombre(v_deporte)
           and public.normalizar_nombre(s.liga) = public.normalizar_nombre(old.nombre)) then
      raise exception 'la liga está en uso: no se puede borrar' using errcode = '23503', hint = 'en_uso';
    end if;
  end if;
  return old;
end;
$$;

revoke all on function public.catalogo_sin_uso() from public, anon, authenticated;

drop trigger if exists deportes_sin_uso on public.deportes;
create trigger deportes_sin_uso before delete on public.deportes
  for each row execute function public.catalogo_sin_uso();
drop trigger if exists ligas_sin_uso on public.ligas;
create trigger ligas_sin_uso before delete on public.ligas
  for each row execute function public.catalogo_sin_uso();

-- ---------- Renombrar en el catálogo y en mis apuestas ----------
-- Selecciones afectadas (solo del usuario de la sesión). p_tipo: 'deporte' | 'liga'.
create or replace function public.selecciones_de_catalogo(p_tipo text, p_id uuid)
returns table (seleccion_id uuid, apuesta_id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nombre text;
  v_deporte text;
begin
  if v_uid is null then
    raise exception 'sin sesión' using errcode = '42501';
  end if;
  if p_tipo = 'deporte' then
    select d.nombre into v_nombre from public.deportes d where d.id = p_id and d.user_id = v_uid;
    if v_nombre is null then raise exception 'no existe' using errcode = 'P0002'; end if;
    return query
      select s.id, s.apuesta_id from public.selecciones s
      where s.user_id = v_uid and public.normalizar_nombre(s.deporte) = public.normalizar_nombre(v_nombre);
  elsif p_tipo = 'liga' then
    select l.nombre, d.nombre into v_nombre, v_deporte
      from public.ligas l join public.deportes d on d.id = l.deporte_id
      where l.id = p_id and l.user_id = v_uid;
    if v_nombre is null then raise exception 'no existe' using errcode = 'P0002'; end if;
    return query
      select s.id, s.apuesta_id from public.selecciones s
      where s.user_id = v_uid
        and public.normalizar_nombre(s.deporte) = public.normalizar_nombre(v_deporte)
        and public.normalizar_nombre(s.liga) = public.normalizar_nombre(v_nombre);
  else
    raise exception 'tipo no válido' using errcode = '22023';
  end if;
end;
$$;

-- Aviso previo: N selecciones en M apuestas.
create or replace function public.previsualizar_renombrado(p_tipo text, p_id uuid)
returns table (selecciones integer, apuestas integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer, count(distinct x.apuesta_id)::integer
  from public.selecciones_de_catalogo(p_tipo, p_id) x
$$;

-- Renombrar todo o nada. p_selecciones / p_apuestas = los números que vio el usuario en el aviso: si
-- ya no coinciden (algo cambió entretanto), no se aplica nada (hint 'cambiado').
create or replace function public.renombrar_en_catalogo(
  p_tipo text, p_id uuid, p_nombre text, p_selecciones integer, p_apuestas integer)
returns table (selecciones integer, apuestas integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_sel uuid[];
  v_ap uuid[];
begin
  if v_uid is null then
    raise exception 'sin sesión' using errcode = '42501';
  end if;
  select coalesce(array_agg(x.seleccion_id), '{}'), coalesce(array_agg(distinct x.apuesta_id), '{}')
    into v_sel, v_ap
    from public.selecciones_de_catalogo(p_tipo, p_id) x;
  if cardinality(v_sel) <> p_selecciones or cardinality(v_ap) <> p_apuestas then
    raise exception 'los datos han cambiado desde el aviso' using errcode = '40001', hint = 'cambiado';
  end if;
  -- 1) Catálogo (las reglas de nombre de la tabla rechazan repetidos y reservados).
  if p_tipo = 'deporte' then
    update public.deportes set nombre = v_nombre where id = p_id and user_id = v_uid;
    update public.selecciones set deporte = v_nombre where id = any (v_sel) and user_id = v_uid;
    -- Deporte resumen de cada apuesta afectada ("Mixto" ↔ un solo deporte).
    update public.apuestas a set deporte = public.deporte_resumen(a.id)
      where a.id = any (v_ap) and a.user_id = v_uid and a.deporte is distinct from public.deporte_resumen(a.id);
  else
    update public.ligas set nombre = v_nombre where id = p_id and user_id = v_uid;
    update public.selecciones set liga = v_nombre where id = any (v_sel) and user_id = v_uid;
  end if;
  return query select cardinality(v_sel), cardinality(v_ap);
end;
$$;

revoke all on function public.selecciones_de_catalogo(text, uuid) from public, anon;
revoke all on function public.previsualizar_renombrado(text, uuid) from public, anon;
revoke all on function public.renombrar_en_catalogo(text, uuid, text, integer, integer) from public, anon;
grant execute on function public.selecciones_de_catalogo(text, uuid) to authenticated;
grant execute on function public.previsualizar_renombrado(text, uuid) to authenticated;
grant execute on function public.renombrar_en_catalogo(text, uuid, text, integer, integer) to authenticated;
