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
