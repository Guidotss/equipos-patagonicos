-- supabase/migrations/20261024090000_ajustes_profiles.sql
-- Perfiles: UPDATE solo de nombre/rol/activo, un admin no puede degradarse a sí mismo,
-- y el nombre nunca queda vacío.

revoke update on public.profiles from authenticated;
grant update (nombre, rol, activo) on public.profiles to authenticated;

create or replace function private.proteger_autodegradacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid())
     and old.rol = 'admin' and old.activo
     and (new.rol <> 'admin' or not new.activo) then
    raise exception 'No podés desactivarte ni quitarte el rol de administrador'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_proteger_autodegradacion
  before update on public.profiles
  for each row execute function private.proteger_autodegradacion();

create or replace function private.crear_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), new.email, 'Usuario sin nombre')
  );
  return new;
end;
$$;
