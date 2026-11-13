create function private.check_document_financial_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare client_id uuid;
begin
  if tg_table_name = 'documentos' then
    select d.cliente_id into client_id from public.documentos d where d.id = coalesce(new.id, old.id);
  elsif tg_table_name = 'invoice_allocations' then
    select d.cliente_id into client_id from public.documentos d where d.id = coalesce(new.invoice_id, old.invoice_id);
  elsif tg_table_name = 'payment_instruments' then
    select d.cliente_id into client_id from public.documentos d where d.id = coalesce(new.op_id, old.op_id);
  else
    select d.cliente_id into client_id from public.payment_instruments i join public.documentos d on d.id = i.op_id
      where i.id = coalesce(new.instrument_id, old.instrument_id);
  end if;
  if client_id is not null then perform private.validate_financial_client(client_id); end if;
  return null;
end;
$$;
