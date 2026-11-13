create function private.write_invoice_allocations(document_id uuid, entries jsonb)
returns void language plpgsql set search_path = '' as $$
declare document public.documentos%rowtype; entry jsonb; allocation_id uuid; budget_id uuid; equipment_id uuid;
  budget public.cotizaciones%rowtype; existing public.invoice_allocations%rowtype; equipment_name text; retained uuid[] := '{}';
begin
  select * into document from public.documentos where id = document_id;
  if document.tipo <> 'factura' then raise exception 'Solo una factura admite distribución' using errcode = 'P0001'; end if;
  if jsonb_typeof(entries) is distinct from 'array' then raise exception 'La distribución debe ser una lista' using errcode = 'P0001'; end if;
  for entry in select * from jsonb_array_elements(entries) loop
    perform private.validate_finance_object(entry, array['id', 'budgetId', 'equipmentId', 'equipmentStatus', 'amount', 'historicalSettledAmount']);
    allocation_id := case when entry ? 'id' then private.financial_uuid(entry -> 'id') else gen_random_uuid() end;
    if allocation_id = any(retained) then raise exception 'Distribución repetida' using errcode = 'P0001'; end if;
    select * into existing from public.invoice_allocations where id = allocation_id;
    if existing.id is not null and existing.invoice_id <> document_id then
      raise exception 'La distribución pertenece a otra factura' using errcode = 'P0001';
    end if;
    budget_id := private.financial_uuid(entry -> 'budgetId', true);
    equipment_id := private.financial_uuid(entry -> 'equipmentId', true);
    if private.financial_decimal(entry -> 'historicalSettledAmount', true) > private.financial_decimal(entry -> 'amount') then
      raise exception 'El cobro histórico atribuido no puede superar la parte facturada' using errcode = 'P0001';
    end if;
    if jsonb_typeof(entry -> 'equipmentStatus') is distinct from 'string' or entry ->> 'equipmentStatus' not in ('assigned', 'none', 'unknown')
      or ((entry ->> 'equipmentStatus' = 'assigned') <> (equipment_id is not null))
      or (budget_id is null and entry ->> 'equipmentStatus' <> 'unknown') then
      raise exception 'Indicá un equipo asignado, sin equipo o desconocido válido' using errcode = 'P0001';
    end if;
    budget := null;
    if budget_id is not null then
      select * into budget from public.cotizaciones where id = budget_id;
      if existing.budget_id is distinct from budget_id and (budget.id is null or budget.cliente_id <> document.cliente_id
        or budget.estado <> 'aprobada' or budget.presupuesto_estado = 'anulado') then
        raise exception 'El trabajo debe estar aprobado y pertenecer al mismo cliente' using errcode = 'P0001';
      end if;
    end if;
    equipment_name := null;
    if equipment_id is not null then
      select e.nombre into equipment_name from public.equipos e where e.id = equipment_id;
      if equipment_name is null then raise exception 'El equipo no existe' using errcode = 'P0001'; end if;
    end if;
    insert into public.invoice_allocations(id, invoice_id, budget_id, budget_number, budget_subject, equipment_id, equipment_name,
      equipment_status, amount, historical_settled_amount, source)
    values(allocation_id, document_id, budget_id,
      case when existing.budget_id = budget_id then existing.budget_number else budget.numero end,
      case when existing.budget_id = budget_id then existing.budget_subject else budget.asunto end,
      equipment_id, case when existing.equipment_id = equipment_id then existing.equipment_name else equipment_name end,
      entry ->> 'equipmentStatus', private.financial_decimal(entry -> 'amount'),
      private.financial_decimal(entry -> 'historicalSettledAmount', true), coalesce(existing.source, 'explicit'))
    on conflict(id) do update set budget_id = excluded.budget_id, budget_number = excluded.budget_number,
      budget_subject = excluded.budget_subject, equipment_id = excluded.equipment_id, equipment_name = excluded.equipment_name,
      equipment_status = excluded.equipment_status, amount = excluded.amount,
      historical_settled_amount = excluded.historical_settled_amount, updated_at = now()
      where public.invoice_allocations.invoice_id = document_id;
    if not found then raise exception 'La distribución pertenece a otra factura' using errcode = 'P0001'; end if;
    retained := array_append(retained, allocation_id);
  end loop;
  delete from public.invoice_allocations where invoice_id = document_id and not id = any(retained);
end;
$$;
