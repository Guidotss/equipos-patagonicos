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
