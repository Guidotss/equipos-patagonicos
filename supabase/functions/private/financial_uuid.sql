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
