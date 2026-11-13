create or replace function private.exigir_usuario_activo()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.es_usuario_activo() then
    raise exception 'Tu usuario no está habilitado' using errcode = '42501';
  end if;
  if not private.is_staff() then
    raise exception 'No tenés permiso para acceder a la gestión comercial' using errcode = '42501';
  end if;
end;
$$;
