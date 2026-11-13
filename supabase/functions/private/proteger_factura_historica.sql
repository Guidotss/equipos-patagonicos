create or replace function private.proteger_factura_historica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_cobrado numeric;
begin
  select cobrado into v_cobrado from public.facturas_historicas where factura_id = old.id;
  if not found then return new; end if;
  if (new.id, new.cliente_id, new.tipo, new.numero, new.fecha, new.monto,
      new.tipo_comprobante, new.fecha_vencimiento, new.numero_oc_ref)
     is distinct from
     (old.id, old.cliente_id, old.tipo, old.numero, old.fecha, old.monto,
      old.tipo_comprobante, old.fecha_vencimiento, old.numero_oc_ref) then
    raise exception 'Los datos de la factura histórica están protegidos; conservá el comprobante original'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
