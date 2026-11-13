create or replace function private.validar_vinculo_presupuesto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.cotizaciones c
    join public.documentos d on d.id = new.documento_id
    where c.id = new.cotizacion_id and c.estado = 'aprobada' and c.cliente_id = d.cliente_id
  ) then
    raise exception 'Un documento solo se vincula a presupuestos aprobados de su mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
