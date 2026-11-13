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
