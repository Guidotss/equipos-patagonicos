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
