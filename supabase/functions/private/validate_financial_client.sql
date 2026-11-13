create function private.validate_financial_client(client_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.documentos d left join public.invoice_allocations a on a.invoice_id = d.id
    left join public.facturas_historicas h on h.factura_id = d.id
    where d.cliente_id = client_id and d.tipo = 'factura'
    group by d.id, h.cobrado having coalesce(sum(a.amount), 0) <> d.monto
      or coalesce(sum(a.historical_settled_amount), 0) <> coalesce(h.cobrado, 0)) then
    raise exception 'La distribución y el cobro histórico deben coincidir exactamente con la factura' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invoice_allocations a join public.documentos d on d.id = a.invoice_id
    where d.cliente_id = client_id and d.tipo <> 'factura') then
    raise exception 'La distribución requiere una factura' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.documentos d left join public.payment_instruments i on i.op_id = d.id and i.status <> 'voided'
    where d.cliente_id = client_id and d.tipo = 'orden_pago' group by d.id having coalesce(sum(i.amount), 0) <> d.monto) then
    raise exception 'Los medios no anulados deben sumar el importe de la orden de pago' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_instruments i join public.documentos d on d.id = i.op_id
    left join public.payment_allocations a on a.instrument_id = i.id where d.cliente_id = client_id
    group by i.id, d.tipo having d.tipo <> 'orden_pago' or coalesce(sum(a.amount), 0) > i.amount
      or (i.status = 'legacy_unclassified' and count(a.id) > 0)) then
    raise exception 'Las aplicaciones superan el medio o requieren clasificar el importe heredado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_instruments i join public.documentos d on d.id = i.op_id
    where d.cliente_id = client_id and i.settled_on > private.hoy_argentina()) then
    raise exception 'La fecha efectiva de cobro no puede estar en el futuro' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id
    join public.documentos op on op.id = i.op_id left join public.documentos f on f.id = a.invoice_id
    where op.cliente_id = client_id and a.invoice_id is not null and
      (f.tipo <> 'factura' or f.tipo_comprobante = 'NC' or f.cliente_id <> client_id)) then
    raise exception 'La aplicación requiere una factura del mismo cliente que no sea nota de crédito' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.documentos f left join public.facturas_historicas h on h.factura_id = f.id
    left join lateral (select sum(l.money + l.withholding + l.legacy_applied + l.reserved) as applied
      from private.financial_ledger(client_id) l where l.invoice_id = f.id) totals on true
    where f.cliente_id = client_id and f.tipo = 'factura' and f.deleted_at is null
      and coalesce(h.cobrado, 0) + coalesce(totals.applied, 0) > f.monto) then
    raise exception 'El cobro y las reservas superan el monto de la factura' using errcode = 'P0001';
  end if;
  -- Los importes sin distribución heredada se conservan; nunca se reparten automáticamente.
  if exists (select 1 from public.documentos f join lateral (
      select l.budget_id, sum(l.money + l.withholding + l.legacy_applied + l.reserved) as applied
      from private.financial_ledger(client_id) l where l.invoice_id = f.id and l.budget_id is not null group by l.budget_id
    ) totals on true left join lateral (select sum(a.amount - a.historical_settled_amount) as capacity
      from public.invoice_allocations a where a.invoice_id = f.id and a.budget_id = totals.budget_id) billed on true
    where f.cliente_id = client_id and f.deleted_at is null and totals.applied > coalesce(billed.capacity, 0)) then
    raise exception 'La aplicación supera la parte facturada al trabajo' using errcode = 'P0001';
  end if;
end;
$$;
