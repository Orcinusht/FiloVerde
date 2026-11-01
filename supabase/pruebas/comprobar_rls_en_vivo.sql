-- =============================================================
-- Filoverde · Comprobación de seguridad EN VIVO (RLS)
--
-- Pégalo entero en Supabase → SQL Editor y pulsa Run.
-- Usa las DOS cuentas más antiguas del proyecto (A y B):
--   1. Como A crea datos de prueba (marcados como PRUEBA-RLS).
--   2. Como B intenta verlos, cambiarlos, borrarlos y suplantar a A.
--   3. Como visitante sin sesión intenta leer.
--   4. Borra los datos de prueba y muestra una tabla de resultados.
-- No deja nada guardado. Si algo falla a mitad, no se guarda nada.
-- =============================================================

create temp table params on commit drop as
  select
    (select id    from auth.users order by created_at limit 1 offset 0) as a,
    (select email from auth.users order by created_at limit 1 offset 0) as a_email,
    (select id    from auth.users order by created_at limit 1 offset 1) as b,
    (select email from auth.users order by created_at limit 1 offset 1) as b_email;

do $$
begin
  if (select b from params) is null then
    raise exception 'Hacen falta al menos 2 cuentas en Authentication → Users.';
  end if;
end $$;

create temp table ids (k text, v uuid) on commit drop;
create temp table resultado (
  n int, comprobacion text, esperado text, obtenido text, ok boolean
) on commit drop;
grant select, insert on params, ids, resultado to authenticated, anon;

-- ---------- 1. Como A: crear datos de prueba ----------
select set_config('request.jwt.claims',
  json_build_object('sub', a, 'role', 'authenticated')::text, true) from params;
set local role authenticated;

with x as (insert into casas_apuestas (nombre) values ('PRUEBA-RLS') returning id)
  insert into ids select 'casa', id from x;
with x as (insert into apuestas (casa_id, importe, cuota_total, notas)
           select v, 1000, 1.85, 'PRUEBA-RLS' from ids where k = 'casa' returning id)
  insert into ids select 'apuesta', id from x;
with x as (insert into selecciones (apuesta_id, evento, cuota)
           select v, 'PRUEBA-RLS', 1.85 from ids where k = 'apuesta' returning id)
  insert into ids select 'seleccion', id from x;
with x as (insert into movimientos_bankroll (tipo, importe) values ('ajuste', 1) returning id)
  insert into ids select 'movimiento', id from x;

insert into resultado
  select 1, 'A ve su propia apuesta (control)', '1', count(*)::text, count(*) = 1
  from apuestas where id in (select v from ids);

reset role;

-- ---------- 2. Como B: intentar acceder a lo de A ----------
select set_config('request.jwt.claims',
  json_build_object('sub', b, 'role', 'authenticated')::text, true) from params;
set local role authenticated;

insert into resultado
  select 2, 'B ve la casa de A', '0', count(*)::text, count(*) = 0
  from casas_apuestas where id in (select v from ids);
insert into resultado
  select 3, 'B ve la apuesta de A', '0', count(*)::text, count(*) = 0
  from apuestas where id in (select v from ids);
insert into resultado
  select 4, 'B ve la selección de A', '0', count(*)::text, count(*) = 0
  from selecciones where id in (select v from ids);
insert into resultado
  select 5, 'B ve el movimiento de bankroll de A', '0', count(*)::text, count(*) = 0
  from movimientos_bankroll where id in (select v from ids);
insert into resultado
  select 6, 'B ve el perfil de A', '0', count(*)::text, count(*) = 0
  from perfiles where user_id = (select a from params);

with x as (update apuestas set importe = 1 where id in (select v from ids) returning 1)
  insert into resultado select 7, 'B cambia el importe de la apuesta de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;
with x as (delete from apuestas where id in (select v from ids) returning 1)
  insert into resultado select 8, 'B borra la apuesta de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;

do $$
begin
  begin
    insert into apuestas (user_id, importe) values ((select a from params), 100);
    insert into resultado values (9, 'B crea una apuesta a nombre de A', 'rechazado', 'PERMITIDO', false);
  exception when others then
    insert into resultado values (9, 'B crea una apuesta a nombre de A', 'rechazado', 'rechazado', true);
  end;
  begin
    insert into selecciones (apuesta_id, evento) select v, 'intruso' from ids where k = 'apuesta';
    insert into resultado values (10, 'B añade una selección a la apuesta de A', 'rechazado', 'PERMITIDO', false);
  exception when others then
    insert into resultado values (10, 'B añade una selección a la apuesta de A', 'rechazado', 'rechazado', true);
  end;
end $$;

reset role;

-- ---------- 3. Sin sesión (visitante anónimo) ----------
set local role anon;
do $$
begin
  perform count(*) from apuestas;
  insert into resultado values (11, 'Un visitante sin sesión lee apuestas', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (11, 'Un visitante sin sesión lee apuestas', 'rechazado', 'rechazado', true);
end $$;
reset role;

-- ---------- 4. Comprobar que A conserva sus datos y limpiar ----------
insert into resultado
  select 12, 'La apuesta de A sigue intacta tras los ataques de B', 'importe 1000',
         'importe ' || coalesce(max(importe)::text, 'BORRADA'), coalesce(max(importe), 0) = 1000
  from apuestas where id in (select v from ids);

delete from apuestas where id in (select v from ids);             -- borra también su selección
delete from casas_apuestas where id in (select v from ids);
delete from movimientos_bankroll where id in (select v from ids);

select
  n as "#",
  comprobacion as "Comprobación",
  esperado as "Esperado",
  obtenido as "Obtenido",
  case when ok then '✅ OK' else '❌ FALLO' end as "Resultado",
  (select 'A = ' || a_email || ' · B = ' || b_email from params) as "Cuentas usadas"
from resultado
order by n;
