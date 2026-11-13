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
