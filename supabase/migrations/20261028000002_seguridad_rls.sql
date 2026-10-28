-- =============================================================
-- Filoverde · Fase 0 · Seguridad por fila (RLS)
-- Regla única: cada usuario solo ve y modifica lo suyo.
-- Los visitantes sin sesión (rol "anon") no tienen acceso a nada.
-- =============================================================

-- ---------- Permisos base ----------

revoke all on public.perfiles, public.casas_apuestas, public.estrategias,
              public.apuestas, public.selecciones, public.movimientos_bankroll
  from anon;

grant select, update on public.perfiles to authenticated;
grant select, insert, update, delete
  on public.casas_apuestas, public.estrategias, public.apuestas,
     public.selecciones, public.movimientos_bankroll
  to authenticated;

-- ---------- Activar RLS en TODAS las tablas ----------

alter table public.perfiles             enable row level security;
alter table public.casas_apuestas       enable row level security;
alter table public.estrategias          enable row level security;
alter table public.apuestas             enable row level security;
alter table public.selecciones          enable row level security;
alter table public.movimientos_bankroll enable row level security;

-- ---------- perfiles (se crean solos y se borran con la cuenta) ----------

create policy "perfil: ver el mío" on public.perfiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "perfil: editar el mío" on public.perfiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- Resto de tablas: mismas 4 reglas ----------

do $$
declare
  t text;
begin
  foreach t in array array['casas_apuestas', 'estrategias', 'apuestas',
                           'selecciones', 'movimientos_bankroll']
  loop
    execute format(
      'create policy "ver lo mío" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "crear lo mío" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "editar lo mío" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "borrar lo mío" on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------- Storage: bucket PRIVADO para capturas ----------
-- Cada archivo se guarda en "capturas/<user_id>/<archivo>".
-- Solo el dueño de la carpeta puede verlo, subirlo, cambiarlo o borrarlo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capturas', 'capturas', false, 10485760,  -- 10 MB
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false;

create policy "capturas: ver las mías" on storage.objects
  for select to authenticated
  using (bucket_id = 'capturas'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "capturas: subir las mías" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capturas'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "capturas: cambiar las mías" on storage.objects
  for update to authenticated
  using (bucket_id = 'capturas'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'capturas'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "capturas: borrar las mías" on storage.objects
  for delete to authenticated
  using (bucket_id = 'capturas'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
