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
with x as (insert into movimientos_bankroll (tipo, importe, casa_id, notas)
           select 'ajuste', 1, v, 'PRUEBA-RLS' from ids where k = 'casa' returning id)
  insert into ids select 'movimiento', id from x;
with x as (insert into transcripciones (modelo, resultado) values ('PRUEBA-RLS', 'ok') returning id)
  insert into ids select 'transcripcion', id from x;

insert into resultado
  select 1, 'A ve su propia apuesta (control)', '1', count(*)::text, count(*) = 1
  from apuestas where id in (select v from ids);

-- Ajustes Fase 1: tipo "mismo partido" con selecciones sin cuota (control)
do $$
declare v uuid;
begin
  v := public.guardar_apuesta(null,
    '{"importe": 500, "tipo": "mismo_partido", "cuota_total": 4.5, "notas": "PRUEBA-RLS"}'::jsonb,
    '[{"evento": "PRUEBA-RLS", "deporte": "Fútbol", "mercado": "1X2", "evento_fecha": "2026-11-08", "evento_hora": "21:00"},
      {"evento": "PRUEBA-RLS", "deporte": "Fútbol", "mercado": "Ambos marcan"}]'::jsonb);
  insert into ids values ('apuesta_mp', v);
  insert into resultado values (19, 'A guarda una apuesta «mismo partido» sin cuotas por selección (control)', 'guardada', 'guardada', true);
exception when others then
  insert into resultado values (19, 'A guarda una apuesta «mismo partido» sin cuotas por selección (control)', 'guardada', 'ERROR: ' || sqlerrm, false);
end $$;

-- Catálogo de deportes y ligas
with x as (insert into deportes (nombre) values ('PRUEBA-RLS') returning id)
  insert into ids select 'deporte', id from x;
with x as (insert into ligas (deporte_id, nombre) select v, 'PRUEBA-RLS' from ids where k = 'deporte' returning id)
  insert into ids select 'liga', id from x;

do $$
declare v uuid;
begin
  v := public.guardar_apuesta(null,
    '{"importe": 500, "tipo": "combinada", "notas": "PRUEBA-RLS", "deporte": "Trampa"}'::jsonb,
    '[{"evento": "PRUEBA-RLS 1", "deporte": "Tenis"}, {"evento": "PRUEBA-RLS 2", "deporte": "Fútbol"}]'::jsonb);
  insert into ids values ('apuesta_mixta', v);
  insert into resultado
    select 24, 'Deporte resumen calculado por la BD (tenis + fútbol)', 'Mixto', coalesce(deporte, 'vacío'), deporte = 'Mixto'
    from apuestas where id = v;
exception when others then
  insert into resultado values (24, 'Deporte resumen calculado por la BD (tenis + fútbol)', 'Mixto', 'ERROR: ' || sqlerrm, false);
end $$;

do $$
begin
  insert into deportes (nombre) values ('Mixto');
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (25, 'A crea un deporte llamado «Mixto»', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;

do $$
begin
  insert into deportes (nombre) values ('PRUEBA-rls');
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (26, 'A crea un deporte repetido con otras mayúsculas', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;

-- En directo y precipitada
do $$
declare v uuid; m text;
begin
  v := public.guardar_apuesta(null,
    '{"importe": 500, "notas": "PRUEBA-RLS", "en_directo": true, "viendo_partido": true, "precipitada": true, "precipitada_momento": "al_resolver"}'::jsonb,
    '[{"evento": "PRUEBA-RLS", "deporte": "Fútbol"}]'::jsonb);
  insert into ids values ('apuesta_conducta', v);
  select precipitada_momento into m from apuestas where id = v;
  insert into resultado values (32, 'A marca precipitada al registrar (el navegador manda otro momento)', 'al_registrar', coalesce(m, 'vacío'), m = 'al_registrar');
  perform public.guardar_apuesta(v, '{"importe": 500, "estado": "ganada", "resultado_economico": 400, "en_directo": true, "viendo_partido": true, "precipitada": true}'::jsonb,
    '[{"evento": "PRUEBA-RLS", "deporte": "Fútbol"}]'::jsonb);
  select precipitada_momento into m from apuestas where id = v;
  insert into resultado values (33, 'A resuelve sin tocar «precipitada»: el momento se conserva', 'al_registrar', coalesce(m, 'vacío'), m = 'al_registrar');
exception when others then
  insert into resultado values (32, 'A guarda una apuesta en directo y precipitada (control)', 'guardada', 'ERROR: ' || sqlerrm, false);
end $$;

do $$
begin
  update apuestas set en_directo = false where id = (select v from ids where k = 'apuesta_conducta');
  insert into resultado values (34, 'A deja «veía el partido» sin «en directo»', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (34, 'A deja «veía el partido» sin «en directo»', 'rechazado', 'rechazado', true);
end $$;

do $$
begin
  update apuestas set recuperar_perdidas = true, precipitada = false where id = (select v from ids where k = 'apuesta_conducta');
  insert into resultado values (35, 'A marca «recuperar pérdidas» sin «precipitada»', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (35, 'A marca «recuperar pérdidas» sin «precipitada»', 'rechazado', 'rechazado', true);
end $$;

update apuestas set precipitada = false where id in (select v from ids where k = 'apuesta_conducta');
update apuestas set precipitada_momento = 'al_registrar' where id in (select v from ids where k = 'apuesta_conducta');
insert into resultado
  select 36, 'A intenta poner un momento sin «precipitada»: se ignora', 'vacío', coalesce(precipitada_momento, 'vacío'), precipitada_momento is null
  from apuestas where id in (select v from ids where k = 'apuesta_conducta');

-- Promociones
do $$
declare v uuid; t text; c bigint;
begin
  v := public.guardar_apuesta(null,
    '{"importe": 700, "notas": "PRUEBA-RLS", "promo_tipo": "asegurada", "promo_credito": 700}'::jsonb,
    '[{"evento": "PRUEBA-RLS", "deporte": "Fútbol"}]'::jsonb);
  insert into ids values ('apuesta_promo', v);
  select promo_tipo, promo_credito into t, c from apuestas where id = v;
  insert into resultado values (38, 'A guarda una apuesta asegurada con su crédito (control)', 'asegurada 700', coalesce(t, 'vacío') || ' ' || coalesce(c::text, 'vacío'), t = 'asegurada' and c = 700);
  -- Quitar la promoción (la app envía promo_tipo vacío) vacía todos sus datos.
  v := public.guardar_apuesta(null,
    '{"importe": 500, "notas": "PRUEBA-RLS", "promo_tipo": "aumento", "promo_cuota_original": 1.8, "promo_aumento": 100, "promo_base": "cuota_original"}'::jsonb,
    '[{"evento": "PRUEBA-RLS", "deporte": "Fútbol"}]'::jsonb);
  insert into ids values ('apuesta_promo2', v);
  perform public.guardar_apuesta(v, '{"importe": 500, "promo_tipo": ""}'::jsonb, '[{"evento": "PRUEBA-RLS", "deporte": "Fútbol"}]'::jsonb);
  insert into resultado
    select 39, 'A quita la promoción: se vacían sus datos', 'vacíos',
           case when promo_tipo is null and promo_cuota_original is null and promo_aumento is null and promo_base is null then 'vacíos' else 'QUEDAN DATOS' end,
           promo_tipo is null and promo_cuota_original is null and promo_aumento is null and promo_base is null
    from apuestas where id = v;
exception when others then
  insert into resultado values (38, 'A guarda una apuesta con promoción (control)', 'guardada', 'ERROR: ' || sqlerrm, false);
end $$;

do $$
begin
  update apuestas set promo_aumento = 100 where id = (select v from ids where k = 'apuesta');
  insert into resultado values (40, 'A pone un aumento sin tipo de promoción', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (40, 'A pone un aumento sin tipo de promoción', 'rechazado', 'rechazado', true);
end $$;

do $$
begin
  update apuestas set promo_tipo = 'aumento', promo_credito = 100 where id = (select v from ids where k = 'apuesta');
  insert into resultado values (41, 'A pone «crédito si se pierde» en un aumento', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (41, 'A pone «crédito si se pierde» en un aumento', 'rechazado', 'rechazado', true);
end $$;

do $$
begin
  update apuestas set promo_credito = -1 where id = (select v from ids where k = 'apuesta_promo');
  insert into resultado values (42, 'A pone un crédito negativo', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (42, 'A pone un crédito negativo', 'rechazado', 'rechazado', true);
end $$;

do $$
begin
  update apuestas set promo_tipo = 'regalo' where id = (select v from ids where k = 'apuesta');
  insert into resultado values (43, 'A pone un tipo de promoción que no existe', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (43, 'A pone un tipo de promoción que no existe', 'rechazado', 'rechazado', true);
end $$;

do $$
begin
  update transcripciones set coste_usd = 0 where id in (select v from ids);
  insert into resultado values (20, 'A cambia el coste registrado de su propia lectura', 'rechazado', 'PERMITIDO', false);
exception when others then
  insert into resultado values (20, 'A cambia el coste registrado de su propia lectura', 'rechazado', 'rechazado', true);
end $$;

-- Bankroll (Fase 3): movimientos por casa
with x as (insert into casas_apuestas (nombre) values ('PRUEBA-RLS-2') returning id)
  insert into ids select 'casa2', id from x;
with x as (insert into movimientos_bankroll (tipo, importe, casa_id, casa_destino_id, notas)
           select 'traspaso', 1, (select v from ids where k = 'casa'), (select v from ids where k = 'casa2'), 'PRUEBA-RLS'
           returning id)
  insert into ids select 'traspaso', id from x;
insert into resultado
  select 47, 'A hace un traspaso entre dos casas suyas (control)', '1', count(*)::text, count(*) = 1
  from movimientos_bankroll where id in (select v from ids where k = 'traspaso');
do $$
begin
  delete from casas_apuestas where id in (select v from ids where k = 'casa2');
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (48, 'A borra una casa que tiene movimientos', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;
do $$
begin
  insert into movimientos_bankroll (tipo, importe, casa_id, fecha)
    select 'deposito', 1, v, now() + interval '3 days' from ids where k = 'casa';
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (49, 'A registra un movimiento con fecha futura', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;
do $$
begin
  insert into movimientos_bankroll (tipo, importe, casa_id, casa_destino_id)
    select 'traspaso', 1, v, v from ids where k = 'casa';
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (50, 'A hace un traspaso a la misma casa', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;

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
  -- Fase 1
  begin
    perform public.guardar_apuesta((select v from ids where k = 'apuesta'),
      '{"importe": 1, "tipo": "simple", "estado": "pendiente"}'::jsonb, '[{"evento": "intruso", "deporte": "Tenis"}]'::jsonb);
    insert into resultado values (15, 'B edita la apuesta de A con guardar_apuesta', 'rechazado', 'PERMITIDO', false);
  exception when others then
    insert into resultado values (15, 'B edita la apuesta de A con guardar_apuesta', 'rechazado', 'rechazado', true);
  end;
  begin
    insert into apuestas (importe, imagen_origen) values (100, (select a from params)::text || '/x.jpg');
    raise exception 'PERMITIDO';
  exception when others then
    insert into resultado values (16, 'B enlaza en su apuesta una captura de A', 'rechazado',
      case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('capturas', (select a from params)::text || '/PRUEBA-RLS.jpg');
    raise exception 'PERMITIDO';  -- se deshace igualmente: no deja nada
  exception when others then
    insert into resultado values (17, 'B sube un archivo a la carpeta de capturas de A', 'rechazado',
      case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
  end;
end $$;

insert into resultado
  select 13, 'B ve la transcripción (coste IA) de A', '0', count(*)::text, count(*) = 0
  from transcripciones where id in (select v from ids);

with x as (update transcripciones set descartadas = '{0}', imagen = null where id in (select v from ids) returning 1)
  insert into resultado select 21, 'B marca como descartada una lectura de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;

do $$
begin
  perform public.guardar_apuesta(null,
    jsonb_build_object('importe', 100, 'transcripcion_id', (select v from ids where k = 'transcripcion'), 'transcripcion_indice', 0),
    '[{"evento": "intruso", "deporte": "Tenis"}]'::jsonb);
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (22, 'B enlaza su apuesta a una lectura de A', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;

insert into resultado
  select 23, 'B ve las selecciones «mismo partido» de A', '0', count(*)::text, count(*) = 0
  from selecciones where apuesta_id in (select v from ids where k = 'apuesta_mp');

with x as (update apuestas set en_directo = true, precipitada = true where id in (select v from ids) returning 1)
  insert into resultado select 37, 'B marca «en directo» o «precipitada» en una apuesta de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;

insert into resultado
  select 44, 'B ve las apuestas con promoción de A', '0', count(*)::text, count(*) = 0
  from apuestas where promo_tipo is not null and user_id = (select a from params);
with x as (update apuestas set promo_tipo = null, promo_credito = null where id in (select v from ids) returning 1)
  insert into resultado select 45, 'B quita o cambia la promoción de una apuesta de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;

insert into resultado
  select 27, 'B ve los deportes de A', '0', count(*)::text, count(*) = 0
  from deportes where user_id = (select a from params);
insert into resultado
  select 28, 'B ve las ligas de A', '0', count(*)::text, count(*) = 0
  from ligas where user_id = (select a from params);
with x as (update deportes set nombre = 'intruso' where id in (select v from ids) returning 1)
  insert into resultado select 29, 'B renombra un deporte de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;
with x as (delete from ligas where id in (select v from ids) returning 1)
  insert into resultado select 30, 'B borra una liga de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;

do $$
begin
  insert into ligas (deporte_id, nombre) select v, 'intrusa' from ids where k = 'deporte';
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (31, 'B añade una liga a un deporte de A', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;
insert into resultado
  select 14, 'B ve las capturas de A en el bucket', '0', count(*)::text, count(*) = 0
  from storage.objects where bucket_id = 'capturas'
    and (storage.foldername(name))[1] = (select a from params)::text;

-- Bankroll (Fase 3)
with x as (update movimientos_bankroll set importe = 999 where id in (select v from ids) returning 1)
  insert into resultado select 51, 'B cambia un movimiento de bankroll de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;
with x as (delete from movimientos_bankroll where id in (select v from ids) returning 1)
  insert into resultado select 52, 'B borra un movimiento de bankroll de A', '0 filas', count(*) || ' filas', count(*) = 0 from x;
do $$
begin
  insert into movimientos_bankroll (tipo, importe, casa_id) select 'deposito', 1, v from ids where k = 'casa';
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (53, 'B crea un movimiento con la casa de A', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
end $$;
with x as (insert into casas_apuestas (nombre) values ('PRUEBA-RLS-B') returning id)
  insert into ids select 'casa_b', id from x;
do $$
begin
  insert into movimientos_bankroll (tipo, importe, casa_id, casa_destino_id)
    select 'traspaso', 1, (select v from ids where k = 'casa_b'), (select v from ids where k = 'casa');
  raise exception 'PERMITIDO';
exception when others then
  insert into resultado values (54, 'B hace un traspaso de su casa a una casa de A', 'rechazado',
    case when sqlerrm = 'PERMITIDO' then 'PERMITIDO' else 'rechazado' end, sqlerrm <> 'PERMITIDO');
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
  select 18, 'A ve sus propias capturas (control; 0 si aún no ha subido ninguna)', '≥ 0', count(*)::text, true
  from storage.objects where bucket_id = 'capturas'
    and (storage.foldername(name))[1] = (select a from params)::text;

insert into resultado
  select 12, 'La apuesta de A sigue intacta tras los ataques de B', 'importe 1000',
         'importe ' || coalesce(max(importe)::text, 'BORRADA'), coalesce(max(importe), 0) = 1000
  from apuestas where id in (select v from ids);

insert into resultado
  select 46, 'La promoción de A sigue intacta tras los intentos de B', 'asegurada 700',
         coalesce(max(promo_tipo), 'BORRADA') || ' ' || coalesce(max(promo_credito)::text, '—'), max(promo_tipo) = 'asegurada' and max(promo_credito) = 700
  from apuestas where id in (select v from ids where k = 'apuesta_promo');

insert into resultado
  select 55, 'El movimiento de bankroll de A sigue intacto tras los intentos de B', 'importe 1',
         'importe ' || coalesce(max(importe)::text, 'BORRADO'), coalesce(max(importe), 0) = 1
  from movimientos_bankroll where id in (select v from ids where k = 'movimiento');

delete from apuestas where id in (select v from ids);             -- borra también su selección
delete from movimientos_bankroll where id in (select v from ids); -- antes que las casas (no se puede borrar una casa con movimientos)
delete from casas_apuestas where id in (select v from ids);
delete from transcripciones where id in (select v from ids);
delete from deportes where id in (select v from ids);            -- borra también su liga

select
  n as "#",
  comprobacion as "Comprobación",
  esperado as "Esperado",
  obtenido as "Obtenido",
  case when ok then '✅ OK' else '❌ FALLO' end as "Resultado",
  (select 'A = ' || a_email || ' · B = ' || b_email from params) as "Cuentas usadas"
from resultado
order by n;
