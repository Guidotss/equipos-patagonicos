create or replace function private.validar_aplicacion_op()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.documentos op
    join public.documentos f on f.id = new.factura_id
    where op.id = new.op_id and op.tipo = 'orden_pago' and f.tipo = 'factura'
      and f.tipo_comprobante <> 'NC' and f.cliente_id = op.cliente_id
  ) then
    raise exception 'Una orden de pago solo cancela facturas (no notas de crédito) del mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
