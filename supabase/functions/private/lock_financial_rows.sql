create function private.lock_financial_rows(client_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.documentos d where d.cliente_id = client_id order by d.id for update;
  perform 1 from public.cotizaciones c where c.cliente_id = client_id order by c.id for share;
end;
$$;
