create function private.write_document_finance(document_id uuid, finance jsonb, creation boolean, budget_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare document public.documentos%rowtype; retained uuid[]; budget public.cotizaciones%rowtype; previous jsonb;
begin
  select * into document from public.documentos where id = document_id;
  previous := private.financial_snapshot(document_id);
  if finance is not null then
    perform private.validate_finance_object(finance, array['expectedVersion', 'correctionReason', 'invoiceAllocations', 'paymentInstruments', 'paymentAllocations']);
    if finance ? 'expectedVersion' then perform private.require_financial_version(document.financial_version, finance -> 'expectedVersion'); end if;
    if finance ? 'correctionReason' and (jsonb_typeof(finance -> 'correctionReason') is distinct from 'string'
      or char_length(finance ->> 'correctionReason') > 2000) then
      raise exception 'El motivo debe ser un texto de hasta 2000 caracteres' using errcode = 'P0001'; end if;
    if finance ? 'invoiceAllocations' then perform private.write_invoice_allocations(document_id, finance -> 'invoiceAllocations'); end if;
    if finance ? 'paymentInstruments' then retained := private.write_payment_instruments(document_id, finance -> 'paymentInstruments'); end if;
    if finance ? 'paymentAllocations' then perform private.write_payment_allocations(document_id, finance -> 'paymentAllocations'); end if;
    if retained is not null then
      -- La colección presente reemplaza los medios vigentes, sin borrar su evidencia ni sus aplicaciones omitidas.
      update public.payment_instruments set status = 'voided', updated_at = now()
        where op_id = document_id and not id = any(retained) and status <> 'voided';
    end if;
  end if;
  if creation and document.tipo = 'factura' and not coalesce(finance ? 'invoiceAllocations', false) then
    if cardinality(budget_ids) = 1 then select * into budget from public.cotizaciones where id = budget_ids[1]; end if;
    insert into public.invoice_allocations(invoice_id, budget_id, budget_number, budget_subject, equipment_status, amount, source)
      values(document_id, budget.id, budget.numero, budget.asunto, 'unknown', document.monto, 'explicit');
  end if;
  if creation and document.tipo = 'orden_pago' and not coalesce(finance ? 'paymentInstruments', false) then
    raise exception 'Declará los medios de pago y sus fechas efectivas; la orden de pago no acredita efectivo automáticamente' using errcode = 'P0001';
  end if;
  perform private.validate_payment_destination_changes(document_id, previous);
  perform private.validate_financial_client(document.cliente_id);
  if document.tipo = 'orden_pago' then perform private.synchronize_payment_projection(document_id); end if;
end;
$$;
