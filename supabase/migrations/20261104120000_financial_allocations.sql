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
create trigger financial_events_reject_truncate before truncate on public.financial_events
  for each statement execute function private.reject_financial_event_mutation();

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

-- El registro de auditoría solo admite anexar eventos, incluso con service_role.
revoke all on public.financial_events from service_role;
grant select, insert on public.financial_events to service_role;

-- Todas las mutaciones del cliente comparten el mismo orden de bloqueo.
create function private.lock_financial_client(client_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if client_id is null or not exists (select 1 from public.clientes where id = client_id) then
    raise exception 'El cliente no existe' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financial-client:' || client_id::text, 0));
end;
$$;

create function private.lock_financial_rows(client_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.documentos d where d.cliente_id = client_id order by d.id for update;
  perform 1 from public.cotizaciones c where c.cliente_id = client_id order by c.id for share;
end;
$$;

create function private.financial_uuid(value jsonb, nullable boolean default false)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if nullable and value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(value) is distinct from 'string'
    or value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Identificador financiero inválido' using errcode = 'P0001';
  end if;
  return (value #>> '{}')::uuid;
end;
$$;

create function private.financial_decimal(value jsonb, allow_zero boolean default false)
returns numeric language plpgsql immutable set search_path = '' as $$
declare amount numeric;
begin
  if jsonb_typeof(value) is distinct from 'string'
    or value #>> '{}' !~ '^0*[0-9]{1,12}(\.[0-9]{1,2})?$' then
    raise exception 'Importe financiero inválido: usá texto con hasta 12 enteros y 2 decimales' using errcode = 'P0001';
  end if;
  amount := (value #>> '{}')::numeric;
  if amount < 0 or (not allow_zero and amount = 0) then
    raise exception 'El importe financiero debe ser positivo' using errcode = 'P0001';
  end if;
  return amount;
end;
$$;

create function private.financial_date(value jsonb)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(value) is distinct from 'string' or value #>> '{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not pg_input_is_valid(value #>> '{}', 'date') then
    raise exception 'Fecha financiera inválida' using errcode = 'P0001';
  end if;
  return (value #>> '{}')::date;
end;
$$;

-- Cálculo canónico: las recepciones y vencimientos nunca acreditan cobros.
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
  from public.documentos d where d.id = document_id;
$$;

create function private.require_financial_version(actual bigint, expected jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(expected) is distinct from 'number' or expected #>> '{}' !~ '^[1-9][0-9]{0,14}$' then
    raise exception 'Falta la versión financiera leída. Volvé a abrir el documento' using errcode = 'P0001';
  end if;
  if actual <> (expected #>> '{}')::bigint then
    raise exception 'El documento cambió. Volvé a abrirlo antes de guardar' using errcode = 'P0001';
  end if;
end;
$$;

create function private.append_financial_event(document_id uuid, previous jsonb, action_name text, reason text, creation boolean default false)
returns void language plpgsql set search_path = '' as $$
declare current_state jsonb; version bigint;
begin
  current_state := private.financial_snapshot(document_id);
  if not creation and current_state = previous then return; end if;
  select financial_version into version from public.documentos where id = document_id;
  if not creation then
    update public.documentos set financial_version = financial_version + 1 where id = document_id;
  end if;
  insert into public.financial_events(document_id, actor, action, before_version, after_version, reason, before_financial, after_financial)
  values(document_id, auth.uid(), action_name, case when creation then 0 else version end,
    case when creation then 1 else version + 1 end, coalesce(reason, ''), coalesce(previous, '{}'::jsonb), current_state);
end;
$$;

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
create function private.validate_finance_object(value jsonb, allowed_keys text[])
returns void language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'object' then
    raise exception 'Los datos financieros deben ser un objeto' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_object_keys(value) as key where not key = any(allowed_keys)) then
    raise exception 'Hay campos financieros no admitidos' using errcode = 'P0001';
  end if;
end;
$$;

create function private.require_correction_reason(previous jsonb, current_state jsonb, reason text)
returns void language plpgsql set search_path = '' as $$
declare instrument jsonb; current_instrument jsonb; previous_allocations jsonb; current_allocations jsonb;
begin
  if previous -> 'invoiceAllocations' is distinct from current_state -> 'invoiceAllocations'
    and exists(select 1 from jsonb_array_elements(previous -> 'invoiceAllocations') a
      where (a ->> 'historical_settled_amount')::numeric > 0)
    and coalesce(btrim(reason), '') = '' then
    raise exception 'Indicá el motivo para corregir la atribución del cobro histórico' using errcode = 'P0001';
  end if;
  for instrument in select * from jsonb_array_elements(previous -> 'paymentInstruments') loop
    if instrument ->> 'status' not in ('confirmed', 'cleared', 'legacy_recognized') and instrument ->> 'kind' <> 'legacy_unidentified' then continue; end if;
    select value into current_instrument from jsonb_array_elements(current_state -> 'paymentInstruments')
      where value ->> 'id' = instrument ->> 'id';
    select coalesce(jsonb_agg(value order by value ->> 'id'), '[]'::jsonb) into previous_allocations
      from jsonb_array_elements(previous -> 'paymentAllocations') where value ->> 'instrument_id' = instrument ->> 'id';
    select coalesce(jsonb_agg(value order by value ->> 'id'), '[]'::jsonb) into current_allocations
      from jsonb_array_elements(current_state -> 'paymentAllocations') where value ->> 'instrument_id' = instrument ->> 'id';
    if (instrument - 'reference' - 'bank' - 'received_on' - 'due_on') is distinct from
        (current_instrument - 'reference' - 'bank' - 'received_on' - 'due_on')
      or previous_allocations is distinct from current_allocations then
      if coalesce(btrim(reason), '') = '' then
        raise exception 'Indicá el motivo de la corrección del cobro o su destino' using errcode = 'P0001';
      end if;
    end if;
  end loop;
end;
$$;

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

create function private.write_payment_instruments(document_id uuid, entries jsonb)
returns uuid[] language plpgsql set search_path = '' as $$
declare entry jsonb; instrument_id uuid; existing public.payment_instruments%rowtype; retained uuid[] := '{}';
  instrument_amount numeric; received_on date; due_on date; settled_on date; instrument_kind text; instrument_status text;
begin
  if not exists(select 1 from public.documentos where id = document_id and tipo = 'orden_pago') then
    raise exception 'Solo una orden de pago admite medios' using errcode = 'P0001'; end if;
  if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Los medios deben ser una lista' using errcode = 'P0001'; end if;
  for entry in select * from jsonb_array_elements(entries) loop
    perform private.validate_finance_object(entry, array['id', 'kind', 'status', 'amount', 'receivedOn', 'dueOn', 'settledOn', 'reference', 'bank']);
    instrument_id := private.financial_uuid(entry -> 'id');
    if instrument_id = any(retained) then raise exception 'Medio de pago repetido' using errcode = 'P0001'; end if;
    select * into existing from public.payment_instruments where id = instrument_id;
    if existing.id is not null and existing.op_id <> document_id then raise exception 'El medio pertenece a otra orden de pago' using errcode = 'P0001'; end if;
    instrument_amount := private.financial_decimal(entry -> 'amount');
    instrument_kind := entry ->> 'kind'; instrument_status := entry ->> 'status';
    if jsonb_typeof(entry -> 'kind') is distinct from 'string' or jsonb_typeof(entry -> 'status') is distinct from 'string'
      or not ((instrument_kind in ('cash', 'transfer', 'withholding') and instrument_status in ('confirmed', 'voided'))
        or (instrument_kind = 'check' and instrument_status in ('pending', 'cleared', 'rejected', 'voided'))
        or (instrument_kind = 'legacy_unidentified' and instrument_status in ('legacy_recognized', 'legacy_unclassified', 'voided'))) then
      raise exception 'Medio o estado de pago inválido' using errcode = 'P0001';
    end if;
    if instrument_kind = 'legacy_unidentified' and (existing.id is null or existing.kind <> instrument_kind
      or existing.amount <> instrument_amount or (instrument_status = 'legacy_recognized' and existing.status <> instrument_status)) then
      raise exception 'No se pueden crear ni aumentar cobros heredados sin identificar' using errcode = 'P0001';
    end if;
    received_on := private.financial_date(entry -> 'receivedOn'); due_on := private.financial_date(entry -> 'dueOn');
    settled_on := private.financial_date(entry -> 'settledOn');
    if instrument_status in ('confirmed', 'cleared') and settled_on is null then
      raise exception 'Indicá la fecha efectiva de cobro' using errcode = 'P0001'; end if;
    if settled_on > private.hoy_argentina() or (instrument_status in ('pending', 'rejected') and settled_on is not null)
      or (instrument_kind = 'legacy_unidentified' and (received_on is not null or due_on is not null or settled_on is not null)) then
      raise exception 'La fecha efectiva de cobro no es válida para ese estado' using errcode = 'P0001'; end if;
    if jsonb_typeof(entry -> 'reference') is distinct from 'string' or jsonb_typeof(entry -> 'bank') is distinct from 'string'
      or char_length(entry ->> 'reference') > 200 or char_length(entry ->> 'bank') > 200 then
      raise exception 'La referencia y el banco deben ser textos de hasta 200 caracteres' using errcode = 'P0001'; end if;
    insert into public.payment_instruments(id, op_id, kind, status, amount, received_on, due_on, settled_on, reference, bank)
    values(instrument_id, document_id, instrument_kind, instrument_status, instrument_amount, received_on, due_on, settled_on,
      entry ->> 'reference', entry ->> 'bank')
    on conflict(id) do update set kind = excluded.kind, status = excluded.status, amount = excluded.amount,
      received_on = excluded.received_on, due_on = excluded.due_on, settled_on = excluded.settled_on,
      reference = excluded.reference, bank = excluded.bank, updated_at = now()
      where public.payment_instruments.op_id = document_id;
    if not found then raise exception 'El medio pertenece a otra orden de pago' using errcode = 'P0001'; end if;
    retained := array_append(retained, instrument_id);
  end loop;
  return retained;
end;
$$;

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
    if invoice_id is not null and (existing.invoice_id is distinct from invoice_id or existing.budget_id is distinct from budget_id
      or existing.amount <> private.financial_decimal(entry -> 'amount')) then
      if not exists (select 1 from public.documentos f where f.id = input.invoice_id and f.tipo = 'factura'
        and f.tipo_comprobante <> 'NC' and f.deleted_at is null and f.cliente_id = document.cliente_id) then
        raise exception 'La factura debe estar vigente y pertenecer al mismo cliente' using errcode = 'P0001'; end if;
      if budget_id is not null and not exists (select 1 from public.invoice_allocations a where a.invoice_id = input.invoice_id and a.budget_id = input.budget_id) then
        raise exception 'El trabajo no está incluido en la distribución de la factura' using errcode = 'P0001'; end if;
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

create function private.write_document_finance(document_id uuid, finance jsonb, creation boolean, budget_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare document public.documentos%rowtype; retained uuid[]; budget public.cotizaciones%rowtype;
begin
  select * into document from public.documentos where id = document_id;
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
      if exists(select 1 from public.payment_instruments i join public.payment_allocations a on a.instrument_id = i.id
        where i.op_id = document_id and not i.id = any(retained)) then
        raise exception 'Reasigná o quitá las aplicaciones antes de reemplazar sus medios de pago' using errcode = 'P0001';
      end if;
      delete from public.payment_instruments where op_id = document_id and not id = any(retained);
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
  perform private.validate_financial_client(document.cliente_id);
  if document.tipo = 'orden_pago' then perform private.synchronize_payment_projection(document_id); end if;
end;
$$;

-- La proyección heredada dejó de ser una autoridad monetaria.
create or replace function private.aplicar_orden_pago(p_op_id uuid, p_cliente_id uuid, p_monto_op numeric, p_aplicaciones jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p_aplicaciones) is distinct from 'array' or jsonb_array_length(p_aplicaciones) > 0 then
    raise exception 'Las aplicaciones se guardan junto con los medios en finance.paymentAllocations' using errcode = 'P0001'; end if;
  perform private.synchronize_payment_projection(p_op_id);
end;
$$;

create or replace function private.validar_presupuestos(p_cliente_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_presupuestos is null or cardinality(p_presupuestos) = 0 then
    raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(p_presupuestos) p(id) where not exists
    (select 1 from public.cotizaciones c where c.id = p.id and c.cliente_id = p_cliente_id)) then
    raise exception 'Los documentos solo se cargan en presupuestos aprobados, no anulados, del mismo cliente' using errcode = 'P0001';
  end if;
  -- Bloquea los presupuestos (en orden) antes de mirar su estado y los deja así hasta confirmar el documento:
  -- si a la vez se revierte la aprobación o se anula el presupuesto, el vínculo espera y ve el estado nuevo;
  -- un revertir que llega después espera y ve el documento.
  perform 1 from public.cotizaciones
  where id = any (p_presupuestos)
  order by id
  for share;

  if exists (
    select 1 from unnest(p_presupuestos) as p(id)
    where not exists (
      select 1 from public.cotizaciones c
      where c.id = p.id and c.estado = 'aprobada' and c.cliente_id = p_cliente_id
        and c.presupuesto_estado <> 'anulado'
    )
  ) then
    raise exception 'Los documentos solo se cargan en presupuestos aprobados, no anulados, del mismo cliente' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.registrar_documento(
  p_datos jsonb,
  p_presupuestos uuid[],
  p_archivos jsonb,
  p_remitos uuid[] default '{}',
  p_aplicaciones jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.documentos%rowtype;
  v_id uuid;
  input_data jsonb;
  previous_financial jsonb;
begin
  perform private.exigir_usuario_activo();
  -- El equipo del remito se obtiene del presupuesto; ningún valor enviado por el navegador lo reemplaza.
  input_data := case when p_datos ->> 'tipo' = 'remito' and jsonb_typeof(p_datos) = 'object'
    then p_datos - 'equipo_id' else p_datos end;
  perform private.validar_datos_documento(input_data ->> 'tipo', input_data);
  v := private.leer_datos_documento(input_data);
  if v.cliente_id is null then
    raise exception 'Falta el cliente' using errcode = 'P0001';
  end if;
  perform private.lock_financial_client(v.cliente_id);
  perform private.lock_financial_rows(v.cliente_id);
  if v.tipo not in ('factura', 'orden_pago') or cardinality(p_presupuestos) > 0 then
    perform private.validar_presupuestos(v.cliente_id, p_presupuestos);
  end if;
  if v.tipo = 'remito' then
    v.equipo_id := private.derive_document_equipment(p_presupuestos);
  end if;
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  -- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
  insert into public.documentos (
    cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, numero_oc_ref,
    periodo_desde, periodo_hasta, equipo_id, notas
  ) values (
    v.cliente_id, v.tipo, coalesce(btrim(v.numero), ''), v.fecha, v.monto,
    case when v.tipo = 'factura' then v.tipo_comprobante end,
    case when v.tipo = 'factura' then v.fecha_vencimiento end,
    case when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '') else '' end,
    case when v.tipo = 'remito' then v.periodo_desde end,
    case when v.tipo = 'remito' then v.periodo_hasta end,
    case when v.tipo = 'remito' then v.equipo_id end,
    coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.reemplazar_presupuestos(v_id, p_presupuestos);
  perform private.adjuntar_archivos(v_id, p_archivos);
  if v.tipo = 'factura' then
    perform private.vincular_remitos(v_id, v.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' then
    perform private.aplicar_orden_pago(v_id, v.cliente_id, v.monto, coalesce(p_aplicaciones, '[]'));
  end if;
  if input_data ? 'payment_condition' then
    if v.tipo <> 'orden_pago' or jsonb_typeof(input_data -> 'payment_condition') is distinct from 'string'
      or char_length(input_data ->> 'payment_condition') > 2000 then
      raise exception 'La condición de pago debe ser texto de hasta 2000 caracteres de la orden de pago' using errcode = 'P0001'; end if;
    update public.documentos set payment_condition = input_data ->> 'payment_condition' where id = v_id;
  end if;
  if v.tipo in ('factura', 'orden_pago') or input_data ? 'finance' then
    perform private.write_document_finance(v_id, input_data -> 'finance', true, p_presupuestos);
    perform private.append_financial_event(v_id, null, 'created', input_data -> 'finance' ->> 'correctionReason', true);
  end if;
  return v_id;
end;
$$;

create or replace function public.actualizar_documento(
  p_id uuid,
  p_datos jsonb,
  p_presupuestos uuid[] default null,
  p_remitos uuid[] default null,
  p_aplicaciones jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documentos%rowtype;
  v public.documentos%rowtype;
  v_cobrado numeric;
  v_presupuestos_nuevos uuid[];
  input_data jsonb;
  previous_financial jsonb;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is null;
  if o.id is not null then
    perform private.lock_financial_client(o.cliente_id);
    perform private.lock_financial_rows(o.cliente_id);
  end if;
  select * into o from public.documentos where id = p_id and deleted_at is null;
  if o.id is null then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;

  -- Se conserva la validación vigente de fechas, montos y textos; el equipo del remito no es editable.
  input_data := case when coalesce(p_datos ->> 'tipo', o.tipo) = 'remito' and jsonb_typeof(p_datos) = 'object'
    then p_datos - 'equipo_id' else p_datos end;
  perform private.validar_datos_documento(coalesce(input_data ->> 'tipo', o.tipo), input_data);
  v := private.leer_datos_documento(input_data);
  v.tipo := coalesce(v.tipo, o.tipo);

  previous_financial := private.financial_snapshot(p_id);
  if o.tipo = 'orden_pago' and not (input_data ? 'finance') and p_aplicaciones = '[]'::jsonb
    and exists(select 1 from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id where i.op_id = p_id) then
    raise exception 'Para cambiar las aplicaciones existentes, enviá finance.paymentAllocations con la versión financiera leída' using errcode = 'P0001';
  end if;
  if input_data ? 'finance' or (v.tipo, v.monto, v.tipo_comprobante) is distinct from (o.tipo, o.monto, o.tipo_comprobante)
    or (input_data ? 'payment_condition' and input_data ->> 'payment_condition' is distinct from o.payment_condition) then
    if o.tipo in ('factura', 'orden_pago') or v.tipo in ('factura', 'orden_pago') then
      perform private.require_financial_version(o.financial_version, input_data -> 'finance' -> 'expectedVersion');
    end if;
  end if;
  if v.tipo <> o.tipo and exists(select 1 from public.payment_instruments where op_id = p_id and status <> 'voided') then
    raise exception 'La orden tiene medios de pago. Corregí o anulá sus fondos conservando la orden original' using errcode = 'P0001'; end if;
  if v.tipo <> o.tipo and o.tipo = 'factura' then
    if exists(select 1 from public.payment_allocations where invoice_id = p_id) then
      raise exception 'La factura tiene pagos vinculados. Corregí sus destinos antes de cambiar el tipo' using errcode = 'P0001'; end if;
    if coalesce(btrim(input_data -> 'finance' ->> 'correctionReason'), '') = '' then
      raise exception 'Indicá el motivo para quitar la distribución de la factura' using errcode = 'P0001'; end if;
    delete from public.invoice_allocations where invoice_id = p_id;
  end if;
  -- Un remito cubierto por una factura anulada cuenta como libre (igual que en vincular_remitos).
  if v.tipo <> o.tipo and (
    exists (select 1 from public.documentos f where f.id = o.factura_id and f.deleted_at is null)
    or exists (select 1 from public.documentos r where r.factura_id = p_id)
    or exists (select 1 from public.op_facturas where op_id = p_id or factura_id = p_id)
  ) then
    raise exception 'Para cambiar el tipo, primero quitá los remitos o facturas vinculados' using errcode = 'P0001';
  end if;

  if p_presupuestos is not null then
    if cardinality(p_presupuestos) = 0 and v.tipo not in ('factura', 'orden_pago') then
      raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
    end if;
    v_presupuestos_nuevos := array(
      select p.id from unnest(p_presupuestos) as p(id)
      where not exists (
        select 1 from public.documento_presupuestos dp where dp.documento_id = p_id and dp.cotizacion_id = p.id
      )
    );
    if cardinality(v_presupuestos_nuevos) > 0 then
      perform private.validar_presupuestos(o.cliente_id, v_presupuestos_nuevos);
    end if;
  end if;
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);
  if v.tipo = 'remito' then
    if o.tipo = 'remito' then
      -- Preserva la grúa real del remito, incluida la recibida desde obra, y los nulos históricos.
      v.equipo_id := o.equipo_id;
    else
      v.equipo_id := private.derive_document_equipment(coalesce(p_presupuestos, array(
        select dp.cotizacion_id from public.documento_presupuestos dp where dp.documento_id = p_id
      )));
    end if;
  end if;

  -- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
  update public.documentos set
    tipo = v.tipo,
    payment_condition = case when v.tipo = 'orden_pago' then o.payment_condition else '' end,
    numero = coalesce(btrim(v.numero), ''),
    fecha = case when p_datos ? 'fecha' then v.fecha else o.fecha end,
    monto = v.monto,
    tipo_comprobante = case when v.tipo = 'factura' then v.tipo_comprobante end,
    fecha_vencimiento = case when v.tipo = 'factura' then v.fecha_vencimiento end,
    numero_oc_ref = case when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '') else '' end,
    periodo_desde = case when v.tipo = 'remito' then v.periodo_desde end,
    periodo_hasta = case when v.tipo = 'remito' then v.periodo_hasta end,
    equipo_id = case when v.tipo = 'remito' then v.equipo_id end,
    factura_id = case when v.tipo = 'remito' then o.factura_id end,
    notas = coalesce(v.notas, '')
  where id = p_id;

  if p_presupuestos is not null then
    perform private.reemplazar_presupuestos(p_id, p_presupuestos);
  end if;
  if v.tipo = 'factura' and p_remitos is not null then
    perform private.vincular_remitos(p_id, o.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' and p_aplicaciones is not null then
    perform private.aplicar_orden_pago(p_id, o.cliente_id, v.monto, p_aplicaciones);
  end if;
  if input_data ? 'payment_condition' then
    if v.tipo <> 'orden_pago' or jsonb_typeof(input_data -> 'payment_condition') is distinct from 'string'
      or char_length(input_data ->> 'payment_condition') > 2000 then
      raise exception 'La condición de pago debe ser texto de hasta 2000 caracteres de la orden de pago' using errcode = 'P0001'; end if;
    update public.documentos set payment_condition = input_data ->> 'payment_condition' where id = p_id;
  end if;
  if v.tipo in ('factura', 'orden_pago') or o.tipo in ('factura', 'orden_pago') or input_data ? 'finance' then
    perform private.write_document_finance(p_id, input_data -> 'finance', v.tipo <> o.tipo, coalesce(p_presupuestos,
      array(select cotizacion_id from public.documento_presupuestos where documento_id = p_id)));
    perform private.require_correction_reason(previous_financial, private.financial_snapshot(p_id), input_data -> 'finance' ->> 'correctionReason');
    perform private.append_financial_event(p_id, previous_financial, 'updated', input_data -> 'finance' ->> 'correctionReason');
  end if;
end;
$$;

create function public.change_payment_instrument_status(p_op_id uuid, p_instrument_id uuid, p_expected_version bigint,
  p_status text, p_settled_on date default null, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare document public.documentos%rowtype; instrument public.payment_instruments%rowtype; previous jsonb;
begin
  perform private.exigir_usuario_activo();
  select * into document from public.documentos where id = p_op_id;
  perform private.lock_financial_client(document.cliente_id);
  perform private.lock_financial_rows(document.cliente_id);
  select * into document from public.documentos where id = p_op_id and tipo = 'orden_pago' and deleted_at is null;
  if document.id is null then raise exception 'La orden de pago no existe o está anulada' using errcode = 'P0001'; end if;
  perform private.require_financial_version(document.financial_version, to_jsonb(p_expected_version));
  select * into instrument from public.payment_instruments where id = p_instrument_id and op_id = p_op_id;
  if instrument.id is null then raise exception 'El medio no pertenece a esta orden de pago' using errcode = 'P0001'; end if;
  if p_status is null or not ((instrument.kind in ('cash', 'transfer', 'withholding') and p_status in ('confirmed', 'voided'))
    or (instrument.kind = 'check' and p_status in ('pending', 'cleared', 'rejected', 'voided'))
    or (instrument.kind = 'legacy_unidentified' and p_status = instrument.status)) then
    raise exception 'Transición inválida. Clasificá el medio heredado con sus datos y un motivo' using errcode = 'P0001'; end if;
  if (p_status in ('confirmed', 'cleared') and p_settled_on is null)
    or p_settled_on > private.hoy_argentina() or (p_status in ('pending', 'rejected') and p_settled_on is not null) then
    raise exception 'Indicá una fecha efectiva de cobro válida, que no sea futura' using errcode = 'P0001'; end if;
  if char_length(p_reason) > 2000 then raise exception 'El motivo puede tener hasta 2000 caracteres' using errcode = 'P0001'; end if;
  previous := private.financial_snapshot(p_op_id);
  update public.payment_instruments set status = p_status, settled_on = p_settled_on, updated_at = now() where id = p_instrument_id;
  perform private.require_correction_reason(previous, private.financial_snapshot(p_op_id), p_reason);
  -- La reactivación de una aplicación requiere que la factura siga vigente.
  if p_status in ('confirmed', 'cleared', 'pending') and instrument.status not in ('confirmed', 'cleared', 'pending', 'legacy_recognized') and exists(select 1 from public.payment_allocations a
    join public.documentos f on f.id = a.invoice_id where a.instrument_id = p_instrument_id and f.deleted_at is not null) then
    raise exception 'Restaurá la factura o reasigná el medio antes de activarlo' using errcode = 'P0001'; end if;
  perform private.validate_financial_client(document.cliente_id);
  perform private.synchronize_payment_projection(p_op_id);
  perform private.append_financial_event(p_op_id, previous, 'instrument_status_changed', p_reason);
  return jsonb_build_object('financialVersion', (select financial_version from public.documentos where id = p_op_id));
end;
$$;
revoke all on function public.change_payment_instrument_status(uuid,uuid,bigint,text,date,text) from public, anon;
grant execute on function public.change_payment_instrument_status(uuid,uuid,bigint,text,date,text) to authenticated;

-- Se reemplazan las firmas anteriores sin sobrecargas ambiguas.
drop function public.anular_documento(uuid);
drop function public.restaurar_documento(uuid);
create function private.set_document_voided(document_id uuid, expected_version bigint, reason text, voided boolean)
returns void language plpgsql set search_path = '' as $$
declare document public.documentos%rowtype; previous jsonb;
begin
  perform private.exigir_usuario_activo();
  select * into document from public.documentos where id = document_id;
  perform private.lock_financial_client(document.cliente_id);
  perform private.lock_financial_rows(document.cliente_id);
  select * into document from public.documentos where id = document_id;
  if document.id is null or (document.deleted_at is not null) = voided then
    raise exception 'El documento no existe o ya tiene ese estado' using errcode = 'P0001'; end if;
  if document.tipo in ('factura', 'orden_pago') then
    perform private.require_financial_version(document.financial_version, to_jsonb(expected_version));
    if coalesce(btrim(reason), '') = '' then raise exception 'Indicá el motivo del cambio financiero' using errcode = 'P0001'; end if;
  end if;
  if char_length(reason) > 2000 then raise exception 'El motivo puede tener hasta 2000 caracteres' using errcode = 'P0001'; end if;
  previous := private.financial_snapshot(document_id);
  if not voided and document.tipo = 'orden_pago' and exists(select 1 from public.payment_allocations a
    join public.payment_instruments i on i.id = a.instrument_id join public.documentos f on f.id = a.invoice_id
    where i.op_id = document_id and i.status in ('confirmed', 'cleared', 'pending', 'legacy_recognized') and f.deleted_at is not null) then
    raise exception 'Restaurá primero las facturas anuladas o reasigná sus aplicaciones' using errcode = 'P0001'; end if;
  update public.documentos set deleted_at = case when voided then now() end,
    deleted_by = case when voided then auth.uid() end where id = document_id;
  perform private.validate_financial_client(document.cliente_id);
  if document.tipo in ('factura', 'orden_pago') then
    perform private.append_financial_event(document_id, previous, case when voided then 'voided' else 'restored' end, reason);
  end if;
end;
$$;
create function public.anular_documento(p_id uuid, p_expected_version bigint default null, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin perform private.set_document_voided(p_id, p_expected_version, p_reason, true); end;
$$;
create function public.restaurar_documento(p_id uuid, p_expected_version bigint default null, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin perform private.set_document_voided(p_id, p_expected_version, p_reason, false); end;
$$;
revoke all on function public.anular_documento(uuid,bigint,text), public.restaurar_documento(uuid,bigint,text) from public, anon;
grant execute on function public.anular_documento(uuid,bigint,text), public.restaurar_documento(uuid,bigint,text) to authenticated;

create or replace function private.proteger_factura_historica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_cobrado numeric;
begin
  select cobrado into v_cobrado from public.facturas_historicas where factura_id = old.id;
  if not found then return new; end if;
  if (new.id, new.cliente_id, new.tipo, new.numero, new.fecha, new.monto,
      new.tipo_comprobante, new.fecha_vencimiento, new.numero_oc_ref)
     is distinct from
     (old.id, old.cliente_id, old.tipo, old.numero, old.fecha, old.monto,
      old.tipo_comprobante, old.fecha_vencimiento, old.numero_oc_ref) then
    raise exception 'Los datos de la factura histórica están protegidos; conservá el comprobante original'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.importar_factura_historica(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_clave text;
  v_campo text;
  v_valor text;
  v_item jsonb;
  v_total_items numeric := 0;
  v_neto numeric;
  v_monto numeric;
  v_cotizacion uuid;
  v_numero_presupuesto bigint;
  v_factura uuid;
  v_notas text;
  v_existente public.facturas_historicas%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'La importación histórica requiere service_role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'Los datos de la factura histórica tienen que ser un objeto' using errcode = 'P0001';
  end if;
  if coalesce(p_datos ->> 'emisor_cuit', '') !~ '^[0-9]{11}$'
     or coalesce(p_datos ->> 'numero', '') !~ '^[0-9]{5}-[0-9]{8}$' then
    raise exception 'Ingresá CUIT emisor y número completo de factura (00002-00001307)' using errcode = 'P0001';
  end if;
  if coalesce(p_datos ->> 'cliente_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Cliente inválido' using errcode = 'P0001'; end if;
  v_cliente := (p_datos ->> 'cliente_id')::uuid;
  perform private.lock_financial_client(v_cliente);
  v_clave := (p_datos ->> 'emisor_cuit') || ':FA:' || (p_datos ->> 'numero');
  perform pg_advisory_xact_lock(hashtextextended(v_clave, 0));
  perform pg_advisory_xact_lock(hashtextextended('factura-historica:FA:' ||
    ltrim(regexp_replace(lower(p_datos ->> 'numero'), '[^a-z0-9]', '', 'g'), '0'), 0));

  perform private.lock_financial_rows(v_cliente);
  select * into v_existente from public.facturas_historicas where clave_origen = v_clave;
  if found then
    if v_existente.entrada is distinct from p_datos then
      raise exception 'Conflicto de importación: la factura ya tiene otra entrada o evidencia' using errcode = 'P0001';
    end if;
    -- No recrear documentos anulados, presupuestos modificados ni vínculos/archivos retirados.
    perform 1 from public.documentos where id = v_existente.factura_id for update;
    select c.numero into v_numero_presupuesto
    from public.cotizaciones c
    join public.documentos d on d.id = v_existente.factura_id
    where c.id = v_existente.cotizacion_id and c.origen = 'directa'
      and c.estado = 'aprobada' and c.presupuesto_estado = 'finalizado'
      and c.cliente_id = (p_datos ->> 'cliente_id')::uuid
      and c.fecha = (p_datos ->> 'fecha')::date and c.fecha_aprobacion = c.fecha
      and c.datos = jsonb_build_object('periodo_desde', p_datos -> 'periodo_desde', 'periodo_hasta', p_datos -> 'periodo_hasta')
      and d.deleted_at is null and d.tipo = 'factura' and d.tipo_comprobante = 'FA'
      and d.numero = p_datos ->> 'numero' and d.cliente_id = c.cliente_id
      and d.fecha = c.fecha and d.fecha_vencimiento is not distinct from (p_datos ->> 'fecha_vencimiento')::date
      and d.monto = (p_datos ->> 'monto')::numeric
      and (select count(*) from public.documento_presupuestos dp where dp.documento_id = d.id) = 1
      and exists (select 1 from public.documento_presupuestos dp where dp.documento_id = d.id and dp.cotizacion_id = c.id)
      and exists (select 1 from public.documento_archivos a where a.documento_id = d.id
        and a.path = p_datos -> 'archivo' ->> 'path' and a.mime = 'application/pdf')
      and (select jsonb_agg(jsonb_build_object('descripcion', i.descripcion, 'cantidad', i.cantidad,
             'precio_unitario', i.precio_unitario, 'unidad', i.unidad) order by i.orden)
           from public.cotizacion_items i where i.cotizacion_id = c.id)
          = (select jsonb_agg(jsonb_build_object('descripcion', i ->> 'descripcion', 'cantidad', (i ->> 'cantidad')::numeric,
             'precio_unitario', (i ->> 'precio_unitario')::numeric, 'unidad', i ->> 'unidad') order by orden)
             from jsonb_array_elements(p_datos -> 'items') with ordinality as t(i, orden))
    for share of c;
    if not found then
      raise exception 'Conflicto de importación: la factura o el presupuesto importados fueron alterados o anulados'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object('factura_id', v_existente.factura_id, 'presupuesto_id', v_existente.cotizacion_id,
      'numero_presupuesto', v_numero_presupuesto, 'ya_importada', true);
  end if;

  if coalesce(p_datos ->> 'cliente_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Cliente inválido' using errcode = 'P0001';
  end if;
  v_cliente := (p_datos ->> 'cliente_id')::uuid;
  if not exists (select 1 from public.clientes where id = v_cliente) then
    raise exception 'El cliente no existe' using errcode = 'P0001';
  end if;
  foreach v_campo in array array['fecha', 'fecha_vencimiento', 'periodo_desde', 'periodo_hasta'] loop
    v_valor := p_datos ->> v_campo;
    if (v_campo = 'fecha' and v_valor is null) or (v_valor is not null and
       (v_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(v_valor, 'date'))) then
      raise exception 'Fecha inválida (%)', v_campo using errcode = 'P0001';
    end if;
  end loop;
  if (p_datos ->> 'periodo_desde')::date > (p_datos ->> 'periodo_hasta')::date then
    raise exception 'El período termina antes de empezar' using errcode = 'P0001';
  end if;
  foreach v_campo in array array['neto', 'iva', 'otros_tributos', 'monto'] loop
    v_valor := p_datos ->> v_campo;
    if coalesce(v_valor, '') !~ '^0*[0-9]{1,12}(\.[0-9]{1,2})?$' then
      raise exception 'Importe inválido (%): hasta 12 enteros y 2 decimales', v_campo using errcode = 'P0001';
    end if;
  end loop;
  v_neto := (p_datos ->> 'neto')::numeric;
  v_monto := (p_datos ->> 'monto')::numeric;
  if v_neto <= 0 or v_monto <= 0
     or v_neto + (p_datos ->> 'iva')::numeric + (p_datos ->> 'otros_tributos')::numeric <> v_monto then
    raise exception 'El neto, IVA y otros tributos no coinciden con el monto positivo de la factura' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_datos -> 'items') is distinct from 'array' then
    raise exception 'Los ítems tienen que ser una lista' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_datos -> 'items') not between 1 and 200 then
    raise exception 'La factura debe tener entre 1 y 200 ítems' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(p_datos -> 'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'descripcion') is distinct from 'string'
       or coalesce(btrim(v_item ->> 'descripcion'), '') = ''
       or coalesce(v_item ->> 'unidad', '') not in ('UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE')
       or coalesce(v_item ->> 'cantidad', '') !~ '^0*[0-9]{1,10}(\.[0-9]{1,2})?$'
       or coalesce(v_item ->> 'precio_unitario', '') !~ '^0*[0-9]{1,12}(\.[0-9]{1,2})?$' then
      raise exception 'Ítem inválido: revisá descripción, unidad, cantidad y precio con hasta 2 decimales' using errcode = 'P0001';
    end if;
    if (v_item ->> 'cantidad')::numeric <= 0 or (v_item ->> 'precio_unitario')::numeric <= 0 then
      raise exception 'La cantidad y el precio deben ser positivos' using errcode = 'P0001';
    end if;
    v_total_items := v_total_items + round((v_item ->> 'cantidad')::numeric * (v_item ->> 'precio_unitario')::numeric, 2);
  end loop;
  if v_total_items <> v_neto then
    raise exception 'La suma de los ítems no coincide con el neto de la factura' using errcode = 'P0001';
  end if;
  if coalesce(p_datos ->> 'sha256', '') !~* '^[0-9a-f]{64}$'
     or jsonb_typeof(p_datos -> 'lote') is distinct from 'string' or btrim(p_datos ->> 'lote') = ''
     or jsonb_typeof(p_datos -> 'confirmacion_cobro') is distinct from 'string' or btrim(p_datos ->> 'confirmacion_cobro') = ''
     or jsonb_typeof(p_datos -> 'fuente') is distinct from 'object'
     or (p_datos ? 'notas' and jsonb_typeof(p_datos -> 'notas') is distinct from 'string') then
    raise exception 'Faltan SHA-256, lote, evidencia o confirmación de cobro válidos' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_datos -> 'archivo') is distinct from 'object'
     or coalesce(p_datos -> 'archivo' ->> 'path', '') !~ '\.pdf$' then
    raise exception 'Adjuntá el PDF original de la factura' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.documentos where tipo = 'factura' and tipo_comprobante = 'FA'
    and numero_normalizado = ltrim(regexp_replace(lower(p_datos ->> 'numero'), '[^a-z0-9]', '', 'g'), '0')) then
    raise exception 'Conflicto de importación: ya existe una factura FA con ese número, incluso si está anulada'
      using errcode = 'P0001';
  end if;

  v_notas := concat_ws(E'\n', nullif(p_datos ->> 'notas', ''),
    'Presupuesto reconstruido desde factura histórica. Fecha y fecha de aprobación usan la emisión como referencia; no acreditan la aprobación original.',
    'Cobro histórico confirmado por el usuario: ' || (p_datos ->> 'confirmacion_cobro') || '. Sin OP ni fecha de pago acreditadas.');
  insert into public.cotizaciones (origen, fecha, cliente_id, formato, asunto, datos, notas)
  values ('directa', (p_datos ->> 'fecha')::date, v_cliente, 'jornada',
    'Servicio histórico — factura FA ' || (p_datos ->> 'numero'),
    jsonb_build_object('periodo_desde', p_datos -> 'periodo_desde', 'periodo_hasta', p_datos -> 'periodo_hasta'), v_notas)
  returning id, numero into v_cotizacion, v_numero_presupuesto;
  perform private.reemplazar_items(v_cotizacion, p_datos -> 'items');
  update public.cotizaciones set estado = 'aprobada', fecha_aprobacion = (p_datos ->> 'fecha')::date,
    presupuesto_estado = 'finalizado' where id = v_cotizacion;

  insert into public.documentos (cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, notas)
  values (v_cliente, 'factura', p_datos ->> 'numero', (p_datos ->> 'fecha')::date, v_monto, 'FA',
    (p_datos ->> 'fecha_vencimiento')::date, v_notas)
  returning id into v_factura;
  insert into public.documento_presupuestos (documento_id, cotizacion_id) values (v_factura, v_cotizacion);
  perform private.adjuntar_archivos(v_factura, jsonb_build_array(p_datos -> 'archivo'));
  if not exists (select 1 from public.documento_archivos where documento_id = v_factura and mime = 'application/pdf') then
    raise exception 'El archivo original debe ser un PDF válido' using errcode = 'P0001';
  end if;
  insert into public.facturas_historicas (factura_id, cotizacion_id, sha256, lote, cobrado, confirmacion_cobro, entrada)
  values (v_factura, v_cotizacion, lower(p_datos ->> 'sha256'), p_datos ->> 'lote', v_monto, p_datos ->> 'confirmacion_cobro', p_datos);
  insert into public.invoice_allocations(invoice_id, budget_id, budget_number, budget_subject, equipment_status,
    amount, historical_settled_amount, source)
  select v_factura, c.id, c.numero, c.asunto, 'unknown', v_monto, v_monto, 'historical_import'
    from public.cotizaciones c where c.id = v_cotizacion;
  perform private.append_financial_event(v_factura, null, 'historical_imported', '', true);
  return jsonb_build_object('factura_id', v_factura, 'presupuesto_id', v_cotizacion,
    'numero_presupuesto', v_numero_presupuesto, 'ya_importada', false);
end;
$$;

revoke all on function public.importar_factura_historica(jsonb) from public, anon, authenticated;
grant execute on function public.importar_factura_historica(jsonb) to service_role;
create or replace function private.validar_cambio_de_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.tipo, new.tipo_comprobante, new.cliente_id) is distinct from (old.tipo, old.tipo_comprobante, old.cliente_id) then
    if exists (
      select 1
      from public.op_facturas ofa
      join public.documentos op on op.id = ofa.op_id
      where ofa.factura_id = new.id
        and (new.tipo = 'factura' and new.tipo_comprobante <> 'NC' and new.cliente_id = op.cliente_id) is not true
    ) then
      raise exception 'La factura tiene órdenes de pago aplicadas: tiene que seguir siendo una factura (no nota de crédito) del mismo cliente'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.op_facturas ofa
      join public.documentos f on f.id = ofa.factura_id
      where ofa.op_id = new.id and (new.tipo = 'orden_pago' and new.cliente_id = f.cliente_id) is not true
    ) then
      raise exception 'La orden de pago cancela facturas: tiene que seguir siendo una orden de pago del mismo cliente'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.documentos r
      where r.factura_id = new.id and (new.tipo = 'factura' and new.cliente_id = r.cliente_id) is not true
    ) then
      raise exception 'La factura cubre remitos: tiene que seguir siendo una factura del mismo cliente' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.documento_presupuestos dp
      join public.cotizaciones c on c.id = dp.cotizacion_id
      where dp.documento_id = new.id and c.cliente_id <> new.cliente_id
    ) then
      raise exception 'El documento está vinculado a presupuestos de otro cliente' using errcode = 'P0001';
    end if;
  end if;

  if old.deleted_at is not null and new.deleted_at is null and (
    (new.tipo not in ('factura', 'orden_pago') and not exists (select 1 from public.documento_presupuestos dp where dp.documento_id = new.id))
    or exists (
      select 1
      from public.documento_presupuestos dp
      join public.cotizaciones c on c.id = dp.cotizacion_id
      where dp.documento_id = new.id and (c.estado = 'aprobada' and c.cliente_id = new.cliente_id) is not true
    )
  ) then
    raise exception 'No se puede restaurar: el documento tiene que seguir vinculado a presupuestos aprobados de su mismo cliente'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create function private.require_budget_without_finances(budget_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.invoice_allocations a join public.documentos d on d.id = a.invoice_id
      where a.budget_id = require_budget_without_finances.budget_id and d.deleted_at is null)
    or exists(select 1 from public.payment_allocations a join public.payment_instruments i on i.id = a.instrument_id
      join public.documentos d on d.id = i.op_id where a.budget_id = require_budget_without_finances.budget_id and d.deleted_at is null
        and i.status in ('confirmed', 'cleared', 'pending', 'legacy_recognized')) then
    raise exception 'El trabajo tiene una distribución financiera o un anticipo activo; corregí sus destinos antes de revertir o borrar' using errcode = 'P0001';
  end if;
end;
$$;
create or replace function public.revertir_aprobacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cotizacion public.cotizaciones%rowtype;
begin
  perform private.exigir_usuario_activo();
  select * into v_cotizacion from public.cotizaciones where id = p_id;
  perform private.lock_financial_client(v_cotizacion.cliente_id);
  perform private.lock_financial_rows(v_cotizacion.cliente_id);
  perform private.require_budget_without_finances(p_id);
  -- Bloquea la cotización antes de validarla y de buscar documentos: un documento que se está vinculando o
  -- restaurando a la vez (que la tiene bloqueada para compartir) termina primero y acá se lo ve; uno que llega
  -- después espera y ve la cotización ya revertida.
  select * into v_cotizacion from public.cotizaciones where id = p_id for update;
  -- Primero lo que no se arregla anulando documentos (así un presupuesto directo recibe su mensaje).
  if v_cotizacion.origen = 'directa' then
    raise exception 'Un presupuesto directo no se revierte: anulalo desde el presupuesto' using errcode = 'P0001';
  end if;
  if v_cotizacion.id is null or v_cotizacion.estado <> 'aprobada' then
    raise exception 'Solo se puede revertir la aprobación de una cotización aprobada' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.documento_presupuestos dp
    join public.documentos d on d.id = dp.documento_id and d.deleted_at is null
    where dp.cotizacion_id = p_id
  ) then
    raise exception 'El presupuesto tiene documentos cargados; anulalos antes de revertir la aprobación' using errcode = 'P0001';
  end if;
  update public.cotizaciones c set
    estado = case when c.origen = 'importada'
                    or exists (select 1 from public.cotizacion_envios e where e.cotizacion_id = c.id)
                  then 'enviada' else 'borrador' end,
    fecha_aprobacion = null,
    pdf_aprobado_path = null,
    presupuesto_estado = null,
    presupuesto_motivo = ''
  where c.id = p_id;
end;
$$;
create or replace function public.borrar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare client_id uuid;
begin
  perform private.exigir_usuario_activo();
  select cliente_id into client_id from public.cotizaciones where id = p_id;
  if client_id is not null then
    perform private.lock_financial_client(client_id);
    perform private.lock_financial_rows(client_id);
    perform private.require_budget_without_finances(p_id);
  end if;
  delete from public.cotizaciones c
  where c.id = p_id and (
    (c.origen = 'app' and c.estado = 'borrador'
      and not exists (select 1 from public.cotizacion_envios e where e.cotizacion_id = c.id))
    or (c.origen = 'importada' and c.estado <> 'aprobada')
  );
  if not found then
    if exists (select 1 from public.cotizaciones where id = p_id and origen = 'importada') then
      raise exception 'Una cotización cargada aprobada no se puede borrar; primero revertí la aprobación' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.cotizaciones where id = p_id and estado = 'borrador') then
      raise exception 'Una cotización que ya se envió no se puede borrar; rechazala' using errcode = 'P0001';
    end if;
    raise exception 'Solo se pueden borrar cotizaciones en borrador' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.aprobar_con_orden_compra(p_id uuid,p_updated_at timestamptz,p_pdf_path text,p_documento jsonb,p_archivos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_cliente uuid; v_doc uuid; v_fecha date;
begin
  perform private.exigir_usuario_activo();
  select cliente_id into v_cliente from public.cotizaciones where id=p_id;
  if v_cliente is not null then
    perform private.lock_financial_client(v_cliente);
    perform private.lock_financial_rows(v_cliente);
  end if;
  select cliente_id into v_cliente from public.cotizaciones where id=p_id for update;
  if not found then raise exception 'La cotización no existe' using errcode='P0001'; end if;
  if p_documento->>'tipo' is distinct from 'orden_compra' then raise exception 'Elegí una orden de compra' using errcode='P0001'; end if;
  v_fecha := coalesce((p_documento->>'fecha')::date,private.hoy_argentina());
  perform public.aprobar_cotizacion(p_id,p_updated_at,nullif(p_pdf_path,''),v_fecha);
  v_doc := public.registrar_documento(p_documento || jsonb_build_object('cliente_id',v_cliente),array[p_id],p_archivos,array[]::uuid[],'[]'::jsonb);
  return v_doc;
end;
$$;
grant execute on function public.aprobar_con_orden_compra(uuid,timestamptz,text,jsonb,jsonb) to authenticated;
-- Respaldo diferido: detecta una escritura incompleta sin inventar asientos ni bloquear tarde al cliente.
create function private.check_document_financial_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare client_id uuid;
begin
  if tg_table_name = 'documentos' then
    select d.cliente_id into client_id from public.documentos d where d.id = coalesce(new.id, old.id);
  elsif tg_table_name = 'invoice_allocations' then
    select d.cliente_id into client_id from public.documentos d where d.id = coalesce(new.invoice_id, old.invoice_id);
  elsif tg_table_name = 'payment_instruments' then
    select d.cliente_id into client_id from public.documentos d where d.id = coalesce(new.op_id, old.op_id);
  else
    select d.cliente_id into client_id from public.payment_instruments i join public.documentos d on d.id = i.op_id
      where i.id = coalesce(new.instrument_id, old.instrument_id);
  end if;
  if client_id is not null then perform private.validate_financial_client(client_id); end if;
  return null;
end;
$$;
create constraint trigger documents_financial_integrity after insert or update on public.documentos
  deferrable initially deferred for each row execute function private.check_document_financial_integrity();
create constraint trigger invoice_allocations_integrity after insert or update or delete on public.invoice_allocations
  deferrable initially deferred for each row execute function private.check_document_financial_integrity();
create constraint trigger payment_instruments_integrity after insert or update or delete on public.payment_instruments
  deferrable initially deferred for each row execute function private.check_document_financial_integrity();
create constraint trigger payment_allocations_integrity after insert or update or delete on public.payment_allocations
  deferrable initially deferred for each row execute function private.check_document_financial_integrity();

-- Los helpers no son puntos de entrada ni eluden RLS para consumidores públicos.
do $$
declare helper record;
begin
  for helper in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('lock_financial_client', 'lock_financial_rows', 'financial_uuid',
      'financial_decimal', 'financial_date', 'financial_ledger', 'financial_snapshot', 'require_financial_version',
      'append_financial_event', 'validate_financial_client', 'validate_finance_object', 'require_correction_reason',
      'write_invoice_allocations', 'write_payment_instruments', 'write_payment_allocations', 'synchronize_payment_projection',
      'write_document_finance', 'set_document_voided', 'require_budget_without_finances', 'check_document_financial_integrity') loop
    execute format('revoke all on function %s from public, anon, authenticated', helper.signature);
  end loop;
end;
$$;

commit;
