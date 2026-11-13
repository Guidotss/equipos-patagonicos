create function private.synchronize_payment_projection(document_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  delete from public.op_facturas where op_id = document_id;
  insert into public.op_facturas(op_id, factura_id, monto_aplicado)
    select i.op_id, a.invoice_id, sum(a.amount) from public.payment_allocations a
    join public.payment_instruments i on i.id = a.instrument_id
    where i.op_id = document_id and a.invoice_id is not null and i.status in ('confirmed', 'cleared', 'pending', 'legacy_recognized')
    group by i.op_id, a.invoice_id;
end;
$$;
