create or replace function private.exigir_version(p_actual timestamptz, p_leida timestamptz)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_leida is null then
    raise exception 'Falta la versión de la cotización' using errcode = 'P0001';
  end if;
  if date_trunc('milliseconds', p_leida, 'UTC') <> date_trunc('milliseconds', p_actual, 'UTC') then
    raise exception 'La cotización cambió desde que la abriste; volvé a intentarlo' using errcode = 'P0001';
  end if;
end;
$$;
