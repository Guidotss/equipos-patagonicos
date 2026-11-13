create or replace function private.validar_contacto(p_cliente_id uuid, p_contacto_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_contacto_id is not null and not exists (
    select 1 from public.contactos where id = p_contacto_id and cliente_id = p_cliente_id
  ) then
    raise exception 'El contacto no pertenece al cliente' using errcode = 'P0001';
  end if;
end;
$$;
