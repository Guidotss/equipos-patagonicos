create function private.require_crane_operator()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_crane_operator() then
    raise exception 'Tu usuario no está habilitado como gruista' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
