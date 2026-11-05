-- Fase 3 · segunda ronda, parte 1: gestión de CASAS y ESTRATEGIAS desde Ajustes.
-- SOLO aditiva y repetible: se puede pegar dos veces sin errores y no rompe la app publicada en main
-- (main nunca renombra, archiva ni borra casas o estrategias; ignora la columna nueva).
--
--   * archivada (no por defecto): oculta la casa o estrategia de los desplegables para apuestas y
--     movimientos NUEVOS; sigue contando igual en Análisis, Bankroll y CSV.
--   * Nombre único por usuario sin distinguir mayúsculas, tildes ni espacios (misma
--     normalización que el catálogo de deportes y ligas).
--   * Nombres reservados (coinciden con etiquetas de Análisis y Bankroll): Sin casa, Sin estrategia,
--     Sin dato, Varios y Mixto.
--   * No se puede borrar una casa o estrategia con apuestas (antes las dejaba en "Sin casa" /
--     "Sin estrategia" y cambiaba saldos y Análisis sin avisar). Las casas con movimientos ya
--     estaban protegidas (on delete restrict). Al borrar una CUENTA entera no se bloquea nada.

alter table public.casas_apuestas add column if not exists archivada boolean not null default false;
alter table public.estrategias    add column if not exists archivada boolean not null default false;

create unique index if not exists casas_nombre_unico
  on public.casas_apuestas (user_id, public.normalizar_nombre(nombre));
create unique index if not exists estrategias_nombre_unico
  on public.estrategias (user_id, public.normalizar_nombre(nombre));

alter table public.casas_apuestas drop constraint if exists casas_nombre_no_reservado;
alter table public.casas_apuestas add constraint casas_nombre_no_reservado
  check (public.normalizar_nombre(nombre) not in ('sin casa', 'sin estrategia', 'sin dato', 'varios', 'mixto'));
alter table public.estrategias drop constraint if exists estrategias_nombre_no_reservado;
alter table public.estrategias add constraint estrategias_nombre_no_reservado
  check (public.normalizar_nombre(nombre) not in ('sin casa', 'sin estrategia', 'sin dato', 'varios', 'mixto'));

-- Bloqueo de borrado si tiene apuestas. SECURITY DEFINER solo para poder mirar si la cuenta
-- sigue existiendo: si se está borrando la cuenta entera (cascada desde auth.users), no se
-- bloquea. Solo comprueba existencias; no devuelve datos.
create or replace function public.opcion_sin_apuestas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old; -- borrado de la cuenta entera
  end if;
  if (tg_table_name = 'casas_apuestas' and exists (select 1 from public.apuestas a where a.casa_id = old.id))
     or (tg_table_name = 'estrategias' and exists (select 1 from public.apuestas a where a.estrategia_id = old.id)) then
    raise exception 'tiene apuestas: no se puede borrar' using errcode = '23503', hint = 'en_uso';
  end if;
  return old;
end;
$$;

revoke all on function public.opcion_sin_apuestas() from public, anon, authenticated;

drop trigger if exists casas_sin_apuestas on public.casas_apuestas;
create trigger casas_sin_apuestas
  before delete on public.casas_apuestas
  for each row execute function public.opcion_sin_apuestas();

drop trigger if exists estrategias_sin_apuestas on public.estrategias;
create trigger estrategias_sin_apuestas
  before delete on public.estrategias
  for each row execute function public.opcion_sin_apuestas();
