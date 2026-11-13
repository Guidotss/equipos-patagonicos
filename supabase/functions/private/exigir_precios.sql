create or replace function private.exigir_precios(p_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cotizacion_items where cotizacion_id = p_id) then
    raise exception 'La cotización no tiene ítems' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cotizacion_items where cotizacion_id = p_id and precio_unitario is null) then
    raise exception 'Hay ítems sin precio' using errcode = 'P0001';
  end if;
end;
$$;
