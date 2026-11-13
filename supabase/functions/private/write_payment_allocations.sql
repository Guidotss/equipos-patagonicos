create function private.write_payment_allocations(document_id uuid, entries jsonb)
returns void language plpgsql set search_path = '' as $$
<<input>>
declare document public.documentos%rowtype; entry jsonb; allocation_id uuid; instrument_id uuid; budget_id uuid; invoice_id uuid;
  budget public.cotizaciones%rowtype; existing public.payment_allocations%rowtype; retained uuid[] := '{}';
begin
  select * into document from public.documentos where id = document_id;
  if document.tipo <> 'orden_pago' then raise exception 'Solo una orden de pago admite aplicaciones' using errcode = 'P0001'; end if;
  if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Las aplicaciones deben ser una lista' using errcode = 'P0001'; end if;
  for entry in select * from jsonb_array_elements(entries) loop
    perform private.validate_finance_object(entry, array['id', 'instrumentId', 'budgetId', 'invoiceId', 'amount']);
    allocation_id := case when entry ? 'id' then private.financial_uuid(entry -> 'id') else gen_random_uuid() end;
    instrument_id := private.financial_uuid(entry -> 'instrumentId'); budget_id := private.financial_uuid(entry -> 'budgetId', true);
    invoice_id := private.financial_uuid(entry -> 'invoiceId', true);
    if allocation_id = any(retained) then raise exception 'Aplicación repetida' using errcode = 'P0001'; end if;
    select * into existing from public.payment_allocations where id = allocation_id;
    if existing.id is not null and not exists(select 1 from public.payment_instruments where id = existing.instrument_id and op_id = document_id) then
      raise exception 'La aplicación pertenece a otra orden de pago' using errcode = 'P0001'; end if;
    if not exists(select 1 from public.payment_instruments where id = instrument_id and op_id = document_id) then
      raise exception 'El medio no pertenece a esta orden de pago' using errcode = 'P0001'; end if;
    if budget_id is null and (existing.id is null or existing.source <> 'legacy' or existing.budget_id is not null
      or existing.instrument_id <> instrument_id or existing.invoice_id is distinct from invoice_id) then
      raise exception 'Asigná el pago a un trabajo conocido; el remanente queda como fondo sin aplicar' using errcode = 'P0001'; end if;
    budget := null;
    if budget_id is not null then
      select * into budget from public.cotizaciones where id = budget_id;
      if existing.budget_id is distinct from budget_id and (budget.id is null or budget.cliente_id <> document.cliente_id
        or budget.estado <> 'aprobada' or budget.presupuesto_estado = 'anulado') then
        raise exception 'El trabajo debe estar aprobado y pertenecer al mismo cliente' using errcode = 'P0001'; end if;
    end if;
    if invoice_id is not null and not exists (select 1 from public.documentos f
      where f.id = input.invoice_id and f.tipo = 'factura'
        and f.tipo_comprobante <> 'NC' and f.cliente_id = document.cliente_id) then
      raise exception 'La aplicación requiere una factura del mismo cliente que no sea nota de crédito' using errcode = 'P0001';
    end if;
    insert into public.payment_allocations(id, instrument_id, budget_id, budget_number, budget_subject, invoice_id, amount, source)
    values(allocation_id, instrument_id, budget_id,
      case when existing.budget_id = budget_id then existing.budget_number else budget.numero end,
      case when existing.budget_id = budget_id then existing.budget_subject else budget.asunto end,
      invoice_id, private.financial_decimal(entry -> 'amount'), coalesce(existing.source, 'explicit'))
    on conflict(id) do update set instrument_id = excluded.instrument_id, budget_id = excluded.budget_id,
      budget_number = excluded.budget_number, budget_subject = excluded.budget_subject,
      invoice_id = excluded.invoice_id, amount = excluded.amount, updated_at = now()
      where exists(select 1 from public.payment_instruments owner where owner.id = public.payment_allocations.instrument_id and owner.op_id = document_id);
    if not found then raise exception 'La aplicación pertenece a otra orden de pago' using errcode = 'P0001'; end if;
    retained := array_append(retained, allocation_id);
  end loop;
  delete from public.payment_allocations a using public.payment_instruments i
    where a.instrument_id = i.id and i.op_id = document_id and not a.id = any(retained);
end;
$$;
