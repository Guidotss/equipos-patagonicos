create or replace function private.validar_cambio_de_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.tipo, new.tipo_comprobante, new.cliente_id) is distinct from (old.tipo, old.tipo_comprobante, old.cliente_id) then
    if exists (
      select 1
      from public.op_facturas ofa
      join public.documentos op on op.id = ofa.op_id
      where ofa.factura_id = new.id
        and (new.tipo = 'factura' and new.tipo_comprobante <> 'NC' and new.cliente_id = op.cliente_id) is not true
    ) then
      raise exception 'La factura tiene órdenes de pago aplicadas: tiene que seguir siendo una factura (no nota de crédito) del mismo cliente'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.op_facturas ofa
      join public.documentos f on f.id = ofa.factura_id
      where ofa.op_id = new.id and (new.tipo = 'orden_pago' and new.cliente_id = f.cliente_id) is not true
    ) then
      raise exception 'La orden de pago cancela facturas: tiene que seguir siendo una orden de pago del mismo cliente'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.documentos r
      where r.factura_id = new.id and (new.tipo = 'factura' and new.cliente_id = r.cliente_id) is not true
    ) then
      raise exception 'La factura cubre remitos: tiene que seguir siendo una factura del mismo cliente' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.documento_presupuestos dp
      join public.cotizaciones c on c.id = dp.cotizacion_id
      where dp.documento_id = new.id and c.cliente_id <> new.cliente_id
    ) then
      raise exception 'El documento está vinculado a presupuestos de otro cliente' using errcode = 'P0001';
    end if;
  end if;

  if old.deleted_at is not null and new.deleted_at is null and (
    (new.tipo not in ('factura', 'orden_pago') and not exists (select 1 from public.documento_presupuestos dp where dp.documento_id = new.id))
    or exists (
      select 1
      from public.documento_presupuestos dp
      join public.cotizaciones c on c.id = dp.cotizacion_id
      where dp.documento_id = new.id and (c.estado = 'aprobada' and c.cliente_id = new.cliente_id) is not true
    )
  ) then
    raise exception 'No se puede restaurar: el documento tiene que seguir vinculado a presupuestos aprobados de su mismo cliente'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
