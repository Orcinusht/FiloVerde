-- =============================================================
-- Filoverde · Fase 0 · Esquema inicial
-- Convenciones:
--   * Importes en CÉNTIMOS (bigint). 12,50 € -> 1250.
--   * Cuotas SIEMPRE en decimal, numeric(12,6). El formato de cuota
--     del perfil solo sirve para mostrar.
--   * Estados y tipos con CHECK (no enums) para poder ampliarlos fácil.
--   * Todas las tablas tienen user_id (selecciones también, y debe
--     coincidir con el de su apuesta: lo garantiza una FK compuesta).
-- =============================================================

-- ---------- Utilidades ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- perfiles ----------

create table public.perfiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  divisa         char(3) not null default 'EUR' check (divisa ~ '^[A-Z]{3}$'),
  formato_cuota  text    not null default 'decimal'
                 check (formato_cuota in ('decimal', 'fraccional', 'americana')),
  zona_horaria   text    not null default 'Europe/Madrid',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger perfiles_updated_at
  before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Crea el perfil automáticamente al registrarse un usuario.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Si no se indica divisa, usa la del perfil del usuario.
create or replace function public.divisa_por_defecto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.divisa is null then
    select p.divisa into new.divisa
    from public.perfiles p
    where p.user_id = new.user_id;
  end if;
  new.divisa = coalesce(new.divisa, 'EUR');
  return new;
end;
$$;

-- ---------- casas_apuestas ----------

create table public.casas_apuestas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 80),
  created_at  timestamptz not null default now(),
  unique (user_id, nombre),
  unique (id, user_id)            -- permite FKs compuestas (misma persona)
);

-- ---------- estrategias ----------

create table public.estrategias (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre       text not null check (length(trim(nombre)) between 1 and 80),
  descripcion  text,
  created_at   timestamptz not null default now(),
  unique (user_id, nombre),
  unique (id, user_id)
);

-- ---------- apuestas ----------

create table public.apuestas (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  casa_id              uuid,
  estrategia_id        uuid,
  tipo                 text not null default 'simple'
                       check (tipo in ('simple', 'combinada', 'sistema')),
  fecha                timestamptz not null default now(),
  importe              bigint not null check (importe > 0),          -- céntimos
  divisa               char(3) not null check (divisa ~ '^[A-Z]{3}$'), -- rellenada por trigger si falta
  cuota_total          numeric(12, 6) check (cuota_total >= 1),
  ganancia_potencial   bigint check (ganancia_potencial >= 0),        -- céntimos
  estado               text not null default 'pendiente'
                       check (estado in ('pendiente', 'ganada', 'perdida', 'anulada',
                                         'cash_out', 'media_ganada', 'media_perdida')),
  resultado_economico  bigint,                                         -- céntimos, neto (+/-)
  notas                text,
  imagen_origen        text,   -- ruta dentro del bucket privado "capturas"
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  -- La casa y la estrategia deben ser del mismo usuario que la apuesta.
  -- Si se borran, la apuesta se conserva y solo se vacía ese campo.
  foreign key (casa_id, user_id)
    references public.casas_apuestas (id, user_id) on delete set null (casa_id),
  foreign key (estrategia_id, user_id)
    references public.estrategias (id, user_id) on delete set null (estrategia_id)
);

create index apuestas_user_fecha_idx on public.apuestas (user_id, fecha desc);

create trigger apuestas_updated_at
  before update on public.apuestas
  for each row execute function public.set_updated_at();

create trigger apuestas_divisa
  before insert on public.apuestas
  for each row execute function public.divisa_por_defecto();

-- ---------- selecciones ----------

create table public.selecciones (
  id          uuid primary key default gen_random_uuid(),
  apuesta_id  uuid not null,
  user_id     uuid not null default auth.uid(),
  evento      text,
  liga        text,
  deporte     text,
  mercado     text,
  pronostico  text,
  cuota       numeric(12, 6) check (cuota >= 1),
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'ganada', 'perdida', 'anulada',
                                'media_ganada', 'media_perdida')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Cuelga de su apuesta Y su user_id tiene que ser el de la apuesta.
  foreign key (apuesta_id, user_id)
    references public.apuestas (id, user_id) on delete cascade
);

create index selecciones_apuesta_idx on public.selecciones (apuesta_id);
create index selecciones_user_idx on public.selecciones (user_id);

create trigger selecciones_updated_at
  before update on public.selecciones
  for each row execute function public.set_updated_at();

-- ---------- movimientos_bankroll ----------

create table public.movimientos_bankroll (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha       timestamptz not null default now(),
  tipo        text not null check (tipo in ('deposito', 'retirada', 'ajuste')),
  -- céntimos. Depósito y retirada siempre en positivo; el ajuste puede ser +/-.
  importe     bigint not null,
  divisa      char(3) not null check (divisa ~ '^[A-Z]{3}$'),
  created_at  timestamptz not null default now(),
  check (
    (tipo in ('deposito', 'retirada') and importe > 0)
    or (tipo = 'ajuste' and importe <> 0)
  )
);

create index movimientos_user_fecha_idx on public.movimientos_bankroll (user_id, fecha desc);

create trigger movimientos_divisa
  before insert on public.movimientos_bankroll
  for each row execute function public.divisa_por_defecto();
