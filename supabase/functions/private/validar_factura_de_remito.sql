create or replace function private.validar_factura_de_remito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.factura_id is not null and not exists (
    select 1 from public.documentos f
    where f.id = new.factura_id and f.tipo = 'factura' and f.cliente_id = new.cliente_id
  ) then
    raise exception 'Un remito solo se vincula a una factura del mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
