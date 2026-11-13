create or replace function private.exigir_ruta_pdf(p_id uuid, p_ruta text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_prefijo text := 'cotizaciones/' || p_id::text || '/';
begin
  if p_ruta is null or left(p_ruta, length(v_prefijo)) <> v_prefijo then
    raise exception 'Ruta de PDF inválida' using errcode = 'P0001';
  end if;
end;
$$;
