-- Distribución financiera conservadora: los vínculos heredados no acreditan una grúa ni una fecha de cobro.
begin;

lock table public.documentos, public.op_facturas, public.documento_presupuestos,
  public.facturas_historicas, public.cotizaciones in share row exclusive mode;
create temporary table financial_before_invoices on commit drop as
  select id, monto, cobrado, saldo from public.v_facturas;

alter table public.documentos
  add column payment_condition text not null default '',
  add column financial_version bigint not null default 1 check (financial_version > 0),
  add constraint documents_payment_condition_type check (tipo = 'orden_pago' or payment_condition = '');

create table public.invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.documentos(id),
  -- El identificador y las instantáneas sobreviven a la eliminación de una cotización.
  budget_id uuid,
  budget_number bigint,
  budget_subject text,
  equipment_id uuid references public.equipos(id),
  equipment_name text,
  equipment_status text not null check (equipment_status in ('assigned', 'none', 'unknown')),
  amount numeric(14,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
  historical_settled_amount numeric(14,2) not null default 0
    check (historical_settled_amount >= 0 and historical_settled_amount <= amount),
  source text not null check (source in ('explicit', 'legacy_single_budget', 'legacy_unallocated', 'historical_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_allocation_equipment check (
    (equipment_status = 'assigned' and equipment_id is not null and equipment_name is not null)
    or (equipment_status in ('none', 'unknown') and equipment_id is null and equipment_name is null)
  ),
  constraint invoice_allocation_budget check (
    (budget_id is not null and budget_number is not null and budget_subject is not null)
    or (budget_id is null and budget_number is null and budget_subject is null and equipment_status = 'unknown')
  )
);
create index invoice_allocations_invoice on public.invoice_allocations(invoice_id);
create index invoice_allocations_budget on public.invoice_allocations(budget_id);
create index invoice_allocations_equipment on public.invoice_allocations(equipment_id);

create table public.payment_instruments (
  id uuid primary key default gen_random_uuid(),
  op_id uuid not null references public.documentos(id),
  kind text not null check (kind in ('cash', 'transfer', 'check', 'withholding', 'legacy_unidentified')),
  status text not null,
  amount numeric(14,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
  received_on date,
  due_on date,
  settled_on date,
  reference text not null default '',
  bank text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_instrument_status check (
    (kind in ('cash', 'transfer', 'withholding') and status in ('confirmed', 'voided')
      and (status <> 'confirmed' or settled_on is not null))
    or (kind = 'check' and status in ('pending', 'cleared', 'rejected', 'voided')
      and (status <> 'cleared' or settled_on is not null))
    or (kind = 'legacy_unidentified' and status in ('legacy_recognized', 'legacy_unclassified', 'voided')
      and received_on is null and due_on is null and settled_on is null)
  )
);
create index payment_instruments_op on public.payment_instruments(op_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.payment_instruments(id),
  budget_id uuid,
  budget_number bigint,
  budget_subject text,
  invoice_id uuid references public.documentos(id),
  amount numeric(14,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
  source text not null check (source in ('explicit', 'legacy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_allocation_budget check (
    (budget_id is not null and budget_number is not null and budget_subject is not null)
    or (budget_id is null and budget_number is null and budget_subject is null and source = 'legacy')
  )
);
create index payment_allocations_instrument on public.payment_allocations(instrument_id);
create index payment_allocations_invoice on public.payment_allocations(invoice_id);
create index payment_allocations_budget on public.payment_allocations(budget_id);

create table public.financial_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documentos(id),
  -- La identidad auditada se conserva aunque luego se elimine el perfil.
  actor uuid,
  action text not null check (btrim(action) <> ''),
  before_version bigint not null check (before_version >= 0),
  after_version bigint not null check (after_version > before_version),
  reason text not null default '',
  before_financial jsonb not null check (jsonb_typeof(before_financial) = 'object'),
  after_financial jsonb not null check (jsonb_typeof(after_financial) = 'object'),
  occurred_at timestamptz not null default now()
);
create index financial_events_document on public.financial_events(document_id, occurred_at);

create function private.reject_financial_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Los eventos financieros no se pueden modificar ni eliminar' using errcode = '42501';
end;
$$;
revoke all on function private.reject_financial_event_mutation() from public, anon, authenticated;
create trigger financial_events_append_only before update or delete on public.financial_events
  for each row execute function private.reject_financial_event_mutation();

comment on table public.financial_events is 'Auditoría de cambios; occurred_at no acredita una fecha de cobro.';
comment on column public.invoice_allocations.historical_settled_amount is
  'Copia protegida del cobro histórico independiente; no es un instrumento ni debe sumarse dos veces.';

do $$
begin
  if exists (select 1 from public.facturas_historicas h
    join public.documentos d on d.id = h.factura_id
    join public.cotizaciones c on c.id = h.cotizacion_id
    where d.tipo <> 'factura' or d.cliente_id <> c.cliente_id or h.cobrado > d.monto) then
    raise exception 'La evidencia histórica no coincide con su factura y trabajo originales';
  end if;
end;
$$;

-- No se infiere el equipo desde el presupuesto actual, aunque tenga uno asignado.
insert into public.invoice_allocations(invoice_id, budget_id, budget_number, budget_subject,
  equipment_status, amount, historical_settled_amount, source)
select d.id, c.id, c.numero, c.asunto, 'unknown', d.monto, coalesce(h.cobrado, 0),
  case when h.factura_id is not null then 'historical_import'
    when c.id is not null then 'legacy_single_budget' else 'legacy_unallocated' end
from public.documentos d
left join public.facturas_historicas h on h.factura_id = d.id
left join lateral (
  select (array_agg(dp.cotizacion_id))[1] as budget_id
  from public.documento_presupuestos dp where dp.documento_id = d.id
  having count(*) = 1
) linked on true
left join public.cotizaciones c on c.id = coalesce(h.cotizacion_id, linked.budget_id)
where d.tipo = 'factura';

-- Lo aplicado conserva su reconocimiento anterior, sin identificar efectivo, retenciones ni fechas.
insert into public.payment_instruments(op_id, kind, status, amount)
select op.id, 'legacy_unidentified', 'legacy_recognized', sum(ofa.monto_aplicado)
from public.documentos op join public.op_facturas ofa on ofa.op_id = op.id
where op.tipo = 'orden_pago' group by op.id;

insert into public.payment_allocations(instrument_id, budget_id, budget_number, budget_subject,
  invoice_id, amount, source)
select pi.id, ia.budget_id, ia.budget_number, ia.budget_subject, ofa.factura_id, ofa.monto_aplicado, 'legacy'
from public.payment_instruments pi
join public.op_facturas ofa on ofa.op_id = pi.op_id
join public.invoice_allocations ia on ia.invoice_id = ofa.factura_id;

insert into public.payment_instruments(op_id, kind, status, amount)
select op.id, 'legacy_unidentified', 'legacy_unclassified', op.monto - coalesce(a.applied, 0)
from public.documentos op
left join lateral (select sum(monto_aplicado) as applied from public.op_facturas where op_id = op.id) a on true
where op.tipo = 'orden_pago' and op.monto > coalesce(a.applied, 0);

do $$
begin
  if exists (select 1 from public.documentos d left join public.invoice_allocations a on a.invoice_id = d.id
    where d.tipo = 'factura' group by d.id having count(a.id) <> 1 or sum(a.amount) <> d.monto) then
    raise exception 'La distribución heredada no coincide con el total de las facturas';
  end if;
  if exists (select 1 from public.documentos d left join public.payment_instruments i on i.op_id = d.id
    where d.tipo = 'orden_pago' group by d.id having coalesce(sum(i.amount), 0) <> d.monto) then
    raise exception 'Las aplicaciones heredadas superan o no coinciden con la orden de pago';
  end if;
  if exists (select 1 from public.payment_instruments i left join public.payment_allocations a on a.instrument_id = i.id
    group by i.id having (i.status = 'legacy_recognized' and coalesce(sum(a.amount), 0) <> i.amount)
      or (i.status = 'legacy_unclassified' and count(a.id) <> 0)) then
    raise exception 'Las distribuciones heredadas no coinciden con sus instrumentos';
  end if;
  if exists (select 1 from public.op_facturas o
    where not exists (select 1 from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id
      where i.op_id = o.op_id and a.invoice_id = o.factura_id and a.amount = o.monto_aplicado)) then
    raise exception 'No se pudo conservar alguna aplicación heredada';
  end if;
  if exists ((select * from financial_before_invoices except select id, monto, cobrado, saldo from public.v_facturas)
    union all (select id, monto, cobrado, saldo from public.v_facturas except select * from financial_before_invoices)) then
    raise exception 'La migración alteró los saldos globales existentes';
  end if;
end;
$$;

-- Las escrituras futuras pertenecen a RPC autorizadas; no se alteran permisos de catálogos existentes.
do $$
declare table_name text;
begin
  foreach table_name in array array['invoice_allocations', 'payment_instruments', 'payment_allocations', 'financial_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create policy staff_read on public.%I for select to authenticated using ((select private.is_staff()))', table_name);
  end loop;
end;
$$;

commit;
