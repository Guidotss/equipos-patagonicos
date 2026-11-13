create function private.reject_financial_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Los eventos financieros no se pueden modificar ni eliminar' using errcode = '42501';
end;
$$;
