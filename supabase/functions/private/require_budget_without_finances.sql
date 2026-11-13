create function private.require_budget_without_finances(budget_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.invoice_allocations a join public.documentos d on d.id = a.invoice_id
      where a.budget_id = require_budget_without_finances.budget_id
        and (d.deleted_at is null or a.historical_settled_amount > 0))
    or exists(select 1 from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id
      join public.documentos d on d.id = i.op_id where a.budget_id = require_budget_without_finances.budget_id and d.deleted_at is null
        and i.status in ('confirmed', 'cleared', 'pending', 'legacy_recognized')) then
    raise exception 'El trabajo tiene una distribución financiera o un anticipo activo; corregí sus destinos antes de revertir o borrar' using errcode = 'P0001';
  end if;
end;
$$;
