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
