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
