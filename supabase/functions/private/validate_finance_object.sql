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
