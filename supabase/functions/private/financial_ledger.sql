create function private.financial_ledger(client_id uuid)
returns table (allocation_id uuid, instrument_id uuid, op_id uuid, invoice_id uuid, budget_id uuid,
  amount numeric, money numeric, withholding numeric, legacy_applied numeric, reserved numeric)
language sql stable set search_path = '' as $$
  select a.id, i.id, op.id, a.invoice_id, a.budget_id, a.amount,
    case when op.deleted_at is null and ((i.kind in ('cash', 'transfer') and i.status = 'confirmed')
      or (i.kind = 'check' and i.status = 'cleared')) then a.amount else 0 end,
    case when op.deleted_at is null and i.kind = 'withholding' and i.status = 'confirmed' then a.amount else 0 end,
    case when op.deleted_at is null and i.status = 'legacy_recognized' then a.amount else 0 end,
    case when op.deleted_at is null and i.kind = 'check' and i.status = 'pending' then a.amount else 0 end
  from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id
  join public.documentos op on op.id = i.op_id where op.cliente_id = client_id;
$$;
