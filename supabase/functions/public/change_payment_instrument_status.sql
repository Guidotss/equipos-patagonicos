-- Cambia el estado de un medio de cobro.
create function public.change_payment_instrument_status(
  p_op_id uuid,
  p_instrument_id uuid,
  p_expected_version bigint,
  p_status text,
  p_settled_on date default null,
  p_reason text default ''
) returns jsonb language plpgsql security definer
set search_path = '' as $$
declare document public.documentos %rowtype;
instrument public.payment_instruments %rowtype;
previous jsonb;
begin perform private.exigir_usuario_activo();
select * into document
from public.documentos
where id = p_op_id;
perform private.lock_financial_client(document.cliente_id);
perform private.lock_financial_rows(document.cliente_id);
select * into document
from public.documentos
where id = p_op_id
  and tipo = 'orden_pago'
  and deleted_at is null;
if document.id is null then raise exception 'La orden de pago no existe o está anulada' using errcode = 'P0001';
end if;
perform private.require_financial_version(
  document.financial_version,
  to_jsonb(p_expected_version)
);
select * into instrument
from public.payment_instruments
where id = p_instrument_id
  and op_id = p_op_id;
if instrument.id is null then raise exception 'El medio no pertenece a esta orden de pago' using errcode = 'P0001';
end if;
if p_status is null
or not (
  (
    instrument.kind in ('cash', 'transfer', 'withholding')
    and p_status in ('confirmed', 'voided')
  )
  or (
    instrument.kind = 'check'
    and p_status in ('pending', 'cleared', 'rejected', 'voided')
  )
  or (
    instrument.kind = 'legacy_unidentified'
    and p_status = instrument.status
  )
) then raise exception 'Transición inválida. Clasificá el medio heredado con sus datos y un motivo' using errcode = 'P0001';
end if;
if (
  p_status in ('confirmed', 'cleared')
  and p_settled_on is null
)
or p_settled_on > private.hoy_argentina()
or (
  p_status in ('pending', 'rejected')
  and p_settled_on is not null
) then raise exception 'Indicá una fecha efectiva de cobro válida, que no sea futura' using errcode = 'P0001';
end if;
if char_length(p_reason) > 2000 then raise exception 'El motivo puede tener hasta 2000 caracteres' using errcode = 'P0001';
end if;
previous := private.financial_snapshot(p_op_id);
update public.payment_instruments
set status = p_status,
  settled_on = p_settled_on,
  updated_at = now()
where id = p_instrument_id;
perform private.require_correction_reason(
  previous,
  private.financial_snapshot(p_op_id),
  p_reason
);
perform private.validate_payment_destination_changes(p_op_id, previous);
perform private.validate_financial_client(document.cliente_id);
perform private.synchronize_payment_projection(p_op_id);
perform private.append_financial_event(
  p_op_id,
  previous,
  'instrument_status_changed',
  p_reason
);
return jsonb_build_object(
  'financialVersion',
  (
    select financial_version
    from public.documentos
    where id = p_op_id
  )
);
end;
$$;