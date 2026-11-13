create function private.financial_snapshot(document_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('type', d.tipo, 'invoiceType', d.tipo_comprobante, 'amount', d.monto, 'voided', d.deleted_at is not null,
    'paymentCondition', d.payment_condition,
    'invoiceAllocations', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at' order by a.id)
      from public.invoice_allocations a where a.invoice_id = d.id), '[]'::jsonb),
    'paymentInstruments', coalesce((select jsonb_agg(to_jsonb(i) - 'created_at' - 'updated_at' order by i.id)
      from public.payment_instruments i where i.op_id = d.id), '[]'::jsonb),
    'paymentAllocations', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at' order by a.id)
      from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id where i.op_id = d.id), '[]'::jsonb))
    || case when d.tipo = 'factura' then jsonb_build_object('issuedOn', d.fecha, 'dueOn', d.fecha_vencimiento) else '{}'::jsonb end
  from public.documentos d where d.id = document_id;
$$;
