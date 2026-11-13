create function private.validate_payment_destination_changes(document_id uuid, previous jsonb)
returns void language plpgsql set search_path = '' as $$
declare allocation record;
begin
  for allocation in
    select a.*, f.cliente_id as target_client_id, f.tipo as target_type, f.tipo_comprobante as target_invoice_type,
      f.deleted_at as target_deleted_at, op.cliente_id as client_id
    from public.payment_allocations a
    join public.payment_instruments i on i.id = a.instrument_id
    join public.documentos op on op.id = i.op_id
    left join public.documentos f on f.id = a.invoice_id
    left join jsonb_to_recordset(coalesce(previous -> 'paymentAllocations', '[]'::jsonb))
      as old_allocation(id uuid, instrument_id uuid, budget_id uuid, invoice_id uuid, amount numeric) on old_allocation.id = a.id
    left join jsonb_to_recordset(coalesce(previous -> 'paymentInstruments', '[]'::jsonb))
      as old_instrument(id uuid, status text) on old_instrument.id = i.id
    where op.id = document_id and a.invoice_id is not null and (
      old_allocation.id is null
      or (a.instrument_id, a.budget_id, a.invoice_id, a.amount) is distinct from
        (old_allocation.instrument_id, old_allocation.budget_id, old_allocation.invoice_id, old_allocation.amount)
      or (op.deleted_at is null and i.status in ('confirmed', 'cleared', 'pending', 'legacy_recognized')
        and (coalesce((previous ->> 'voided')::boolean, true)
          or coalesce(old_instrument.status, '') not in ('confirmed', 'cleared', 'pending', 'legacy_recognized')))
    )
  loop
    if allocation.target_deleted_at is not null then
      raise exception 'Restaurá primero las facturas anuladas o reasigná sus aplicaciones' using errcode = 'P0001';
    end if;
    if allocation.target_type is distinct from 'factura' or allocation.target_invoice_type = 'NC'
      or allocation.target_client_id is distinct from allocation.client_id then
      raise exception 'La aplicación requiere una factura del mismo cliente que no sea nota de crédito' using errcode = 'P0001';
    end if;
    if allocation.budget_id is not null and not exists (select 1 from public.invoice_allocations a
      where a.invoice_id = allocation.invoice_id and a.budget_id = allocation.budget_id) then
      raise exception 'El trabajo no está incluido en la distribución de la factura' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;
