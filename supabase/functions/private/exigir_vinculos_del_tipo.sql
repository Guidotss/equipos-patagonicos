create or replace function private.exigir_vinculos_del_tipo(p_tipo text, p_remitos uuid[], p_aplicaciones jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_aplicaciones is not null and jsonb_typeof(p_aplicaciones) <> 'array' then
    raise exception 'Las facturas canceladas tienen que ser una lista' using errcode = 'P0001';
  end if;
  if p_tipo <> 'factura' and coalesce(cardinality(p_remitos), 0) > 0 then
    raise exception 'Solo una factura cubre remitos' using errcode = 'P0001';
  end if;
  if p_tipo <> 'orden_pago' and jsonb_array_length(coalesce(p_aplicaciones, '[]')) > 0 then
    raise exception 'Solo una orden de pago cancela facturas' using errcode = 'P0001';
  end if;
end;
$$;
