-- Fase 3 · Bankroll (primera ronda): movimientos de dinero por casa de apuestas.
-- SOLO aditiva y repetible: se puede pegar dos veces sin errores y no rompe la app publicada en main
-- (main no lee ni escribe esta tabla: su pantalla Bankroll es "próximamente").
--
-- Amplía la tabla que ya existe desde la Fase 0 (estaba vacía; ya tiene RLS: cada usuario solo ve,
-- crea, edita y borra lo suyo):
--   * casa_id (obligatoria) y casa_destino_id (solo en traspasos, distinta de la de origen). Las dos
--     con clave compuesta (casa, user_id) hacia casas_apuestas: la base de datos impide usar la
--     casa de otro usuario. ON DELETE RESTRICT: no se puede borrar una casa con movimientos.
--   * tipo 'traspaso'. Depósito, retirada y traspaso con importe > 0; ajuste distinto de 0 (+/−).
--   * notas (hasta 500 caracteres) y updated_at (se pone sola al editar).
--   * fecha: no puede ser futura (margen de un día por la zona horaria). Disparador, porque una
--     comprobación con now() no se debe hacer con CHECK.

alter table public.movimientos_bankroll
  add column if not exists casa_id         uuid,
  add column if not exists casa_destino_id uuid,
  add column if not exists notas           text,
  add column if not exists updated_at      timestamptz not null default now();

-- Tipos e importes (sustituyen a las comprobaciones de la Fase 0).
alter table public.movimientos_bankroll drop constraint if exists movimientos_bankroll_tipo_check;
alter table public.movimientos_bankroll drop constraint if exists movimientos_bankroll_check;
alter table public.movimientos_bankroll drop constraint if exists movimientos_tipo_valido;
alter table public.movimientos_bankroll add constraint movimientos_tipo_valido
  check (tipo in ('deposito', 'retirada', 'ajuste', 'traspaso'));
alter table public.movimientos_bankroll drop constraint if exists movimientos_importe_valido;
alter table public.movimientos_bankroll add constraint movimientos_importe_valido
  check ((tipo in ('deposito', 'retirada', 'traspaso') and importe > 0) or (tipo = 'ajuste' and importe <> 0));

-- Casa obligatoria; destino solo en traspasos (y obligatorio en ellos) y distinto del origen.
alter table public.movimientos_bankroll drop constraint if exists movimientos_casa_obligatoria;
alter table public.movimientos_bankroll add constraint movimientos_casa_obligatoria check (casa_id is not null);
alter table public.movimientos_bankroll drop constraint if exists movimientos_destino_traspaso;
alter table public.movimientos_bankroll add constraint movimientos_destino_traspaso
  check ((tipo = 'traspaso') = (casa_destino_id is not null));
alter table public.movimientos_bankroll drop constraint if exists movimientos_destino_distinto;
alter table public.movimientos_bankroll add constraint movimientos_destino_distinto
  check (casa_destino_id is null or casa_destino_id <> casa_id);
alter table public.movimientos_bankroll drop constraint if exists movimientos_notas_largo;
alter table public.movimientos_bankroll add constraint movimientos_notas_largo
  check (notas is null or length(notas) <= 500);

-- Las casas deben ser del mismo usuario que el movimiento (clave compuesta, como en apuestas).
alter table public.movimientos_bankroll drop constraint if exists movimientos_casa_fk;
alter table public.movimientos_bankroll add constraint movimientos_casa_fk
  foreign key (casa_id, user_id) references public.casas_apuestas (id, user_id) on delete restrict;
alter table public.movimientos_bankroll drop constraint if exists movimientos_casa_destino_fk;
alter table public.movimientos_bankroll add constraint movimientos_casa_destino_fk
  foreign key (casa_destino_id, user_id) references public.casas_apuestas (id, user_id) on delete restrict;

create index if not exists movimientos_casa_idx on public.movimientos_bankroll (user_id, casa_id);
create index if not exists movimientos_casa_destino_idx on public.movimientos_bankroll (user_id, casa_destino_id)
  where casa_destino_id is not null;

-- updated_at al editar (misma función que apuestas y selecciones).
drop trigger if exists movimientos_updated_at on public.movimientos_bankroll;
create trigger movimientos_updated_at
  before update on public.movimientos_bankroll
  for each row execute function public.set_updated_at();

-- Sin fechas futuras (margen de un día). Al editar, solo se comprueba si cambia la fecha.
create or replace function public.movimiento_sin_fecha_futura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.fecha is distinct from old.fecha) and new.fecha > now() + interval '1 day' then
    raise exception 'la fecha del movimiento no puede ser futura' using errcode = '22023', hint = 'fecha';
  end if;
  return new;
end;
$$;

drop trigger if exists movimientos_sin_fecha_futura on public.movimientos_bankroll;
create trigger movimientos_sin_fecha_futura
  before insert or update on public.movimientos_bankroll
  for each row execute function public.movimiento_sin_fecha_futura();
