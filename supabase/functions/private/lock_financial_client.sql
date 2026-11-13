create function private.lock_financial_client(client_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if client_id is null or not exists (select 1 from public.clientes where id = client_id) then
    raise exception 'El cliente no existe' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financial-client:' || client_id::text, 0));
end;
$$;
